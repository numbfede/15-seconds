export class AudioSystem {
  private ctx: AudioContext | null = null;
  private enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  unlock(): void {
    this.ensure();
  }

  private beep(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.05): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  countdown(): void {
    this.beep(660, 0.12, 'square', 0.04);
  }

  go(): void {
    this.beep(880, 0.2, 'sawtooth', 0.05);
  }

  button(): void {
    this.beep(420, 0.08, 'triangle', 0.05);
  }

  pickup(): void {
    this.beep(740, 0.1, 'sine', 0.05);
    setTimeout(() => this.beep(980, 0.1, 'sine', 0.04), 60);
  }

  objective(): void {
    this.beep(520, 0.12, 'square', 0.05);
    setTimeout(() => this.beep(780, 0.16, 'square', 0.05), 90);
  }

  roundStart(): void {
    this.beep(300, 0.15, 'sawtooth', 0.03);
  }

  roundEnd(): void {
    this.beep(240, 0.2, 'triangle', 0.05);
  }

  echoSpawn(): void {
    this.beep(180, 0.25, 'sine', 0.03);
  }

  victory(): void {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.18, 'square', 0.04), i * 120);
    });
  }
}
