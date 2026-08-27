export class KeyboardInput {
  up = false;
  down = false;
  left = false;
  right = false;
  action = false;
  private readonly pressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.reset);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.reset);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'e'].includes(k)) {
      e.preventDefault();
    }
    this.pressed.add(k);
    this.sync();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.key.toLowerCase());
    this.sync();
  };

  private readonly reset = (): void => {
    this.pressed.clear();
    this.sync();
  };

  private sync(): void {
    this.up = this.pressed.has('w') || this.pressed.has('arrowup');
    this.down = this.pressed.has('s') || this.pressed.has('arrowdown');
    this.left = this.pressed.has('a') || this.pressed.has('arrowleft');
    this.right = this.pressed.has('d') || this.pressed.has('arrowright');
    this.action = this.pressed.has(' ') || this.pressed.has('e');
  }
}
