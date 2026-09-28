/*
 * PET EXPRESSIONS (portado de js/pet3d/PetExpressions.js)
 * -------------------------------------------------------
 * Cada expresión es un conjunto de parámetros numéricos (párpados, cejas,
 * boca...). Varias pueden estar activas a la vez: se mezclan por peso y los
 * pesos cambian suavemente, así una transición happy → sad nunca "salta".
 */
import type { PetModel } from './PetModel';

export const EXPRESSION_KEYS = ['upper', 'lower', 'tilt', 'eye', 'white', 'brow', 'browAngle', 'smile', 'open', 'round', 'tongue', 'tears', 'chew', 'lap', 'talk', 'arch', 'wink'] as const;
type ExprKey = (typeof EXPRESSION_KEYS)[number];
type ExprParams = Record<ExprKey, number>;

const P = (p: Partial<ExprParams>): Partial<ExprParams> => p;

export const EXPRESSION_PRESETS = {
  neutral: P({ upper: 0.05, lower: 0, tilt: 0, eye: 1, white: 0, brow: 0, browAngle: 0, smile: 0.55, open: 0, round: 0, tongue: 0, tears: 0 }),
  happy: P({ arch: 1, upper: 0, lower: 0, tilt: 0, eye: 1, white: 0, brow: 0, browAngle: 0, smile: 1, open: 0.2, round: 0, tongue: 0.3, tears: 0 }),
  openHappy: P({ arch: 1, upper: 0, lower: 0, tilt: 0, eye: 1, white: 0, brow: 0, browAngle: 0, smile: 1, open: 0.85, round: 0, tongue: 0.9, tears: 0 }),
  sad: P({ upper: 0.3, lower: 0, tilt: 0.6, eye: 1.05, white: 0, brow: 1, browAngle: 0.45, smile: -0.9, open: 0, round: 0, tongue: 0, tears: 0 }),
  crying: P({ upper: 0.4, lower: 0.15, tilt: 0.6, eye: 1, white: 0, brow: 1, browAngle: 0.5, smile: -1, open: 0.45, round: 0.3, tongue: 0, tears: 1 }),
  surprised: P({ upper: 0, lower: 0, tilt: 0, eye: 1.22, white: 1, brow: 1, browAngle: -0.25, smile: 0, open: 0.55, round: 1, tongue: 0, tears: 0 }),
  sleeping: P({ upper: 1, lower: 1, tilt: 0, eye: 1, white: 0, brow: 0, browAngle: 0, smile: 0.35, open: 0, round: 0, tongue: 0, tears: 0 }),
  eating: P({ upper: 0.1, lower: 0.35, tilt: 0, eye: 1, white: 0, brow: 0, browAngle: 0, smile: 0.6, open: 0.4, round: 0.2, tongue: 0.2, tears: 0, chew: 1 }),
  drinking: P({ upper: 0.2, lower: 0.3, tilt: 0, eye: 1, white: 0, brow: 0, browAngle: 0, smile: 0.5, open: 0.4, round: 0, tongue: 1, tears: 0, lap: 1 }),
  curious: P({ upper: 0, lower: 0, tilt: 0, eye: 1.1, white: 0, brow: 0.7, browAngle: -0.2, smile: 0.3, open: 0.1, round: 0.8, tongue: 0, tears: 0 }),
  wink: P({ arch: 0, wink: 1, upper: 0, lower: 0, tilt: 0, eye: 1, white: 0, brow: 0, browAngle: 0, smile: 1, open: 0.1, round: 0, tongue: 0.4, tears: 0 }),
  talking: P({ upper: 0, lower: 0.2, tilt: 0, eye: 1.05, white: 0, brow: 0, browAngle: 0, smile: 0.6, open: 0.6, round: 0.6, tongue: 0.2, tears: 0, talk: 1 }),
};
export type ExpressionName = keyof typeof EXPRESSION_PRESETS;
const NAMES = Object.keys(EXPRESSION_PRESETS) as ExpressionName[];

export class PetExpressions {
  weights: Partial<Record<ExpressionName, number>> = { neutral: 1 };
  active = new Set<ExpressionName>(['neutral']);
  params: ExprParams;
  private blink = { next: 2 + Math.random() * 3, t: -1 };
  private time = 0;

  constructor(private readonly model: PetModel) {
    this.params = Object.fromEntries(EXPRESSION_KEYS.map((k) => [k, EXPRESSION_PRESETS.neutral[k] ?? 0])) as ExprParams;
  }

  // Una o varias expresiones a la vez (se mezclan)
  set(names: ExpressionName | readonly ExpressionName[]): void {
    const list = ([] as ExpressionName[]).concat(names).filter((n) => n in EXPRESSION_PRESETS);
    this.active = new Set(list.length ? list : ['neutral']);
  }

  update(dt: number): void {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 7);
    for (const name of NAMES) {
      const w = this.weights[name] ?? 0, target = this.active.has(name) ? 1 : 0;
      this.weights[name] = w + (target - w) * k;
    }
    let total = 0;
    const p = Object.fromEntries(EXPRESSION_KEYS.map((key) => [key, 0])) as ExprParams;
    for (const name of NAMES) {
      const w = this.weights[name] ?? 0;
      if (w < 0.001) continue;
      total += w;
      const preset = EXPRESSION_PRESETS[name];
      for (const key of EXPRESSION_KEYS) p[key] += (preset[key] ?? 0) * w;
    }
    for (const key of EXPRESSION_KEYS) p[key] /= total || 1;

    // Movimiento secundario de la cara
    const t = this.time;
    if (p.chew) p.open = p.open * (1 - p.chew) + p.chew * (0.12 + 0.4 * (0.5 + 0.5 * Math.sin(t * 13)));
    if (p.talk) p.open = p.open * (1 - p.talk) + p.talk * (0.15 + 0.7 * Math.abs(Math.sin(t * 9)));
    const tongueOut = p.lap ? p.lap * (0.5 + 0.5 * Math.sin(t * 11)) : 0;

    // Parpadeo ocasional (no cuando duerme)
    this.blink.next -= dt;
    if (this.blink.next <= 0) { this.blink.t = 0; this.blink.next = 2.2 + Math.random() * 3.5; }
    if (this.blink.t >= 0) {
      this.blink.t += dt;
      const b = Math.sin(Math.min(1, this.blink.t / 0.16) * Math.PI);
      p.upper = Math.max(p.upper, b * (1 - (this.weights.sleeping ?? 0)));
      if (this.blink.t > 0.16) this.blink.t = -1;
    }
    this.params = p;
    this.apply(p, tongueOut);
  }

  private apply(p: ExprParams, tongueOut: number): void {
    const m = this.model;
    for (const e of m.eyes) {
      e.upper.rotation.x = -Math.asin(1 - Math.min(1, p.upper));
      e.upper.rotation.z = e.side * p.tilt * 0.4 * Math.min(1, p.upper * 3);
      e.lower.rotation.x = Math.asin(1 - Math.min(1, p.lower));
      e.pivot.scale.setScalar(p.eye || 1);
      // Ojos felices: el ojo se aplana y aparece el arco "⌒"
      const a = Math.max(p.arch || 0, e.side === 1 ? p.wink || 0 : 0);
      e.ball.scale.set(e.baseScale.x, e.baseScale.y * (1 - 0.9 * a), e.baseScale.z);
      e.ball.visible = e.hl1.visible = e.hl2.visible = a < 0.6;
      e.arch.visible = a >= 0.6;
      const w = Math.max(0.0001, p.white);
      e.white.scale.set(0.1 * w, 0.118 * w, 0.03 * w);
      e.white.visible = p.white > 0.01;
      e.line.visible = p.upper > 0.85 && p.lower > 0.6;
      e.brow.visible = p.brow > 0.05;
      e.brow.scale.set(0.012, Math.max(0.0001, 0.032 * p.brow), 0.012);
      e.brow.rotation.z = Math.PI / 2 - e.side * p.browAngle;
    }
    const mo = m.mouth;
    const smile = p.smile;
    mo.arcs.forEach((a) => {
      a.visible = p.open < 0.55;
      a.rotation.z = smile >= 0 ? Math.PI : 0;
      a.position.y = smile >= 0 ? 0 : -0.012;
      a.scale.y = 0.032 * Math.max(0.25, Math.abs(smile));
    });
    const open = Math.max(0, p.open);
    const r = Math.min(1, Math.max(0, p.round));
    mo.open.scale.set(0.062 * (0.6 + 0.4 * open), 0.001 + 0.06 * open * (1 - r), 0.032);
    mo.openRound.scale.set(0.034 * (0.5 + 0.5 * open), 0.001 + 0.045 * open * r, 0.03);
    mo.openRound.position.y = -0.01 - 0.02 * open;
    // Especies con la lengua un poco fuera en reposo
    const w = this.weights;
    const rest = this.model.cfg.tongueOut
      ? Math.max(0, 1 - (w.sleeping ?? 0) - (w.surprised ?? 0) - (w.crying ?? 0) - (w.sad ?? 0) - (w.talking ?? 0)) * Math.max(0, 1 - open * 2)
      : 0;
    mo.tongue.visible = (p.tongue > 0.05 && open > 0.1) || rest > 0.05;
    const ty = Math.max(0.001 + 0.028 * Math.min(p.tongue, open * 1.4), 0.03 * rest);
    mo.tongue.scale.set(0.036 + 0.004 * rest, ty, 0.022);
    mo.tongue.position.set(0, -0.018 - 0.028 * open - 0.012 * rest - 0.03 * tongueOut, 0.01 + 0.018 * rest + 0.025 * tongueOut);

    // Lágrimas que caen por las mejillas
    const t = this.time;
    m.tears.forEach((tear, i) => {
      tear.visible = p.tears > 0.5;
      if (!tear.visible) return;
      const base = tear.userData.base as { x: number; y: number; z: number };
      const f = (t * 0.9 + i * 0.5) % 1;
      tear.position.set(base.x, base.y - f * 0.14, base.z + f * 0.02);
      tear.scale.setScalar(0.022 * (1 - f * 0.4));
      tear.scale.y *= 1.4;
    });
  }
}
