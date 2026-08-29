import { SERVER_WS_URL } from '../config';

type MessageHandler = (msg: any) => void;

class SocketService {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private roomCode: string | null = null;
  private playerName: string = '';
  private playerColor: string = '';
  private isExplicitDisconnect: boolean = false;
  private pendingDirs: Array<{ x: number; y: number }> = [];

  public connect(roomCode: string | null, playerName: string, playerColor: string) {
    this.roomCode = roomCode;
    this.playerName = playerName;
    this.playerColor = playerColor;
    this.isExplicitDisconnect = false;
    this.initSocket();
  }

  private initSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch(e) {}
    }

    try {
      console.log('[Socket] Connecting to', SERVER_WS_URL);
      this.ws = new WebSocket(SERVER_WS_URL);

      this.ws.onopen = () => {
        console.log('[Socket] Connected');
        this.startPing();
        const token = this.getToken();

        if (this.roomCode) {
          this.send({
            type: 'joinRoom',
            code: this.roomCode,
            token,
            name: this.playerName,
            color: this.playerColor
          });
        } else {
          // Send name & color with createRoom so the server assigns them immediately
          this.send({
            type: 'createRoom',
            name: this.playerName,
            color: this.playerColor
          });
        }
        this.flushPendingDirs();
      };

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          // Server creates the room then expects a joinRoom — do it automatically
          if (msg.type === 'roomCreated') {
            this.roomCode = msg.code;
            this.send({
              type: 'joinRoom',
              code: msg.code,
              token: this.getToken(),
              name: this.playerName,
              color: this.playerColor
            });
            return; // don't forward roomCreated to UI
          }
          this.handlers.forEach(h => h(msg));
        } catch (err) {
          console.error('[Socket] Parse error:', err);
        }
      };

      this.ws.onclose = (ev) => {
        console.warn('[Socket] Closed', ev.code, ev.reason);
        this.stopPing();
        if (!this.isExplicitDisconnect) {
          this.handlers.forEach(h => h({ type: 'error', reason: 'Lost connection to server. Retrying…' }));
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (ev) => {
        console.error('[Socket] Error', ev);
        this.handlers.forEach(h => h({ type: 'error', reason: 'Cannot reach the game server. Is it running?' }));
        try { this.ws?.close(); } catch(e) {}
      };
    } catch (err) {
      console.error('[Socket] Connection failure:', err);
      this.handlers.forEach(h => h({ type: 'error', reason: 'Failed to connect to server.' }));
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitDisconnect) {
        this.initSocket();
      }
    }, 1500);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      }
    }, 6000);
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
  }

  public send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public sendDirection(dir: { x: number; y: number }) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'dir', dir }));
    } else {
      this.pendingDirs.push(dir);
      if (this.pendingDirs.length > 3) this.pendingDirs.shift();
    }
  }

  private flushPendingDirs() {
    while (this.pendingDirs.length) {
      const d = this.pendingDirs.shift();
      if (d) this.send({ type: 'dir', dir: d });
    }
  }

  public addListener(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  public getToken(): string | null {
    return localStorage.getItem('snakeToken_' + (this.roomCode || 'x'));
  }

  public setToken(t: string) {
    localStorage.setItem('snakeToken_' + (this.roomCode || 'x'), t);
  }

  public disconnect() {
    this.isExplicitDisconnect = true;
    clearTimeout(this.reconnectTimer);
    this.stopPing();
    if (this.ws) {
      try { this.ws.close(); } catch(e) {}
      this.ws = null;
    }
  }
}

export const socketService = new SocketService();
