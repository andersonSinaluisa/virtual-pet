/*
 * ENTORNOS 3D de cada ubicación (solo representación; el estado está en el dominio)
 * -------------------------------------------------------------------------------
 *   habitación  suelo redondeado, alfombra, pared curva, ventana, puerta
 *   jardín      césped, valla, árbol, macizo de flores, fachada con la puerta de casa
 *   parque      pradera grande, camino, árboles, estanque, banco, farolas
 *
 * Presupuesto móvil: pocas mallas, geometrías sencillas, solo proyectan
 * sombra los árboles y la valla (no la hierba ni las flores). Cada entorno
 * vive en un Group propio que se desecha (dispose) al cambiar de lugar.
 * Las posiciones de obstáculos coinciden con Locations.ts (el árbol que el
 * NavigationSystem rodea es el árbol que se ve).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { LOCATIONS, type LocationId } from '@/core/world/Locations';

import { PetGeometry, PetMaterials } from './PetMaterials';

const M = PetMaterials;

export interface BuiltEnvironment {
  group: THREE.Group;
  windowMat: THREE.MeshBasicMaterial | null; // la ventana muestra el cielo (habitación)
  stars: THREE.Points | null; // de noche, fuera
  lamps: THREE.Mesh[]; // farolas del parque (se encienden de noche)
  bg: string;
  outdoor: boolean;
}

export const ROOM_COLORS = { bg: '#F3E7EC', wall: '#F6ECEF', floor: '#F7EDE6', rug: '#EEDBD6', window: '#FFF3E6', door: '#D9A27E' };

// Coordenadas del lugar → 3D (mismo criterio que PetScene)
export function floorSize(loc: LocationId, W: number, D: number): { w: number; d: number } {
  const s = LOCATIONS[loc].size;
  return { w: W * s.w, d: D * s.h };
}

function add(g: THREE.Group, m: THREE.Mesh, shadow = false): THREE.Mesh {
  m.castShadow = shadow;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function tree(g: THREE.Group, x: number, z: number, h = 1.8, color = '#7BC47F'): void {
  const trunk = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, h * 0.55, 10), M.flat('#9B6B4B', 0.9)), true);
  trunk.position.set(x, h * 0.27, z);
  const crown = add(g, new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.38, 1), M.plush(color)), true);
  crown.position.set(x, h * 0.72, z);
  crown.scale.y = 0.9;
}

function flowers(g: THREE.Group, cx: number, cz: number, r: number, n = 14): void {
  const cols = ['#FF8FAB', '#FFD166', '#B5A1FF', '#FFFFFF'];
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), headGeo = new THREE.IcosahedronGeometry(0.05, 0);
  for (let i = 0; i < n; i++) {
    const a = i * 2.39, rr = r * Math.sqrt((i + 0.5) / n);
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    const stem = add(g, new THREE.Mesh(stemGeo, M.flat('#4F9D57')));
    stem.position.set(x, 0.11, z);
    const head = add(g, new THREE.Mesh(headGeo, M.plush(cols[i % cols.length])));
    head.position.set(x, 0.24, z);
  }
}

function stars(): THREE.Points {
  const n = 80, pos = new Float32Array(n * 3);
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI - Math.PI / 2, e = 0.2 + r() * 0.8;
    pos[i * 3] = Math.sin(a) * 16; pos[i * 3 + 1] = 3 + e * 7; pos[i * 3 + 2] = -10 - r() * 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#FFF6D5', size: 0.09, transparent: true, opacity: 0 }));
  p.name = 'Stars';
  return p;
}

export function buildRoom(W: number, D: number): BuiltEnvironment {
  const g = new THREE.Group();
  g.name = 'Env:room';
  const floor = add(g, new THREE.Mesh(new RoundedBoxGeometry(W + 0.8, 0.3, D + 0.8, 4, 0.14), M.flat(ROOM_COLORS.floor, 0.95)));
  floor.position.y = -0.15; floor.name = 'Floor';
  // Alfombra de punto (tono cálido de Stitch)
  const rug = add(g, new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.02, 64), M.plush(ROOM_COLORS.rug)));
  rug.position.set(0.2, 0.01, 0.4); rug.scale.z = 0.7;
  // Fondo curvo sin esquinas duras
  const wall = add(g, new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 5, 64, 1, true, Math.PI * 0.72, Math.PI * 0.56),
    new THREE.MeshStandardMaterial({ color: ROOM_COLORS.wall, roughness: 1, side: THREE.BackSide }),
  ));
  wall.position.set(0, 2.2, 6.4);
  const windowMat = new THREE.MeshBasicMaterial({ color: ROOM_COLORS.window });
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), windowMat);
  win.position.set(1.7, 1.9, -2.4); win.rotation.y = -0.2;
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.06, 12, 48), M.flat('#ffffff', 0.5));
  frame.position.copy(win.position); frame.rotation.copy(win.rotation);
  g.add(win, frame);
  const door = add(g, new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.7, 0.08, 4, 0.06), M.plush(ROOM_COLORS.door)), true);
  door.position.set(-2.3, 0.85, -2.3); door.name = 'GardenDoor';
  return { group: g, windowMat, stars: null, lamps: [], bg: ROOM_COLORS.bg, outdoor: false };
}

export function buildGarden(W: number, D: number): BuiltEnvironment {
  const g = new THREE.Group();
  g.name = 'Env:garden';
  const { w, d } = floorSize('garden', W, D);
  const toX = (x: number) => (x - 0.5) * w, toZ = (y: number) => (y - 0.5) * d;
  const lawn = add(g, new THREE.Mesh(new RoundedBoxGeometry(w + 1.2, 0.3, d + 1.2, 3, 0.14), M.flat('#A8D98A', 1)));
  lawn.position.y = -0.15; lawn.name = 'Floor';
  // Fachada de la casa al fondo, con la puerta por la que se sale
  const house = add(g, new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 2.6, 0.3), M.flat('#F6ECEF', 1)));
  house.position.set(0, 1.3, toZ(0) - 0.6);
  const door = add(g, new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.7, 0.08, 4, 0.06), M.plush(ROOM_COLORS.door)), true);
  door.position.set(toX(0.1), 0.85, toZ(0) - 0.42); door.name = 'HouseDoor';
  // Valla lateral y verja hacia el parque
  const postGeo = new THREE.BoxGeometry(0.08, 0.6, 0.08), railGeo = new THREE.BoxGeometry(0.05, 0.06, d + 1.0);
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 0.5);
    for (let i = 0; i <= 8; i++) { const p = add(g, new THREE.Mesh(postGeo, M.flat('#FFFFFF', 0.8)), true); p.position.set(x, 0.3, -d / 2 - 0.5 + (i * (d + 1)) / 8); }
    for (const y of [0.2, 0.45]) { const r = add(g, new THREE.Mesh(railGeo, M.flat('#FFFFFF', 0.8))); r.position.set(x, y, 0); }
  }
  const gate = add(g, new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.8, 0.9, 2, 0.03), M.plush('#C9A27E')), true);
  gate.position.set(toX(0.97) + 0.35, 0.4, toZ(0.5)); gate.name = 'Gate';
  const ob = LOCATIONS.garden.obstacles;
  tree(g, toX(ob[0].x), toZ(ob[0].y), 2.1);
  flowers(g, toX(ob[1].x), toZ(ob[1].y), 0.45, 16);
  // Unas matas de hierba alta sueltas
  for (let i = 0; i < 6; i++) {
    const b = add(g, new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), M.plush('#8CCB6C')));
    b.position.set(toX(0.15 + (i * 0.137) % 0.7), 0.08, toZ(0.8 + (i % 3) * 0.06)); b.scale.y = 0.6;
  }
  const st = stars();
  g.add(st);
  return { group: g, windowMat: null, stars: st, lamps: [], bg: '#DCEFFB', outdoor: true };
}

export function buildPark(W: number, D: number): BuiltEnvironment {
  const g = new THREE.Group();
  g.name = 'Env:park';
  const { w, d } = floorSize('park', W, D);
  const toX = (x: number) => (x - 0.5) * w, toZ = (y: number) => (y - 0.5) * d;
  const meadow = add(g, new THREE.Mesh(new RoundedBoxGeometry(w + 2, 0.3, d + 2, 3, 0.14), M.flat('#9ED47E', 1)));
  meadow.position.y = -0.15; meadow.name = 'Floor';
  // Camino de tierra desde la entrada
  const path = add(g, new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, 0.7), M.flat('#E8D2B0', 1)));
  path.rotation.x = -Math.PI / 2; path.position.set(toX(0.2), 0.01, toZ(0.5));
  const ob = LOCATIONS.park.obstacles;
  // Estanque
  const pond = add(g, new THREE.Mesh(new THREE.CircleGeometry(ob[0].r * w, 40), new THREE.MeshPhysicalMaterial({ color: '#8EC9F0', roughness: 0.1, clearcoat: 1 })));
  pond.rotation.x = -Math.PI / 2; pond.position.set(toX(ob[0].x), 0.015, toZ(ob[0].y)); pond.scale.y = 0.8;
  tree(g, toX(ob[1].x), toZ(ob[1].y), 2.4, '#6FB873');
  tree(g, toX(ob[2].x), toZ(ob[2].y), 2.0, '#86C97E');
  // Árboles del fondo (sin sombra: fuera de la zona de juego)
  for (let i = 0; i < 5; i++) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), M.plush(i % 2 ? '#7BC47F' : '#5FAE6A'));
    crown.position.set(-w / 2 + (i + 0.5) * (w / 5), 1.2, -d / 2 - 1.4);
    g.add(crown);
  }
  // Banco
  const bench = new THREE.Group();
  add(bench, new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.08, 0.35, 2, 0.03), M.plush('#B5835A')), true).position.set(0, 0.42, 0);
  add(bench, new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.3, 0.06, 2, 0.02), M.plush('#B5835A')), true).position.set(0, 0.65, -0.16);
  for (const s of [-1, 1]) add(bench, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.3), M.flat('#555B66')), true).position.set(0.45 * s, 0.21, 0);
  bench.position.set(toX(ob[3].x), 0, toZ(ob[3].y));
  g.add(bench);
  // Farolas (se encienden de noche: PARK_LAMPS en Environment.ts)
  const lamps: THREE.Mesh[] = [];
  for (const [x, y] of [[0.35, 0.35], [0.7, 0.7]] as [number, number][]) {
    const pole = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.2, 8), M.flat('#555B66')), true);
    pole.position.set(toX(x), 1.1, toZ(y));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: '#FFF3C4' }));
    bulb.position.set(toX(x), 2.25, toZ(y));
    g.add(bulb);
    lamps.push(bulb);
  }
  flowers(g, toX(0.45), toZ(0.9), 0.5, 12);
  const st = stars();
  g.add(st);
  return { group: g, windowMat: null, stars: st, lamps, bg: '#D6ECFA', outdoor: true };
}

export function buildEnvironment(loc: LocationId, W: number, D: number): BuiltEnvironment {
  if (loc === 'garden') return buildGarden(W, D);
  if (loc === 'park') return buildPark(W, D);
  return buildRoom(W, D);
}

// Suelta geometrías y materiales NO compartidos del entorno (los de PetMaterials están cacheados)
export function disposeEnvironment(env: BuiltEnvironment): void {
  env.group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
      if (!PetGeometry.isShared(o.geometry)) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (!PetMaterials.isCached(m)) m.dispose();
    }
  });
  env.group.parent?.remove(env.group);
}
