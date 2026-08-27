import type {
  GameSnapshot,
  LeaderboardEntry,
  LobbyState,
  ScoreEvent,
} from '@15-seconds/shared';
import { GAME_CONFIG } from '@15-seconds/shared';

export type MenuScreen = 'main' | 'create' | 'join' | 'lobby' | 'howto' | 'results' | 'hidden';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline';

export interface UICallbacks {
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onStart: () => void;
  onLeave: () => void;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
  onAddBot: () => void;
  onRemoveBot: () => void;
}

function loadNickname(): string {
  return localStorage.getItem('15s_nickname') ?? '';
}

function saveNickname(name: string): void {
  localStorage.setItem('15s_nickname', name);
}

export class UIManager {
  private readonly menuRoot: HTMLElement;
  private readonly hudRoot: HTMLElement;
  private readonly toastRoot: HTMLElement;
  private readonly callbacks: UICallbacks;
  private screen: MenuScreen = 'main';
  private localId: string | null = null;
  private lastCountdownSec = -1;
  private scorePops: { text: string; born: number }[] = [];
  private connection: ConnectionStatus = 'idle';
  private serverLabel = '';

  constructor(
    menuRoot: HTMLElement,
    hudRoot: HTMLElement,
    toastRoot: HTMLElement,
    callbacks: UICallbacks,
  ) {
    this.menuRoot = menuRoot;
    this.hudRoot = hudRoot;
    this.toastRoot = toastRoot;
    this.callbacks = callbacks;
    this.showMain();
  }

  setLocalId(id: string): void {
    this.localId = id;
  }

  setServerLabel(url: string): void {
    this.serverLabel = url;
  }

  setConnection(status: ConnectionStatus): void {
    if (this.connection === status) return;
    this.connection = status;
    this.paintConnection();
  }

  /** Updates the badge in place so menu inputs keep focus and typed text. */
  private paintConnection(): void {
    const badge = this.menuRoot.querySelector('#conn-badge') as HTMLElement | null;
    if (badge) {
      badge.className = `conn-badge conn-${this.connection}`;
      badge.textContent = this.connectionText();
    }
    const gate = this.menuRoot.querySelector('#conn-gate') as HTMLElement | null;
    if (gate) gate.textContent = this.gateText();
  }

  private connectionText(): string {
    switch (this.connection) {
      case 'online':
        return 'SERVER ONLINE';
      case 'connecting':
        return 'CONNECTING…';
      case 'offline':
        return 'SERVER OFFLINE';
      default:
        return 'SERVER IDLE';
    }
  }

  private gateText(): string {
    if (this.connection !== 'offline') return '';
    return this.serverLabel
      ? `Cannot reach ${this.serverLabel} — retrying automatically.`
      : 'Cannot reach the game server — retrying automatically.';
  }

  private connectionMarkup(): string {
    return `
      <div class="conn-badge conn-${this.connection}" id="conn-badge">${this.connectionText()}</div>
      <div class="conn-gate" id="conn-gate">${escapeHtml(this.gateText())}</div>
    `;
  }

  showMain(): void {
    this.screen = 'main';
    this.menuRoot.innerHTML = `
      <div class="screen">
        <div class="brand">15 SECONDS</div>
        <div class="subtitle">Your past is still playing.</div>
        ${this.connectionMarkup()}
        <div class="panel">
          <label for="nick">Nickname</label>
          <input id="nick" maxlength="16" placeholder="2–16 characters" value="${escapeHtml(loadNickname())}" />
          <div class="btn-row">
            <button class="btn-primary" id="btn-create">CREATE GAME</button>
            <button class="btn-secondary" id="btn-join">JOIN GAME</button>
            <button class="btn-ghost" id="btn-howto">HOW TO PLAY</button>
          </div>
          <div class="error" id="menu-error"></div>
        </div>
        <div class="rotate-hint">Landscape recommended for play</div>
      </div>
    `;
    const nick = this.menuRoot.querySelector('#nick') as HTMLInputElement;
    const err = this.menuRoot.querySelector('#menu-error') as HTMLElement;
    this.menuRoot.querySelector('#btn-create')?.addEventListener('click', () => {
      const name = nick.value.trim();
      if (!validName(name)) {
        err.textContent = 'Nickname must be 2–16 characters';
        return;
      }
      saveNickname(name);
      err.textContent = this.connection === 'online' ? '' : 'Connecting to server…';
      this.callbacks.onCreate(name);
    });
    this.menuRoot.querySelector('#btn-join')?.addEventListener('click', () => {
      const name = nick.value.trim();
      if (!validName(name)) {
        err.textContent = 'Nickname must be 2–16 characters';
        return;
      }
      saveNickname(name);
      this.showJoin(name);
    });
    this.menuRoot.querySelector('#btn-howto')?.addEventListener('click', () => this.showHowTo());
  }

  showJoin(name: string): void {
    this.screen = 'join';
    this.menuRoot.innerHTML = `
      <div class="screen">
        <div class="brand">JOIN</div>
        ${this.connectionMarkup()}
        <div class="panel">
          <label for="code">Room code</label>
          <input id="code" maxlength="4" placeholder="X7KF" style="text-transform:uppercase;letter-spacing:0.2em;text-align:center;font-family:Orbitron,sans-serif;" />
          <div class="btn-row">
            <button class="btn-primary" id="btn-do-join">JOIN</button>
            <button class="btn-ghost" id="btn-back">BACK</button>
          </div>
          <div class="error" id="join-error"></div>
        </div>
      </div>
    `;
    const code = this.menuRoot.querySelector('#code') as HTMLInputElement;
    const err = this.menuRoot.querySelector('#join-error') as HTMLElement;
    this.menuRoot.querySelector('#btn-do-join')?.addEventListener('click', () => {
      const c = code.value.trim();
      if (c.length < 3) {
        err.textContent = 'Enter a room code';
        return;
      }
      err.textContent = this.connection === 'online' ? '' : 'Connecting to server…';
      this.callbacks.onJoin(name, c);
    });
    this.menuRoot.querySelector('#btn-back')?.addEventListener('click', () => this.showMain());
  }

  showLobby(lobby: LobbyState, localId: string): void {
    this.screen = 'lobby';
    this.localId = localId;
    const isHost = lobby.hostId === localId;
    this.menuRoot.innerHTML = `
      <div class="screen">
        <div class="brand" style="font-size:clamp(1.6rem,6vw,2.4rem)">ROOM</div>
        <div class="panel">
          <div style="text-align:center;color:var(--muted);letter-spacing:0.14em;font-size:0.75rem;">ROOM CODE</div>
          <div class="room-code">${escapeHtml(lobby.roomCode)}</div>
          <div style="text-align:center;margin-top:8px;color:var(--muted);">
            PLAYERS ${lobby.players.length} / ${lobby.maxPlayers}
          </div>
          <ul class="player-list">
            ${lobby.players
              .map(
                (p) => `
              <li>
                <span class="swatch" style="color:${p.color};background:${p.color}"></span>
                <span>${escapeHtml(p.name)}${p.isHost ? ' ★' : ''}${p.isBot ? ' (bot)' : ''}</span>
              </li>`,
              )
              .join('')}
          </ul>
          <div class="btn-row">
            ${
              isHost
                ? `<button class="btn-primary" id="btn-start">START GAME</button>
                   ${
                     GAME_CONFIG.ALLOW_BOTS
                       ? `<button class="btn-secondary" id="btn-add-bot">ADD BOT</button>
                          <button class="btn-ghost" id="btn-remove-bot">REMOVE BOT</button>`
                       : ''
                   }`
                : `<div style="text-align:center;color:var(--muted);">Waiting for host…</div>`
            }
            <button class="btn-danger" id="btn-leave">LEAVE</button>
          </div>
          <div class="error" id="lobby-error"></div>
        </div>
      </div>
    `;
    this.menuRoot.querySelector('#btn-start')?.addEventListener('click', () => {
      this.callbacks.onStart();
    });
    this.menuRoot.querySelector('#btn-leave')?.addEventListener('click', () => {
      this.callbacks.onLeave();
      this.showMain();
    });
    this.menuRoot.querySelector('#btn-add-bot')?.addEventListener('click', () => {
      this.callbacks.onAddBot();
    });
    this.menuRoot.querySelector('#btn-remove-bot')?.addEventListener('click', () => {
      this.callbacks.onRemoveBot();
    });
  }

  updateLobby(lobby: LobbyState): void {
    if (this.screen !== 'lobby' || !this.localId) return;
    this.showLobby(lobby, this.localId);
  }

  showHowTo(): void {
    this.screen = 'howto';
    this.menuRoot.innerHTML = `
      <div class="screen">
        <div class="brand" style="font-size:clamp(1.4rem,5vw,2rem)">HOW TO PLAY</div>
        <div class="panel how-to">
          <p><strong>Every round lasts 15 seconds.</strong> Your actions are recorded.</p>
          <p>Next round, your <strong>Echo</strong> repeats them — and can press buttons or pick up items.</p>
          <p>Use your past self to complete chaotic objectives across 7 rounds.</p>
          <p>Desktop: WASD / arrows + Space/E<br/>Mobile: joystick + ACTION</p>
          <div class="btn-row">
            <button class="btn-primary" id="btn-back">GOT IT</button>
          </div>
        </div>
      </div>
    `;
    this.menuRoot.querySelector('#btn-back')?.addEventListener('click', () => this.showMain());
  }

  hideMenus(): void {
    this.screen = 'hidden';
    this.menuRoot.innerHTML = '';
  }

  showError(message: string): void {
    const el =
      this.menuRoot.querySelector('#menu-error') ||
      this.menuRoot.querySelector('#join-error') ||
      this.menuRoot.querySelector('#lobby-error');
    if (el) el.textContent = message;
    this.toast(message);
  }

  toast(message: string): void {
    this.toastRoot.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
    setTimeout(() => {
      this.toastRoot.innerHTML = '';
    }, 2800);
  }

  showResults(leaderboard: LeaderboardEntry[], yourId: string): void {
    this.screen = 'results';
    this.menuRoot.innerHTML = `
      <div class="screen">
        <div class="panel results">
          <h2>TIME COLLAPSED</h2>
          <ul class="leaderboard">
            ${leaderboard
              .map(
                (e, i) => `
              <li class="${e.id === yourId ? 'you' : ''}">
                <span>${i + 1}</span>
                <span style="color:${e.color}">${escapeHtml(e.name)}</span>
                <span>${e.score}</span>
              </li>`,
              )
              .join('')}
          </ul>
          <div class="btn-row">
            <button class="btn-primary" id="btn-again">PLAY AGAIN</button>
            <button class="btn-ghost" id="btn-lobby">BACK TO LOBBY</button>
          </div>
        </div>
      </div>
    `;
    this.menuRoot.querySelector('#btn-again')?.addEventListener('click', () => {
      this.callbacks.onPlayAgain();
    });
    this.menuRoot.querySelector('#btn-lobby')?.addEventListener('click', () => {
      this.callbacks.onBackToLobby();
    });
  }

  pushScoreEvents(events: ScoreEvent[]): void {
    const now = performance.now();
    for (const ev of events) {
      this.scorePops.push({ text: `+${ev.amount} ${ev.reason}`, born: now });
    }
  }

  renderHud(state: GameSnapshot | null, opts: { fps: number; ping: number; debug: boolean }): void {
    if (!state || state.phase === 'LOBBY' || state.phase === 'RESULTS') {
      this.hudRoot.innerHTML = '';
      return;
    }

    const local = state.players.find((p) => p.id === this.localId);
    const timer =
      state.phase === 'PLAYING'
        ? state.timeLeft.toFixed(1)
        : state.phase === 'COUNTDOWN'
          ? String(Math.ceil(state.timeLeft))
          : state.phase === 'ROUND_END'
            ? 'DONE'
            : '…';

    const countdownFlash =
      state.phase === 'COUNTDOWN'
        ? `<div class="overlay-center"><div class="countdown-num">${Math.max(1, Math.ceil(state.timeLeft))}</div></div>`
        : state.phase === 'ROUND_END'
          ? `<div class="overlay-center"><div class="phase-label">ROUND COMPLETE</div></div>`
          : state.phase === 'NEXT_ROUND'
            ? `<div class="overlay-center"><div class="phase-label">NEXT ROUND</div></div>`
            : state.phase === 'PLAYING' && state.timeLeft > GAME_CONFIG.ROUND_DURATION - 0.4
              ? `<div class="overlay-center"><div class="phase-label">GO!</div></div>`
              : '';

    if (state.phase === 'COUNTDOWN') {
      const sec = Math.ceil(state.timeLeft);
      if (sec !== this.lastCountdownSec) this.lastCountdownSec = sec;
    }

    const now = performance.now();
    this.scorePops = this.scorePops.filter((p) => now - p.born < 1200);

    this.hudRoot.innerHTML = `
      <div class="hud">
        <div class="hud-top">
          <div class="hud-pill hud-left">👥 ${state.players.length}</div>
          <div class="hud-center hud-pill">
            <div>
              <div class="round">ROUND ${state.round} / ${state.totalRounds}</div>
              <div class="timer">${timer}</div>
            </div>
          </div>
          <div class="hud-pill hud-right">★ ${local?.score ?? 0}</div>
        </div>
        ${
          state.objective
            ? `<div class="objective-banner">
                <div class="title">${escapeHtml(state.objective.title)} (${state.objective.progress}/${state.objective.target})</div>
                <div class="desc">${escapeHtml(state.objective.description)}</div>
              </div>`
            : ''
        }
        ${countdownFlash}
        <div class="score-pops">
          ${this.scorePops.map((p) => `<div class="score-pop">${escapeHtml(p.text)}</div>`).join('')}
        </div>
        ${
          opts.debug
            ? `<div class="debug-overlay">FPS ${opts.fps.toFixed(0)}
PING ${opts.ping}ms
PLAYERS ${state.players.length}
ECHOS ${state.echoes.length}
ROUND ${state.round}
STATE ${state.phase}</div>`
            : ''
        }
      </div>
    `;
  }

  get lastCountdown(): number {
    return this.lastCountdownSec;
  }
}

function validName(name: string): boolean {
  return name.length >= GAME_CONFIG.NICKNAME_MIN && name.length <= GAME_CONFIG.NICKNAME_MAX;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
