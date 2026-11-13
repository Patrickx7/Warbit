import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TEAM_COLORS, type VehicleState, type World } from '@warbit/shared';
import { getEquipmentVendorPos, getVendorPos, getVehicleSpawnPos } from '@warbit/shared';

const _c = new THREE.Color();
function paint(g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (m) geo.applyMatrix4(m);
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.setHex(color);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const TR = (x: number, y: number, z: number, rx: number, ry = 0, rz = 0) =>
  new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z);
const rb = (w: number, h: number, d: number, color: number, m?: THREE.Matrix4, r = 0.02) =>
  paint(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), color, m);
const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
};

// =====================================================================
// Geometrias do Quadriciclo
// =====================================================================
function quadBodyGeo(): THREE.BufferGeometry {
  return merge([
    // Chassi principal e motor
    rb(0.64, 0.42, 1.25, 0x242628, T(0, 0.42, 0), 0.04),
    // Para-lamas e capô dianteiro (verde militar tático)
    rb(1.06, 0.18, 0.72, 0x48523c, T(0, 0.62, -0.44), 0.06),
    // Para-lamas traseiro
    rb(1.14, 0.16, 0.62, 0x48523c, T(0, 0.64, 0.52), 0.06),
    // Estribos laterais (apoio dos pés)
    rb(0.22, 0.05, 0.82, 0x18181a, T(-0.46, 0.24, 0.06), 0.02),
    rb(0.22, 0.05, 0.82, 0x18181a, T(0.46, 0.24, 0.06), 0.02),
    // Para-choque dianteiro (quebra-mato tubular)
    rb(0.82, 0.26, 0.08, 0x1a1a1a, T(0, 0.48, -0.84), 0.02),
    paint(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 8), 0x777777, TR(0, 0.42, -0.84, 0, 0, Math.PI / 2)), // guincho
    // Faróis dianteiros duplos
    rb(0.14, 0.09, 0.04, 0xfff0aa, T(-0.26, 0.58, -0.81), 0.01),
    rb(0.14, 0.09, 0.04, 0xfff0aa, T(0.26, 0.58, -0.81), 0.01),
    // Lanternas traseiras
    rb(0.12, 0.06, 0.03, 0xdd2222, T(-0.32, 0.62, 0.83), 0.01),
    rb(0.12, 0.06, 0.03, 0xdd2222, T(0.32, 0.62, 0.83), 0.01),
    // Bagageiro / grade traseira
    rb(0.88, 0.08, 0.42, 0x282828, T(0, 0.76, 0.58), 0.02),
    // Banco longo acolchoado
    rb(0.32, 0.15, 0.82, 0x18181a, T(0, 0.71, 0.06), 0.05),
    // Cano de descarga
    paint(new THREE.CylinderGeometry(0.035, 0.035, 0.38, 8), 0x5a5855, TR(0.26, 0.36, 0.66, Math.PI / 4, 0, 0)),
  ]);
}

function quadHandlebarGeo(): THREE.BufferGeometry {
  return merge([
    // Coluna de direção
    paint(new THREE.CylinderGeometry(0.035, 0.045, 0.38, 8), 0x222222, TR(0, 0.18, 0, -0.38, 0, 0)),
    // Guidão horizontal
    paint(new THREE.CylinderGeometry(0.022, 0.022, 0.68, 8), 0x262626, TR(0, 0.36, 0.07, 0, 0, Math.PI / 2)),
    // Manoplas (empunhaduras de borracha)
    paint(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 8), 0x111112, TR(-0.3, 0.36, 0.07, 0, 0, Math.PI / 2)),
    paint(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 8), 0x111112, TR(0.3, 0.36, 0.07, 0, 0, Math.PI / 2)),
    // Painel / velocímetro
    rb(0.16, 0.08, 0.07, 0x1a1a1c, T(0, 0.33, 0.02), 0.01),
  ]);
}

function wheelGeo(): THREE.BufferGeometry {
  return merge([
    // Pneu largo off-road
    paint(new THREE.CylinderGeometry(0.31, 0.31, 0.22, 14), 0x1b1b1c, TR(0, 0, 0, 0, 0, Math.PI / 2)),
    // Roda / aro metálico
    paint(new THREE.CylinderGeometry(0.17, 0.17, 0.23, 10), 0x6e7175, TR(0, 0, 0, 0, 0, Math.PI / 2)),
    // Cubo central
    paint(new THREE.CylinderGeometry(0.065, 0.065, 0.24, 6), 0x282828, TR(0, 0, 0, 0, 0, Math.PI / 2)),
  ]);
}

// =====================================================================
// Geometria do Estande e Vendedor NPC da Base
// =====================================================================
function vendorBoothGeo(teamColor: number): THREE.BufferGeometry {
  return merge([
    // Balcão de oficina / garagem
    rb(2.6, 0.95, 1.1, 0x42464b, T(0, 0.475, 0), 0.04),
    // Tampo reforçado de metal escuro
    rb(2.76, 0.08, 1.2, 0x2c2f33, T(0, 0.99, 0), 0.02),
    // Pilares do toldo
    paint(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8), 0x222222, T(-1.25, 1.25, -0.45)),
    paint(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8), 0x222222, T(1.25, 1.25, -0.45)),
    paint(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8), 0x222222, T(-1.25, 1.25, 0.45)),
    paint(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8), 0x222222, T(1.25, 1.25, 0.45)),
    // Toldo / Cobertura
    rb(2.9, 0.06, 1.6, 0x6d5e41, T(0, 2.5, 0), 0.02),
    // Placa frontal com a cor do time e letreiro
    rb(2.4, 0.38, 0.06, teamColor, T(0, 2.32, 0.75), 0.02),
    rb(2.1, 0.24, 0.07, 0x1f2326, T(0, 2.32, 0.76), 0.01),
    // Tambores de óleo e ferramentas ao lado
    paint(new THREE.CylinderGeometry(0.32, 0.32, 0.88, 10), 0x2a3e5c, T(1.9, 0.44, -0.1)),
    paint(new THREE.CylinderGeometry(0.32, 0.32, 0.88, 10), 0x5c2a2a, T(1.7, 0.44, 0.5)),
    // Pilha de pneus de reserva
    paint(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 12), 0x1a1a1a, TR(-1.8, 0.11, 0.2, 0, 0, 0)),
    paint(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 12), 0x1a1a1a, TR(-1.8, 0.33, 0.2, 0, 0, 0)),
    paint(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 12), 0x1a1a1a, TR(-1.8, 0.55, 0.2, 0, 0, 0)),
    // Caixa de ferramentas vermelha sobre o balcão
    rb(0.48, 0.22, 0.25, 0xa3322a, T(0.8, 1.14, 0.05), 0.02),
  ]);
}

function vendorNpcGeo(teamColor: number): THREE.BufferGeometry {
  return merge([
    // Corpo do mecânico atrás do balcão (macacão de graxa)
    // Pernas
    paint(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 8), 0x2b3036, T(-0.16, 0.4, 0)),
    paint(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 8), 0x2b3036, T(0.16, 0.4, 0)),
    // Tronco com macacão e suspensório
    rb(0.44, 0.56, 0.26, 0x3d434a, T(0, 1.05, 0), 0.04),
    // Colete na cor do time
    rb(0.46, 0.38, 0.28, teamColor, T(0, 1.02, 0), 0.03),
    // Cabeça
    paint(new THREE.SphereGeometry(0.115, 10, 8), 0xd19b75, T(0, 1.45, 0)),
    // Boné / Boina de mecânico
    paint(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), 0x1c1e21, T(0, 1.48, 0)),
    rb(0.16, 0.02, 0.14, 0x1c1e21, T(0, 1.47, 0.12), 0.01), // aba
    // Braços apoiados no balcão
    paint(new THREE.CylinderGeometry(0.065, 0.06, 0.35, 8), 0x3d434a, TR(-0.26, 1.12, 0.12, 0.6, 0, -0.3)),
    paint(new THREE.CylinderGeometry(0.065, 0.06, 0.35, 8), 0x3d434a, TR(0.26, 1.12, 0.12, 0.6, 0, 0.3)),
  ]);
}

function padGeo(): THREE.BufferGeometry {
  return merge([
    // Chão de concreto / cascalho demarcado
    rb(3.2, 0.04, 4.2, 0x383c40, T(0, 0.02, 0), 0.02),
    // Faixas amareladas de marcação da vaga
    rb(0.15, 0.05, 3.8, 0xd4a528, T(-1.4, 0.025, 0)),
    rb(0.15, 0.05, 3.8, 0xd4a528, T(1.4, 0.025, 0)),
    rb(2.8, 0.05, 0.15, 0xd4a528, T(0, 0.025, -1.9)),
  ]);
}

interface VehicleMeshGroup {
  group: THREE.Group;
  handlebar: THREE.Group;
  wheels: THREE.Mesh[]; // FL, FR, RL, RR
  wheelSpin: number;
}

export class VehicleRenderer {
  readonly group = new THREE.Group();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private vMeshes = new Map<number, VehicleMeshGroup>();
  private quadBodyGeom: THREE.BufferGeometry;
  private quadHandlebarGeom: THREE.BufferGeometry;
  private quadWheelGeom: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, world: World) {
    this.quadBodyGeom = quadBodyGeo();
    this.quadHandlebarGeom = quadHandlebarGeo();
    this.quadWheelGeom = wheelGeo();

    scene.add(this.group);
    this.buildBaseVendors(world);
  }

  private buildBaseVendors(world: World) {
    const padGeom = padGeo();
    for (let t = 0; t < 3; t++) {
      const v = getVendorPos(t, world);
      const s = getVehicleSpawnPos(t, world);
      const teamColor = TEAM_COLORS[t];

      // Estande e NPC
      const booth = new THREE.Mesh(vendorBoothGeo(teamColor), this.mat);
      booth.position.set(v.x, v.y, v.z);
      booth.rotation.y = v.yaw;
      this.group.add(booth);

      const npc = new THREE.Mesh(vendorNpcGeo(teamColor), this.mat);
      npc.position.set(v.x, v.y, v.z);
      npc.rotation.y = v.yaw;
      this.group.add(npc);

      const eq=getEquipmentVendorPos(t,world);
      const eqBooth=new THREE.Mesh(vendorBoothGeo(0xb79948),this.mat);eqBooth.position.set(eq.x,eq.y,eq.z);eqBooth.rotation.y=eq.yaw;this.group.add(eqBooth);
      const eqNpc=new THREE.Mesh(vendorNpcGeo(teamColor),this.mat);eqNpc.position.set(eq.x,eq.y,eq.z);eqNpc.rotation.y=eq.yaw;this.group.add(eqNpc);
      const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=96;
      const ctx=signCanvas.getContext('2d')!;ctx.fillStyle='#20271d';ctx.fillRect(0,0,512,96);ctx.fillStyle='#e5cc83';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText('EQUIPAMENTO  [E]',256,58);
      const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(signCanvas)}));sign.position.set(eq.x,eq.y+3.1,eq.z);sign.scale.set(3.4,.64,1);this.group.add(sign);
      // Vaga de entrega no chão
      const pad = new THREE.Mesh(padGeom, this.mat);
      pad.position.set(s.x, s.y, s.z);
      pad.rotation.y = s.yaw;
      this.group.add(pad);
    }
  }

  private createQuadMesh(): VehicleMeshGroup {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.quadBodyGeom, this.mat);
    g.add(body);

    const hbGroup = new THREE.Group();
    hbGroup.position.set(0, 0.62, -0.32);
    const hbMesh = new THREE.Mesh(this.quadHandlebarGeom, this.mat);
    hbGroup.add(hbMesh);
    g.add(hbGroup);

    const wheels: THREE.Mesh[] = [];
    const offsets = [
      { x: -0.54, y: 0.31, z: -0.48 }, // FL
      { x: 0.54, y: 0.31, z: -0.48 },  // FR
      { x: -0.54, y: 0.31, z: 0.48 },  // RL
      { x: 0.54, y: 0.31, z: 0.48 },   // RR
    ];

    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(this.quadWheelGeom, this.mat);
      w.position.set(offsets[i].x, offsets[i].y, offsets[i].z);
      g.add(w);
      wheels.push(w);
    }

    this.group.add(g);
    return { group: g, handlebar: hbGroup, wheels, wheelSpin: 0 };
  }

  update(vehicles: VehicleState[], dt: number) {
    const seen = new Set<number>();

    for (const v of vehicles) {
      seen.add(v.id);
      let vm = this.vMeshes.get(v.id);
      if (!vm) {
        vm = this.createQuadMesh();
        this.vMeshes.set(v.id, vm);
      }

      // Posição e rotação básica (com pitch e roll para abraçar o terreno)
      vm.group.position.set(v.x, v.y, v.z);
      vm.group.rotation.set(v.pitch, v.yaw, v.roll, 'YXZ');

      // Guidão vira com a direção
      vm.handlebar.rotation.y = -v.steer * 0.45;

      // Rotação das rodas com o deslocamento
      vm.wheelSpin += (v.speed / 0.31) * dt;
      for (let i = 0; i < 4; i++) {
        const w = vm.wheels[i];
        if (i < 2) {
          // Rodas dianteiras esterçam
          w.rotation.set(vm.wheelSpin, -v.steer * 0.42, 0, 'YXZ');
        } else {
          // Rodas traseiras giram no eixo
          w.rotation.x = vm.wheelSpin;
        }
      }
    }

    // Remove veículos que não existem mais
    for (const [id, vm] of this.vMeshes) {
      if (!seen.has(id)) {
        this.group.remove(vm.group);
        this.vMeshes.delete(id);
      }
    }
  }

  remove(id: number) {
    const vm = this.vMeshes.get(id);
    if (vm) {
      this.group.remove(vm.group);
      this.vMeshes.delete(id);
    }
  }
}
