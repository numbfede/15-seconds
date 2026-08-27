export class ActionButton {
  private readonly el: HTMLButtonElement;
  pressed = false;
  private pointerId: number | null = null;

  constructor(el: HTMLButtonElement) {
    this.el = el;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('lostpointercapture', this.onUp);
  }

  setVisible(visible: boolean): void {
    this.el.classList.toggle('visible', visible);
    if (!visible) this.pressed = false;
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('lostpointercapture', this.onUp);
  }

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    this.pressed = true;
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.pressed = false;
  };
}
