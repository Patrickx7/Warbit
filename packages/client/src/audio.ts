/** Som 100% procedural (WebAudio): nenhum arquivo de áudio para baixar. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;
  private voices = 0;

  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.6;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  private burst(freq: number, q: number, dur: number, vol: number, pan: number) {
    const c = this.ctx;
    if (!c || !this.noise || !this.master || this.voices > 14 || vol < 0.004) return;
    this.voices++;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(t, Math.random() * 0.3, dur + 0.02);
    src.onended = () => { this.voices--; };
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0) {
    const c = this.ctx;
    if (!c || !this.master) return;
    const o = c.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** tiro: kind 0 fuzil, 1 smg/escopeta, 2 precisão, 3 pistola; dist em metros; pan -1..1 */
  shot(kind: number, dist: number, pan: number) {
    const att = Math.min(1, 14 / (14 + dist)) * (dist > 420 ? 0 : 1);
    const f = [900, 1400, 520, 1700][kind] ?? 900;
    const d = [0.16, 0.11, 0.34, 0.1][kind] ?? 0.15;
    const far = dist > 60 ? 0.55 : 1;
    this.burst(f * far, 0.7, d * (dist > 60 ? 1.6 : 1), 0.9 * att, pan);
    if (dist < 40) this.burst(180, 1.2, d * 0.7, 0.5 * att, pan);
  }

  boom(dist: number, pan: number) {
    const att = Math.min(1, 30 / (30 + dist));
    this.burst(120, 0.5, 0.9, 1.4 * att, pan);
    this.burst(600, 0.4, 0.35, 0.6 * att, pan);
  }

  hit(kill: boolean) { this.tone(kill ? 1250 : 900, 0.07, 0.25, 'square'); if (kill) this.tone(1700, 0.1, 0.2, 'square', 0.06); }
  hurt() { this.burst(300, 1, 0.12, 0.5, 0); }
  cash() { this.tone(1320, 0.09, 0.14, 'triangle'); this.tone(1760, 0.16, 0.14, 'triangle', 0.07); }
  click() { this.tone(520, 0.04, 0.1, 'square'); }
  reload() { this.burst(2400, 3, 0.05, 0.25, 0); }
  alert() { this.tone(660, 0.18, 0.18, 'sawtooth'); this.tone(880, 0.25, 0.18, 'sawtooth', 0.16); }
}
