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
 *
 * v7 (mundo vivo): el entorno depende de la UBICACIÓN del dominio (habitación,
 * jardín, parque; Environments.ts) y se reconstruye al cambiar de lugar
 * (transición intencional). La orientación de la mascota viene de la
 * simulación (define su campo de visión: lo que se ve es lo que "ve").
 * Herramientas de desarrollo: FOV, radio de oído, objetos percibidos,
 * objetivo de atención y de navegación. Hojas/plumas/mariposas se reciclan
 * (pool) y el entorno anterior se desecha (dispose).
 */
import * as THREE from 'three';

import type { Action } from '@/core/brain/Actions';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import type { Point } from '@/core/simulation/Pet';
import type { World, WorldObject } from '@/core/simulation/World';

import { LOCATIONS, type LocationId } from '@/core/world/Locations';

import { buildEnvironment, disposeEnvironment, type BuiltEnvironment } from './Environments';
import { GrowthVisualController } from './GrowthVisualController';
import { Pet3D } from './Pet3D';
import { PetController, type VoiceCue } from './PetController';
import { propFor } from './Props';
import { setDarkness, setupStudio, type StudioLights } from './Studio';

export const FLOOR_W = 5.2;
export const FLOOR_D = 3.8;

// Lo único que la escena necesita saber de la simulación
export interface SceneSource {
  world: World;
  active(): readonly Action[];
  // v6: crecimiento (valor visual continuo 0..3 y tamaño individual); sin él, joven
  growth?(): { value: number; size: number };
  // v8 (voz): reacción a su propia voz y eventos del cuerpo para el foley (opcionales)
  voice?(): VoiceCue | null;
  onFoley?(e: { kind: 'step'; run: boolean } | { kind: 'land' }): void;
}

// v7: capas de depuración del World Inspector (solo desarrollo)
export interface WorldDebugFlags {
  fov: boolean;
  hearing: boolean;
  perceived: boolean;
  attention: boolean;
  navigation: boolean;
}

export type CameraFocus = { type: 'pet' } | { type: 'object'; id: number } | null;

const POOLED: ReadonlySet<string> = new Set(['leaf', 'feather', 'butterfly']);

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
const DAY_SKY = new THREE.Color('#FFF3E6');
const DUSK_SKY = new THREE.Color('#FFB27A');
// Cuánto "atardecer" hay: máximo cuando la luz del día está a medias
const dusk = (daylight: number) => Math.max(0, 1 - Math.abs(daylight - 0.5) * 2);
/** Campo de visión vertical de la franja visible (el del prototipo). */
const BASE_FOV = 30;

export class PetScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 60);
  private pet!: Pet3D;
  private species!: SpeciesKey;
  private readonly controller = new PetController(null);
  private readonly lights: StudioLights;
  private readonly entities = new Map<number, Entity>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly petProxy: THREE.Mesh;
  private windowMat: THREE.MeshBasicMaterial | null = null;
  private env: BuiltEnvironment | null = null;
  private envLocation: LocationId | null = null;
  private readonly pool = new Map<string, THREE.Group[]>();
  debugFlags: WorldDebugFlags = { fov: false, hearing: false, perceived: false, attention: false, navigation: false };
  cameraFocus: CameraFocus = null;
  private readonly fovMesh: THREE.Mesh;
  private readonly hearMesh: THREE.Mesh;
  private readonly attnMesh: THREE.Mesh;
  private readonly navMesh: THREE.Mesh;
  private readonly perceivedMarks: THREE.Mesh[] = [];
  private readonly soundRings: THREE.Mesh[];
  private readonly focusRing: THREE.Mesh;
  private readonly bgColor = new THREE.Color(ROOM.bg);
  private readonly sky = new THREE.Color(DAY_SKY);
  private darkness = 0;
  private t = 0;
  private yaw = 0;
  private lastMoveT = 0;
  private prevPetPos = new THREE.Vector3();
  private camShake = 0;
  private aspect = 1;
  private width = 1;
  private height = 1;
  private viewTop = 0;
  private viewBottom = 0;
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

  private growthVisual: GrowthVisualController | null = null;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly source: SceneSource, opts: SceneOptions) {
    this.debug = !!opts.debug;
    this.framing = opts.framing ?? 'room';
    this.scene.background = this.bgColor;
    this.lights = setupStudio(this.scene, renderer, { extent: 4.2, environment: !!opts.environment });
    this.scene.add(this.lights.key.target);
    this.syncEnvironment();

    const ringMat = new THREE.MeshBasicMaterial({ color: '#FF9E79', transparent: true, depthWrite: false });
    this.soundRings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 8, 48), ringMat.clone());
      r.rotation.x = Math.PI / 2; r.visible = false; this.scene.add(r);
      return r;
    });
    this.focusRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 48), new THREE.MeshBasicMaterial({ color: '#F2C230' }));
    this.focusRing.rotation.x = Math.PI / 2; this.focusRing.position.y = 0.02; this.focusRing.visible = false;
    this.scene.add(this.focusRing);

    // Capas de depuración (invisibles salvo en el World Inspector)
    const dbg = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    this.fovMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40, 0, 1), dbg('#7DD8B7', 0.25));
    this.fovMesh.rotation.x = -Math.PI / 2; this.fovMesh.position.y = 0.03; this.fovMesh.visible = false;
    this.hearMesh = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), dbg('#93C5FD', 0.6));
    this.hearMesh.rotation.x = -Math.PI / 2; this.hearMesh.position.y = 0.035; this.hearMesh.visible = false;
    this.attnMesh = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 32), dbg('#F2C230', 0.95));
    this.attnMesh.rotation.x = Math.PI / 2; this.attnMesh.visible = false;
    this.navMesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 12), dbg('#E35D8C', 0.9));
    this.navMesh.rotation.x = Math.PI; this.navMesh.visible = false;
    this.scene.add(this.fovMesh, this.hearMesh, this.attnMesh, this.navMesh);

    // Volumen invisible para tocar a la mascota (raycast barato, sin recorrer el pelaje)
    this.petProxy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.petProxy.position.y = 0.6;
    this.setSpecies(opts.species);
  }

  // ---------- Coordenadas ----------
  private get sizeW(): number { return FLOOR_W * LOCATIONS[this.envLocation ?? 'room'].size.w; }
  private get sizeD(): number { return FLOOR_D * LOCATIONS[this.envLocation ?? 'room'].size.h; }
  toX(x: number): number { return (x - 0.5) * this.sizeW; }
  toZ(y: number): number { return (y - 0.5) * this.sizeD; }
  fromXZ(X: number, Z: number): Point { return { x: X / this.sizeW + 0.5, y: Z / this.sizeD + 0.5 }; }

  // ---------- Escena ----------
  // El entorno sigue a la ubicación del DOMINIO. Cambiar de lugar = transición intencional:
  // se desecha el entorno anterior y los objetos de allí (quedan guardados en el mundo, no aquí).
  private syncEnvironment(): void {
    const loc = this.source.world.location;
    if (loc === this.envLocation && this.env) return;
    if (this.env) disposeEnvironment(this.env);
    for (const [id, e] of this.entities) this.releaseEntity(id, e);
    this.envLocation = loc;
    this.env = buildEnvironment(loc, FLOOR_W, FLOOR_D);
    this.scene.add(this.env.group);
    this.windowMat = this.env.windowMat;
    if (this.pet) {
      const p = this.source.world.pet;
      this.pet.object3D.position.set(this.toX(p.x), 0, this.toZ(p.y));
      this.prevPetPos.copy(this.pet.object3D.position);
    }
  }

  get location(): LocationId | null {
    return this.envLocation;
  }

  setSpecies(species: SpeciesKey): void {
    if (this.pet && this.species === species) return;
    const p = this.source.world.pet;
    if (this.pet) { this.pet.object3D.remove(this.petProxy); this.scene.remove(this.pet.object3D); this.pet.dispose(); }
    this.species = species;
    this.pet = new Pet3D({ species });
    this.growthVisual = new GrowthVisualController(this.pet);
    const g = this.source.growth?.();
    this.growthVisual.update(0, g?.value ?? 2, g?.size ?? 1, true);
    this.pet.object3D.add(this.petProxy);
    this.pet.object3D.position.set(this.toX(p.x), 0, this.toZ(p.y));
    this.scene.add(this.pet.object3D);
    this.controller.setPet(this.pet);
    // v8: pasos y aterrizajes sincronizados con la animación → foley (si la fuente escucha)
    this.pet.animator.onFootContact = (run) => this.source.onFoley?.({ kind: 'step', run });
    this.pet.animator.onLand = () => this.source.onFoley?.({ kind: 'land' });
    this.prevPetPos.copy(this.pet.object3D.position);
    this.yaw = 0;
  }

  resize(width: number, height: number): void {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.width = width;
    this.height = height;
    this.applyView();
  }

  /**
   * Franjas del lienzo tapadas por la interfaz (fracción del alto, arriba y
   * abajo). La escena ocupa toda la pantalla, pero se encuadra en la franja
   * visible: se centra en ella y se ve con el mismo tamaño que tendría un
   * lienzo de ese alto. Tocar/arrastrar siguen funcionando porque el raycast
   * usa la misma proyección.
   */
  setViewInsets(top: number, bottom: number): void {
    const t = Math.max(0, Math.min(0.45, top || 0));
    const b = Math.max(0, Math.min(0.45, bottom || 0));
    if (t === this.viewTop && b === this.viewBottom) return;
    this.viewTop = t;
    this.viewBottom = b;
    this.applyView();
  }

  private applyView(): void {
    const band = Math.max(0.1, 1 - this.viewTop - this.viewBottom);
    // El encuadre (distancia de cámara) se calcula con el aspecto de la franja visible
    this.aspect = this.width / (this.height * band);
    this.camera.aspect = this.width / this.height;
    // Campo de visión ampliado para que la franja muestre exactamente BASE_FOV
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) / band));
    const shift = ((this.viewBottom - this.viewTop) / 2) * this.height;
    if (Math.abs(shift) > 0.5) this.camera.setViewOffset(this.width, this.height, 0, shift, this.width, this.height);
    else this.camera.clearViewOffset();
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
    // Hojas, plumas y mariposas van y vienen: se reciclan en vez de crear/desechar mallas
    const pooled = POOLED.has(o.kind) ? this.pool.get(o.kind)?.pop() : undefined;
    const group = pooled ?? propFor(o.kind);
    group.visible = true;
    group.traverse((m) => { if (m instanceof THREE.Mesh) m.userData.entityId = o.id; });
    group.position.set(this.toX(o.x), 0, this.toZ(o.y));
    this.scene.add(group);
    e = { group, obj: o };
    this.entities.set(o.id, e);
    return e;
  }

  private releaseEntity(id: number, e: Entity): void {
    this.scene.remove(e.group);
    this.entities.delete(id);
    if (POOLED.has(e.obj.kind)) {
      e.group.visible = false;
      const list = this.pool.get(e.obj.kind) ?? [];
      if (list.length < 8) { list.push(e.group); this.pool.set(e.obj.kind, list); }
    }
  }

  // ---------- Frame ----------
  update(dtRaw: number): void {
    const dt = Math.max(0, Math.min(0.1, dtRaw));
    this.t += dt;
    const world = this.source.world, pet = world.pet, active = this.source.active();
    const k = 1 - Math.exp(-dt * 7);
    this.syncEnvironment();

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
      if (o.kind === 'mysteryBox') {
        e.group.rotation.z = o.state === 'closed' ? 0.04 * Math.sin(this.t * 3) * Math.min(1, o.novelty * 2) : 0;
        const lid = e.group.userData.lid as THREE.Object3D | undefined;
        if (lid) lid.rotation.x += ((o.state === 'closed' ? 0 : -1.9) - lid.rotation.x) * k;
      }
      // Hoja/pluma recién caída: baja planeando; la mariposa aletea
      if ((o.kind === 'leaf' || o.kind === 'feather') && o.age < 30) {
        e.group.position.y = Math.max(0, 1.4 * (1 - o.age / 30)) + 0.05 * Math.sin(this.t * 6);
        e.group.rotation.y += dt * 2;
      }
      if (o.kind === 'butterfly') {
        const wings = e.group.userData.wings as THREE.Object3D[] | undefined;
        wings?.forEach((wg, i) => { wg.rotation.z = (i ? -1 : 1) * (0.2 + 0.9 * Math.abs(Math.sin(this.t * 18))); });
        const flyer = e.group.userData.flyer as THREE.Object3D | undefined;
        if (flyer) flyer.position.y = 0.5 + 0.12 * Math.sin(this.t * 2.3 + o.id);
        e.group.rotation.y = Math.atan2(o.vx, o.vy);
      }
      if (o.type === 'toy' && o.id !== pet.carrying && (active.includes('PLAY') || o.vx || o.vy)) e.group.rotation.y += dt * 3;
    }
    for (const [id, e] of this.entities) if (!alive.has(id)) this.releaseEntity(id, e);

    // Mascota: posición del mundo + orientación
    const root = this.pet.object3D;
    root.position.x += (this.toX(pet.x) - root.position.x) * k;
    root.position.z += (this.toZ(pet.y) - root.position.z) * k;
    const moved = this.v1.copy(root.position).sub(this.prevPetPos);
    this.prevPetPos.copy(root.position);
    const renderSpeed = moved.length() / Math.max(dt, 1e-4);

    const lookTarget = this.lookTarget(pet.lookTarget);
    // v7: el cuerpo mira hacia donde la SIMULACIÓN dice (su orientación define lo que ve).
    // orientation = atan2(dy, dx) en el suelo; en 3D X ∝ x y Z ∝ y → yaw = atan2(cos, sin)
    const yawTarget = Math.atan2(Math.cos(pet.orientation) * this.sizeW, Math.sin(pet.orientation) * this.sizeD);
    if (renderSpeed > 0.25) this.lastMoveT = this.t;
    this.yaw += angDiff(yawTarget, this.yaw) * (1 - Math.exp(-dt * 6));
    root.rotation.y = this.yaw;

    const touching = world.player.touchTicks > 0;
    this.controller.update({ active, pet, touching, lookTarget, renderSpeed, species: this.species, voice: this.source.voice?.() ?? null });
    const g = this.source.growth?.();
    this.growthVisual?.update(dt, g?.value ?? 2, g?.size ?? 1);
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
    this.focusRing.visible = (this.debug || this.debugFlags.attention) && !!focus && focus.id !== pet.carrying;
    if (this.focusRing.visible && focus) {
      const e = this.entities.get(focus.id);
      if (e) this.focusRing.position.set(e.group.position.x, 0.02, e.group.position.z);
      this.focusRing.rotation.z = this.t;
    }

    // Luz: ciclo día/noche + lámpara (world.lightLevel), interpolada por frame (sin saltos)
    this.darkness += ((1 - world.lightLevel) - this.darkness) * (1 - Math.exp(-dt * 2));
    this.sky.set(DAY_SKY).lerp(DUSK_SKY, dusk(world.daylight));
    setDarkness(this.scene, this.lights, this.darkness);
    this.bgColor.set(this.env?.bg ?? ROOM.bg).lerp(NIGHT, this.darkness * 0.85);
    // La ventana muestra el cielo real: día, atardecer anaranjado o noche (aunque la lámpara esté encendida)
    this.windowMat?.color.copy(this.sky).lerp(NIGHT, 1 - world.daylight);
    // Fuera: estrellas de noche y farolas encendidas
    if (this.env?.stars) (this.env.stars.material as THREE.PointsMaterial).opacity = Math.max(0, (1 - world.daylight - 0.4) * 1.6);
    for (const lamp of this.env?.lamps ?? []) (lamp.material as THREE.MeshBasicMaterial).color.set(world.daylight < 0.35 ? '#FFE9A8' : '#E8E4D8');
    // La luz principal sigue a la mascota en los sitios grandes (sombras nítidas con el mismo mapa)
    this.lights.key.target.position.set(root.position.x, 0, root.position.z);
    this.lights.key.position.set(root.position.x - 3, 6, root.position.z + 5);
    this.updateDebug(world);

    this.updateCamera(dt, active, root.position);
  }

  private updateCamera(dt: number, active: readonly Action[], petPos: THREE.Vector3): void {
    // Encuadre: el prototipo era 4:3; en retrato se aleja un poco y sigue más a la mascota
    const portrait = Math.max(1, Math.sqrt((4 / 3) / Math.max(0.3, this.aspect)));
    const close = this.framing === 'close';
    const dist = (close ? 0.62 : 1) * Math.min(1.6, portrait) * this.zoom;
    const outside = (this.envLocation ?? 'room') !== 'room';
    const followK = close ? 0.85 : outside ? 0.85 : 0.12 + 0.25 * (portrait - 1);
    const shakeTarget = active.includes('GET_SCARED') ? 1 : (this.source.world.pet.speed || 0) > 1.4 ? 0.35 : 0;
    this.camShake += (shakeTarget - this.camShake) * (1 - Math.exp(-dt * 4));

    // Modo cámara: sigue a la mascota (por defecto) o enfoca un objeto (herramientas / Recuerdos)
    const focusObj = this.cameraFocus?.type === 'object' ? this.entities.get(this.cameraFocus.id)?.group.position : null;
    const target = focusObj ?? petPos;
    const look = this.v2.set(target.x * followK, close ? 0.55 : 0.38, 0.45 + (target.z - 0.45) * followK * 0.6);
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

  // ---------- World Inspector: FOV, oído, percibidos, atención, navegación ----------
  private updateDebug(world: World): void {
    const f = this.debugFlags, pet = world.pet, root = this.pet.object3D.position;
    const cfg = world.sensorSystem.config;
    this.fovMesh.visible = f.fov;
    if (f.fov) {
      const half = (cfg.fovDeg / 2) * (Math.PI / 180);
      const range = world.def.sensoryProfile.visualRange * FLOOR_W * 0.6;
      this.fovMesh.position.set(root.x, 0.03, root.z);
      this.fovMesh.scale.set(range, range, 1);
      // CircleGeometry(θstart, θlength) en XY; rotado al suelo: ángulo 0 = +X, crece hacia −Z
      const g = this.fovMesh.geometry as THREE.CircleGeometry;
      if (g.parameters.thetaLength !== half * 2) { g.dispose(); this.fovMesh.geometry = new THREE.CircleGeometry(1, 40, -half, half * 2); }
      const fwd = Math.atan2(-Math.sin(pet.orientation) * this.sizeD, Math.cos(pet.orientation) * this.sizeW);
      this.fovMesh.rotation.set(-Math.PI / 2, 0, fwd);
    }
    this.hearMesh.visible = f.hearing;
    if (f.hearing) {
      // Radio al que un sonido de intensidad media (0.5) llega como umbral de atención (0.06)
      const r = cfg.hearingReference * Math.sqrt(0.5 / 0.06 - 1) * FLOOR_W * 0.6;
      this.hearMesh.position.set(root.x, 0.035, root.z);
      this.hearMesh.scale.set(r, r, 1);
    }
    const t = world.attentionTarget;
    this.attnMesh.visible = f.attention && !!t;
    if (this.attnMesh.visible && t) { this.attnMesh.position.set(this.toX(t.x), 0.05, this.toZ(t.y)); this.attnMesh.rotation.z = this.t * 2; }
    const nav = world.navigation.lastStep;
    this.navMesh.visible = f.navigation && !!nav && nav.reachable;
    if (this.navMesh.visible && nav) this.navMesh.position.set(this.toX(nav.waypoint.x), 0.35 + 0.05 * Math.sin(this.t * 4), this.toZ(nav.waypoint.y));
    // Marcas de objetos percibidos (más opacas cuanto más fuerte la señal)
    const list = f.perceived ? world.percepts.filter((p) => p.perceived) : [];
    while (this.perceivedMarks.length < list.length) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.3, 32), new THREE.MeshBasicMaterial({ color: '#7DD8B7', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      this.scene.add(m);
      this.perceivedMarks.push(m);
    }
    this.perceivedMarks.forEach((m, i) => {
      const p = list[i];
      m.visible = !!p;
      if (!p) return;
      const e = this.entities.get(p.id);
      if (e) m.position.set(e.group.position.x, 0.025, e.group.position.z);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.8 * p.signal;
    });
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
    if (this.env) disposeEnvironment(this.env);
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
