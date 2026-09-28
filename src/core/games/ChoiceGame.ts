/*
 * ¿CUÁL PREFIERES?
 * ----------------
 * Se colocan (hasta) tres objetos. Durante la observación se mide la
 * atención REAL que la red les dedica: foco perceptivo, mirada, investigación
 * de cerca y llevarlo en la boca. No se fuerza ninguna elección: si ninguno
 * destaca claramente, el resultado es "hoy no eligió".
 */
import type { StepResult } from '../simulation/Simulation';
import { ITEMS, type ItemKind } from '../world/Items';
import { behaviorLine, capitalize, type GameCommand, type GameContext, type GameSummary, type MiniGame, type Narration } from './MiniGame';

export type ChoicePhase = 'setup' | 'observing' | 'result';

export interface ChoiceOption {
  kind: ItemKind;
  selected: boolean;
  score: number;
  share: number; // 0..1 de la atención total
}

export interface ChoiceView {
  gameId: 'choice';
  phase: ChoicePhase;
  narration: Narration;
  options: ChoiceOption[];
  chosen: ItemKind | null;
  secondsLeft: number;
  focusKind: ItemKind | null;
}

const DEFAULT_OPTIONS: ItemKind[] = ['ball', 'duck', 'rope'];
const OBSERVE_TICKS = 90;
const MIN_SCORE = 8;
const MARGIN = 1.3;

export class ChoiceGame implements MiniGame<ChoiceView> {
  readonly id = 'choice' as const;
  private options: ChoiceOption[] = [];
  private placed = new Map<number, ItemKind>();
  private phase: ChoicePhase = 'setup';
  private ticksLeft = OBSERVE_TICKS;
  private chosen: ItemKind | null = null;
  private carryTicks = 0;
  private focusKind: ItemKind | null = null;
  private lastActive: StepResult['active'] = [];

  start(ctx: GameContext): void {
    ctx.world.setPlayerPresent(true);
    const owned = ctx.ownedItems().filter((k) => ITEMS[k].pickable);
    const kinds = DEFAULT_OPTIONS.map((k, i) => (owned.includes(k) || owned.length === 0 ? k : owned[i % owned.length]));
    this.options = [...new Set(kinds)].map((kind) => ({ kind, selected: true, score: 0, share: 0 }));
  }

  input(cmd: GameCommand, ctx: GameContext): void {
    if (cmd.type === 'toggle_item' && this.phase === 'setup') {
      const o = this.options.find((x) => x.kind === cmd.kind);
      if (!o) return;
      const selectedCount = this.options.filter((x) => x.selected).length;
      if (o.selected && selectedCount <= 2) return; // al menos dos opciones
      o.selected = !o.selected;
    } else if (cmd.type === 'begin' && this.phase === 'setup') {
      const chosen = this.options.filter((o) => o.selected);
      chosen.forEach((o, i) => {
        const x = chosen.length === 1 ? 0.5 : 0.28 + (0.44 * i) / (chosen.length - 1);
        const obj = ctx.world.placeItem(o.kind, { x, y: 0.62 }, 'game');
        obj.novelty = 0.5; // misma novedad para todos: comparación justa
        this.placed.set(obj.id, o.kind);
      });
      this.phase = 'observing';
      ctx.setEvaluation(true); // medir sin que la propia prueba cambie los pesos
    }
  }

  observe(r: StepResult, ctx: GameContext): void {
    this.lastActive = r.active;
    if (this.phase !== 'observing') return;
    const w = ctx.world, pet = w.pet;
    const investigating = r.active.includes('INVESTIGATE');
    this.focusKind = r.focusObjectId !== null ? this.placed.get(r.focusObjectId) ?? null : null;
    for (const [id, kind] of this.placed) {
      const obj = w.getObject(id);
      const opt = this.options.find((o) => o.kind === kind);
      if (!obj || !opt) continue;
      if (r.focusObjectId === id) opt.score += 1;
      if (pet.lookTarget === obj) opt.score += 1;
      if (investigating && w.distance(pet, obj) < 0.12) opt.score += 2;
      if (pet.carrying === id) opt.score += 3;
    }
    const total = this.options.reduce((s, o) => s + o.score, 0);
    this.options.forEach((o) => { o.share = total ? o.score / total : 0; });

    const carried = pet.carrying !== null ? this.placed.get(pet.carrying) : undefined;
    this.carryTicks = carried ? this.carryTicks + 1 : 0;
    this.ticksLeft--;
    if (this.ticksLeft <= 0 || this.carryTicks >= 6) this.finish(ctx);
  }

  private finish(ctx: GameContext): void {
    const ranked = this.options.filter((o) => o.selected).sort((a, b) => b.score - a.score);
    const [first, second] = ranked;
    const clear = first && first.score >= MIN_SCORE && (!second || first.score >= second.score * MARGIN);
    this.chosen = clear ? first.kind : null;
    this.phase = 'result';
    ctx.setEvaluation(false);
    if (this.chosen) ctx.record('choice_made', this.chosen, 0.6, 0.7);
  }

  view(ctx: GameContext): ChoiceView {
    const n = ctx.petName;
    const line = capitalize(behaviorLine(this.lastActive));
    const focus = this.focusKind ? ITEMS[this.focusKind].label : null;
    const narration: Narration =
      this.phase === 'setup' ? { title: 'Elige qué juguetes poner en su mundo', subtitle: 'Y observa sus preferencias naturales.', tone: 'neutral' }
      : this.phase === 'observing' ? { title: focus ? `${n} tiene la atención puesta en ${focus}…` : `${n} mira las opciones…`, subtitle: line, tone: 'neutral' }
      : this.chosen ? { title: `Hoy ${n} eligió ${ITEMS[this.chosen].label}`, subtitle: 'Lo recordará para la próxima vez.', tone: 'positive' }
      : { title: `Hoy ${n} no se decidió por ninguno`, subtitle: 'No hay respuestas correctas: también es una elección.', tone: 'neutral' };
    return {
      gameId: 'choice', phase: this.phase, narration, options: this.options.map((o) => ({ ...o })), chosen: this.chosen,
      secondsLeft: Math.max(0, Math.ceil(this.ticksLeft / ctx.ticksPerSecond)), focusKind: this.focusKind,
    };
  }

  end(ctx: GameContext): GameSummary {
    const n = ctx.petName;
    if (this.phase === 'observing') this.finish(ctx);
    if (this.chosen) {
      const others = this.options.filter((o) => o.selected && o.kind !== this.chosen).map((o) => ITEMS[o.kind].label).join(' y ');
      ctx.addMoment({
        title: `${n} eligió ${ITEMS[this.chosen].label}`, subject: this.chosen, icon: 'interests', tags: ['#Preferencias'],
        story: `Entre ${ITEMS[this.chosen].label} y ${others || 'nada más'}, ${n} dedicó casi toda su atención a ${ITEMS[this.chosen].label}.`,
      });
    }
    if (this.phase !== 'setup') ctx.record('game_played', null, this.chosen ? 0.5 : 0.2, 0.4);
    ctx.world.removeTagged('game');
    return { gameId: this.id, success: !!this.chosen, headline: this.chosen ? `Eligió ${ITEMS[this.chosen].label}` : 'No eligió ninguno' };
  }
}
