import { socketService } from './socket';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  iceTransportPolicy: 'all'
};

class WebRTCVoiceService {
  private peers: Record<string, { pc: RTCPeerConnection; stream?: MediaStream }> = {};
  private localStream: MediaStream | null = null;
  private isEnabled: boolean = false;
  private audioCtx: AudioContext | null = null;
  private analyserNodes: Record<string, AnalyserNode> = {};
  private onPeerUpdateCallback: (() => void) | null = null;

  public async start(onUpdate: () => void) {
    this.onPeerUpdateCallback = onUpdate;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        },
        video: false
      });

      this.isEnabled = true;

      // Add local stream tracks to any already open peer connections
      for (const pid in this.peers) {
        const pc = this.peers[pid].pc;
        this.localStream.getTracks().forEach(t => {
          try { pc.addTrack(t, this.localStream!); } catch(e) {}
        });
      }

      socketService.send({ type: 'rtcPeers' });
      this.notifyUpdate();
      return true;
    } catch (err) {
      console.warn('[WebRTC] Mic access denied/unavailable:', err);
      return false;
    }
  }

  public stop() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.isEnabled = false;
    for (const pid in this.peers) {
      this.closePeer(pid);
    }
    this.notifyUpdate();
  }

  public toggle(onUpdate: () => void) {
    if (this.isEnabled) {
      this.stop();
      return false;
    } else {
      return this.start(onUpdate);
    }
  }

  public getActivePeers() {
    return Object.keys(this.peers).filter(
      pid => this.peers[pid].stream || (this.peers[pid].pc && this.peers[pid].pc.connectionState === 'connected')
    );
  }

  public isVoiceActive() {
    return this.isEnabled;
  }

  private getAudioCtx() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioCtx;
  }

  private makePeerConn(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketService.send({ type: 'rtcIce', to: peerId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const actx = this.getAudioCtx();
      const src = actx.createMediaStreamSource(e.streams[0]);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyser.connect(actx.destination);
      this.analyserNodes[peerId] = analyser;

      if (this.peers[peerId]) {
        this.peers[peerId].stream = e.streams[0];
      } else {
        this.peers[peerId] = { pc, stream: e.streams[0] };
      }
      this.notifyUpdate();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.closePeer(peerId);
      }
      this.notifyUpdate();
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream!));
    }

    return pc;
  }

  public async initiatePeer(peerId: string) {
    if (this.peers[peerId]) return;
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
    } catch (e) {}
  }

  public async handleOffer(msg: any) {
    const peerId = msg.from;
    if (this.peers[peerId]) this.closePeer(peerId);
    const pc = this.makePeerConn(peerId);
    this.peers[peerId] = { pc };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      answer.sdp = this.preferOpus(answer.sdp || '');
      await pc.setLocalDescription(answer);
      socketService.send({ type: 'rtcAnswer', to: peerId, sdp: pc.localDescription });
    } catch (e) {}
  }

  public handleAnswer(msg: any) {
    if (this.peers[msg.from] && this.peers[msg.from].pc) {
      this.peers[msg.from].pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch(()=>{});
    }
  }

  public handleIce(msg: any) {
    if (this.peers[msg.from] && this.peers[msg.from].pc && msg.candidate) {
      this.peers[msg.from].pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(()=>{});
    }
  }

  public closePeer(peerId: string) {
    if (!this.peers[peerId]) return;
    try { this.peers[peerId].pc.close(); } catch(e) {}
    delete this.peers[peerId];
    delete this.analyserNodes[peerId];
    this.notifyUpdate();
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
    if (this.onPeerUpdateCallback) this.onPeerUpdateCallback();
  }
}

export const webrtcService = new WebRTCVoiceService();
