// RANGE audio: one engine tone plus filtered noise, a gun report and a burst for impacts. Built
// with the Web Audio API, so nothing is fetched and nothing is encoded into the bundle.
export class Audio {
  constructor() {
    this.context = null;
    this.muted = false;
  }

  // Called from a user gesture, which is what browsers require before audio may start. iOS also
  // mutes Web Audio under the ringer switch unless the page claims a playback session, so that is
  // asked for here (Safari 17), and the context is resumed explicitly: Safari can hand one over
  // suspended even inside the gesture.
  start() {
    if (this.context) { this.context.resume(); return; }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not offered */ }
    const context = new Context();
    this.context = context;
    context.resume();
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
    this.seekerTone=context.createOscillator();this.seekerTone.type='sine';
    this.seekerGain=context.createGain();this.seekerGain.gain.value=0;
    this.seekerTone.connect(this.seekerGain).connect(this.master);this.seekerTone.start();

    // One continuous, cadence-shaped cannon loop. Gating its gain avoids overlapping reports.
    const cannon = context.createBuffer(1, Math.round(context.sampleRate*.065)*16, context.sampleRate);
    const samples = cannon.getChannelData(0), period = Math.round(context.sampleRate*.065);
    for (let i=0;i<samples.length;i++) {
      const t=(i%period)/context.sampleRate;
      samples[i]=(Math.random()*2-1)*Math.exp(-t*85)*.65 + Math.sin(t*2*Math.PI*92)*Math.exp(-t*48)*.55;
    }
    this.cannon = context.createBufferSource();this.cannon.buffer=cannon;this.cannon.loop=true;
    this.cannonGain=context.createGain();this.cannonGain.gain.value=0;
    this.cannonPanner=context.createPanner();this.cannonPanner.panningModel='HRTF';
    this.cannonPanner.refDistance=30;this.cannonPanner.rolloffFactor=.6;
    this.cannon.connect(this.cannonGain).connect(this.cannonPanner).connect(this.master);this.cannon.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.context.currentTime, 0.05);
    return this.muted;
  }

  seeker(enabled,locked,acquiring){
    if(!this.context)return;const t=this.context.currentTime;
    this.seekerTone.frequency.setTargetAtTime(locked?870:acquiring?620:380,t,.06);
    this.seekerGain.gain.setTargetAtTime(enabled?(locked?.019:(Math.sin(t*14)>0?.007:0)):0,t,.03);
  }

  update(flight, paused) {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (paused || flight.crashed) this.setGun(false);
    const speed = flight.velocity.length();
    this.engine.frequency.setTargetAtTime(28 + flight.spool * 68 + speed * 0.06, now, 0.2);
    this.engineGain.gain.setTargetAtTime(paused || flight.crashed ? 0 : 0.012 + flight.spool * 0.045, now, 0.15);
    this.noiseGain.gain.setTargetAtTime(paused || flight.crashed ? 0 : 0.04 + flight.spool * 0.18 + speed * 0.0003, now, 0.2);
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

  setGun(firing, flight, camera) {
    if (!this.context) return;
    const now=this.context.currentTime;
    if (firing !== this.gunActive) {
      if (firing) {
        const buffer=this.cannon.buffer;this.cannon.stop();this.cannon.disconnect();
        this.cannon=this.context.createBufferSource();this.cannon.buffer=buffer;this.cannon.loop=true;
        this.cannon.connect(this.cannonGain);this.cannon.start(now);
      }
      this.cannonGain.gain.setTargetAtTime(firing ? .48 : 0,now,.006);
      this.gunActive=firing;
    }
    if (!flight || !camera) return;
    const position=flight.position.clone().addScaledVector(flight.basis().forward,8);
    this.cannonPanner.setPosition(position.x,position.y,position.z);
    const forward=camera.getWorldDirection(position), up=camera.up;
    const listener=this.context.listener;
    listener.setPosition(camera.position.x,camera.position.y,camera.position.z);
    listener.setOrientation(forward.x,forward.y,forward.z,up.x,up.y,up.z);
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
