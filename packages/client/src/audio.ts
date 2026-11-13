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

  // ---------- som posicional (3D) ----------
  private lx = 0; private ly = 0; private lz = 0;
  private shots = 0;

  /** posição e direção do ouvinte (câmera); chamar a cada quadro */
  setListener(x: number, y: number, z: number, yaw: number) {
    const c = this.ctx;
    this.lx = x; this.ly = y; this.lz = z;
    if (!c) return;
    const l = c.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z); l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /**
   * Saída 3D: HRTF dá a direção (esquerda/direita e frente/trás), o volume cai com a distância,
   * e o som fica abafado de longe ou atrás de parede. Devolve o nó onde ligar as camadas do som.
   */
  private spatial(x: number, y: number, z: number, loud: number, occluded: boolean): { bus: GainNode; dist: number; delay: number } | null {
    const c = this.ctx;
    if (!c || !this.master) return null;
    const dist = Math.hypot(x - this.lx, y - this.ly, z - this.lz);
    const bus = c.createGain();
    bus.gain.value = loud * (occluded ? 0.55 : 1);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(450, (occluded ? 1400 : 15000) / (1 + dist / 55));
    const pan = c.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse';
    pan.refDistance = 7; pan.rolloffFactor = 1.15; pan.maxDistance = 10000;
    if (pan.positionX) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; } else pan.setPosition(x, y, z);
    bus.connect(lp).connect(pan).connect(this.master);
    // o som demora a chegar: ~343 m/s (de longe você vê o clarão antes de ouvir)
    return { bus, dist, delay: Math.min(1.2, dist / 343) };
  }

  private noiseLayer(out: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number, vol: number, dur: number) {
    const c = this.ctx!;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.3, dur + 0.03);
    return src;
  }
  private thump(out: AudioNode, t: number, f0: number, f1: number, vol: number, dur: number) {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.03);
  }

  /**
   * Tiro em camadas (estalo + corpo + grave + cauda de eco).
   * pos = null: é o seu próprio tiro (sem espacialização). kind 0 fuzil, 1 smg/escopeta, 2 precisão, 3 pistola.
   */
  gunshot(kind: number, pos: { x: number; y: number; z: number } | null, suppressed = false, occluded = false) {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    if (this.shots >= (pos ? 9 : 12)) return;
    const loud = [1, 0.8, 1.35, 0.7][kind] ?? 1;
    let out: AudioNode, t = c.currentTime, dist = 0;
    if (pos) {
      const sp = this.spatial(pos.x, pos.y, pos.z, loud * (suppressed ? 0.25 : 1.6), occluded);
      if (!sp) return;
      if (sp.dist > (suppressed ? 90 : 650)) return;
      out = sp.bus; t += sp.delay; dist = sp.dist;
    } else {
      const g = c.createGain(); g.gain.value = loud * (suppressed ? 0.3 : 0.75); g.connect(this.master); out = g;
    }
    this.shots++;
    const body = [850, 1300, 480, 1600][kind] ?? 850;
    const len = [0.17, 0.12, 0.36, 0.1][kind] ?? 0.16;
    let last: AudioBufferSourceNode;
    if (suppressed) {
      last = this.noiseLayer(out, t, 'bandpass', 1900, 1.4, 0.5, 0.07);
      this.thump(out, t, 220, 90, 0.25, 0.05);
    } else {
      this.noiseLayer(out, t, 'highpass', 2600, 0.5, 0.9, 0.028);             // estalo
      this.noiseLayer(out, t, 'bandpass', body, 0.7, 1.0, len);                 // corpo
      this.thump(out, t, kind === 2 ? 130 : 170, 42, 0.9, kind === 2 ? 0.2 : 0.12); // grave
      // cauda: eco de campo aberto, mais longa quanto mais longe (ajuda a perceber a distância)
      last = this.noiseLayer(out, t + 0.02, 'lowpass', 1100, 0.3, 0.22, 0.45 + Math.min(0.9, dist / 250) + (kind === 2 ? 0.35 : 0));
    }
    last.onended = () => { this.shots--; };
  }

  /** explosão posicional */
  boomAt(x: number, y: number, z: number) {
    const c = this.ctx;
    if (!c || !this.noise) return;
    const sp = this.spatial(x, y, z, 3.2, false);
    if (!sp) return;
    const t = c.currentTime + sp.delay;
    this.noiseLayer(sp.bus, t, 'highpass', 1800, 0.4, 0.8, 0.05);
    this.noiseLayer(sp.bus, t, 'bandpass', 420, 0.5, 1.2, 0.5);
    this.thump(sp.bus, t, 110, 28, 1.6, 0.7);
    this.noiseLayer(sp.bus, t + 0.05, 'lowpass', 600, 0.3, 0.5, 1.6);
  }

  // ---------- sons de compra ----------
  private cashRegister() {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    const t = c.currentTime;
    // gaveta + moedas + sininho ("ka-ching")
    this.noiseLayer(this.master, t, 'bandpass', 900, 1.2, 0.35, 0.05);
    for (let i = 0; i < 4; i++) this.noiseLayer(this.master, t + 0.03 + i * 0.022, 'bandpass', 5200 + i * 700, 9, 0.22, 0.035);
    this.tone(1975, 0.55, 0.16, 'triangle', 0.075);
    this.tone(2637, 0.7, 0.13, 'sine', 0.085);
    this.tone(3951, 0.4, 0.05, 'sine', 0.085);
  }
  /** arma engatilhando: puxa o ferrolho e solta ("clac-CLAC") */
  private cock(delay: number) {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    const t = c.currentTime + delay;
    this.noiseLayer(this.master, t, 'bandpass', 2300, 2.5, 0.5, 0.04);
    this.noiseLayer(this.master, t + 0.004, 'highpass', 5200, 0.6, 0.25, 0.018);
    this.noiseLayer(this.master, t + 0.05, 'bandpass', 1500, 6, 0.12, 0.09); // ferrolho deslizando
    this.noiseLayer(this.master, t + 0.17, 'bandpass', 1450, 2, 0.75, 0.055);
    this.noiseLayer(this.master, t + 0.172, 'highpass', 4200, 0.6, 0.35, 0.02);
    this.thump(this.master, t + 0.17, 240, 110, 0.3, 0.05);
  }
  /** zíper fechando: chiado serrilhado que sobe de tom */
  private zipper(delay: number) {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    const t = c.currentTime + delay, dur = 0.42;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(1700, t); f.frequency.exponentialRampToValueAtTime(5200, t + dur);
    const teeth = c.createGain(); teeth.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.type = 'square';
    lfo.frequency.setValueAtTime(55, t); lfo.frequency.linearRampToValueAtTime(120, t + dur);
    const depth = c.createGain(); depth.gain.value = 0.5;
    lfo.connect(depth).connect(teeth.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.42, t + 0.03);
    env.gain.setValueAtTime(0.42, t + dur - 0.05); env.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    src.connect(f).connect(teeth).connect(env).connect(this.master);
    src.start(t, 0, dur + 0.03); lfo.start(t); lfo.stop(t + dur + 0.03);
    this.noiseLayer(this.master, t + dur, 'bandpass', 3000, 3, 0.3, 0.03); // puxador batendo no fim
  }
  /** compra confirmada pelo servidor: dinheiro + som do que foi comprado */
  purchase(kind?: 'weapon' | 'gear' | 'vehicle') {
    this.unlock();
    this.cashRegister();
    if (kind === 'weapon') this.cock(0.3);
    else if (kind === 'gear') this.zipper(0.3);
    else if (kind === 'vehicle') { this.tone(3100, 0.12, 0.08, 'triangle', 0.3); this.tone(3600, 0.14, 0.07, 'triangle', 0.36); this.tone(2900, 0.16, 0.06, 'triangle', 0.43); } // chaves
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
  shot(kind: number, dist: number, pan: number, suppressed = false) {
    if(suppressed){if(dist>85)return;this.burst(420,1.2,.08,.22*(8/(8+dist)),pan);return;}
    const att = Math.min(1, 14 / (14 + dist)) * (dist > 420 ? 0 : 1);
    const f = [900, 1400, 520, 1700][kind] ?? 900;
    const d = [0.16, 0.11, 0.34, 0.1][kind] ?? 0.15;
    const far = dist > 60 ? 0.55 : 1;
    this.burst(f * far, 0.7, d * (dist > 60 ? 1.6 : 1), 0.9 * att, pan);
    if (dist < 40) this.burst(180, 1.2, d * 0.7, 0.5 * att, pan);
  }

  footstep(dist:number,pan:number,soft:boolean,crouch:boolean,sprint:boolean,occluded=false) {
    const range=crouch?9:sprint?32:23;
    if(dist>=range)return;
    const volume=(1-dist/range)**2*(crouch?.11:sprint?.48:.3)*(occluded?.3:1);
    this.burst(soft?340:760,.8,soft?.13:.085,volume,pan);
    this.burst(130,1.2,.07,volume*.55,pan);
  }
  boom(dist: number, pan: number) {
    const att = Math.min(1, 30 / (30 + dist));
    this.burst(120, 0.5, 0.9, 1.4 * att, pan);
    this.burst(600, 0.4, 0.35, 0.6 * att, pan);
  }

  hit(kill: boolean) {
    if (kill) { this.tone(280, .08, .09, 'sine'); return; }
    this.tone(900, .07, .25, 'square');
  }
  hurt() { this.burst(300, 1, 0.12, 0.5, 0); }
  cash() { this.tone(1320, 0.09, 0.14, 'triangle'); this.tone(1760, 0.16, 0.14, 'triangle', 0.07); }
  killCash() {
    const c = this.ctx;
    if (!c || !this.master || !this.noise) return;
    const t = c.currentTime;
    this.thump(this.master, t, 145, 85, .14, .09);
    this.noiseLayer(this.master, t, 'lowpass', 950, .5, .035, .045);
    this.tone(587, .19, .10, 'sine', .025);
    this.tone(784, .28, .075, 'triangle', .075);
  }
  click() { this.tone(520, 0.04, 0.1, 'square'); }
  reload() { this.burst(2400, 3, 0.05, 0.25, 0); }
  alert() { this.tone(660, 0.18, 0.18, 'sawtooth'); this.tone(880, 0.25, 0.18, 'sawtooth', 0.16); }

  /** Um motor por veículo com piloto, posicionado em 3D: some com a distância como os tiros. */
  private engines = new Map<number, { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; pan: PannerNode }>();

  updateEngines(list: { id: number; x: number; y: number; z: number; speed: number }[]) {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime;
    const seen = new Set<number>();
    for (const v of list) {
      const dist = Math.hypot(v.x - this.lx, v.y - this.ly, v.z - this.lz);
      if (dist > 220) continue;
      seen.add(v.id);
      let e = this.engines.get(v.id);
      if (!e) {
        try {
          const osc = c.createOscillator(); osc.type = 'sawtooth';
          const sub = c.createOscillator(); sub.type = 'square';
          const filter = c.createBiquadFilter(); filter.type = 'lowpass';
          const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, t); gain.gain.linearRampToValueAtTime(0.2, t + 0.25);
          const subGain = c.createGain(); subGain.gain.value = 0.35;
          const pan = c.createPanner();
          pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse';
          pan.refDistance = 3; pan.rolloffFactor = 1.6; pan.maxDistance = 10000;
          osc.connect(filter); sub.connect(subGain).connect(filter);
          filter.connect(gain).connect(pan).connect(this.master);
          osc.start(); sub.start();
          e = { osc, sub, filter, gain, pan };
          this.engines.set(v.id, e);
        } catch { continue; }
      }
      if (e.pan.positionX) { e.pan.positionX.value = v.x; e.pan.positionY.value = v.y + 0.5; e.pan.positionZ.value = v.z; } else e.pan.setPosition(v.x, v.y + 0.5, v.z);
      const f = Math.max(0, Math.min(1, Math.abs(v.speed) / 17.5));
      e.osc.frequency.setTargetAtTime(42 + f * 95, t, 0.08);
      e.sub.frequency.setTargetAtTime(21 + f * 47, t, 0.08);
      // de longe o motor fica abafado (perde os agudos)
      e.filter.frequency.setTargetAtTime(Math.max(140, (260 + f * 420) / (1 + dist / 60)), t, 0.1);
    }
    for (const [id, e] of this.engines) {
      if (seen.has(id)) continue;
      this.engines.delete(id);
      try { e.gain.gain.setTargetAtTime(0.0001, t, 0.05); e.osc.stop(t + 0.3); e.sub.stop(t + 0.3); } catch { /* ignora */ }
    }
  }
}
