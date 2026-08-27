import type { ActionRecording, RecordedFrame } from '@15-seconds/shared';

export class ActionRecorder {
  private readonly frames: RecordedFrame[] = [];
  private readonly startX: number;
  private readonly startY: number;
  private readonly playerId: string;
  private readonly round: number;
  private readonly color: string;
  private lastAction = false;

  constructor(
    playerId: string,
    round: number,
    color: string,
    startX: number,
    startY: number,
  ) {
    this.playerId = playerId;
    this.round = round;
    this.color = color;
    this.startX = startX;
    this.startY = startY;
  }

  record(
    t: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    action: boolean,
  ): void {
    const last = this.frames[this.frames.length - 1];
    const moved =
      !last ||
      Math.abs(last.x - x) > 0.5 ||
      Math.abs(last.y - y) > 0.5 ||
      last.action !== action ||
      action !== this.lastAction;

    if (moved || this.frames.length === 0) {
      this.frames.push({ t, x, y, vx, vy, action });
    }
    this.lastAction = action;
  }

  finish(): ActionRecording {
    return {
      playerId: this.playerId,
      round: this.round,
      startX: this.startX,
      startY: this.startY,
      color: this.color,
      frames: this.frames,
    };
  }
}

export class EchoEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly color: string;
  readonly round: number;
  readonly recording: ActionRecording;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  holdingItemId: string | null = null;
  actionPressed = false;
  private actionEdge = false;
  private frameIndex = 0;
  alive = true;

  constructor(id: string, recording: ActionRecording) {
    this.id = id;
    this.ownerId = recording.playerId;
    this.color = recording.color;
    this.round = recording.round;
    this.recording = recording;
    this.x = recording.startX;
    this.y = recording.startY;
  }

  /** Advance echo to match elapsed round time (seconds). */
  update(elapsed: number): void {
    const frames = this.recording.frames;
    if (frames.length === 0) return;

    while (
      this.frameIndex < frames.length - 1 &&
      frames[this.frameIndex + 1]!.t <= elapsed
    ) {
      this.frameIndex++;
    }

    const a = frames[this.frameIndex]!;
    const b = frames[Math.min(this.frameIndex + 1, frames.length - 1)]!;

    if (a === b || b.t <= a.t) {
      this.x = a.x;
      this.y = a.y;
      this.vx = a.vx;
      this.vy = a.vy;
    } else {
      const u = Math.min(1, Math.max(0, (elapsed - a.t) / (b.t - a.t)));
      this.x = a.x + (b.x - a.x) * u;
      this.y = a.y + (b.y - a.y) * u;
      this.vx = a.vx + (b.vx - a.vx) * u;
      this.vy = a.vy + (b.vy - a.vy) * u;
    }

    const was = this.actionPressed;
    this.actionPressed = a.action || (elapsed >= a.t && a.action);
    // rising edge detection from interpolated frames
    const nearAction = frames
      .slice(Math.max(0, this.frameIndex - 1), this.frameIndex + 2)
      .some((f: { action: boolean; t: number }) => f.action && Math.abs(f.t - elapsed) < 0.08);
    this.actionPressed = nearAction;
    this.actionEdge = this.actionPressed && !was;
  }

  consumeActionEdge(): boolean {
    if (!this.actionEdge) return false;
    this.actionEdge = false;
    return true;
  }

  toPublic(alpha = 0.45): {
    id: string;
    ownerId: string;
    color: string;
    round: number;
    x: number;
    y: number;
    holdingItemId: string | null;
    alpha: number;
  } {
    return {
      id: this.id,
      ownerId: this.ownerId,
      color: this.color,
      round: this.round,
      x: this.x,
      y: this.y,
      holdingItemId: this.holdingItemId,
      alpha,
    };
  }
}
