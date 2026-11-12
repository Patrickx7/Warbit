import * as THREE from 'three';
import { Soldiers, type SoldierPose } from './soldiers';

export interface PreviewLook { armor: number; helmet: number; pack: number; gun: number }

/** Soldado girando na loja: mostra na hora como fica o equipamento (colete, capacete, mochila) e o uniforme do time. */
export class SoldierPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  private soldiers = new Soldiers(1);
  private w = 0; private h = 0;
  private pose: SoldierPose = { id: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: false, prone: false, sprint: false, downed: false, team: 0, armor: 0, helmet: 0, pack: 0, gun: 0, marker: 0, camo: 0, dist: 3 };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new THREE.HemisphereLight(0xe6efff, 0x5a5546, 1.35));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
    sun.position.set(1.2, 2, 1.5);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor, this.soldiers.group);
    this.camera.position.set(0, 1.0, 4.0);
    this.camera.lookAt(0, 0.9, 0);
  }

  set(look: PreviewLook, team: number) {
    const p = this.pose;
    p.team = team; p.armor = look.armor; p.helmet = look.helmet; p.pack = look.pack;
    p.gun = look.gun;
  }

  render(now: number) {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    if (cw !== this.w || ch !== this.h) {
      this.w = cw; this.h = ch;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.setSize(cw, ch, false);
      this.camera.aspect = cw / ch;
      this.camera.updateProjectionMatrix();
    }
    // gira devagar e para um instante de costas, para mostrar a mochila
    const t = now / 1000;
    this.pose.yaw = Math.PI + Math.sin(t * 0.6) * 1.9;
    this.soldiers.begin();
    this.soldiers.add(this.pose, 0);
    this.soldiers.end();
    this.renderer.render(this.scene, this.camera);
  }
}
