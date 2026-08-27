import type { Rect, Vec2, WallPublic } from '@15-seconds/shared';
import { GAME_CONFIG } from '@15-seconds/shared';

export interface GameMap {
  width: number;
  height: number;
  walls: WallPublic[];
  spawns: Vec2[];
  buttonSlots: Vec2[];
  itemSlots: Vec2[];
  zoneSlots: Rect[];
  safeZone: Rect;
  center: Vec2;
}

function wall(x: number, y: number, w: number, h: number): WallPublic {
  return { x, y, w, h };
}

/** Compact arena with corridors, rooms, and open center. */
export function createArenaMap(): GameMap {
  const W = GAME_CONFIG.MAP_WIDTH;
  const H = GAME_CONFIG.MAP_HEIGHT;
  const t = 24;

  const walls: WallPublic[] = [
    // outer bounds
    wall(0, 0, W, t),
    wall(0, H - t, W, t),
    wall(0, 0, t, H),
    wall(W - t, 0, t, H),

    // left rooms
    wall(160, 120, t, 180),
    wall(160, 340, t, 180),
    wall(24, 280, 160, t),

    // right rooms
    wall(W - 184, 120, t, 180),
    wall(W - 184, 340, t, 180),
    wall(W - 184, 280, 160, t),

    // top / bottom corridors
    wall(280, 120, 400, t),
    wall(280, H - 144, 400, t),

    // center pillars
    wall(430, 250, 40, 140),
    wall(490, 250, 40, 140),

    // corner blocks
    wall(240, 200, 80, t),
    wall(640, 200, 80, t),
    wall(240, 416, 80, t),
    wall(640, 416, 80, t),
  ];

  const spawns: Vec2[] = [
    { x: 80, y: 80 },
    { x: W - 80, y: 80 },
    { x: 80, y: H - 80 },
    { x: W - 80, y: H - 80 },
    { x: 80, y: H / 2 },
    { x: W - 80, y: H / 2 },
    { x: W / 2, y: 80 },
    { x: W / 2, y: H - 80 },
    { x: 220, y: 80 },
    { x: W - 220, y: 80 },
    { x: 220, y: H - 80 },
    { x: W - 220, y: H - 80 },
    { x: 320, y: H / 2 },
    { x: W - 320, y: H / 2 },
    { x: W / 2, y: 200 },
  ];

  const buttonSlots: Vec2[] = [
    { x: 100, y: 200 },
    { x: W - 100, y: 200 },
    { x: 100, y: H - 200 },
    { x: W - 100, y: H - 200 },
    { x: W / 2, y: 180 },
    { x: W / 2, y: H - 180 },
    { x: 300, y: H / 2 },
    { x: W - 300, y: H / 2 },
  ];

  const itemSlots: Vec2[] = [
    { x: 200, y: 160 },
    { x: W - 200, y: 160 },
    { x: 200, y: H - 160 },
    { x: W - 200, y: H - 160 },
    { x: W / 2 - 120, y: H / 2 },
    { x: W / 2 + 120, y: H / 2 },
  ];

  const zoneSlots: Rect[] = [
    { x: W / 2 - 50, y: H / 2 - 50, w: 100, h: 100 },
    { x: 60, y: 60, w: 90, h: 90 },
    { x: W - 150, y: 60, w: 90, h: 90 },
    { x: 60, y: H - 150, w: 90, h: 90 },
    { x: W - 150, y: H - 150, w: 90, h: 90 },
  ];

  return {
    width: W,
    height: H,
    walls,
    spawns,
    buttonSlots,
    itemSlots,
    zoneSlots,
    safeZone: { x: W / 2 - 90, y: H / 2 - 90, w: 180, h: 180 },
    center: { x: W / 2, y: H / 2 },
  };
}

export function circleRectCollision(
  cx: number,
  cy: number,
  r: number,
  rect: Rect,
): boolean {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < r * r;
}

export function resolveCircleWalls(
  x: number,
  y: number,
  r: number,
  walls: WallPublic[],
  mapW: number,
  mapH: number,
): Vec2 {
  let nx = Math.max(r, Math.min(mapW - r, x));
  let ny = Math.max(r, Math.min(mapH - r, y));

  for (const wall of walls) {
    if (!circleRectCollision(nx, ny, r, wall)) continue;

    const nearestX = Math.max(wall.x, Math.min(nx, wall.x + wall.w));
    const nearestY = Math.max(wall.y, Math.min(ny, wall.y + wall.h));
    let dx = nx - nearestX;
    let dy = ny - nearestY;
    const dist = Math.hypot(dx, dy) || 0.001;
    const overlap = r - dist;
    if (overlap > 0) {
      dx /= dist;
      dy /= dist;
      nx += dx * overlap;
      ny += dy * overlap;
    }
  }

  nx = Math.max(r, Math.min(mapW - r, nx));
  ny = Math.max(r, Math.min(mapH - r, ny));
  return { x: nx, y: ny };
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}
