/*
 * VEN AQUÍ
 * --------
 * El botón del jugador produce un estímulo PLAYER_CALL (sensor playerCalling).
 * La red decide si responde. La mascota nunca se teletransporta: si viene,
 * es porque APPROACH/FOLLOW_PLAYER la movieron. Cuando está cerca, el jugador
 * puede acariciarla (recompensa = caricia real en el mundo).
 */
import type { StepResult } from '../simulation/Simulation';
import { behaviorLine, capitalize, type GameCommand, type GameContext, type GameSummary, type MiniGame, type Narration } from './MiniGame';

export type ComeHerePhase = 'idle' | 'called' | 'coming' | 'arrived' | 'ignored' | 'petted';

export interface ComeHereView {
  gameId: 'come-here';
  phase: ComeHerePhase;
  narration: Narration;
  calls: number;
  responses: number;
  canPet: boolean;
  distance: number;
}

const WAIT_TICKS = 30; // ~10 s
const ARRIVE_RANGE = 0.2;
const PET_RANGE = 0.25;

export class ComeHereGame implements MiniGame<ComeHereView> {
  readonly id = 'come-here' as const;
  private phase: ComeHerePhase = 'idle';
  private calls = 0;
  private responses = 0;
  private callTick = 0;
  private startDist = 0;
  private distance = 1;
  private lastActive: StepResult['active'] = [];

  start(ctx: GameContext): void {
    ctx.world.setPlayerPresent(true);
    this.distance = ctx.world.distance(ctx.world.pet, ctx.world.player);
  }

  input(cmd: GameCommand, ctx: GameContext): void {
    const w = ctx.world;
    if (cmd.type === 'call') {
      w.callPet(cmd.intensity ?? 1);
      this.calls++;
      this.callTick = w.tick;
      this.startDist = w.distance(w.pet, w.player);
      this.phase = this.startDist < ARRIVE_RANGE ? 'arrived' : 'called';
    } else if (cmd.type === 'pet') {
      if (w.distance(w.pet, w.player) < PET_RANGE || this.phase === 'arrived') {
        w.petDirect();
        this.phase = 'petted';
      }
    } else if (cmd.type === 'treat') {
      w.offerTreat();
    }
  }

  observe(r: StepResult, ctx: GameContext): void {
    this.lastActive = r.active;
    const w = ctx.world;
    this.distance = w.distance(w.pet, w.player);
    if (this.phase !== 'called' && this.phase !== 'coming') return;
    const moving = r.active.includes('APPROACH') || r.active.includes('FOLLOW_PLAYER');
    if (this.distance < ARRIVE_RANGE) {
      this.phase = 'arrived';
      this.responses++;
      ctx.record('called_responded', 'player', 0.7, 0.7);
    } else if (moving && this.distance < this.startDist - 0.04) {
      this.phase = 'coming';
    } else if (w.tick - this.callTick > WAIT_TICKS) {
      this.phase = 'ignored';
      ctx.record('called_ignored', 'player', -0.1, 0.3);
    }
  }

  view(ctx: GameContext): ComeHereView {
    const n = ctx.petName;
    const line = capitalize(behaviorLine(this.lastActive));
    const narr: Record<ComeHerePhase, Narration> = {
      idle: { title: `Llama a ${n} con suavidad`, subtitle: `${n} ${behaviorLine(this.lastActive)}`, tone: 'neutral' },
      called: { title: `${n} escuchó tu voz…`, subtitle: line, tone: 'neutral' },
      coming: { title: `¡${n} viene hacia ti!`, subtitle: line, tone: 'positive' },
      arrived: { title: `${n} está a tu lado`, subtitle: 'Puedes acariciarlo como premio.', tone: 'positive' },
      ignored: { title: `${n} decidió quedarse donde estaba`, subtitle: 'Tú propones, él decide. Inténtalo más tarde.', tone: 'cautious' },
      petted: { title: `${n} disfruta de tu caricia`, subtitle: line, tone: 'positive' },
    };
    return {
      gameId: 'come-here', phase: this.phase, narration: narr[this.phase], calls: this.calls, responses: this.responses,
      canPet: this.distance < PET_RANGE, distance: this.distance,
    };
  }

  end(ctx: GameContext): GameSummary {
    const n = ctx.petName;
    if (this.calls) {
      ctx.record('game_played', null, this.responses ? 0.6 : 0.1, 0.4);
      if (this.responses) {
        ctx.addMoment({
          title: `${n} vino cuando lo llamaste`, subject: 'player', icon: 'wave', tags: ['#Vínculo', '#AprenderJuntos'],
          story: `Lo llamaste ${this.calls} ${this.calls === 1 ? 'vez' : 'veces'} y vino a tu lado ${this.responses} ${this.responses === 1 ? 'vez' : 'veces'}.`,
        });
      }
    }
    return { gameId: this.id, success: this.responses > 0, headline: this.responses ? `Vino ${this.responses} de ${this.calls} veces` : 'Hoy prefirió quedarse' };
  }
}
