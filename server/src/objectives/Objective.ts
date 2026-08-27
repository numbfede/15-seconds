import type {
  ButtonPublic,
  ItemPublic,
  ObjectivePublic,
  ObjectiveType,
  ScoreEvent,
  ZonePublic,
} from '@15-seconds/shared';
import { GAME_CONFIG } from '@15-seconds/shared';
import type { EchoEntity } from '../game/Recording.js';
import type { GameMap } from '../game/Map.js';
import { dist, pickRandom, pointInRect, shuffle } from '../game/Map.js';

export interface Actor {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  holdingItemId: string | null;
  isEcho: boolean;
  actionEdge: boolean;
}

export abstract class Objective {
  abstract readonly type: ObjectiveType;
  abstract readonly title: string;
  abstract readonly description: string;
  completed = false;
  progress = 0;
  target = 1;
  buttons: ButtonPublic[] = [];
  items: ItemPublic[] = [];
  zones: ZonePublic[] = [];
  protected scoreEvents: ScoreEvent[] = [];
  protected rewarded = new Set<string>();

  abstract start(map: GameMap): void;
  abstract update(dt: number, actors: Actor[], map: GameMap): void;

  isCompleted(): boolean {
    return this.completed;
  }

  drainScoreEvents(): ScoreEvent[] {
    const events = this.scoreEvents;
    this.scoreEvents = [];
    return events;
  }

  onRoundEnd(_actors: Actor[]): ScoreEvent[] {
    return this.drainScoreEvents();
  }

  toPublic(): ObjectivePublic {
    return {
      type: this.type,
      title: this.title,
      description: this.description,
      completed: this.completed,
      progress: this.progress,
      target: this.target,
      buttons: this.buttons.map((b) => ({ ...b })),
      items: this.items.map((i) => ({ ...i })),
      zones: this.zones.map((z) => ({ ...z })),
    };
  }

  protected award(playerId: string, amount: number, reason: string, onceKey?: string): void {
    const key = onceKey ?? `${playerId}:${reason}`;
    if (this.rewarded.has(key)) return;
    this.rewarded.add(key);
    this.scoreEvents.push({ playerId, amount, reason });
  }

  protected syncItemHolders(actors: Actor[]): void {
    for (const item of this.items) {
      if (!item.heldBy) continue;
      const holder = actors.find((a) => a.id === item.heldBy);
      if (!holder) {
        item.heldBy = null;
        continue;
      }
      item.x = holder.x;
      item.y = holder.y;
      holder.holdingItemId = item.id;
    }
  }

  protected tryPickup(actors: Actor[]): void {
    for (const actor of actors) {
      if (!actor.actionEdge || actor.holdingItemId) continue;
      for (const item of this.items) {
        if (item.heldBy) continue;
        if (dist(actor, item) <= GAME_CONFIG.PLAYER_RADIUS + item.radius + 6) {
          item.heldBy = actor.id;
          actor.holdingItemId = item.id;
          if (!actor.isEcho) {
            this.award(
              actor.ownerId,
              GAME_CONFIG.SCORE_SECONDARY,
              'pickup',
              `${actor.ownerId}:pickup:${item.id}`,
            );
          }
          break;
        }
      }
    }
  }

  protected tryPressButtons(actors: Actor[]): void {
    for (const button of this.buttons) {
      let pressed = false;
      for (const actor of actors) {
        if (dist(actor, button) <= button.radius + GAME_CONFIG.PLAYER_RADIUS) {
          pressed = true;
          if (actor.actionEdge && !actor.isEcho) {
            this.award(
              actor.ownerId,
              GAME_CONFIG.SCORE_SECONDARY,
              'button',
              `${actor.ownerId}:button:${button.id}`,
            );
          }
        }
      }
      button.pressed = pressed;
    }
  }
}

export class CollectObjective extends Objective {
  readonly type = 'COLLECT' as const;
  readonly title = 'COLLECT';
  readonly description = 'Pick up the orb and bring it to the zone';

  start(map: GameMap): void {
    this.target = 1;
    this.progress = 0;
    const itemPos = pickRandom(map.itemSlots);
    const zone = pickRandom(map.zoneSlots);
    this.items = [
      {
        id: 'orb-1',
        x: itemPos.x,
        y: itemPos.y,
        radius: 10,
        heldBy: null,
        kind: 'orb',
      },
    ];
    this.zones = [{ id: 'target-1', ...zone, kind: 'target', active: true }];
  }

  update(_dt: number, actors: Actor[], _map: GameMap): void {
    this.tryPickup(actors);
    this.syncItemHolders(actors);
    const zone = this.zones[0];
    if (!zone || this.completed) return;

    for (const actor of actors) {
      if (!actor.holdingItemId) continue;
      if (!pointInRect(actor.x, actor.y, zone)) continue;
      this.completed = true;
      this.progress = 1;
      this.award(actor.ownerId, GAME_CONFIG.SCORE_OBJECTIVE, 'objective');
      const item = this.items.find((i) => i.id === actor.holdingItemId);
      if (item) item.heldBy = null;
      actor.holdingItemId = null;
      break;
    }
  }
}

export class ButtonObjective extends Objective {
  readonly type = 'BUTTON' as const;
  readonly title = 'BUTTON';
  readonly description = 'Stand on the button';

  start(map: GameMap): void {
    this.target = 1;
    const pos = pickRandom(map.buttonSlots);
    this.buttons = [
      { id: 'btn-1', x: pos.x, y: pos.y, radius: 22, pressed: false, label: 'A' },
    ];
  }

  update(_dt: number, actors: Actor[], _map: GameMap): void {
    this.tryPressButtons(actors);
    const btn = this.buttons[0];
    if (!btn) return;
    this.progress = btn.pressed ? 1 : 0;
    if (btn.pressed && !this.completed) {
      this.completed = true;
      const presser = actors.find(
        (a) => dist(a, btn) <= btn.radius + GAME_CONFIG.PLAYER_RADIUS,
      );
      if (presser) {
        this.award(presser.ownerId, GAME_CONFIG.SCORE_OBJECTIVE, 'objective');
      }
    }
  }
}

export class ThreeButtonsObjective extends Objective {
  readonly type = 'THREE_BUTTONS' as const;
  readonly title = 'THREE BUTTONS';
  readonly description = 'Activate all three buttons at once';

  start(map: GameMap): void {
    this.target = 3;
    const slots = shuffle([...map.buttonSlots]).slice(0, 3);
    this.buttons = slots.map((pos, i) => ({
      id: `btn-${i + 1}`,
      x: pos.x,
      y: pos.y,
      radius: 20,
      pressed: false,
      label: String.fromCharCode(65 + i),
    }));
  }

  update(_dt: number, actors: Actor[], _map: GameMap): void {
    this.tryPressButtons(actors);
    this.progress = this.buttons.filter((b) => b.pressed).length;
    if (this.progress >= this.target && !this.completed) {
      this.completed = true;
      for (const actor of actors) {
        if (actor.isEcho) continue;
        const onButton = this.buttons.some(
          (b) => b.pressed && dist(actor, b) <= b.radius + GAME_CONFIG.PLAYER_RADIUS,
        );
        if (onButton) {
          this.award(actor.ownerId, GAME_CONFIG.SCORE_OBJECTIVE, 'objective');
        }
      }
    }
  }
}

export class ReachObjective extends Objective {
  readonly type = 'REACH' as const;
  readonly title = 'REACH';
  readonly description = 'Reach the glowing zone';
  private reached = new Set<string>();

  start(map: GameMap): void {
    this.target = 1;
    const zone = pickRandom(map.zoneSlots);
    this.zones = [{ id: 'reach-1', ...zone, kind: 'target', active: true }];
  }

  update(_dt: number, actors: Actor[], _map: GameMap): void {
    const zone = this.zones[0];
    if (!zone) return;
    for (const actor of actors) {
      if (actor.isEcho) continue;
      if (!pointInRect(actor.x, actor.y, zone)) continue;
      if (!this.reached.has(actor.ownerId)) {
        this.reached.add(actor.ownerId);
        this.award(actor.ownerId, GAME_CONFIG.SCORE_OBJECTIVE, 'objective');
      }
      this.completed = true;
      this.progress = 1;
    }
  }
}

export class DeliverObjective extends Objective {
  readonly type = 'DELIVER' as const;
  readonly title = 'DELIVER';
  readonly description = 'Deliver the package to the drop zone';

  start(map: GameMap): void {
    this.target = 1;
    const itemPos = pickRandom(map.itemSlots);
    const farZones = map.zoneSlots.filter(
      (z) => dist({ x: z.x + z.w / 2, y: z.y + z.h / 2 }, itemPos) > 200,
    );
    const zone = pickRandom(farZones.length > 0 ? farZones : map.zoneSlots);
    this.items = [
      {
        id: 'pkg-1',
        x: itemPos.x,
        y: itemPos.y,
        radius: 11,
        heldBy: null,
        kind: 'package',
      },
    ];
    this.zones = [{ id: 'drop-1', ...zone, kind: 'target', active: true }];
  }

  update(_dt: number, actors: Actor[], _map: GameMap): void {
    this.tryPickup(actors);
    this.syncItemHolders(actors);
    const zone = this.zones[0];
    if (!zone || this.completed) return;

    for (const actor of actors) {
      if (!actor.holdingItemId) continue;
      if (!pointInRect(actor.x, actor.y, zone)) continue;
      this.completed = true;
      this.progress = 1;
      this.award(actor.ownerId, GAME_CONFIG.SCORE_OBJECTIVE, 'objective');
      const item = this.items.find((i) => i.id === actor.holdingItemId);
      if (item) {
        item.heldBy = null;
        item.x = zone.x + zone.w / 2;
        item.y = zone.y + zone.h / 2;
      }
      actor.holdingItemId = null;
      break;
    }
  }
}

export class SurviveObjective extends Objective {
  readonly type = 'SURVIVE' as const;
  readonly title = 'SURVIVE';
  readonly description = 'Stay inside the safe zone';
  private timeInside = new Map<string, number>();

  start(map: GameMap): void {
    this.target = Math.floor(GAME_CONFIG.ROUND_DURATION * 0.6);
    this.zones = [{ id: 'safe-1', ...map.safeZone, kind: 'safe', active: true }];
  }

  update(dt: number, actors: Actor[], _map: GameMap): void {
    const zone = this.zones[0];
    if (!zone) return;
    let best = 0;
    for (const actor of actors) {
      if (actor.isEcho) continue;
      const inside = pointInRect(actor.x, actor.y, zone);
      const prev = this.timeInside.get(actor.ownerId) ?? 0;
      const next = inside ? prev + dt : prev;
      this.timeInside.set(actor.ownerId, next);
      best = Math.max(best, next);
      if (next >= this.target) {
        this.award(actor.ownerId, GAME_CONFIG.SCORE_OBJECTIVE, 'objective', `${actor.ownerId}:survive`);
        this.award(
          actor.ownerId,
          GAME_CONFIG.SCORE_SURVIVAL,
          'survival',
          `${actor.ownerId}:survival-bonus`,
        );
        this.completed = true;
      }
    }
    this.progress = Math.min(this.target, best);
  }

  override onRoundEnd(actors: Actor[]): ScoreEvent[] {
    for (const actor of actors) {
      if (actor.isEcho) continue;
      const t = this.timeInside.get(actor.ownerId) ?? 0;
      if (t >= this.target * 0.5) {
        this.award(
          actor.ownerId,
          GAME_CONFIG.SCORE_SURVIVAL,
          'survival',
          `${actor.ownerId}:partial-survive`,
        );
      }
    }
    if (this.progress / this.target >= 1) this.completed = true;
    return this.drainScoreEvents();
  }
}

export function createRandomObjective(): Objective {
  const pool: Objective[] = [
    new CollectObjective(),
    new ButtonObjective(),
    new ThreeButtonsObjective(),
    new ReachObjective(),
    new DeliverObjective(),
    new SurviveObjective(),
  ];
  return pickRandom(pool);
}

export function buildActors(
  players: Iterable<{
    id: string;
    x: number;
    y: number;
    holdingItemId: string | null;
    actionEdge: boolean;
  }>,
  echoes: EchoEntity[],
): Actor[] {
  const list: Actor[] = [];
  for (const p of players) {
    list.push({
      id: p.id,
      ownerId: p.id,
      x: p.x,
      y: p.y,
      holdingItemId: p.holdingItemId,
      isEcho: false,
      actionEdge: p.actionEdge,
    });
  }
  for (const e of echoes) {
    list.push({
      id: e.id,
      ownerId: e.ownerId,
      x: e.x,
      y: e.y,
      holdingItemId: e.holdingItemId,
      isEcho: true,
      actionEdge: e.consumeActionEdge(),
    });
  }
  return list;
}
