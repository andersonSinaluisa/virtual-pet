/*
 * PET FX: pequeños efectos flotantes (Zzz, !, ?, corazones, notas, ondas).
 *
 * DIFERENCIA MÓVIL: el prototipo dibujaba estos símbolos como texto en un
 * <canvas> 2D (Sprite con CanvasTexture). En React Native no hay canvas 2D,
 * así que cada símbolo es una malla 3D plana del mismo estilo juguete que
 * mira siempre a la cámara (billboard).
 */
import * as THREE from 'three';

import { PetGeometry } from './PetMaterials';

export type FxName = 'zzz' | 'exclaim' | 'question' | 'hearts' | 'notes' | 'sound';

function mat(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

function outlineGlyph(shape: THREE.Shape, color: string): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.ShapeGeometry(shape, 12);
  geo.center();
  const back = new THREE.Mesh(geo, mat('#ffffff'));
  back.scale.setScalar(1.25);
  back.position.z = -0.002;
  g.add(back, new THREE.Mesh(geo, mat(color)));
  return g;
}

function heartShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.1, -0.35, -0.55, -0.1, -0.5, 0.18);
  s.bezierCurveTo(-0.45, 0.45, -0.1, 0.5, 0, 0.25);
  s.bezierCurveTo(0.1, 0.5, 0.45, 0.45, 0.5, 0.18);
  s.bezierCurveTo(0.55, -0.1, 0.1, -0.35, 0, -0.5);
  return s;
}

function zShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.4, 0.4); s.lineTo(0.4, 0.4); s.lineTo(0.4, 0.22); s.lineTo(-0.12, -0.22); s.lineTo(0.4, -0.22);
  s.lineTo(0.4, -0.4); s.lineTo(-0.4, -0.4); s.lineTo(-0.4, -0.22); s.lineTo(0.12, 0.22); s.lineTo(-0.4, 0.22); s.lineTo(-0.4, 0.4);
  return s;
}

function exclaim(color: string): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color);
  const bar = new THREE.Mesh(PetGeometry.capsule(), m); bar.scale.set(0.12, 0.28, 0.02); bar.position.y = 0.15;
  const dot = new THREE.Mesh(PetGeometry.sphereLow(), m); dot.scale.set(0.12, 0.12, 0.02); dot.position.y = -0.38;
  g.add(bar, dot);
  return g;
}

function question(color: string): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 24, Math.PI * 1.4), m);
  arc.rotation.z = -Math.PI * 0.35; arc.position.y = 0.2;
  const stem = new THREE.Mesh(PetGeometry.capsule(), m); stem.scale.set(0.07, 0.08, 0.02); stem.position.y = -0.12;
  const dot = new THREE.Mesh(PetGeometry.sphereLow(), m); dot.scale.set(0.09, 0.09, 0.02); dot.position.y = -0.4;
  g.add(arc, stem, dot);
  return g;
}

function note(color: string): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color);
  const head = new THREE.Mesh(PetGeometry.sphereLow(), m); head.scale.set(0.2, 0.15, 0.02); head.position.set(-0.1, -0.3, 0);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.02), m); stem.position.set(0.07, 0.02, 0);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.02), m); flag.position.set(0.17, 0.3, 0); flag.rotation.z = -0.4;
  g.add(head, stem, flag);
  return g;
}

function setOpacity(o: THREE.Object3D, v: number): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) c.material.opacity = v;
  });
}

export class PetFX {
  readonly group = new THREE.Group();
  private active = new Set<FxName>();
  private t = 0;
  private readonly kinds: Record<Exclude<FxName, 'sound'>, THREE.Group[]>;
  private readonly rings: THREE.Mesh[];
  private readonly qRoot = new THREE.Quaternion();
  private readonly qBill = new THREE.Quaternion();
  private readonly headLocal = new THREE.Vector3();

  constructor(parent: THREE.Object3D) {
    this.group.name = 'PetFX';
    parent.add(this.group);
    const add = (g: THREE.Group, s: number) => { g.scale.setScalar(s); g.visible = false; this.group.add(g); return g; };
    this.kinds = {
      zzz: [0, 1, 2].map(() => add(outlineGlyph(zShape(), '#5b63c9'), 0.2)),
      exclaim: [add(exclaim('#ff8a3d'), 0.36)],
      question: [add(question('#4f8fe0'), 0.3)],
      hearts: [0, 1, 2].map(() => add(outlineGlyph(heartShape(), '#ff6f91'), 0.2)),
      notes: [0, 1].map(() => add(note('#7c6cf0'), 0.22)),
    };
    const ringMat = new THREE.MeshBasicMaterial({ color: '#8ea0ff', transparent: true, opacity: 0.8, depthWrite: false });
    this.rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(PetGeometry.ring(), ringMat.clone());
      r.visible = false;
      this.group.add(r);
      return r;
    });
  }

  set(names: readonly FxName[]): void {
    this.active = new Set(names);
  }

  update(dt: number, headWorld: THREE.Vector3, root: THREE.Object3D, camera: THREE.Camera): void {
    this.t += dt;
    const t = this.t;
    const head = root.worldToLocal(this.headLocal.copy(headWorld));
    // Billboard en el espacio local de la mascota: q = inv(raíz) · cámara
    root.getWorldQuaternion(this.qRoot).invert();
    this.qBill.copy(this.qRoot).multiply(camera.quaternion);

    const show = (list: THREE.Group[], on: boolean, fn: (g: THREE.Group, i: number) => void) => list.forEach((g, i) => {
      g.visible = on;
      if (on) { g.quaternion.copy(this.qBill); fn(g, i); }
    });
    show(this.kinds.zzz, this.active.has('zzz'), (g, i) => {
      const f = (t * 0.45 + i / 3) % 1;
      g.position.set(head.x + 0.25 + f * 0.25, head.y + 0.25 + f * 0.45, head.z);
      setOpacity(g, Math.sin(f * Math.PI));
      g.scale.setScalar(0.12 + f * 0.12);
    });
    show(this.kinds.exclaim, this.active.has('exclaim'), (g) => { g.position.set(head.x, head.y + 0.62 + 0.03 * Math.sin(t * 20), head.z); });
    show(this.kinds.question, this.active.has('question'), (g) => { g.position.set(head.x + 0.28, head.y + 0.55 + 0.03 * Math.sin(t * 4), head.z); });
    show(this.kinds.hearts, this.active.has('hearts'), (g, i) => {
      const f = (t * 0.7 + i / 3) % 1;
      g.position.set(head.x + (i - 1) * 0.25, head.y + 0.35 + f * 0.5, head.z + 0.1);
      setOpacity(g, Math.sin(f * Math.PI));
    });
    show(this.kinds.notes, this.active.has('notes'), (g, i) => {
      const f = (t * 0.6 + i / 2) % 1;
      g.position.set(head.x - 0.35 + f * 0.15 + i * 0.7, head.y + 0.1 + f * 0.5, head.z);
      setOpacity(g, Math.sin(f * Math.PI));
    });
    this.rings.forEach((r, i) => {
      r.visible = this.active.has('sound');
      if (!r.visible) return;
      const f = (t * 1.4 + i / 3) % 1, s = 0.12 + f * 0.35;
      r.position.set(head.x, head.y - 0.12, head.z + 0.42 + f * 0.1);
      r.scale.set(s, s, s);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - f);
    });
  }
}
