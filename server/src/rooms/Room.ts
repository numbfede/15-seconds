import type { WebSocket } from 'ws';
import type {
  ActionRecording,
  ClientMessage,
  GamePhase,
  GameSnapshot,
  LeaderboardEntry,
  LobbyState,
  ScoreEvent,
  ServerMessage,
} from '@15-seconds/shared';
import { GAME_CONFIG, PLAYER_COLORS } from '@15-seconds/shared';
import { createArenaMap, type GameMap } from '../game/Map.js';
import { PlayerEntity } from '../game/Player.js';
import { EchoEntity } from '../game/Recording.js';
import {
  buildActors,
  createRandomObjective,
  type Objective,
} from '../objectives/Objective.js';
import { updateBot } from '../game/Bots.js';

export interface ConnectedClient {
  id: string;
  ws: WebSocket | null;
  name: string;
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < GAME_CONFIG.ROOM_CODE_LENGTH; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function send(ws: WebSocket | null, msg: ServerMessage): void {
  if (!ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

export class Room {
  readonly code: string;
  hostId: string;
  private readonly clients = new Map<string, ConnectedClient>();
  private readonly players = new Map<string, PlayerEntity>();
  private phase: GamePhase = 'LOBBY';
  private round = 0;
  private timeLeft = 0;
  private phaseElapsed = 0;
  private map: GameMap = createArenaMap();
  private objective: Objective | null = null;
  private echoes: EchoEntity[] = [];
  private recordings: ActionRecording[] = [];
  private scoreEvents: ScoreEvent[] = [];
  private colorIndex = 0;
  private echoSeq = 0;
  private botSeq = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  onEmpty: (() => void) | null = null;

  constructor(hostId: string, hostName: string, hostWs: WebSocket) {
    this.code = generateRoomCode();
    this.hostId = hostId;
    this.addPlayer(hostId, hostName, hostWs, false);
  }

  get playerCount(): number {
    return this.players.size;
  }

  get isEmpty(): boolean {
    return [...this.clients.values()].every((c) => c.ws === null) &&
      [...this.players.values()].every((p) => p.isBot);
  }

  private nextColor(): string {
    const color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length]!;
    this.colorIndex++;
    return color;
  }

  private spawnPoint(index: number): { x: number; y: number } {
    return this.map.spawns[index % this.map.spawns.length]!;
  }

  addPlayer(id: string, name: string, ws: WebSocket | null, isBot: boolean): boolean {
    if (this.phase !== 'LOBBY') return false;
    if (this.players.size >= GAME_CONFIG.MAX_PLAYERS) return false;
    if (this.players.has(id)) return false;

    const spawn = this.spawnPoint(this.players.size);
    const player = new PlayerEntity(id, name, this.nextColor(), spawn.x, spawn.y, isBot);
    player.spawnX = spawn.x;
    player.spawnY = spawn.y;
    this.players.set(id, player);
    this.clients.set(id, { id, ws, name });
    this.broadcastLobby();
    return true;
  }

  reconnectOrReject(): void {
    // placeholder for future reconnect
  }

  tryJoin(id: string, name: string, ws: WebSocket): { ok: true } | { ok: false; code: string; message: string } {
    if (this.phase !== 'LOBBY') {
      return { ok: false, code: 'GAME_STARTED', message: 'GAME ALREADY STARTED' };
    }
    if (this.players.size >= GAME_CONFIG.MAX_PLAYERS) {
      return { ok: false, code: 'ROOM_FULL', message: 'ROOM FULL' };
    }
    this.addPlayer(id, name, ws, false);
    return { ok: true };
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (client) client.ws = null;

    const player = this.players.get(id);
    if (!player) {
      this.clients.delete(id);
      this.checkEmpty();
      return;
    }

    if (this.phase === 'LOBBY') {
      this.players.delete(id);
      this.clients.delete(id);
      if (this.hostId === id) {
        const next = [...this.players.values()].find((p) => !p.isBot);
        if (next) this.hostId = next.id;
      }
      this.broadcastLobby();
      this.checkEmpty();
      return;
    }

    // mid-game: mark gone but keep echoes; remove player entity
    this.players.delete(id);
    this.clients.delete(id);
    if (this.hostId === id) {
      const next = [...this.players.values()][0];
      if (next) this.hostId = next.id;
    }
    this.checkEmpty();
  }

  private checkEmpty(): void {
    const humans = [...this.players.values()].filter((p) => !p.isBot);
    const connected = [...this.clients.values()].filter((c) => c.ws);
    if (humans.length === 0 && connected.length === 0) {
      this.destroy();
      this.onEmpty?.();
    }
  }

  handleMessage(playerId: string, msg: ClientMessage): void {
    switch (msg.type) {
      case 'START_GAME':
        if (playerId === this.hostId) this.startGame();
        break;
      case 'INPUT': {
        const p = this.players.get(playerId);
        if (!p || p.isBot) break;
        if (this.phase !== 'PLAYING') break;
        p.setInput({
          up: msg.up,
          down: msg.down,
          left: msg.left,
          right: msg.right,
          action: msg.action,
          seq: msg.seq,
        });
        break;
      }
      case 'PLAY_AGAIN':
        if (playerId === this.hostId && this.phase === 'RESULTS') {
          this.resetToLobbyKeepPlayers();
        }
        break;
      case 'BACK_TO_LOBBY':
        if (this.phase === 'RESULTS') this.resetToLobbyKeepPlayers();
        break;
      case 'ADD_BOT':
        if (GAME_CONFIG.ALLOW_BOTS && playerId === this.hostId) this.addBot();
        break;
      case 'REMOVE_BOT':
        if (playerId === this.hostId) this.removeBot();
        break;
      case 'SKIP_ROUND':
        if (GAME_CONFIG.DEBUG && playerId === this.hostId) {
          if (this.phase === 'PLAYING' || this.phase === 'COUNTDOWN') {
            this.endRound();
          }
        }
        break;
      case 'LEAVE_ROOM':
        this.removeClient(playerId);
        send(this.clients.get(playerId)?.ws ?? null, { type: 'LEFT_ROOM' });
        break;
      default:
        break;
    }
  }

  private addBot(): void {
    if (this.phase !== 'LOBBY') return;
    if (this.players.size >= GAME_CONFIG.MAX_PLAYERS) return;
    this.botSeq++;
    const id = `bot-${this.botSeq}`;
    this.addPlayer(id, `Bot ${this.botSeq}`, null, true);
  }

  private removeBot(): void {
    if (this.phase !== 'LOBBY') return;
    const bot = [...this.players.values()].reverse().find((p) => p.isBot);
    if (!bot) return;
    this.players.delete(bot.id);
    this.clients.delete(bot.id);
    this.broadcastLobby();
  }

  getLobby(): LobbyState {
    return {
      roomCode: this.code,
      hostId: this.hostId,
      maxPlayers: GAME_CONFIG.MAX_PLAYERS,
      minPlayers: GAME_CONFIG.MIN_PLAYERS,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isHost: p.id === this.hostId,
        isBot: p.isBot,
        score: p.score,
      })),
    };
  }

  broadcastLobby(): void {
    this.broadcast({ type: 'LOBBY_UPDATE', lobby: this.getLobby() });
  }

  private broadcast(msg: ServerMessage): void {
    for (const client of this.clients.values()) {
      send(client.ws, msg);
    }
  }

  private startGame(): void {
    if (this.phase !== 'LOBBY') return;
    if (this.players.size < GAME_CONFIG.MIN_PLAYERS) return;

    this.round = 0;
    this.recordings = [];
    this.echoes = [];
    this.scoreEvents = [];
    for (const p of this.players.values()) p.score = 0;

    // assign stable spawns
    let i = 0;
    for (const p of this.players.values()) {
      const spawn = this.spawnPoint(i++);
      p.spawnX = spawn.x;
      p.spawnY = spawn.y;
    }

    this.beginCountdown();
    this.ensureTicking();
  }

  private beginCountdown(): void {
    this.round += 1;
    this.phase = 'COUNTDOWN';
    this.timeLeft = GAME_CONFIG.COUNTDOWN_DURATION;
    this.phaseElapsed = 0;
    this.objective = createRandomObjective();
    this.objective.start(this.map);

    // trim echoes
    while (this.echoes.length > GAME_CONFIG.MAX_ACTIVE_ECHOS) {
      this.echoes.shift();
    }

    for (const p of this.players.values()) {
      p.beginRound(this.round);
      p.setInput({
        up: false,
        down: false,
        left: false,
        right: false,
        action: false,
        seq: 0,
      });
    }

    // rebuild echoes from all prior recordings
    this.echoes = this.recordings.map((rec) => {
      this.echoSeq++;
      return new EchoEntity(`echo-${this.echoSeq}`, rec);
    });
    while (this.echoes.length > GAME_CONFIG.MAX_ACTIVE_ECHOS) {
      this.echoes.shift();
    }

    this.broadcastState();
  }

  private beginPlaying(): void {
    this.phase = 'PLAYING';
    this.timeLeft = GAME_CONFIG.ROUND_DURATION;
    this.phaseElapsed = 0;
    this.broadcastState();
  }

  private endRound(): void {
    // finalize recordings
    for (const p of this.players.values()) {
      if (p.recorder) {
        this.recordings.push(p.recorder.finish());
        p.recorder = null;
      }
    }

    const actors = buildActors(this.players.values(), this.echoes);
    if (this.objective) {
      const endEvents = this.objective.onRoundEnd(actors);
      this.applyScores(endEvents);
    }

    this.phase = 'ROUND_END';
    this.timeLeft = GAME_CONFIG.ROUND_END_DURATION;
    this.phaseElapsed = 0;
    this.broadcastState();
    if (this.scoreEvents.length > 0) {
      this.broadcast({ type: 'SCORE_POP', events: [...this.scoreEvents] });
      this.scoreEvents = [];
    }
  }

  private applyScores(events: ScoreEvent[]): void {
    for (const ev of events) {
      const p = this.players.get(ev.playerId);
      if (p) p.score += ev.amount;
      this.scoreEvents.push(ev);
    }
  }

  private goNextOrResults(): void {
    if (this.round >= GAME_CONFIG.TOTAL_ROUNDS) {
      this.phase = 'RESULTS';
      this.timeLeft = 0;
      const leaderboard: LeaderboardEntry[] = [...this.players.values()]
        .map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          score: p.score,
        }))
        .sort((a, b) => b.score - a.score);
      for (const client of this.clients.values()) {
        send(client.ws, {
          type: 'GAME_OVER',
          leaderboard,
          yourId: client.id,
        });
      }
      this.broadcastState();
      return;
    }
    this.phase = 'NEXT_ROUND';
    this.timeLeft = 0.8;
    this.phaseElapsed = 0;
    this.broadcastState();
  }

  private resetToLobbyKeepPlayers(): void {
    this.phase = 'LOBBY';
    this.round = 0;
    this.timeLeft = 0;
    this.recordings = [];
    this.echoes = [];
    this.objective = null;
    this.stopTicking();
    this.broadcastLobby();
  }

  private ensureTicking(): void {
    if (this.tickTimer) return;
    const dt = 1 / GAME_CONFIG.TICK_RATE;
    this.tickTimer = setInterval(() => this.tick(dt), 1000 / GAME_CONFIG.TICK_RATE);
  }

  private stopTicking(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private tick(dt: number): void {
    if (this.destroyed) return;

    if (this.phase === 'COUNTDOWN') {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.phaseElapsed += dt;
      if (this.timeLeft <= 0) this.beginPlaying();
      else this.broadcastState();
      return;
    }

    if (this.phase === 'PLAYING') {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.phaseElapsed += dt;
      const elapsed = GAME_CONFIG.ROUND_DURATION - this.timeLeft;

      for (const p of this.players.values()) {
        if (p.isBot) updateBot(p, this.objective, this.map, dt);
        p.update(dt, this.map, elapsed);
      }

      for (const echo of this.echoes) {
        echo.update(elapsed);
      }

      if (this.objective) {
        const actors = buildActors(
          [...this.players.values()].map((p) => ({
            id: p.id,
            x: p.x,
            y: p.y,
            holdingItemId: p.holdingItemId,
            actionEdge: p.actionEdge,
          })),
          this.echoes,
        );
        this.objective.update(dt, actors, this.map);

        // write back holdings
        for (const actor of actors) {
          if (actor.isEcho) {
            const echo = this.echoes.find((e) => e.id === actor.id);
            if (echo) echo.holdingItemId = actor.holdingItemId;
          } else {
            const p = this.players.get(actor.id);
            if (p) p.holdingItemId = actor.holdingItemId;
          }
        }

        const events = this.objective.drainScoreEvents();
        if (events.length > 0) {
          this.applyScores(events);
          this.broadcast({ type: 'SCORE_POP', events });
        }
      }

      this.broadcastState();

      if (this.timeLeft <= 0) {
        this.endRound();
      }
      return;
    }

    if (this.phase === 'ROUND_END') {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) this.goNextOrResults();
      else this.broadcastState();
      return;
    }

    if (this.phase === 'NEXT_ROUND') {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) this.beginCountdown();
      else this.broadcastState();
    }
  }

  private snapshot(): GameSnapshot {
    return {
      roomCode: this.code,
      phase: this.phase,
      round: this.round,
      totalRounds: GAME_CONFIG.TOTAL_ROUNDS,
      timeLeft: this.timeLeft,
      hostId: this.hostId,
      players: [...this.players.values()].map((p) => p.toPublic()),
      echoes: this.echoes.map((e) => e.toPublic()),
      walls: this.map.walls,
      objective: this.objective ? this.objective.toPublic() : null,
      scoreEvents: this.scoreEvents,
      mapWidth: this.map.width,
      mapHeight: this.map.height,
    };
  }

  broadcastState(): void {
    this.broadcast({ type: 'GAME_STATE', state: this.snapshot() });
  }

  destroy(): void {
    this.destroyed = true;
    this.stopTicking();
  }
}
