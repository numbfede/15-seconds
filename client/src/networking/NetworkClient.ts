import type { ClientMessage, ServerMessage } from '@15-seconds/shared';
import { parseServerMessage } from '@15-seconds/shared';

export function resolveServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/$/, '');
  }

  const { protocol, hostname } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

  // Same-host reverse proxy default
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `${wsProtocol}//${hostname}`;
  }

  return `${wsProtocol}//${hostname}:3001`;
}

type MessageHandler = (msg: ServerMessage) => void;

export class NetworkClient {
  private ws: WebSocket | null = null;
  private readonly queue: ServerMessage[] = [];
  private handlers = new Set<MessageHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  playerId: string | null = null;
  connected = false;
  lastPingMs = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  get url(): string {
    return resolveServerUrl();
  }

  connect(): void {
    this.intentionallyClosed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.startPing();
    };

    ws.onmessage = (ev) => {
      const msg = parseServerMessage(String(ev.data));
      if (!msg) return;
      if (msg.type === 'WELCOME') this.playerId = msg.playerId;
      if (msg.type === 'PONG') this.lastPingMs = Math.max(0, Date.now() - msg.t);
      this.queue.push(msg);
      for (const handler of this.handlers) handler(msg);
    };

    ws.onclose = () => {
      this.connected = false;
      this.stopPing();
      if (!this.intentionallyClosed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 1200);
      }
    };

    ws.onerror = () => {
      // onclose will handle reconnect
    };
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  drain(): ServerMessage[] {
    const out = this.queue.splice(0, this.queue.length);
    return out;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'PING', t: Date.now() });
    }, 2000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
