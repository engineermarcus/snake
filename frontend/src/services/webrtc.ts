import { socketService } from './socket';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ],
  iceTransportPolicy: 'all'
};

class WebRTCVoiceService {
  private peers: Record<string, { pc: RTCPeerConnection; stream?: MediaStream }> = {};
  private audioElements: Record<string, HTMLAudioElement> = {};
  private mutedPeers: Set<string> = new Set();
  private localStream: MediaStream | null = null;
  private isMicActive: boolean = false;
  private isDeafened: boolean = false;
  private audioCtx: AudioContext | null = null;
  private analyserNodes: Record<string, AnalyserNode> = {};
  private onPeerUpdateCallback: (() => void) | null = null;

  public async startMic(onUpdate?: () => void): Promise<{ success: boolean; error?: string }> {
    if (onUpdate) this.onPeerUpdateCallback = onUpdate;
    this.resumeAudioContext();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return { success: false, error: 'Microphone not supported on this device/browser' };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
        video: false
      });

      this.localStream = stream;
      this.isMicActive = true;

      // Add local audio track to all existing peer connections
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        for (const pid in this.peers) {
          const pc = this.peers[pid].pc;
          const senders = pc.getSenders();
          const existingSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (existingSender) {
            existingSender.replaceTrack(audioTrack).catch(() => {});
          } else {
            try { pc.addTrack(audioTrack, stream); } catch(e) {}
          }
        }
      }

      // Request peer list to initiate connections to any new peers
      socketService.send({ type: 'rtcPeers' });
      this.notifyUpdate();
      return { success: true };
    } catch (err: any) {
      console.warn('[WebRTC] Mic permission error:', err);
      this.isMicActive = false;
      let msg = 'Microphone permission denied. Please allow mic access in browser/device settings.';
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No microphone device found.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Microphone permission was blocked. Allow mic access to talk.';
      }
      return { success: false, error: msg };
    }
  }

  public stopMic() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.isMicActive = false;

    // Remove or disable tracks on peer connections
    for (const pid in this.peers) {
      const pc = this.peers[pid].pc;
      const senders = pc.getSenders();
      senders.forEach(s => {
        if (s.track && s.track.kind === 'audio') {
          try { pc.removeTrack(s); } catch(e) {}
        }
      });
    }
    this.notifyUpdate();
  }

  public async toggleMic(onUpdate?: () => void): Promise<{ active: boolean; error?: string }> {
    if (this.isMicActive) {
      this.stopMic();
      return { active: false };
    } else {
      const res = await this.startMic(onUpdate);
      return { active: res.success, error: res.error };
    }
  }

  public toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;
    this.updateAllAudioPlayback();
    this.notifyUpdate();
    return this.isDeafened;
  }

  public isUserDeafened(): boolean {
    return this.isDeafened;
  }

  public toggleMutePeer(peerId: string): boolean {
    if (this.mutedPeers.has(peerId)) {
      this.mutedPeers.delete(peerId);
    } else {
      this.mutedPeers.add(peerId);
    }
    this.updatePeerAudio(peerId);
    this.notifyUpdate();
    return this.mutedPeers.has(peerId);
  }

  public isPeerMuted(peerId: string): boolean {
    return this.mutedPeers.has(peerId);
  }

  public getMutedPeers(): Set<string> {
    return this.mutedPeers;
  }

  public getActivePeers(): string[] {
    return Object.keys(this.peers).filter(pid => {
      const p = this.peers[pid];
      return p && (p.stream || (p.pc && (p.pc.connectionState === 'connected' || p.pc.iceConnectionState === 'connected')));
    });
  }

  public isVoiceActive(): boolean {
    return this.isMicActive;
  }

  public resumeAudioContext() {
    try {
      const actx = this.getAudioCtx();
      if (actx && actx.state === 'suspended') {
        actx.resume().catch(() => {});
      }
    } catch(e) {}

    // Resume playback on all audio elements if paused by autoplay policy
    for (const pid in this.audioElements) {
      const el = this.audioElements[pid];
      if (el && el.paused && el.srcObject) {
        el.play().catch(() => {});
      }
    }
  }

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    return this.audioCtx!;
  }

  private updatePeerAudio(peerId: string) {
    const audio = this.audioElements[peerId];
    if (audio) {
      audio.muted = this.isDeafened || this.mutedPeers.has(peerId);
    }
  }

  private updateAllAudioPlayback() {
    for (const pid in this.audioElements) {
      this.updatePeerAudio(pid);
    }
  }

  private getOrCreateAudioElement(peerId: string): HTMLAudioElement {
    let el = this.audioElements[peerId];
    if (!el) {
      el = document.createElement('audio');
      el.id = `rtc-audio-${peerId}`;
      el.autoplay = true;
      (el as any).playsInline = true;
      el.style.display = 'none';
      document.body.appendChild(el);
      this.audioElements[peerId] = el;
    }
    return el;
  }

  private makePeerConn(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketService.send({ type: 'rtcIce', to: peerId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0] || new MediaStream([e.track]);
      
      // Attach to HTML Audio Element for guaranteed playback
      const audio = this.getOrCreateAudioElement(peerId);
      audio.srcObject = remoteStream;
      audio.muted = this.isDeafened || this.mutedPeers.has(peerId);
      audio.play().catch(err => {
        console.log('[WebRTC] Autoplay deferred until user interaction:', err);
      });

      // Optional audio analyser for voice activity indicator
      try {
        const actx = this.getAudioCtx();
        if (actx) {
          const src = actx.createMediaStreamSource(remoteStream);
          const analyser = actx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          this.analyserNodes[peerId] = analyser;
        }
      } catch(e) {}

      if (this.peers[peerId]) {
        this.peers[peerId].stream = remoteStream;
      } else {
        this.peers[peerId] = { pc, stream: remoteStream };
      }
      this.notifyUpdate();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(peerId);
      }
      this.notifyUpdate();
    };

    // If local mic is already active, attach audio track to this new peer
    if (this.localStream && this.isMicActive) {
      this.localStream.getTracks().forEach(t => {
        try { pc.addTrack(t, this.localStream!); } catch(e) {}
      });
    }

    return pc;
  }

  public async initiatePeer(peerId: string) {
    if (this.peers[peerId] && this.peers[peerId].pc.signalingState !== 'closed') return;
    const pc = this.makePeerConn(peerId);
    this.peers[peerId] = { pc };

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      } as any);
      offer.sdp = this.preferOpus(offer.sdp || '');
      await pc.setLocalDescription(offer);
      socketService.send({ type: 'rtcOffer', to: peerId, sdp: pc.localDescription });
    } catch (e) {
      console.warn('[WebRTC] initiatePeer offer error:', e);
    }
  }

  public async handleOffer(msg: any) {
    const peerId = msg.from;
    if (this.peers[peerId]) {
      try { this.peers[peerId].pc.close(); } catch(e) {}
    }
    const pc = this.makePeerConn(peerId);
    this.peers[peerId] = { pc };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      answer.sdp = this.preferOpus(answer.sdp || '');
      await pc.setLocalDescription(answer);
      socketService.send({ type: 'rtcAnswer', to: peerId, sdp: pc.localDescription });
      this.notifyUpdate();
    } catch (e) {
      console.warn('[WebRTC] handleOffer error:', e);
    }
  }

  public handleAnswer(msg: any) {
    if (this.peers[msg.from] && this.peers[msg.from].pc) {
      this.peers[msg.from].pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch(e => {
        console.warn('[WebRTC] handleAnswer error:', e);
      });
    }
  }

  public handleIce(msg: any) {
    if (this.peers[msg.from] && this.peers[msg.from].pc && msg.candidate) {
      this.peers[msg.from].pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
    }
  }

  public closePeer(peerId: string) {
    if (this.peers[peerId]) {
      try { this.peers[peerId].pc.close(); } catch(e) {}
      delete this.peers[peerId];
    }
    if (this.audioElements[peerId]) {
      try {
        this.audioElements[peerId].pause();
        this.audioElements[peerId].srcObject = null;
        this.audioElements[peerId].remove();
      } catch(e) {}
      delete this.audioElements[peerId];
    }
    delete this.analyserNodes[peerId];
    this.notifyUpdate();
  }

  public cleanup() {
    this.stopMic();
    for (const pid in this.peers) {
      this.closePeer(pid);
    }
  }

  private preferOpus(sdp: string) {
    return sdp.replace(/a=fmtp:(\d+) (.*)/g, (match, pt, params) => {
      if (sdp.includes(`a=rtpmap:${pt} opus`)) {
        return `a=fmtp:${pt} ${params};maxplaybackrate=16000;stereo=0;sprop-stereo=0;cbr=1`;
      }
      return match;
    });
  }

  private notifyUpdate() {
    if (this.onPeerUpdateCallback) {
      try { this.onPeerUpdateCallback(); } catch(e) {}
    }
  }
}

export const webrtcService = new WebRTCVoiceService();

