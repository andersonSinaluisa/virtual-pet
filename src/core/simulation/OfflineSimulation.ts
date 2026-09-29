/*
 * OFFLINE SIMULATION: "mientras no estabas…"
 * ------------------------------------------
 * La app NO mantiene la SNN ni Three.js vivos en background. Al volver:
 *
 *   elapsed = now − lastActiveAt
 *   ticksReales   = min(elapsed·tps, maxTicks)          ← la SNN real decide
 *   escalaTiempo  = min(elapsed·tps / ticksReales, maxTimeScale)
 *
 * Cada tick offline aplica la deriva física (hambre, sed…) multiplicada por
 * `escalaTiempo` (el tiempo pasa más rápido), mientras el cerebro sigue
 * tomando decisiones reales con el jugador ausente: puede ir a comer, dormir,
 * jugar sola o llorar. Lo que exceda maxTicks·maxTimeScale no se simula (las
 * necesidades ya están acotadas a 0..1). Se ejecuta en bloques asíncronos
 * para no bloquear la UI.
 */
import { ACTION_LIST, type Action } from '../brain/Actions';
import { subjectLabel } from '../memory/subjects';
import type { EpisodeRecord, SubjectKey } from '../memory/types';
import type { GameSession } from '../session/GameSession';
import type { PetStats } from './SimConfig';
import { LOCATIONS, type LocationId } from '../world/Locations';

export interface AwayReport {
  elapsedMs: number;
  simulatedTicks: number;
  timeScale: number;
  before: PetStats;
  after: PetStats;
  actionOnsets: Partial<Record<Action, number>>;
  foodEaten: number;
  waterDrunk: number;
  slept: boolean;
  grewPending: boolean; // v6: alcanzó el momento de crecer mientras no estabas (se vivirá al volver)
  highlights: string[];
  // v7: mismo mundo que online: solo pudo ir a donde físicamente podía (puerta abierta, su cuerpo)
  locationsVisited: LocationId[];
  startLocation: LocationId;
  endLocation: LocationId;
}

export type YieldFn = () => Promise<void>;
const defaultYield: YieldFn = () => new Promise((resolve) => setTimeout(resolve, 0));

export const MIN_AWAY_MS = 60_000; // menos de un minuto no se reconcilia

export async function simulateAway(session: GameSession, elapsedMs: number, yieldFn: YieldFn = defaultYield): Promise<AwayReport | null> {
  if (!(elapsedMs >= MIN_AWAY_MS)) return null;
  const cfg = session.config;
  const tps = cfg.simulation.baseTicksPerSecond;
  const totalTicks = (elapsedMs / 1000) * tps;
  const ticks = Math.max(1, Math.min(cfg.offline.maxTicks, Math.floor(totalTicks)));
  const timeScale = Math.min(cfg.offline.maxTimeScale, Math.max(1, totalTicks / ticks));

  const world = session.world;
  const before = world.pet.snapshot();
  const food0 = world.foodSources().reduce((s, o) => s + o.amount, 0);
  const water0 = world.firstOfType('water')?.amount ?? 0;
  const onsets: Partial<Record<Action, number>> = {};
  let slept = false;

  const startLocation = world.location;
  const visited = new Set<LocationId>([startLocation]);
  const wasPresent = world.player.present;
  world.setPlayerPresent(false);
  world.drainEvents(); // la salida del jugador no es un evento que la mascota "vea" ahora

  // v5: cada tick offline ocurre a su hora del mundo (la noche y la luz pasan de verdad)
  // v6: el desarrollo sigue mientras no estás, más despacio y con tope; nunca crece solo (queda pendiente)
  session.growth.beginAway();
  const stage0 = session.growth.stage;
  const endAt = session.clock.now();
  const startAt = endAt - elapsedMs;
  let done = 0;
  while (done < ticks) {
    const n = Math.min(cfg.offline.chunk, ticks - done);
    for (let i = 0; i < n; i++) {
      const prev = new Set(session.sim.last.active);
      session.setTimeOverride(startAt + ((done + i + 1) / ticks) * elapsedMs);
      const r = session.tick({ timeScale, offline: true });
      for (const a of r.active) if (!prev.has(a)) onsets[a] = (onsets[a] ?? 0) + 1;
      if (world.pet.asleep) slept = true;
      visited.add(world.location);
    }
    done += n;
    await yieldFn();
  }
  session.setTimeOverride(null);
  session.growth.endAway();
  if (wasPresent) world.setPlayerPresent(true);

  // Solo lo que pasó de verdad en la simulación (episodios reales, no plantillas)
  const lived = session.memory.episodes.filter((e) => e.offline && e.start >= startAt);
  const after = world.pet.snapshot();
  const foodEaten = Math.max(0, food0 - world.foodSources().reduce((s, o) => s + o.amount, 0));
  const waterDrunk = Math.max(0, water0 - (world.firstOfType('water')?.amount ?? 0));
  const grewPending = !!session.growth.state.pending && session.growth.stage === stage0;
  const locationsVisited = [...visited];
  const hl = highlights(session.profile.name, onsets, { foodEaten, waterDrunk, slept, before, after, lived, place: LOCATIONS[world.location].label });
  const toPlace = (l: LocationId) => { const lb = LOCATIONS[l].label; return lb.startsWith('el ') ? `al ${lb.slice(3)}` : `a ${lb}`; };
  const newPlaces = locationsVisited.filter((l) => l !== startLocation);
  if (newPlaces.length) {
    hl.unshift(world.location === startLocation ? `Salió ${toPlace(newPlaces[0])} por su cuenta y luego volvió.` : `Se fue ${toPlace(world.location)} por su cuenta.`);
  }
  return {
    elapsedMs, simulatedTicks: ticks, timeScale, before, after, actionOnsets: onsets, foodEaten, waterDrunk, slept, grewPending, highlights: hl,
    locationsVisited, startLocation, endLocation: world.location,
  };
}

function highlights(
  name: string,
  onsets: Partial<Record<Action, number>>,
  x: { foodEaten: number; waterDrunk: number; slept: boolean; before: PetStats; after: PetStats; lived: readonly EpisodeRecord[]; place: string },
): string[] {
  const out: string[] = [];
  const n = (a: Action) => onsets[a] ?? 0;
  const sleptMin = x.lived.filter((e) => e.kind === 'sleep').reduce((s, e) => s + (e.end - e.start) / 60_000, 0);
  if (sleptMin >= 90) out.push(`Durmió en su camita (unas ${Math.round(sleptMin / 60)} horas).`);
  else if (x.slept) out.push(`Durmió una siesta en su camita.`);
  if (x.foodEaten > 0.05) out.push(`Fue a comer a su plato.`);
  if (x.waterDrunk > 0.05) out.push(`Bebió agua.`);
  const toys = [...new Set(x.lived.filter((e) => e.kind === 'play' && e.subject).map((e) => e.subject as SubjectKey))];
  if (toys.length) out.push(`Jugó con ${toys.slice(0, 2).map(subjectLabel).join(' y ')}.`);
  else if (n('PLAY') + n('PICK_UP_OBJECT') > 0) out.push(`Jugó un rato con sus juguetes.`);
  if (n('EXPLORE') + n('INVESTIGATE') > 1) out.push(`Exploró ${x.place} y olfateó cosas.`);
  if (n('ASK_ATTENTION') + n('CRY') > 1) out.push(`Te echó de menos: miró varias veces hacia la puerta.`);
  if (n('HIDE') + n('GET_SCARED') > 0) out.push(`Algo lo asustó y buscó refugio.`);
  if (!out.length) {
    const top = ACTION_LIST.filter((a) => n(a) > 0).sort((a, b) => n(b) - n(a))[0];
    out.push(top ? `${name} pasó el rato tranquilo.` : `${name} descansó sin moverse mucho.`);
  }
  if (x.after.hunger > 0.7) out.push(`Ahora tiene hambre.`);
  if (x.after.affection < 0.35) out.push(`Necesita un poco de cariño.`);
  return out;
}
