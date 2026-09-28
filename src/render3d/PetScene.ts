/*
 * PET SCENE: representación visual del mundo con Three.js (antes World3D.js)
 * ------------------------------------------------------------------------
 *   PetScene
 *    ├── Pet3D (PetModel + PetAnimator + PetExpressions + PetFX)
 *    ├── PetController (acciones activas → canales de animación)
 *    ├── Environment (habitación, props, luces de Studio)
 *    └── Camera (encuadre según aspecto, zoom con pinch, órbita con swipe)
 *
 * Lee el estado de la simulación (World, acciones activas) y lo dibuja.
 * No contiene lógica neuronal ni React. Nunca escribe en el mundo: los gestos
 * los traduce la capa RN (PetCanvas) a llamadas de GameSession.
 *
 * Coordenadas: el mundo es un suelo 1×1 (x, y); aquí X = (x−0.5)·W, Z = (y−0.5)·D.
 * El render va a 60 fps; la SNN hace sus ticks por separado.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import type { Action } from '@/core/brain/Actions';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import type { Point } from '@/core/simulation/Pet';
import type { World, WorldObject } from '@/core/simulation/World';

import { Pet3D } from './Pet3D';
import { PetController } from './PetController';
import { PetMaterials } from './PetMaterials';
import { propFor } from './Props';
import { setDarkness, setupStudio, type StudioLights } from './Studio';

export const FLOOR_W = 5.2;
export const FLOOR_D = 3.8;

// Lo único que la escena necesita saber de la simulación
export interface SceneSource {
  world: World;
  active(): readonly Action[];
}

export interface SceneOptions {
  species: SpeciesKey;
  environment?: boolean;
  debug?: boolean; // anillo del objeto percibido (herramienta de desarrollo)
  framing?: 'room' | 'close';
}

export type PickResult =
  | { kind: 'pet'; point: THREE.Vector3 }
  | { kind: 'object'; id: number; point: THREE.Vector3 }
  | { kind: 'floor'; point: THREE.Vector3; world: Point };

interface Entity {
  group: THREE.Group;
  obj: WorldObject;
}

const ROOM = { bg: '#F3E7EC', wall: '#F6ECEF', floor: '#F7EDE6', rug: '#EEDBD6', window: '#FFF3E6', door: '#D9A27E' };
const NIGHT = new THREE.Color('#2a2f5a');

export class PetScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  private pet!: Pet3D;
  private species!: SpeciesKey;
  private readonly controller = new PetController(null);
  private readonly lights: StudioLights;
  private readonly entities = new Map<number, Entity>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly petProxy: THREE.Mesh;
  private windowMat!: THREE.MeshBasicMaterial;
  private readonly soundRings: THREE.Mesh[];
  private readonly focusRing: THREE.Mesh;
  private readonly bgColor = new THREE.Color(ROOM.bg);
  private darkness = 0;
  private t = 0;
  private yaw = 0;
  private lastMoveT = 0;
  private prevPetPos = new THREE.Vector3();
  private camShake = 0;
  private aspect = 1;
  private zoom = 1;
  private orbit = 0;
  private readonly debug: boolean;
  private readonly framing: 'room' | 'close';
  // Vectores reutilizados (sin basura por frame)
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly vLook = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly source: SceneSource, opts: SceneOptions) {
    this.debug = !!opts.debug;
    this.framing = opts.framing ?? 'room';
    this.scene.background = this.bgColor;
    this.lights = setupStudio(this.scene, renderer, { extent: 4.2, environment: !!opts.environment });
    this.buildRoom();

    const ringMat = new THREE.MeshBasicMaterial({ color: '#FF9E79', transparent: true, depthWrite: false });
    this.soundRings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 8, 48), ringMat.clone());
      r.rotation.x = Math.PI / 2; r.visible = false; this.scene.add(r);
      return r;
    });
    this.focusRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 48), new THREE.MeshBasicMaterial({ color: '#F2C230' }));
    this.focusRing.rotation.x = Math.PI / 2; this.focusRing.position.y = 0.02; this.focusRing.visible = false;
    this.scene.add(this.focusRing);

    // Volumen invisible para tocar a la mascota (raycast barato, sin recorrer el pelaje)
    this.petProxy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.petProxy.position.y = 0.6;
    this.setSpecies(opts.species);
  }

  // ---------- Coordenadas ----------
  toX(x: number): number { return (x - 0.5) * FLOOR_W; }
  toZ(y: number): number { return (y - 0.5) * FLOOR_D; }
  fromXZ(X: number, Z: number): Point { return { x: X / FLOOR_W + 0.5, y: Z / FLOOR_D + 0.5 }; }

  // ---------- Escena ----------
  private buildRoom(): void {
    const M = PetMaterials;
    const floor = new THREE.Mesh(new RoundedBoxGeometry(FLOOR_W + 0.8, 0.3, FLOOR_D + 0.8, 4, 0.14), M.flat(ROOM.floor, 0.95));
    floor.position.y = -0.15; floor.receiveShadow = true; floor.name = 'Floor';
    this.scene.add(floor);
    // Alfombra de punto (tono cálido de Stitch)
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.02, 64), M.plush(ROOM.rug));
    rug.position.set(0.2, 0.01, 0.4); rug.scale.z = 0.7; rug.receiveShadow = true;
    this.scene.add(rug);
    // Fondo curvo sin esquinas duras
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 5, 64, 1, true, Math.PI * 0.72, Math.PI * 0.56),
      new THREE.MeshStandardMaterial({ color: ROOM.wall, roughness: 1, side: THREE.BackSide }),
    );
    wall.position.set(0, 2.2, 6.4); wall.receiveShadow = true;
    this.scene.add(wall);
    this.windowMat = new THREE.MeshBasicMaterial({ color: ROOM.window });
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), this.windowMat);
    win.position.set(1.7, 1.9, -2.4); win.rotation.y = -0.2;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.06, 12, 48), M.flat('#ffffff', 0.5));
    frame.position.copy(win.position); frame.rotation.copy(win.rotation);
    this.scene.add(win, frame);
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.7, 0.08, 4, 0.06), M.plush(ROOM.door));
    door.position.set(-2.3, 0.85, -2.3); door.castShadow = true;
    this.scene.add(door);
  }

  setSpecies(species: SpeciesKey): void {
    if (this.pet && this.species === species) return;
    const p = this.source.world.pet;
    if (this.pet) { this.pet.object3D.remove(this.petProxy); this.scene.remove(this.pet.object3D); this.pet.dispose(); }
    this.species = species;
    this.pet = new Pet3D({ species });
    this.pet.object3D.add(this.petProxy);
    this.pet.object3D.position.set(this.toX(p.x), 0, this.toZ(p.y));
    this.scene.add(this.pet.object3D);
    this.controller.setPet(this.pet);
    this.prevPetPos.copy(this.pet.object3D.position);
    this.yaw = 0;
  }

  resize(width: number, height: number): void {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  setZoom(z: number): void { this.zoom = Math.max(0.65, Math.min(1.35, z)); }
  getZoom(): number { return this.zoom; }
  setOrbit(yaw: number): void { this.orbit = Math.max(-0.7, Math.min(0.7, yaw)); }
  getOrbit(): number { return this.orbit; }

  // ---------- Objetos del mundo ----------
  private entityFor(o: WorldObject): Entity {
    let e = this.entities.get(o.id);
    if (e) return e;
    const group = propFor(o.kind);
    group.traverse((m) => { if (m instanceof THREE.Mesh) m.userData.entityId = o.id; });
    group.position.set(this.toX(o.x), 0, this.toZ(o.y));
    this.scene.add(group);
    e = { group, obj: o };
    this.entities.set(o.id, e);
    return e;
  }

  // ---------- Frame ----------
  update(dtRaw: number): void {
    const dt = Math.max(0, Math.min(0.1, dtRaw));
    this.t += dt;
    const world = this.source.world, pet = world.pet, active = this.source.active();
    const k = 1 - Math.exp(-dt * 7);

    // Objetos (posiciones suavizadas entre ticks)
    const alive = new Set<number>();
    for (const o of world.objects) {
      alive.add(o.id);
      const e = this.entityFor(o);
      e.obj = o;
      if (o.id === pet.carrying) {
        this.pet.carryWorldPosition(e.group.position);
        e.group.position.y -= 0.12;
      } else {
        // Objetos lanzados: seguimiento más rápido para que el vuelo se vea fluido
        const kk = o.vx || o.vy ? 1 - Math.exp(-dt * 12) : k;
        e.group.position.x += (this.toX(o.x) - e.group.position.x) * kk;
        e.group.position.z += (this.toZ(o.y) - e.group.position.z) * kk;
        e.group.position.y += (0 - e.group.position.y) * k;
      }
      if (o.kind === 'bowl') {
        const n = Math.round(Math.min(1, o.amount / 2) * 14);
        (e.group.userData.kibble as THREE.Object3D[]).forEach((kb, i) => { kb.visible = i < n; });
      }
      if (o.kind === 'water') {
        const w = e.group.userData.water as THREE.Mesh, a = Math.max(0, Math.min(1, o.amount));
        w.visible = a > 0.02; w.scale.setScalar(0.55 + 0.45 * a); w.position.y = 0.06 + 0.09 * a;
      }
      if (o.kind === 'mysteryBox') e.group.rotation.z = 0.04 * Math.sin(this.t * 3) * Math.min(1, o.novelty * 2);
      if (o.type === 'toy' && o.id !== pet.carrying && (active.includes('PLAY') || o.vx || o.vy)) e.group.rotation.y += dt * 3;
    }
    for (const [id, e] of this.entities) if (!alive.has(id)) { this.scene.remove(e.group); this.entities.delete(id); }

    // Mascota: posición del mundo + orientación
    const root = this.pet.object3D;
    root.position.x += (this.toX(pet.x) - root.position.x) * k;
    root.position.z += (this.toZ(pet.y) - root.position.z) * k;
    const moved = this.v1.copy(root.position).sub(this.prevPetPos);
    this.prevPetPos.copy(root.position);
    const renderSpeed = moved.length() / Math.max(dt, 1e-4);

    const lookTarget = this.lookTarget(pet.lookTarget);
    let yawTarget = this.yaw;
    if (renderSpeed > 0.25) yawTarget = Math.atan2(moved.x, moved.z);
    else if (lookTarget) {
      const d = this.v3.copy(lookTarget).sub(root.position), want = Math.atan2(d.x, d.z);
      if (Math.abs(angDiff(want, this.yaw)) > 0.9) yawTarget = want;
    } else if (this.t - this.lastMoveT > 2.5) yawTarget = this.orbit; // quieto: mira hacia la cámara
    if (renderSpeed > 0.25) this.lastMoveT = this.t;
    this.yaw += angDiff(yawTarget, this.yaw) * (1 - Math.exp(-dt * 5));
    root.rotation.y = this.yaw;

    const touching = world.player.touchTicks > 0;
    this.controller.update({ active, pet, touching, lookTarget, renderSpeed });
    this.pet.update(dt, renderSpeed, this.camera);

    // Sonido
    const lvl = world.sound.level;
    this.soundRings.forEach((r, i) => {
      r.visible = lvl > 0.05;
      if (!r.visible) return;
      const f = (this.t * 1.2 + i / 3) % 1, s = 0.3 + f * 1.4;
      r.position.set(this.toX(world.sound.x), 0.05 + f * 0.3, this.toZ(world.sound.y));
      r.scale.set(s, s, s);
      (r.material as THREE.MeshBasicMaterial).opacity = (1 - f) * Math.min(1, lvl * 1.5);
    });

    // Objeto percibido (solo desarrollo)
    const focus = world.getObject(world.focusObjectId);
    this.focusRing.visible = this.debug && !!focus && focus.id !== pet.carrying;
    if (this.focusRing.visible && focus) {
      const e = this.entities.get(focus.id);
      if (e) this.focusRing.position.set(e.group.position.x, 0.02, e.group.position.z);
      this.focusRing.rotation.z = this.t;
    }

    // Luz
    this.darkness += ((world.lightOn ? 0 : 1) - this.darkness) * (1 - Math.exp(-dt * 3));
    setDarkness(this.scene, this.lights, this.darkness);
    this.bgColor.set(ROOM.bg).lerp(NIGHT, this.darkness * 0.85);
    this.windowMat.color.set(ROOM.window).lerp(NIGHT, this.darkness);

    this.updateCamera(dt, active, root.position);
  }

  private updateCamera(dt: number, active: readonly Action[], petPos: THREE.Vector3): void {
    // Encuadre: el prototipo era 4:3; en retrato se aleja un poco y sigue más a la mascota
    const portrait = Math.max(1, Math.sqrt((4 / 3) / Math.max(0.3, this.aspect)));
    const close = this.framing === 'close';
    const dist = (close ? 0.62 : 1) * Math.min(1.6, portrait) * this.zoom;
    const followK = close ? 0.85 : 0.12 + 0.25 * (portrait - 1);
    const shakeTarget = active.includes('GET_SCARED') ? 1 : (this.source.world.pet.speed || 0) > 1.4 ? 0.35 : 0;
    this.camShake += (shakeTarget - this.camShake) * (1 - Math.exp(-dt * 4));

    const look = this.v2.set(petPos.x * followK, close ? 0.55 : 0.38, 0.45 + (petPos.z - 0.45) * followK * 0.6);
    // Desplazamiento base de la cámara (el mismo del prototipo) escalado y orbitado
    const off = this.v3.set(0, 3.5 - 0.38, 6.3 - 0.45).multiplyScalar(dist);
    if (close) off.y *= 0.55;
    off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.orbit);
    this.camera.position.set(
      look.x + off.x + Math.sin(this.t * 31) * 0.012 * this.camShake,
      look.y + off.y + Math.sin(this.t * 27) * 0.01 * this.camShake,
      look.z + off.z,
    );
    this.camera.lookAt(look);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // pet.lookTarget viene del mundo (jugador, objeto, puerta) → punto 3D
  private lookTarget(t: Point | null): THREE.Vector3 | null {
    if (!t) return null;
    const world = this.source.world;
    // El jugador está "en la pantalla": mira hacia la cámara
    if (t === world.player) return this.vLook.copy(this.camera.position);
    const y = 'type' in t ? 0.2 : 1.0;
    return this.vLook.set(this.toX(t.x), y, this.toZ(t.y));
  }

  // ---------- Interacción (Raycaster) ----------
  // x, y en coordenadas normalizadas del dispositivo (−1..1)
  pick(x: number, y: number): PickResult | null {
    this.raycaster.setFromCamera(this.ndc.set(x, y), this.camera);
    const targets: THREE.Object3D[] = [this.petProxy];
    for (const e of this.entities.values()) if (!e.obj.fixed || e.obj.type === 'food' || e.obj.type === 'water') targets.push(e.group);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      if (h.object === this.petProxy) return { kind: 'pet', point: h.point };
      const id = h.object.userData.entityId as number | undefined;
      if (id !== undefined) return { kind: 'object', id, point: h.point };
    }
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, p) ? { kind: 'floor', point: p, world: this.fromXZ(p.x, p.z) } : null;
  }

  floorPoint(x: number, y: number): Point | null {
    this.raycaster.setFromCamera(this.ndc.set(x, y), this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, p) ? this.fromXZ(p.x, p.z) : null;
  }

  // Posición en pantalla (−1..1) de un punto del mundo, p. ej. para anclar un bocadillo
  project(point: Point, height = 0.9): { x: number; y: number } {
    const v = this.v1.set(this.toX(point.x), height, this.toZ(point.y)).project(this.camera);
    return { x: v.x, y: v.y };
  }

  dispose(): void {
    this.pet.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry && !(o.geometry as THREE.BufferGeometry & { shared?: boolean }).shared) {
        // Las geometrías cacheadas (PetGeometry) se comparten entre escenas: solo se sueltan las de la habitación
        if (o.parent === this.scene) o.geometry.dispose();
      }
    });
    this.renderer.dispose();
  }
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
