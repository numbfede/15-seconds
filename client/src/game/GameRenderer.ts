import type { GameSnapshot, PlayerPublic } from '@15-seconds/shared';
import { GAME_CONFIG } from '@15-seconds/shared';
import { ParticleSystem } from '../systems/ParticleSystem.js';

export class GameRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private shake = 0;
  private readonly particles = new ParticleSystem();
  private cameraX = 0;
  private cameraY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  addShake(amount = 6): void {
    this.shake = Math.max(this.shake, amount);
  }

  burst(x: number, y: number, color: string): void {
    this.particles.burst(x, y, color);
  }

  update(dt: number): void {
    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - dt * 20);
  }

  render(state: GameSnapshot, localId: string | null): void {
    const ctx = this.ctx;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    const pad = 16;
    const scale = Math.min(
      (viewW - pad * 2) / state.mapWidth,
      (viewH - pad * 2) / state.mapHeight,
    );

    const local = state.players.find((p) => p.id === localId) ?? state.players[0];
    const targetX = local ? local.x : state.mapWidth / 2;
    const targetY = local ? local.y : state.mapHeight / 2;

    // soft follow
    this.cameraX += (targetX - this.cameraX) * 0.12;
    this.cameraY += (targetY - this.cameraY) * 0.12;

    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.shake ? (Math.random() - 0.5) * this.shake : 0;

    ctx.clearRect(0, 0, viewW, viewH);

    // atmosphere
    const grad = ctx.createRadialGradient(
      viewW * 0.5,
      viewH * 0.35,
      20,
      viewW * 0.5,
      viewH * 0.5,
      Math.max(viewW, viewH),
    );
    grad.addColorStop(0, '#121933');
    grad.addColorStop(1, '#05070f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.translate(viewW / 2 + shakeX, viewH / 2 + shakeY);
    ctx.scale(scale, scale);
    ctx.translate(-this.cameraX, -this.cameraY);

    this.drawGrid(ctx, state.mapWidth, state.mapHeight);
    this.drawWalls(ctx, state);
    this.drawObjective(ctx, state);
    this.drawEchoes(ctx, state);
    this.drawPlayers(ctx, state, localId);
    this.particles.draw(ctx);

    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.05)';
    ctx.lineWidth = 1;
    const step = 40;
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 245, 255, 0.2)';
    ctx.strokeRect(0, 0, w, h);
  }

  private drawWalls(ctx: CanvasRenderingContext2D, state: GameSnapshot): void {
    for (const wall of state.walls) {
      ctx.fillStyle = 'rgba(20, 28, 52, 0.95)';
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 4);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawObjective(ctx: CanvasRenderingContext2D, state: GameSnapshot): void {
    const obj = state.objective;
    if (!obj) return;

    for (const zone of obj.zones) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = zone.kind === 'safe' ? '#b8ff3c' : '#00f5ff';
      ctx.strokeStyle = zone.kind === 'safe' ? '#b8ff3c' : '#00f5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(zone.x, zone.y, zone.w, zone.h, 10);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.restore();
    }

    for (const button of obj.buttons) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(button.x, button.y, button.radius, 0, Math.PI * 2);
      ctx.fillStyle = button.pressed ? '#ff2d95' : '#2a3358';
      ctx.shadowColor = button.pressed ? '#ff2d95' : '#00f5ff';
      ctx.shadowBlur = button.pressed ? 24 : 10;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = button.pressed ? '#ffd0e8' : '#00f5ff';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      ctx.fillText(button.label, button.x, button.y + 1);
      ctx.restore();
    }

    for (const item of obj.items) {
      if (item.heldBy) continue;
      ctx.save();
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
      ctx.fillStyle = item.kind === 'package' ? '#ff9f1c' : '#80ffdb';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.restore();
    }
  }

  private drawEchoes(ctx: CanvasRenderingContext2D, state: GameSnapshot): void {
    for (const echo of state.echoes) {
      ctx.save();
      ctx.globalAlpha = echo.alpha;
      ctx.beginPath();
      ctx.arc(echo.x, echo.y, GAME_CONFIG.PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = echo.color;
      ctx.shadowColor = echo.color;
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.stroke();

      // ghost ring
      ctx.globalAlpha = echo.alpha * 0.5;
      ctx.beginPath();
      ctx.arc(echo.x, echo.y, GAME_CONFIG.PLAYER_RADIUS + 5, 0, Math.PI * 2);
      ctx.strokeStyle = echo.color;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawPlayers(
    ctx: CanvasRenderingContext2D,
    state: GameSnapshot,
    localId: string | null,
  ): void {
    for (const player of state.players) {
      this.drawPlayer(ctx, player, player.id === localId);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerPublic, isLocal: boolean): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(player.x, player.y, GAME_CONFIG.PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = isLocal ? 22 : 12;
    ctx.fill();
    ctx.lineWidth = isLocal ? 3 : 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    if (player.holdingItemId) {
      ctx.beginPath();
      ctx.arc(player.x + 10, player.y - 12, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#80ffdb';
      ctx.shadowBlur = 10;
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(player.x - 28, player.y - 30, 56, 14);
    ctx.fillStyle = '#e8f1ff';
    ctx.font = '10px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name.slice(0, 12), player.x, player.y - 23);
    ctx.restore();
  }
}
