import type { PlayerEntity } from './Player.js';
import type { GameMap } from './Map.js';
import { dist } from './Map.js';
import type { Objective } from '../objectives/Objective.js';

interface BotBrain {
  changeAt: number;
  targetX: number;
  targetY: number;
  actionUntil: number;
}

const brains = new WeakMap<PlayerEntity, BotBrain>();

function ensureBrain(player: PlayerEntity, _map: GameMap): BotBrain {
  let brain = brains.get(player);
  if (!brain) {
    brain = {
      changeAt: 0,
      targetX: player.x,
      targetY: player.y,
      actionUntil: 0,
    };
    brains.set(player, brain);
  }
  return brain;
}

export function updateBot(
  player: PlayerEntity,
  objective: Objective | null,
  map: GameMap,
  dt: number,
): void {
  const brain = ensureBrain(player, map);
  brain.changeAt -= dt;
  brain.actionUntil -= dt;

  // seek objective interest points
  let interestX = brain.targetX;
  let interestY = brain.targetY;

  if (objective) {
    const btn = objective.buttons.find((b) => !b.pressed) ?? objective.buttons[0];
    const item = objective.items.find((i) => !i.heldBy);
    const zone = objective.zones[0];

    if (player.holdingItemId && zone) {
      interestX = zone.x + zone.w / 2;
      interestY = zone.y + zone.h / 2;
    } else if (item && !player.holdingItemId) {
      interestX = item.x;
      interestY = item.y;
    } else if (btn) {
      interestX = btn.x;
      interestY = btn.y;
    } else if (zone) {
      interestX = zone.x + zone.w / 2;
      interestY = zone.y + zone.h / 2;
    }
  }

  if (brain.changeAt <= 0) {
    brain.changeAt = 0.6 + Math.random() * 1.2;
    const jitter = 40;
    brain.targetX = interestX + (Math.random() - 0.5) * jitter;
    brain.targetY = interestY + (Math.random() - 0.5) * jitter;
    brain.targetX = Math.max(40, Math.min(map.width - 40, brain.targetX));
    brain.targetY = Math.max(40, Math.min(map.height - 40, brain.targetY));
  }

  const dx = brain.targetX - player.x;
  const dy = brain.targetY - player.y;
  const dead = 12;

  player.setInput({
    left: dx < -dead,
    right: dx > dead,
    up: dy < -dead,
    down: dy > dead,
    action: brain.actionUntil > 0,
    seq: player.input.seq + 1,
  });

  // press action near interactables
  if (objective) {
    const nearButton = objective.buttons.some(
      (b) => dist(player, b) < b.radius + 20,
    );
    const nearItem = objective.items.some(
      (i) => !i.heldBy && dist(player, i) < i.radius + 24,
    );
    if ((nearButton || nearItem) && brain.actionUntil <= -0.4) {
      brain.actionUntil = 0.25;
    }
  }
}
