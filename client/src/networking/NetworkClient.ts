import type { ClientMessage, ServerMessage } from '@15-seconds/shared';
import { parseServerMessage } from '@15-seconds/shared';

function normalizeWsUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (trimmed.startsWith('https://')) return `wss://${trimmed.slice('https://'.length)}`;
  if (trimmed.startsWith('http://')) return `ws://${trimmed.slice('http://'.length)}`;
  return trimmed;
}

let runtimeServerUrl: string | null = null;

/**
 * Lets the deployed frontend point at a new game server without a rebuild.
 * Order: runtime config.json, then build-time env, then same-host guess.
 */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const res = await fetch(`/config.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && 'serverUrl' in data) {
      const value = (data as { serverUrl?: unknown }).serverUrl;
      if (typeof value === 'string' && value.trim().length > 0) {
        runtimeServerUrl = normalizeWsUrl(value);
      }
    }
  } catch {
    // config.json is optional
  }
}

export function resolveServerUrl(): string {
  if (runtimeServerUrl) return runtimeServerUrl;

  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv && fromEnv.trim().length > 0) {
    return normalizeWsUrl(fromEnv);
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

export type ConnectionStatus = 'idle' | 'connecting' | 'waking' | 'online' | 'offline';

type StatusHandler = (status: ConnectionStatus) => void;

/** A responsive server answers well within this; anything slower is a cold start. */
const CONNECT_TIMEOUT_MS = 6000;
/** Free hosting tiers sleep when idle and can take about a minute to boot. */
const WAKE_TIMEOUT_MS = 75000;
const MAX_QUEUE = 32;

function healthUrl(wsUrl: string): string {
  const httpUrl = wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
  return `${httpUrl}/health`;
}

export class NetworkClient {
  private ws: WebSocket | null = null;
  private readonly queue: ServerMessage[] = [];
  private readonly outbox: ClientMessage[] = [];
  private handlers = new Set<MessageHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private attempts = 0;
  playerId: string | null = null;
  connected = false;
  lastPingMs = 0;
  status: ConnectionStatus = 'idle';
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  get url(): string {
    return resolveServerUrl();
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  connect(): void {
    this.intentionallyClosed = false;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.setStatus('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.setStatus('offline');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    // A socket stuck in CONNECTING never fires onclose on some browsers, and a
    // sleeping free-tier server stays stuck there for the whole cold start.
    this.connectTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.CONNECTING) return;
      this.setStatus('waking');
      this.wakeServer();
      this.connectTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          this.setStatus('offline');
          ws.close();
        }
      }, WAKE_TIMEOUT_MS);
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      this.clearConnectTimeout();
      this.attempts = 0;
      this.connected = true;
      this.setStatus('online');
      this.flushOutbox();
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
      this.clearConnectTimeout();
      this.connected = false;
      this.stopPing();
      if (!this.intentionallyClosed) {
        this.setStatus('offline');
        this.scheduleReconnect();
      } else {
        this.setStatus('idle');
      }
    };

    ws.onerror = () => {
      // onclose handles reconnection
    };
  }

  /** An ordinary HTTP hit is what boots a sleeping instance; the socket then succeeds. */
  private wakeServer(): void {
    void fetch(healthUrl(this.url), { mode: 'no-cors', cache: 'no-store' }).catch(() => {
      // best effort
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.attempts += 1;
    const delay = Math.min(10000, 1000 * 2 ** Math.min(4, this.attempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.stopPing();
    this.clearConnectTimeout();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.outbox.length = 0;
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.setStatus('idle');
  }

  /** Sends now when open, otherwise buffers until the socket opens. */
  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return;
    }

    // Realtime input is worthless once stale, so never buffer it.
    if (msg.type !== 'INPUT' && msg.type !== 'PING' && this.outbox.length < MAX_QUEUE) {
      this.outbox.push(msg);
    }
    this.connect();
  }

  private flushOutbox(): void {
    const pending = this.outbox.splice(0, this.outbox.length);
    for (const msg of pending) {
      this.ws?.send(JSON.stringify(msg));
    }
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
