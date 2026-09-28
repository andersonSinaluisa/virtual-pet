/*
 * PET MODEL: construcción procedural + rig de pivotes (portado de js/pet3d/PetModel.js)
 * -------------------------------------------------------------------------------
 * Silueta de peluche tipo "gomita": cabeza enorme que se funde con un cuerpo
 * compacto, brazos gruesos y cortos. Formas squircle y pelaje de capas.
 *
 *   PetRoot (posición y orientación en el mundo)
 *    └─ Motion (saltos, inclinación, temblor)
 *        ├─ LeftLegPivot / RightLegPivot
 *        └─ BodyPivot (respiración, aplastado)
 *            ├─ Body, Collar
 *            ├─ LeftArmPivot / RightArmPivot, CarryAnchor
 *            ├─ TailPivot
 *            └─ HeadPivot
 *                 └─ Head: Skull, Face (ojos + párpados, hocico, nariz, boca), orejas
 */
import * as THREE from 'three';

import { resolveAppearance, type PetAppearance } from './PetAppearance';
import { PetGeometry, PetMaterials, PetQuality } from './PetMaterials';

type V3 = [number, number, number];

interface MeshOpts {
  pos?: V3;
  scale?: V3;
  rot?: V3;
  name?: string;
  shadow?: boolean;
  fur?: { color: string; length?: number } | null;
}

export interface EyeRig {
  side: number;
  pivot: THREE.Group;
  ball: THREE.Mesh;
  white: THREE.Mesh;
  hl1: THREE.Mesh;
  hl2: THREE.Mesh;
  upper: THREE.Group;
  lower: THREE.Group;
  line: THREE.Mesh;
  arch: THREE.Mesh;
  brow: THREE.Mesh;
  baseScale: THREE.Vector3;
}

export interface MouthRig {
  pivot: THREE.Group;
  arcs: THREE.Mesh[];
  open: THREE.Mesh;
  openRound: THREE.Mesh;
  tongue: THREE.Mesh;
}

export interface RestPose {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  scale: THREE.Vector3;
}

export class PetModel {
  readonly cfg: PetAppearance;
  readonly meshes: THREE.Mesh[] = [];
  readonly pivots: Record<string, THREE.Group> = {};
  rest: Record<string, RestPose> = {};
  root!: THREE.Group;
  motion!: THREE.Group;
  bodyPivot!: THREE.Group;
  headPivot!: THREE.Group;
  head!: THREE.Group;
  tailPivot!: THREE.Group;
  carry!: THREE.Group;
  headRadius: V3 = [0.47, 0.4, 0.4];
  eyes: EyeRig[] = [];
  mouth!: MouthRig;
  tears: THREE.Mesh[] = [];

  constructor(appearance: Partial<PetAppearance>) {
    this.cfg = resolveAppearance(appearance);
    this.build();
  }

  // Crea una malla. fur: añade capas de pelo como hijas (siguen todas las animaciones).
  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], name, shadow = true, fur = null }: MeshOpts = {}): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
    if (name) m.name = name;
    m.castShadow = shadow;
    parent.add(m);
    this.meshes.push(m);
    if (fur && PetQuality.fur && this.cfg.fur) {
      const n = PetQuality.furLayers, L = PetQuality.furLength * (fur.length ?? 1);
      for (let i = 1; i <= n; i++) {
        const d = (L * i) / n;
        const sh = new THREE.Mesh(geo, PetMaterials.furShell(fur.color, i, n));
        sh.scale.set(1 + d / scale[0], 1 + d / scale[1], 1 + d / scale[2]);
        sh.name = 'FurShell'; sh.userData.shell = true;
        m.add(sh);
      }
    }
    return m;
  }

  private pivot(parent: THREE.Object3D, name: string, pos: V3): THREE.Group {
    const g = new THREE.Group();
    g.name = name; g.position.set(...pos);
    parent.add(g);
    this.pivots[name] = g;
    return g;
  }

  private build(): void {
    const c = this.cfg, M = PetMaterials, S = PetGeometry.sphere(), SQ = PetGeometry.squircle(2.7);
    const skin = M.plush(c.bodyColor), second = M.plush(c.secondaryColor);
    const furSkin = { color: c.bodyColor };
    const bw = c.bodyWidth;

    const root = (this.root = new THREE.Group());
    root.name = 'PetRoot';
    const motion = this.pivot(root, 'Motion', [0, 0, 0]);

    // ---- Patitas ----
    const fs = c.footScale;
    (['Left', 'Right'] as const).forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      const leg = this.pivot(motion, `${side}LegPivot`, [0.17 * s * bw, 0.08, 0.16]);
      this.mesh(S, skin, leg, { pos: [0, -0.035, 0.05], scale: [0.11 * fs, 0.07, 0.12 * fs], name: `${side}Foot`, fur: { ...furSkin, length: 0.6 } });
    });

    // ---- Cuerpo compacto ----
    const bodyPivot = this.pivot(motion, 'BodyPivot', [0, 0, 0]);
    this.mesh(SQ, skin, bodyPivot, { pos: [0, 0.35, 0], scale: [0.4 * bw, 0.35, 0.35], name: 'Body', fur: furSkin });
    if (c.collarColor) {
      this.mesh(PetGeometry.squircle(3.2), M.plush(c.collarColor), bodyPivot,
        { pos: [0, 0.45, 0.0], scale: [0.43 * bw, 0.078, 0.38], name: 'Collar', fur: { color: c.collarColor, length: 0.7 } });
    }

    // ---- Brazos gruesos ----
    const ls = c.limbScale;
    (['Left', 'Right'] as const).forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      const arm = this.pivot(bodyPivot, `${side}ArmPivot`, [0.35 * s * bw, 0.5, 0.07]);
      arm.rotation.set(-0.45, 0, 0.32 * s);
      this.mesh(PetGeometry.capsule(), skin, arm, { pos: [0, -0.1, 0.01], scale: [0.092 * ls, 0.07 * ls, 0.095 * ls], name: `${side}Arm`, fur: furSkin });
      this.mesh(S, skin, arm, { pos: [0, -0.2, 0.02], scale: [0.105 * ls, 0.095 * ls, 0.105 * ls], name: `${side}Paw`, fur: furSkin });
    });
    const carry = this.pivot(bodyPivot, 'CarryAnchor', [0, 0.46, 0.45]);

    // ---- Cola ----
    const tailPivot = this.pivot(bodyPivot, 'TailPivot', [0, 0.22, -0.33]);
    this.buildTail(tailPivot, c);

    // ---- Cabeza enorme ----
    const headPivot = this.pivot(bodyPivot, 'HeadPivot', [0, 0.62, 0.0]);
    const head = this.pivot(headPivot, 'Head', [0, 0.25, 0.03]);
    const hs = c.headScale;
    this.headRadius = [0.47 * hs[0], 0.4 * hs[1], 0.4 * hs[2]];
    this.mesh(SQ, skin, head, { scale: this.headRadius, name: 'Skull', fur: furSkin });

    this.buildFace(head, c, skin);
    this.buildEars(head, c, skin, second);

    Object.assign(this, { motion, bodyPivot, headPivot, head, tailPivot, carry });
    this.rest = {};
    for (const [name, p] of Object.entries(this.pivots)) this.rest[name] = { pos: p.position.clone(), rot: p.rotation.clone(), scale: p.scale.clone() };
  }

  private buildTail(pivot: THREE.Group, c: PetAppearance): void {
    const M = PetMaterials, k = c.tailScale;
    const color = c.tailType === 'pom' ? c.bellyColor : c.tailType === 'curl' ? c.bodyColor : c.secondaryColor;
    const mat = M.plush(color), fur = { color, length: 0.7 };
    const tail = new THREE.Group(); tail.name = 'Tail'; pivot.add(tail);
    if (c.tailType === 'curl') {
      this.mesh(new THREE.TorusGeometry(1, 0.42, 14, 30, Math.PI * 1.5), mat, tail, { pos: [0, 0.07 * k, -0.02], scale: [0.09 * k, 0.09 * k, 0.09 * k], rot: [0, Math.PI / 2, 0.6], name: 'TailMesh', fur });
    } else if (c.tailType === 'long') {
      const pts = ([[0, 0, 0], [0, 0.03, -0.16], [0, 0.16, -0.28], [0, 0.34, -0.3], [0, 0.46, -0.22]] as V3[]).map((p) => new THREE.Vector3(p[0] * k, p[1] * k, p[2] * k));
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.045 * k, 12, false);
      this.mesh(geo, mat, tail, { name: 'TailMesh' });
      this.mesh(PetGeometry.sphere(), mat, tail, { pos: pts[4].toArray() as V3, scale: [0.045 * k, 0.045 * k, 0.045 * k], name: 'TailTip' });
      this.mesh(PetGeometry.sphere(), mat, tail, { scale: [0.06 * k, 0.06 * k, 0.06 * k], name: 'TailBase' });
    } else if (c.tailType === 'stub') {
      this.mesh(PetGeometry.sphere(), mat, tail, { scale: [0.08 * k, 0.08 * k, 0.07 * k], name: 'TailMesh', fur });
    } else {
      this.mesh(PetGeometry.sphere(), mat, tail, { pos: [0, 0.02, -0.02], scale: [0.11 * k, 0.11 * k, 0.1 * k], name: 'TailMesh', fur: { color, length: 1.4 } });
    }
  }

  private buildEars(head: THREE.Group, c: PetAppearance, skin: THREE.Material, second: THREE.Material): void {
    const M = PetMaterials, S = PetGeometry.sphere(), k = c.earScale;
    const inner = M.plush(c.innerEarColor);
    const furSecond = { color: c.secondaryColor, length: 0.8 }, furSkin = { color: c.bodyColor, length: 0.8 };
    const [rx, ry] = this.headRadius;
    (['Left', 'Right'] as const).forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      let pivot: THREE.Group;
      if (c.earType === 'rose') {
        pivot = this.pivot(head, `${side}EarPivot`, [(rx - 0.13) * s, ry - 0.02, 0.06]);
        const flap = new THREE.Group(); flap.rotation.set(-0.95, 0.35 * s, 0.62 * s); pivot.add(flap);
        this.mesh(S, inner, flap, { pos: [0, -0.07, -0.02], scale: [0.11 * k, 0.1 * k, 0.03 * k], name: `${side}EarInner` });
        this.mesh(S, second, flap, { pos: [0.01 * s, -0.11, 0.012], scale: [0.13 * k, 0.15 * k, 0.042 * k], name: `${side}Ear`, fur: furSecond });
      } else if (c.earType === 'floppy') {
        pivot = this.pivot(head, `${side}EarPivot`, [(rx - 0.05) * s, ry * 0.45, 0.02]);
        pivot.rotation.z = 0.3 * s;
        this.mesh(S, second, pivot, { pos: [0.035 * s, -0.16 * k, 0.02], scale: [0.105 * k, 0.2 * k, 0.07 * k], rot: [0.15, 0, 0.1 * s], name: `${side}Ear`, fur: furSecond });
      } else if (c.earType === 'triangle') {
        pivot = this.pivot(head, `${side}EarPivot`, [(rx - 0.16) * s, ry - 0.06, -0.02]);
        pivot.rotation.z = -0.3 * s;
        this.mesh(PetGeometry.cone(), skin, pivot, { pos: [0, 0.11 * k, 0], scale: [0.15 * k, 0.26 * k, 0.1 * k], name: `${side}Ear`, fur: furSkin });
        this.mesh(PetGeometry.cone(), inner, pivot, { pos: [0, 0.095 * k, 0.05], scale: [0.09 * k, 0.17 * k, 0.03 * k], name: `${side}EarInner` });
      } else if (c.earType === 'round') {
        pivot = this.pivot(head, `${side}EarPivot`, [(rx - 0.1) * s, ry - 0.03, -0.03]);
        pivot.rotation.z = -0.4 * s;
        this.mesh(S, skin, pivot, { pos: [0, 0.05, 0], scale: [0.12 * k, 0.115 * k, 0.07 * k], name: `${side}Ear`, fur: furSkin });
        this.mesh(S, inner, pivot, { pos: [0, 0.05, 0.045], scale: [0.07 * k, 0.065 * k, 0.03 * k], name: `${side}EarInner` });
      } else {
        pivot = this.pivot(head, `${side}EarPivot`, [0.15 * s, ry - 0.04, -0.03]);
        pivot.rotation.z = -0.14 * s;
        this.mesh(PetGeometry.capsule(), skin, pivot, { pos: [0, 0.26 * k, 0], scale: [0.08 * k, 0.13 * k, 0.055 * k], name: `${side}Ear`, fur: furSkin });
        this.mesh(PetGeometry.capsule(), inner, pivot, { pos: [0, 0.26 * k, 0.035], scale: [0.045 * k, 0.1 * k, 0.025 * k], name: `${side}EarInner` });
      }
    });
  }

  private buildFace(head: THREE.Group, c: PetAppearance, skin: THREE.Material): void {
    const M = PetMaterials, S = PetGeometry.sphere();
    const [rx, ry, rz] = this.headRadius, p = 2.7;
    const furLift = PetQuality.fur && c.fur ? PetQuality.furLength * 0.85 : 0;
    const surfaceZ = (x: number, y: number) => rz * Math.pow(Math.max(0, 1 - Math.abs(x / rx) ** p - Math.abs(y / ry) ** p), 1 / p) + furLift;
    const face = this.pivot(head, 'Face', [0, 0, 0]);

    // ---- Ojos grandes y brillantes, con párpados ----
    this.eyes = [];
    const es = c.eyeSize, ex = 0.19 * c.eyeSpacing, ey = 0.07;
    (['Left', 'Right'] as const).forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      const eye = this.pivot(face, `${side}EyePivot`, [ex * s, ey, surfaceZ(ex, ey) - 0.022]);
      eye.rotation.y = 0.24 * s;
      const white = this.mesh(S, M.white(), eye, { pos: [0, 0, -0.004], scale: [0.0001, 0.0001, 0.0001], name: `${side}EyeWhite`, shadow: false });
      const ball = this.mesh(S, M.eye(), eye, { scale: [0.07 * es, 0.086 * es, 0.045 * es], name: `${side}Eye`, shadow: false });
      const hl1 = this.mesh(PetGeometry.sphereLow(), M.highlight(), eye, { pos: [0.024 * es, 0.036 * es, 0.038 * es], scale: [0.014 * es, 0.016 * es, 0.006], shadow: false });
      const hl2 = this.mesh(PetGeometry.sphereLow(), M.highlight(), eye, { pos: [-0.02 * es, -0.03 * es, 0.039 * es], scale: [0.006 * es, 0.006 * es, 0.004], shadow: false });
      const upper = this.pivot(eye, `${side}UpperLid`, [0, 0, 0]);
      this.mesh(PetGeometry.hemi(), skin, upper, { scale: [0.077 * es, 0.093 * es, 0.053 * es], name: 'UpperLid', shadow: false });
      const lower = this.pivot(eye, `${side}LowerLid`, [0, 0, 0]);
      this.mesh(PetGeometry.hemi(), skin, lower, { rot: [Math.PI, 0, 0], scale: [0.077 * es, 0.093 * es, 0.053 * es], name: 'LowerLid', shadow: false });
      const line = this.mesh(PetGeometry.torusArc(), M.eye(), eye, { pos: [0, -0.005, 0.045 * es], scale: [0.055 * es, 0.034 * es, 0.04], rot: [0, 0, Math.PI], name: 'LidLine', shadow: false });
      line.visible = false;
      const arch = this.mesh(PetGeometry.torusArc(), M.eye(), eye, { pos: [0, -0.02, 0.03 * es], scale: [0.062 * es, 0.05 * es, 0.06], name: 'HappyArch', shadow: false });
      arch.visible = false;
      const brow = this.mesh(PetGeometry.capsule(), M.plush(c.secondaryColor), face, { pos: [ex * s, ey + 0.14, surfaceZ(ex, ey + 0.14) + 0.005], scale: [0.013, 0.034, 0.013], rot: [0, 0, Math.PI / 2], name: `${side}Brow`, shadow: false });
      this.eyes.push({ side: s, pivot: eye, ball, white, hl1, hl2, upper, lower, line, arch, brow, baseScale: ball.scale.clone() });
    });

    // ---- Hocico / antifaz, nariz, boca ----
    const ms = c.muzzleScale, my = -0.12;
    const muzzle = this.pivot(face, 'Muzzle', [0, my, surfaceZ(0, my) - 0.07]);
    const muzzleColor = c.maskColor ?? c.muzzleColor;
    const mfur = { color: muzzleColor, length: 0.6 };
    if (c.muzzle === 'mask') {
      this.mesh(PetGeometry.squircle(2.4), M.plush(muzzleColor), muzzle, { pos: [0, 0.005, 0.0], scale: [0.21 * ms, 0.15 * ms, 0.12 * ms], name: 'Mask', fur: mfur });
      [-1, 1].forEach((s) => this.mesh(S, M.plush(muzzleColor), muzzle, { pos: [0.07 * s * ms, -0.025, 0.05], scale: [0.1 * ms, 0.085 * ms, 0.08 * ms], name: 'MuzzlePuff', fur: mfur }));
    } else if (c.muzzle === 'small' || c.muzzle === 'bunny') {
      [-1, 1].forEach((s) => this.mesh(S, M.plush(muzzleColor), muzzle, { pos: [0.05 * s * ms, -0.02, 0.05], scale: [0.07 * ms, 0.06 * ms, 0.06 * ms], name: 'MuzzlePuff', fur: mfur }));
    } else {
      this.mesh(S, M.plush(muzzleColor), muzzle, { pos: [0, -0.005, 0.04], scale: [0.16 * ms, 0.115 * ms, 0.11 * ms], name: 'MuzzleBase', fur: mfur });
    }
    const big = c.muzzle === 'mask' || c.muzzle === 'bear';
    const nk = big ? 1 : 0.55;
    const nose = this.pivot(muzzle, 'Nose', [0, (big ? 0.075 : 0.035) * ms, (big ? 0.11 : 0.1) * ms]);
    this.mesh(S, M.glossy(c.noseColor), nose, { scale: [0.07 * nk, 0.04 * nk, 0.045 * nk], name: 'NoseMesh', shadow: false });
    this.mesh(S, M.glossy(c.noseColor), nose, { pos: [0, -0.026 * nk, 0.004], scale: [0.032 * nk, 0.034 * nk, 0.034 * nk], name: 'NoseTip', shadow: false });
    this.mesh(PetGeometry.sphereLow(), M.highlight(), nose, { pos: [-0.022 * nk, 0.018 * nk, 0.034 * nk], scale: [0.016 * nk, 0.007 * nk, 0.004], shadow: false });

    const mouth = this.pivot(muzzle, 'Mouth', [0, (big ? 0.0 : -0.03) * ms, 0.125 * ms]);
    const dark = M.flat('#2a1512');
    const arcs = [-1, 1].map((s) => this.mesh(PetGeometry.torusArc(), dark, mouth, { pos: [0.03 * s, 0, 0], scale: [0.03, 0.03, 0.03], rot: [0, 0, Math.PI], name: 'MouthArc', shadow: false }));
    const open = this.mesh(PetGeometry.hemi(), M.flat('#5a1f27', 0.5), mouth, { pos: [0, -0.004, -0.006], rot: [Math.PI, 0, 0], scale: [0.05, 0.001, 0.03], name: 'MouthOpen', shadow: false });
    const openRound = this.mesh(S, M.flat('#5a1f27', 0.5), mouth, { pos: [0, -0.03, -0.006], scale: [0.03, 0.001, 0.03], name: 'MouthRound', shadow: false });
    const tongue = this.mesh(S, M.glossy('#F2545F'), mouth, { pos: [0, -0.05, 0.012], scale: [0.03, 0.001, 0.02], name: 'Tongue', shadow: false });
    this.mouth = { pivot: mouth, arcs, open, openRound, tongue };

    // Rubor muy sutil
    [-1, 1].forEach((s) => this.mesh(S, M.blush(), face, { pos: [0.29 * s, -0.06, surfaceZ(0.29, -0.06) - 0.01], scale: [0.05, 0.03, 0.02], rot: [0, 0.6 * s, 0], name: 'Blush', shadow: false }));

    if (c.whiskers) [-1, 1].forEach((s) => [0.02, -0.02].forEach((dy) => this.mesh(PetGeometry.capsule(), M.flat('#ffffff', 0.4), muzzle,
      { pos: [0.13 * s, 0.0 + dy, 0.07], scale: [0.003, 0.05, 0.003], rot: [0, 0, Math.PI / 2 + dy * 4 * s], name: 'Whisker', shadow: false })));

    // Lágrimas (se muestran al llorar)
    this.tears = [-1, 1].map((s) => this.mesh(S, M.tear(), face, { pos: [ex * s, ey - 0.1, surfaceZ(ex, ey - 0.1) + 0.012], scale: [0.018, 0.026, 0.018], name: 'Tear', shadow: false }));
    this.tears.forEach((t) => { t.visible = false; t.userData.base = t.position.clone(); });
  }

  dispose(): void {
    // Geometrías y materiales compartidos se conservan en caché; solo se sueltan las geometrías propias
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.geometry instanceof THREE.TubeGeometry || (o.geometry instanceof THREE.TorusGeometry && o.name === 'TailMesh'))) o.geometry.dispose();
    });
  }
}
