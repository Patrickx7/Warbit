import * as THREE from 'three';

/**
 * Cockpit do quadriciclo em primeira pessoa: o piloto olha para baixo e vê a frente do veículo —
 * para-lamas, bagageiro dianteiro de tubos, guidão com comandos, painel central com visor LCD e chave.
 *
 * Tudo é modelado em "coordenadas do veículo" (metros, +Y para cima, −Z para a frente) e preso à câmera
 * com a transformação inversa do olho do piloto, então a perspectiva sai certa sem ajuste manual.
 */
export class Handlebars {
  /** quanto a câmera do piloto olha para baixo (rad) */
  static readonly PITCH = 0.5;
  /** olho do piloto no espaço do veículo: altura do chão e recuo em relação ao guidão (debruçado sobre ele) */
  static readonly EYE = new THREE.Vector3(0, 1.35, 0.2);

  readonly group = new THREE.Group();
  private rig = new THREE.Group();
  private bar = new THREE.Group();
  private lcd = document.createElement('canvas');
  private lcdCtx: CanvasRenderingContext2D;
  private lcdTex: THREE.CanvasTexture;
  private lastKey = '';

  constructor(camera: THREE.Camera, sleeve: number) {
    const L = (color: number) => new THREE.MeshLambertMaterial({ color });
    const body = L(0x56633f), bodyDark = L(0x47533a), plastic = L(0x1b1c1f), plastic2 = L(0x26282c), tubeM = L(0x141516);
    const rubber = L(0x0f1011), steel = L(0x8c9096), yellow = L(0xe9c21a), grey = L(0x9aa0a6), white = L(0xe8e6de), orange = L(0xd8641c);
    const glove = L(0x3d362b), cloth = L(sleeve);

    const add = (parent: THREE.Object3D, m: THREE.Mesh) => { parent.add(m); return m; };
    const box = (parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      return add(parent, m);
    };
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    /** cilindro ligando dois pontos */
    const tube = (parent: THREE.Object3D, mat: THREE.Material, r: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, seg = 8) => {
      dir.set(bx - ax, by - ay, bz - az);
      const len = dir.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
      m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      m.quaternion.setFromUnitVectors(up, dir.normalize());
      return add(parent, m);
    };
    const R = this.rig;

    // ---------- carenagem: para-lamas dianteiros na cor do veículo + tampa central preta ----------
    for (const s of [-1, 1]) {
      box(R, body, 0.42, 0.1, 0.86, s * 0.37, 0.69, -0.55, 0, 0, -s * 0.1);     // topo do para-lama
      box(R, bodyDark, 0.16, 0.1, 0.86, s * 0.62, 0.63, -0.55, 0, 0, -s * 0.55); // aba externa caindo
      box(R, body, 0.3, 0.26, 0.5, s * 0.3, 0.6, 0.1, 0, 0, -s * 0.12);          // lateral do tanque, perto dos joelhos
      box(R, plastic2, 0.16, 0.012, 0.11, s * 0.38, 0.742 - 0.0, -0.2, 0, 0, -s * 0.1); // tampa de porta-objetos
    }
    box(R, plastic, 0.38, 0.12, 0.9, 0, 0.73, -0.55);     // tampa central
    box(R, plastic, 0.3, 0.14, 0.55, 0, 0.69, 0.12);       // frente do banco / tanque
    // adesivo de aviso (genérico, sem texto)
    box(R, white, 0.11, 0.004, 0.15, -0.37, 0.748, -0.33, 0, 0, 0.1);
    box(R, orange, 0.11, 0.005, 0.028, -0.37, 0.749, -0.39, 0, 0, 0.1);

    // ---------- bagageiro dianteiro de tubos ----------
    const ry = 0.855, zf = -1.0, zr = -0.6;
    tube(R, tubeM, 0.013, -0.47, ry, zf, 0.47, ry, zf);
    tube(R, tubeM, 0.013, -0.5, ry - 0.01, zr, 0.5, ry - 0.01, zr);
    for (const s of [-1, 1]) {
      tube(R, tubeM, 0.013, s * 0.47, ry, zf, s * 0.5, ry - 0.01, zr);
      tube(R, tubeM, 0.011, s * 0.17, ry, zf, s * 0.17, ry - 0.01, zr);
      tube(R, tubeM, 0.011, s * 0.5, ry - 0.01, zr, s * 0.46, 0.74, zr + 0.06); // pé do bagageiro
      // chapa com rasgos (os rasgos deixam ver a cor do para-lama)
      box(R, plastic, 0.28, 0.012, 0.3, s * 0.33, ry - 0.004, -0.82);
      for (const [dx, dz] of [[-0.07, -0.07], [0.06, -0.07], [-0.07, 0.07], [0.06, 0.07]]) box(R, body, 0.07, 0.014, 0.035, s * 0.33 + dx, ry - 0.003, -0.82 + dz);
    }
    tube(R, tubeM, 0.011, -0.17, ry, -0.8, 0.17, ry, -0.8);
    box(R, plastic, 0.3, 0.012, 0.16, 0, ry - 0.004, -0.9);

    // ---------- painel central (fixo na carenagem): carcaça, visor LCD, chave de ignição ----------
    box(R, plastic, 0.3, 0.16, 0.3, 0, 0.8, -0.34, -0.45);  // cobertura da coluna de direção
    // o painel fica sobre a mesa do guidão (gira com ele), com a face virada para o piloto
    const pod = new THREE.Group();
    pod.position.set(0, 0.035, 0.0);
    pod.rotation.x = -0.72;
    pod.scale.setScalar(0.82);
    this.bar.add(pod);
    box(pod, plastic2, 0.3, 0.26, 0.1, 0, 0, 0);
    box(pod, plastic, 0.2, 0.14, 0.014, 0, 0.04, 0.052);       // moldura do visor
    this.lcd.width = 256; this.lcd.height = 160;
    this.lcdCtx = this.lcd.getContext('2d')!;
    this.lcdTex = new THREE.CanvasTexture(this.lcd);
    this.lcdTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.168, 0.105), new THREE.MeshBasicMaterial({ map: this.lcdTex, toneMapped: false }));
    screen.position.set(0, 0.04, 0.0595);
    pod.add(screen);
    // botão do painel + miolo da ignição com a chave e o chaveiro
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 10), plastic);
    knob.rotation.x = Math.PI / 2; knob.position.set(-0.075, -0.05, 0.052); pod.add(knob);
    const ign = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 14), plastic);
    ign.rotation.x = Math.PI / 2; ign.position.set(0, -0.085, 0.055); pod.add(ign);
    box(pod, steel, 0.008, 0.026, 0.03, 0, -0.085, 0.078);
    box(pod, yellow, 0.02, 0.05, 0.004, 0.004, -0.125, 0.07, 0.25, 0, 0.15);

    // tampa do tanque à direita do painel
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.03, 16), plastic2);
    cap.position.set(0.25, 0.81, -0.26); R.add(cap);
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.022, 12), plastic);
    capTop.position.set(0.25, 0.832, -0.26); R.add(capTop);

    // ---------- guidão (gira com a direção) ----------
    const B = this.bar;
    B.position.set(0, 0.99, -0.24);
    R.add(B);
    tube(B, tubeM, 0.022, 0, -0.2, -0.07, 0, 0, 0);                 // coluna
    box(B, plastic, 0.11, 0.04, 0.06, 0, 0.005, 0);                 // mesa / abraçadeira
    tube(B, tubeM, 0.014, -0.2, 0, 0, 0.2, 0, 0);
    for (const s of [-1, 1]) {
      tube(B, tubeM, 0.014, s * 0.2, 0, 0, s * 0.3, 0.03, 0.05);     // curva para trás
      tube(B, tubeM, 0.014, s * 0.3, 0.03, 0.05, s * 0.36, 0.03, 0.07);
      tube(B, rubber, 0.021, s * 0.345, 0.03, 0.065, s * 0.465, 0.03, 0.105, 10); // manopla
      tube(B, rubber, 0.026, s * 0.46, 0.03, 0.103, s * 0.47, 0.03, 0.107, 10);   // flange da ponta
      // manete de freio na frente da manopla
      tube(B, tubeM, 0.006, s * 0.3, 0.035, 0.01, s * 0.45, 0.03, 0.055, 6);
    }
    // comandos da esquerda: caixa de interruptores com botão amarelo e teclas
    box(B, plastic2, 0.075, 0.06, 0.06, -0.3, 0.035, 0.05, 0, -0.35, 0);
    box(B, yellow, 0.024, 0.02, 0.014, -0.305, 0.07, 0.062, 0, -0.35, 0);
    box(B, grey, 0.016, 0.012, 0.012, -0.285, 0.068, 0.085, 0, -0.35, 0);
    box(B, grey, 0.016, 0.012, 0.012, -0.315, 0.05, 0.088, 0, -0.35, 0);
    // direita: acelerador de polegar + reservatório do freio
    box(B, plastic2, 0.07, 0.055, 0.065, 0.3, 0.035, 0.05, 0, 0.35, 0);
    box(B, plastic, 0.016, 0.012, 0.06, 0.275, 0.022, 0.1, 0, 0.5, 0);   // gatilho do acelerador
    box(B, plastic2, 0.065, 0.045, 0.05, 0.21, 0.05, -0.02);
    box(B, plastic, 0.05, 0.008, 0.038, 0.21, 0.076, -0.02);
    // mãos (luvas) nas manoplas e antebraços vindo de baixo da câmera
    for (const s of [-1, 1]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), glove);
      hand.scale.set(1.45, 0.95, 1.15);
      hand.position.set(s * 0.4, 0.05, 0.09); hand.rotation.y = s * 0.33;
      B.add(hand);
      box(B, glove, 0.03, 0.022, 0.05, s * 0.355, 0.05, 0.105, 0, s * 0.9, 0); // polegar
      // punho da luva + antebraço afinando até a mão; passa ao lado e por baixo da câmera
      tube(B, glove, 0.036, s * 0.405, 0.05, 0.12, s * 0.41, 0.045, 0.17, 10);
      dir.set(s * 0.03, -0.07, 0.5);
      const len = dir.length();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.034, len, 10), cloth);
      arm.position.set(s * 0.425, 0.01, 0.42);
      arm.quaternion.setFromUnitVectors(up, dir.normalize());
      B.add(arm);
    }

    // prende à câmera: desfaz a inclinação do olhar e leva a origem do veículo para baixo do olho
    this.rig.position.copy(Handlebars.EYE).multiplyScalar(-1);
    this.group.add(this.rig);
    this.group.rotation.x = Handlebars.PITCH;
    this.group.visible = false;
    this.group.traverse((o) => { o.frustumCulled = false; });
    camera.add(this.group);
    this.drawLcd(0, 1, false);
  }

  /** Visor LCD monocromático: velocidade em dígitos grandes, marcha e barrinha de integridade. */
  private drawLcd(kmh: number, hpFrac: number, reverse: boolean) {
    const c = this.lcdCtx, W = 256, H = 160;
    const ink = '#1d241b';
    c.fillStyle = '#0c0d0e'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#a9b59d'; c.fillRect(10, 10, W - 20, H - 20);
    // dígitos "fantasma" apagados, como em LCD de verdade
    c.textBaseline = 'alphabetic'; c.textAlign = 'right';
    c.font = 'italic bold 92px ui-monospace, Consolas, monospace';
    c.fillStyle = 'rgba(29,36,27,.07)'; c.fillText('888', 196, 100);
    c.fillStyle = ink; c.fillText(String(Math.round(kmh)), 196, 100);
    c.font = 'bold 15px system-ui'; c.textAlign = 'left';
    c.fillText('km/h', 201, 100);
    // marcha: N parado, D andando, R de ré
    c.font = 'bold 26px ui-monospace, Consolas, monospace';
    c.fillText(reverse ? 'R' : kmh < 1 ? 'N' : 'D', 206, 54);
    // integridade em 8 blocos
    c.font = 'bold 12px system-ui';
    c.fillText('HP', 22, 136);
    const on = Math.ceil(hpFrac * 8);
    for (let k = 0; k < 8; k++) {
      c.fillStyle = k < on ? ink : 'rgba(29,36,27,.12)';
      c.fillRect(46 + k * 23, 122, 19, 16);
    }
    this.lcdTex.needsUpdate = true;
  }

  update(visible: boolean, steer: number, speed: number, hpFrac: number, t: number) {
    this.group.visible = visible;
    if (!visible) return;
    this.bar.rotation.y = -steer * 0.38;
    const kmh = Math.abs(speed) * 3.6;
    const key = `${Math.round(kmh)}|${Math.ceil(hpFrac * 8)}|${speed < -0.3 ? 1 : 0}`;
    if (key !== this.lastKey) { this.lastKey = key; this.drawLcd(kmh, hpFrac, speed < -0.3); }
    // trepidação leve que cresce com a velocidade
    const shake = Math.min(1, Math.abs(speed) / 17.5) * 0.004;
    const e = Handlebars.EYE;
    this.rig.position.set(-e.x + Math.sin(t * 23) * shake * 0.6, -e.y + Math.sin(t * 31) * shake, -e.z);
  }
}
