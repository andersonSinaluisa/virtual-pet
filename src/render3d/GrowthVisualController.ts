/*
 * GROWTH VISUAL CONTROLLER: el MISMO modelo crece de forma continua.
 *
 * No hay un modelo por etapa: se interpolan fotogramas clave de proporción
 * (GrowthConfig.visual) y se aplican sobre la pose de reposo del rig (el
 * animador parte de ella en cada frame, así que todas las animaciones siguen
 * funcionando). El valor visual cambia suave: dentro de una etapa se nota
 * poco a poco y al crecer se interpola en unos segundos.
 */
import * as THREE from 'three';

import { GROWTH_CONFIG, type AnimationStyle, type VisualKeyframe } from '@/core/growth/GrowthConfig';
import { LIFE_STAGES } from '@/core/growth/LifeStage';

import type { Pet3D } from './Pet3D';

const KEYS = LIFE_STAGES.map((s) => GROWTH_CONFIG.stages[s]);
const RATE = 0.9; // 1/s: una transición completa tarda ~3–4 s

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function visualAt(v: number): { frame: VisualKeyframe; style: AnimationStyle } {
  const x = Math.max(0, Math.min(KEYS.length - 1, v));
  const i = Math.min(KEYS.length - 2, Math.floor(x)), t = x - i;
  const a = KEYS[i], b = KEYS[i + 1];
  const frame = {} as VisualKeyframe, style = {} as AnimationStyle;
  for (const k of Object.keys(a.visual) as (keyof VisualKeyframe)[]) frame[k] = lerp(a.visual[k], b.visual[k], t);
  for (const k of Object.keys(a.animation) as (keyof AnimationStyle)[]) style[k] = lerp(a.animation[k], b.animation[k], t);
  return { frame, style };
}

interface Base { pos: THREE.Vector3; scale: THREE.Vector3 }

export class GrowthVisualController {
  private current: number | null = null;
  private readonly base = new Map<string, Base>();
  private readonly body: THREE.Object3D | null;
  private readonly bodyScale = new THREE.Vector3(1, 1, 1);

  constructor(private readonly pet: Pet3D) {
    for (const [name, r] of Object.entries(pet.model.rest)) this.base.set(name, { pos: r.pos.clone(), scale: r.scale.clone() });
    this.body = pet.object3D.getObjectByName('Body') ?? null;
    if (this.body) this.bodyScale.copy(this.body.scale);
  }

  get value(): number { return this.current ?? 0; }

  // target: valor continuo 0..3 (etapa + avance); size: variación individual; snap = sin transición
  update(dt: number, target: number, size = 1, snap = false): void {
    if (this.current === null || snap) this.current = target;
    else this.current += (target - this.current) * (1 - Math.exp(-dt * RATE));
    const { frame, style } = visualAt(this.current);
    this.apply(frame, size);
    this.pet.animator.setStyle(style);
  }

  private apply(f: VisualKeyframe, size: number): void {
    const rest = this.pet.model.rest;
    const set = (name: string, fn: (r: { pos: THREE.Vector3; scale: THREE.Vector3 }, b: Base) => void) => {
      const r = rest[name], b = this.base.get(name);
      if (r && b) { r.pos.copy(b.pos); r.scale.copy(b.scale); fn(r, b); }
    };
    this.pet.object3D.scale.setScalar(f.scale * size);
    set('Head', (r) => r.scale.multiplyScalar(f.head));
    set('HeadPivot', (r) => { r.pos.y += f.neck; });
    for (const side of ['Left', 'Right']) {
      set(`${side}LegPivot`, (r) => { r.scale.y *= f.legs; r.scale.x *= 0.5 + 0.5 * f.legs; r.scale.z *= 0.5 + 0.5 * f.legs; });
      set(`${side}EarPivot`, (r) => r.scale.multiplyScalar(f.ears));
      set(`${side}ArmPivot`, (r) => { r.scale.y *= 0.6 + 0.4 * f.legs; });
    }
    if (this.body) this.body.scale.set(this.bodyScale.x * f.body, this.bodyScale.y, this.bodyScale.z * f.body);
  }
}
