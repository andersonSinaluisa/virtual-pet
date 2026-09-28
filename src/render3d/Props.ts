/*
 * PROPS: objetos del mundo con primitivas (portado de js/pet3d/Props.js).
 * Cada función devuelve un THREE.Group con el origen apoyado en el suelo.
 * Móvil: la pelota usa una DataTexture a rayas (no hay canvas 2D) y se
 * añaden la cuerda, la caja misteriosa y la galletita.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import type { ItemKind } from '@/core/world/Items';

import { PetModel } from './PetModel';
import { PetGeometry, PetMaterials } from './PetMaterials';

type V3 = [number, number, number];
const M = PetMaterials;
const S = () => PetGeometry.sphere();

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, pos: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], rot: V3 = [0, 0, 0]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 4, r);
const cyl = (rt: number, rb: number, h: number, seg = 40) => new THREE.CylinderGeometry(rt, rb, h, seg);

function bed(): THREE.Group {
  const g = new THREE.Group();
  mesh(rbox(1.25, 0.2, 0.9, 0.09), M.plush('#BCADF4'), g, [0, 0.1, 0]);
  mesh(rbox(1.12, 0.12, 0.78, 0.06), M.plush('#E7DEFF'), g, [0, 0.22, 0]);
  mesh(S(), M.plush('#FFFFFF'), g, [-0.36, 0.3, -0.05], [0.24, 0.09, 0.2]);
  return g;
}

function bowl(color: string): THREE.Group {
  const g = new THREE.Group();
  const outer = mesh(cyl(0.3, 0.24, 0.16), M.glossy(color), g, [0, 0.08, 0]);
  mesh(new THREE.TorusGeometry(0.29, 0.03, 12, 40), M.glossy(color), g, [0, 0.16, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  mesh(cyl(0.26, 0.26, 0.01), M.flat('#5c3b2a', 0.9), g, [0, 0.12, 0]);
  g.userData.outer = outer;
  return g;
}

function foodBowl(): THREE.Group {
  const g = bowl('#FF9E79');
  const kibble = new THREE.Group(); g.add(kibble);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, r = 0.05 + (i % 5) * 0.035;
    mesh(PetGeometry.sphereLow(), M.plush(i % 3 ? '#C9884A' : '#B06F38'), kibble, [Math.cos(a) * r, 0.15 + (i % 4) * 0.012, Math.sin(a) * r], [0.045, 0.03, 0.045]);
  }
  g.userData.kibble = kibble.children;
  return g;
}

function waterBowl(): THREE.Group {
  const g = bowl('#7DD8B7');
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.25, 40), new THREE.MeshPhysicalMaterial({ color: '#93C5FD', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.15; g.add(water);
  g.userData.water = water;
  return g;
}

let ballTex: THREE.DataTexture | null = null;
function ballTexture(): THREE.DataTexture {
  if (ballTex) return ballTex;
  const w = 128, h = 64, data = new Uint8Array(w * h * 4);
  const cols = [[0xff, 0x6f, 0x91], [0xff, 0xd1, 0x66]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cols[Math.floor(x / 32) % 2], k = (y * w + x) * 4;
    data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
  }
  ballTex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  ballTex.colorSpace = THREE.SRGBColorSpace;
  ballTex.magFilter = THREE.LinearFilter;
  ballTex.minFilter = THREE.LinearFilter;
  ballTex.needsUpdate = true;
  return ballTex;
}

function ball(): THREE.Group {
  const g = new THREE.Group();
  mesh(S(), new THREE.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.35, clearcoat: 0.6 }), g, [0, 0.15, 0], [0.15, 0.15, 0.15]);
  return g;
}

function teddy(): THREE.Group {
  // Reutiliza el mismo generador de mascotas: un osito de peluche quieto
  const model = new PetModel({ species: 'bear', bodyColor: '#C98F5A', bellyColor: '#F1D3AE', innerEarColor: '#F1D3AE', fur: false });
  const g = new THREE.Group();
  model.root.scale.setScalar(0.38);
  g.add(model.root);
  return g;
}

function tent(): THREE.Group {
  const g = new THREE.Group();
  const fabric = M.plush('#FFB59A'), dark = M.flat('#763216', 0.95);
  [-1, 1].forEach((s) => mesh(rbox(0.06, 0.95, 1.0, 0.03), fabric, g, [0.3 * s, 0.4, 0], [1, 1, 1], [0, 0, 0.62 * s]));
  const back = new THREE.Shape(); back.moveTo(-0.58, 0); back.lineTo(0.58, 0); back.lineTo(0, 0.78); back.lineTo(-0.58, 0);
  mesh(new THREE.ShapeGeometry(back), dark, g, [0, 0.02, -0.46]);
  mesh(cyl(0.03, 0.03, 1.04, 12), M.flat('#8a5a3b'), g, [0, 0.8, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  mesh(rbox(1.0, 0.03, 0.95, 0.015), M.plush('#FBE3C8'), g, [0, 0.015, 0]);
  return g;
}

function novel(kind: ItemKind): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'gift':
      mesh(rbox(0.32, 0.28, 0.32, 0.04), M.plush('#E35D8C'), g, [0, 0.14, 0]);
      mesh(rbox(0.07, 0.3, 0.34, 0.02), M.glossy('#FFD166'), g, [0, 0.15, 0]);
      mesh(rbox(0.34, 0.3, 0.07, 0.02), M.glossy('#FFD166'), g, [0, 0.15, 0]);
      [-1, 1].forEach((s) => mesh(S(), M.glossy('#FFD166'), g, [0.06 * s, 0.32, 0], [0.07, 0.05, 0.04], [0, 0, 0.5 * s]));
      break;
    case 'mysteryBox':
      mesh(rbox(0.46, 0.42, 0.46, 0.06), M.plush('#F7D9CC'), g, [0, 0.21, 0]);
      mesh(rbox(0.06, 0.44, 0.48, 0.02), M.plush('#B88A78'), g, [0, 0.22, 0]);
      mesh(rbox(0.48, 0.44, 0.06, 0.02), M.plush('#B88A78'), g, [0, 0.22, 0]);
      mesh(rbox(0.14, 0.03, 0.03, 0.01), M.flat('#763216'), g, [0, 0.44, 0]);
      break;
    case 'cactus':
      mesh(cyl(0.14, 0.11, 0.16), M.plush('#E07A4F'), g, [0, 0.08, 0]);
      mesh(PetGeometry.capsule(), M.plush('#6DBE4B'), g, [0, 0.34, 0], [0.08, 0.1, 0.08]);
      [-1, 1].forEach((s) => mesh(PetGeometry.capsule(), M.plush('#6DBE4B'), g, [0.12 * s, 0.36, 0], [0.04, 0.04, 0.04], [0, 0, -0.6 * s]));
      break;
    case 'duck':
      mesh(S(), M.plush('#FFD84A'), g, [0, 0.12, 0], [0.16, 0.12, 0.2]);
      mesh(S(), M.plush('#FFD84A'), g, [0, 0.28, 0.1], [0.1, 0.1, 0.1]);
      mesh(PetGeometry.cone(), M.glossy('#FF9F43'), g, [0, 0.27, 0.22], [0.04, 0.08, 0.03], [Math.PI / 2, 0, 0]);
      [-1, 1].forEach((s) => mesh(S(), M.eye(), g, [0.05 * s, 0.31, 0.18], [0.015, 0.02, 0.012]));
      break;
    case 'mushroom':
      mesh(cyl(0.06, 0.08, 0.18), M.plush('#FFF1DC'), g, [0, 0.09, 0]);
      mesh(PetGeometry.hemi(), M.plush('#E4483D'), g, [0, 0.16, 0], [0.2, 0.15, 0.2]);
      ([[0.08, 0.25, 0.1], [-0.1, 0.24, 0.06], [0.02, 0.3, -0.04]] as V3[]).forEach((p) => mesh(S(), M.white(), g, p, [0.03, 0.02, 0.03]));
      break;
    case 'yoyo':
      [-1, 1].forEach((s) => mesh(cyl(0.14, 0.14, 0.06), M.glossy('#4A7BD9'), g, [0.04 * s, 0.15, 0], [1, 1, 1], [0, 0, Math.PI / 2]));
      mesh(cyl(0.04, 0.04, 0.06), M.flat('#ffffff'), g, [0, 0.15, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
      break;
    case 'crystal':
      mesh(cyl(0.1, 0.13, 0.06), M.glossy('#7B5238'), g, [0, 0.03, 0]);
      mesh(S(), new THREE.MeshPhysicalMaterial({ color: '#b9a7ff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.75 }), g, [0, 0.19, 0], [0.14, 0.14, 0.14]);
      break;
    case 'shell':
      mesh(PetGeometry.cone(), M.glossy('#F7B6A8'), g, [0, 0.1, 0], [0.13, 0.22, 0.13], [Math.PI / 2.4, 0, 0]);
      mesh(S(), M.glossy('#FFD9CF'), g, [0, 0.07, 0.08], [0.1, 0.07, 0.06]);
      break;
    case 'puzzle':
      mesh(rbox(0.28, 0.08, 0.28, 0.03), M.plush('#2EC4B6'), g, [0, 0.04, 0]);
      ([[0.17, 0], [0, 0.17]] as [number, number][]).forEach(([x, z]) => mesh(cyl(0.05, 0.05, 0.08, 20), M.plush('#2EC4B6'), g, [x, 0.04, z]));
      break;
    case 'rope':
      mesh(new THREE.TorusKnotGeometry(0.1, 0.035, 64, 10, 2, 3), M.plush('#E4483D'), g, [0, 0.14, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      [-1, 1].forEach((s) => mesh(PetGeometry.capsule(), M.plush('#4A7BD9'), g, [0.17 * s, 0.05, 0], [0.035, 0.05, 0.035], [0, 0, Math.PI / 2]));
      break;
    case 'treat':
      mesh(cyl(0.1, 0.1, 0.04, 28), M.plush('#D9A066'), g, [0, 0.02, 0]);
      ([[0.03, 0.045, 0.02], [-0.04, 0.045, -0.01], [0.0, 0.045, -0.05]] as V3[]).forEach((p) => mesh(S(), M.flat('#5c3b2a'), g, p, [0.014, 0.008, 0.014]));
      break;
    default:
      mesh(rbox(0.26, 0.26, 0.26, 0.06), M.plush('#9D6BD8'), g, [0, 0.13, 0]);
  }
  return g;
}

export function propFor(kind: ItemKind): THREE.Group {
  switch (kind) {
    case 'bed': return bed();
    case 'bowl': return foodBowl();
    case 'water': return waterBowl();
    case 'tent': return tent();
    case 'ball': return ball();
    case 'teddy': return teddy();
    default: return novel(kind);
  }
}
