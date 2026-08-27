export class VirtualJoystick {
  private readonly zone: HTMLElement;
  private readonly knob: HTMLElement;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly maxRadius = 42;
  x = 0;
  y = 0;
  active = false;

  constructor(zone: HTMLElement, knob: HTMLElement) {
    this.zone = zone;
    this.knob = knob;

    zone.addEventListener('pointerdown', this.onDown);
    zone.addEventListener('pointermove', this.onMove);
    zone.addEventListener('pointerup', this.onUp);
    zone.addEventListener('pointercancel', this.onUp);
    zone.addEventListener('lostpointercapture', this.onUp);
  }

  setVisible(visible: boolean): void {
    this.zone.classList.toggle('visible', visible);
    if (!visible) this.reset();
  }

  dispose(): void {
    this.zone.removeEventListener('pointerdown', this.onDown);
    this.zone.removeEventListener('pointermove', this.onMove);
    this.zone.removeEventListener('pointerup', this.onUp);
    this.zone.removeEventListener('pointercancel', this.onUp);
    this.zone.removeEventListener('lostpointercapture', this.onUp);
  }

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);
    const rect = this.zone.getBoundingClientRect();
    this.originX = rect.left + rect.width / 2;
    this.originY = rect.top + rect.height / 2;
    this.active = true;
    this.updateFrom(e.clientX, e.clientY);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    e.preventDefault();
    this.updateFrom(e.clientX, e.clientY);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    this.reset();
  };

  private updateFrom(clientX: number, clientY: number): void {
    let dx = clientX - this.originX;
    let dy = clientY - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > this.maxRadius) {
      dx = (dx / len) * this.maxRadius;
      dy = (dy / len) * this.maxRadius;
    }
    this.x = dx / this.maxRadius;
    this.y = dy / this.maxRadius;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private reset(): void {
    this.pointerId = null;
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  get up(): boolean {
    return this.y < -0.25;
  }
  get down(): boolean {
    return this.y > 0.25;
  }
  get left(): boolean {
    return this.x < -0.25;
  }
  get right(): boolean {
    return this.x > 0.25;
  }
}
