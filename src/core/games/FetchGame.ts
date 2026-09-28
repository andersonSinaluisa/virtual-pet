/*
 * TRAE LA PELOTA
 * --------------
 * El jugador arrastra y suelta la pelota: el MUNDO le da velocidad.
 * La mascota la percibe (toyAvailable, interestingObjectVisible, novedad por
 * movimiento) y su red decide: mirar, perseguir, recogerla, jugar sola o
 * volver contigo. Aquí no hay `pet.fetchBall()`.
 */
import type { StepResult } from '../simulation/Simulation';
import type { WorldObject } from '../simulation/World';
import { behaviorLine, capitalize, type GameCommand, type GameContext, type GameSummary, type MiniGame, type Narration } from './MiniGame';

export type FetchPhase = 'ready' | 'thrown' | 'chasing' | 'carrying' | 'playing_alone' | 'returned' | 'ignored';

export interface FetchView {
  gameId: 'fetch';
  phase: FetchPhase;
  narration: Narration;
  ballId: number | null;
  canThrow: boolean;
  throws: number;
  chases: number;
  returns: number;
  spikesPerSecond: number;
}

const IGNORE_AFTER = 25; // ticks sin reacción tras un lanzamiento
const RETURN_RANGE = 0.22;

export class FetchGame implements MiniGame<FetchView> {
  readonly id = 'fetch' as const;
  private ballId: number | null = null;
  private phase: FetchPhase = 'ready';
  private throws = 0;
  private chases = 0;
  private returns = 0;
  private thrownAt = 0;
  private chasedThisThrow = false;
  private returnedThisCarry = false;
  private noticed = false;
  private carryFarTicks = 0;
  private prevDist = Infinity;
  private lastActive: StepResult['active'] = [];

  start(ctx: GameContext): void {
    const w = ctx.world;
    w.setPlayerPresent(true);
    const ball = w.placeItem('ball', { x: 0.5, y: 0.85 }, 'game');
    this.ballId = ball.id;
  }

  private ball(ctx: GameContext): WorldObject | null {
    return ctx.world.getObject(this.ballId);
  }

  input(cmd: GameCommand, ctx: GameContext): void {
    const w = ctx.world;
    if (cmd.type === 'throw') {
      const ball = this.ball(ctx);
      if (!ball || w.pet.carrying === ball.id) return;
      if (!w.throwObject(ball.id, cmd.vx, cmd.vy)) return;
      this.throws++;
      this.phase = 'thrown';
      this.thrownAt = w.tick;
      this.chasedThisThrow = false;
      this.noticed = false;
      this.prevDist = w.distance(w.pet, ball);
    } else if (cmd.type === 'call') {
      w.callPet(cmd.intensity ?? 1);
    } else if (cmd.type === 'treat') {
      w.offerTreat();
    }
  }

  observe(r: StepResult, ctx: GameContext): void {
    const w = ctx.world, pet = w.pet, ball = this.ball(ctx);
    this.lastActive = r.active;
    if (!ball) return;
    const carrying = pet.carrying === ball.id;
    const dBall = w.distance(pet, ball);
    const dPlayer = w.distance(pet, w.player);

    if (!this.noticed && (pet.lookTarget === ball || r.focusObjectId === ball.id) && r.active.some((a) => a === 'LOOK_AT_OBJECT' || a === 'INVESTIGATE' || a === 'PLAY')) {
      this.noticed = true;
    }

    if (carrying) {
      if (this.phase !== 'carrying' && this.phase !== 'playing_alone' && this.phase !== 'returned') {
        this.phase = 'carrying';
        this.returnedThisCarry = false;
        this.carryFarTicks = 0;
      }
      if (!this.returnedThisCarry && dPlayer < RETURN_RANGE) {
        this.returnedThisCarry = true;
        this.returns++;
        this.phase = 'returned';
        ctx.record('fetch_returned', 'ball', 0.8, 0.8);
      } else if (!this.returnedThisCarry) {
        this.carryFarTicks = r.active.includes('PLAY') && dPlayer > 0.3 ? this.carryFarTicks + 1 : this.carryFarTicks;
        if (this.carryFarTicks > 8) this.phase = 'playing_alone';
      }
    } else if (this.phase === 'thrown' || this.phase === 'chasing') {
      const approaching = dBall < this.prevDist - 0.005 && pet.speed > 0.3;
      if (approaching && !this.chasedThisThrow) {
        this.chasedThisThrow = true;
        this.chases++;
        this.phase = 'chasing';
        ctx.record('fetch_chased', 'ball', 0.5, 0.6);
      }
      if (this.phase === 'thrown' && w.tick - this.thrownAt > IGNORE_AFTER) this.phase = 'ignored';
    } else if (this.phase === 'carrying' || this.phase === 'playing_alone' || this.phase === 'returned') {
      this.phase = 'ready'; // la soltó
    }
    this.prevDist = dBall;
  }

  view(ctx: GameContext): FetchView {
    const w = ctx.world, ball = this.ball(ctx), n = ctx.petName;
    const moving = !!ball && Math.hypot(ball.vx, ball.vy) > 0.004;
    const line = capitalize(behaviorLine(this.lastActive));
    const narr: Record<FetchPhase, Narration> = {
      ready: { title: `Arrastra la pelota y suéltala`, subtitle: `${n} ${behaviorLine(this.lastActive)}`, tone: 'neutral' },
      thrown: this.noticed
        ? { title: `${n} observó la trayectoria…`, subtitle: line, tone: 'neutral' }
        : { title: `La pelota rueda por la habitación…`, subtitle: `${n} ${behaviorLine(this.lastActive)}`, tone: 'neutral' },
      chasing: { title: `¡${n} corre tras la pelota!`, subtitle: line, tone: 'positive' },
      carrying: { title: `${n} recogió la pelota`, subtitle: line, tone: 'positive' },
      playing_alone: { title: `${n} recogió la pelota, pero se quedó jugando solo con ella…`, subtitle: line, tone: 'neutral' },
      returned: { title: `¡${n} te trajo la pelota!`, subtitle: line, tone: 'positive' },
      ignored: { title: `${n} prefirió no ir a por ella`, subtitle: `Tú propones, ${n} decide.`, tone: 'cautious' },
    };
    return {
      gameId: 'fetch', phase: this.phase, narration: narr[this.phase], ballId: this.ballId,
      canThrow: !!ball && w.pet.carrying !== ball.id && !moving,
      throws: this.throws, chases: this.chases, returns: this.returns,
      spikesPerSecond: ctx.sim.trace.totalRate(ctx.ticksPerSecond) * ctx.ticksPerSecond,
    };
  }

  end(ctx: GameContext): GameSummary {
    const n = ctx.petName;
    if (this.throws) ctx.record('game_played', null, this.returns ? 0.7 : this.chases ? 0.4 : 0.1, 0.5);
    if (this.returns > 0) {
      ctx.addMoment({
        title: `${n} te trajo la pelota`, subject: 'ball', icon: 'ball', tags: ['#AprenderJuntos', '#Juegos'], keyMoment: this.returns === 1,
        story: `Lanzaste la pelota ${this.throws} ${this.throws === 1 ? 'vez' : 'veces'}. ${n} fue tras ella ${this.chases} ${this.chases === 1 ? 'vez' : 'veces'} y volvió contigo ${this.returns} ${this.returns === 1 ? 'vez' : 'veces'}.`,
      });
    } else if (this.chases > 0) {
      ctx.addMoment({
        title: `${n} persiguió la pelota`, subject: 'ball', icon: 'ball', tags: ['#Juegos'],
        story: `Lanzaste la pelota ${this.throws} ${this.throws === 1 ? 'vez' : 'veces'} y ${n} corrió tras ella ${this.chases} ${this.chases === 1 ? 'vez' : 'veces'}. Todavía no te la trae… ¡pero se divierte!`,
      });
    }
    ctx.world.removeTagged('game');
    return {
      gameId: this.id, success: this.returns > 0,
      headline: this.returns ? `Te trajo la pelota ${this.returns} ${this.returns === 1 ? 'vez' : 'veces'}` : this.chases ? 'Persiguió la pelota' : 'Hoy no le apetecía',
    };
  }
}
