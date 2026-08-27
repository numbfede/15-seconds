import type { InputState, PlayerPublic } from '@15-seconds/shared';
import { GAME_CONFIG } from '@15-seconds/shared';
import type { GameMap } from './Map.js';
import { resolveCircleWalls } from './Map.js';
import { ActionRecorder } from './Recording.js';

export class PlayerEntity {
  readonly id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  score = 0;
  alive = true;
  holdingItemId: string | null = null;
  isBot: boolean;
  input: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
    seq: 0,
  };
  private prevAction = false;
  actionEdge = false;
  recorder: ActionRecorder | null = null;
  spawnX = 0;
  spawnY = 0;

  constructor(
    id: string,
    name: string,
    color: string,
    x: number,
    y: number,
    isBot = false,
  ) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.isBot = isBot;
  }

  setInput(input: Partial<InputState>): void {
    this.input = { ...this.input, ...input };
  }

  beginRound(round: number): void {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = 0;
    this.vy = 0;
    this.holdingItemId = null;
    this.alive = true;
    this.prevAction = false;
    this.actionEdge = false;
    this.recorder = new ActionRecorder(
      this.id,
      round,
      this.color,
      this.spawnX,
      this.spawnY,
    );
  }

  update(dt: number, map: GameMap, elapsed: number): void {
    let dx = 0;
    let dy = 0;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;
    if (this.input.up) dy -= 1;
    if (this.input.down) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
    }

    this.vx = dx * GAME_CONFIG.PLAYER_SPEED;
    this.vy = dy * GAME_CONFIG.PLAYER_SPEED;

    const next = resolveCircleWalls(
      this.x + this.vx * dt,
      this.y + this.vy * dt,
      GAME_CONFIG.PLAYER_RADIUS,
      map.walls,
      map.width,
      map.height,
    );
    this.x = next.x;
    this.y = next.y;

    this.actionEdge = this.input.action && !this.prevAction;
    this.prevAction = this.input.action;

    this.recorder?.record(
      elapsed,
      this.x,
      this.y,
      this.vx,
      this.vy,
      this.input.action,
    );
  }

  toPublic(): PlayerPublic {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      score: this.score,
      alive: this.alive,
      holdingItemId: this.holdingItemId,
      isBot: this.isBot,
    };
  }
}
