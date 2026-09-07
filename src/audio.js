// RANGE audio: one engine tone plus filtered noise, a gun report and a burst for impacts. Built
// with the Web Audio API, so nothing is fetched and nothing is encoded into the bundle.
export class Audio {
  constructor() {
    this.context = null;
    this.muted = false;
  }

  // Called from a user gesture, which is what browsers require before audio may start.
  start() {
    if (this.context) { this.context.resume(); return; }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(context.destination);

    this.engine = context.createOscillator();
    this.engine.type = 'sawtooth';
    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0.005;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    this.engine.connect(filter).connect(this.engineGain).connect(this.master);
    this.engine.start();

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + Math.random() * 0.12 - 0.06) / 1.03;
      data[i] = last * 3;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    this.noiseGain = context.createGain();
    this.noiseGain.gain.value = 0.03;
    source.connect(this.noiseGain).connect(this.master);
    source.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.context.currentTime, 0.05);
    return this.muted;
  }

  update(flight, paused) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const speed = flight.velocity.length();
    this.engine.frequency.setTargetAtTime(28 + flight.spool * 68 + speed * 0.06, now, 0.2);
    this.engineGain.gain.setTargetAtTime(paused ? 0 : 0.012 + flight.spool * 0.045, now, 0.15);
    this.noiseGain.gain.setTargetAtTime(paused ? 0 : 0.04 + flight.spool * 0.18 + speed * 0.0003, now, 0.2);
  }

  gun() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const o = this.context.createOscillator();
    const g = this.context.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(72, now);
    g.gain.setValueAtTime(0.055, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(now + 0.07);
  }

  burst() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const o = this.context.createOscillator();
    const g = this.context.createGain();
    o.frequency.setValueAtTime(85, now);
    o.frequency.exponentialRampToValueAtTime(24, now + 0.8);
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(now + 1);
  }

  // A soft thump for a touchdown, scaled by the sink rate.
  touchdown(strength) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const o = this.context.createOscillator();
    const g = this.context.createGain();
    o.frequency.setValueAtTime(110, now);
    o.frequency.exponentialRampToValueAtTime(38, now + 0.35);
    g.gain.setValueAtTime(Math.min(0.25, 0.05 + strength * 0.05), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(now + 0.5);
  }
}
