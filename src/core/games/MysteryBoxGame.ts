/*
 * CAJA MISTERIOSA
 * ---------------
 * Aparece un objeto desconocido (novedad 1, interés alto). Los sensores
 * newObjectDetected / interestingObjectVisible hacen el resto: la red puede
 * mirarla, acercarse, investigarla, alejarse o esconderse. No hay respuesta
 * programada.
 *
 * La caja se abre cuando la mascota la ha INVESTIGADO de cerca lo suficiente
 * (contador físico `investigation` que incrementa el handler INVESTIGATE).
 *
 * v7 (mundo vivo): abrirla es FÍSICA del mundo (World.openBox), igual que en
 * la habitación sin minijuego: el juego solo narra. La experiencia
 * `mystery_opened`, el desbloqueo y el aprendizaje los registra GameSession
 * al ver el evento OBJECT_OPENED (una sola fuente de verdad).
 */
import type { StepResult } from '../simulation/Simulation';
import type { WorldObject } from '../simulation/World';
import { BOX_OPENS_AT } from '../simulation/ActionSystem';
import { NOVEL_KINDS, isItemKind, type ItemKind } from '../world/Items';
import { behaviorLine, capitalize, circuitActivity, type GameCommand, type GameContext, type GameSummary, type MiniGame, type Narration } from './MiniGame';

export type MysteryPhase = 'appeared' | 'noticed' | 'approaching' | 'cautious' | 'investigating' | 'opened';

export interface MysteryView {
  gameId: 'mystery-box';
  phase: MysteryPhase;
  narration: Narration;
  progress: number; // 0..1
  curiosity: number; // actividad del circuito de curiosidad (0..1)
  caution: number; // actividad del circuito de miedo (0..1)
  revealed: ItemKind | null;
  boxId: number | null;
}

const OPEN_AT = BOX_OPENS_AT;
const CAUTIOUS = new Set(['MOVE_AWAY', 'HIDE', 'GET_SCARED']);

export class MysteryBoxGame implements MiniGame<MysteryView> {
  readonly id = 'mystery-box' as const;
  private boxId: number | null = null;
  private phase: MysteryPhase = 'appeared';
  private revealed: ItemKind | null = null;
  private cautiousTicks = 0;
  private lastInvestigation = 0;
  private prevDist = Infinity;
  private lastActive: StepResult['active'] = [];

  start(ctx: GameContext): void {
    ctx.world.setPlayerPresent(true);
    const box = ctx.world.placeItem('mysteryBox', { x: 0.72, y: 0.55 }, 'game');
    // Dentro: algo que aún no tenga en la mochila (si ya lo tiene todo, cualquiera)
    const owned = new Set(ctx.ownedItems());
    const pool = NOVEL_KINDS.filter((k) => !owned.has(k));
    const list = pool.length ? pool : NOVEL_KINDS;
    box.content = list[Math.floor(ctx.sim.config.rng() * list.length)];
    this.boxId = box.id;
  }

  private box(ctx: GameContext): WorldObject | null {
    return ctx.world.getObject(this.boxId);
  }

  input(cmd: GameCommand, ctx: GameContext): void {
    // Voz baja: una llamada suave (subumbral por sí sola; se suma a lo que ya siente)
    if (cmd.type === 'encourage') ctx.world.callPet(0.7);
    // Mantener distancia: el jugador no añade estímulos; solo se registra la elección
  }

  observe(r: StepResult, ctx: GameContext): void {
    this.lastActive = r.active;
    if (this.phase === 'opened') {
      // El evento de apertura llega en el tick siguiente al que la caja cedió (los eventos se recogen al empezar cada tick)
      const opened = r.events.find((e) => e.type === 'OBJECT_OPENED');
      if (!this.revealed && opened && isItemKind(opened.detail)) this.revealed = opened.detail;
      return;
    }
    const w = ctx.world, pet = w.pet, box = this.box(ctx);
    if (!box) return;
    const d = w.distance(pet, box);
    const A = new Set<string>(r.active);

    if ([...A].some((a) => CAUTIOUS.has(a))) { this.phase = 'cautious'; this.cautiousTicks++; }
    else if (box.investigation > this.lastInvestigation) this.phase = 'investigating';
    else if (A.has('INVESTIGATE') && d < this.prevDist - 0.003) this.phase = 'approaching';
    else if ((A.has('LOOK_AT_OBJECT') && r.focusObjectId === box.id) || pet.lookTarget === box) { if (this.phase === 'appeared') this.phase = 'noticed'; }
    this.lastInvestigation = box.investigation;
    this.prevDist = d;

    // La abrió el mundo (World.openBox) al investigarla lo suficiente: el juego solo lo cuenta
    const opened = r.events.find((e) => e.type === 'OBJECT_OPENED');
    if (box.state !== 'closed' || opened) {
      this.phase = 'opened';
      this.revealed = box.content ?? (opened && isItemKind(opened.detail) ? opened.detail : null);
    }
  }

  view(ctx: GameContext): MysteryView {
    const n = ctx.petName, box = this.box(ctx);
    const line = capitalize(behaviorLine(this.lastActive));
    const narr: Record<MysteryPhase, Narration> = {
      appeared: { title: 'Algo nuevo ha aparecido en la habitación…', subtitle: `${n} ${behaviorLine(this.lastActive)}`, tone: 'neutral' },
      noticed: { title: `${n} ya la vio… ¿será seguro?`, subtitle: line, tone: 'neutral' },
      approaching: { title: `${n} se acerca despacito…`, subtitle: line, tone: 'positive' },
      cautious: { title: `${n} prefiere mantener la distancia`, subtitle: line, tone: 'cautious' },
      investigating: { title: `${n} la olfatea con atención`, subtitle: line, tone: 'positive' },
      opened: { title: `¡${n} abrió la caja!`, subtitle: this.revealed ? `Dentro había algo nuevo para su mochila.` : line, tone: 'positive' },
    };
    return {
      gameId: 'mystery-box', phase: this.phase, narration: narr[this.phase],
      progress: this.phase === 'opened' ? 1 : Math.min(1, (box?.investigation ?? 0) / OPEN_AT),
      curiosity: circuitActivity(ctx.sim, 'curiosityCircuit'), caution: circuitActivity(ctx.sim, 'fearCircuit'),
      revealed: this.revealed, boxId: this.boxId,
    };
  }

  end(ctx: GameContext): GameSummary {
    const n = ctx.petName;
    if (this.revealed) {
      ctx.addMoment({
        title: `La caja misteriosa de ${n}`, subject: this.revealed, icon: 'box', tags: ['#Curiosidad', '#Aventura'],
        story: `Apareció una caja desconocida. ${n} la investigó con cuidado hasta abrirla y encontró un objeto nuevo.`,
      });
      ctx.record('game_played', null, 0.6, 0.5);
    } else {
      if (this.cautiousTicks >= 3) ctx.record('mystery_avoided', 'mysteryBox', -0.3, 0.5);
      ctx.record('game_played', null, 0.1, 0.3);
    }
    ctx.world.removeTagged('game');
    return { gameId: this.id, success: !!this.revealed, headline: this.revealed ? 'Abrió la caja' : 'Hoy prefirió observar desde lejos' };
  }
}
