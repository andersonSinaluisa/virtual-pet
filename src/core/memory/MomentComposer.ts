/*
 * MOMENT COMPOSER: experiencia → recuerdo de largo plazo
 * ------------------------------------------------------
 * No todo se recuerda. Solo:
 *  - las PRIMERAS veces relevantes (primera caricia, primer juego con X...);
 *  - los resultados de minijuegos (los compone cada juego);
 *  - los descubrimientos;
 *  - las capturas que hace el jugador.
 * El texto describe hechos reales de la simulación; nada inventado.
 */
import type { PetStats } from '../simulation/SimConfig';
import { subjectEmoji, subjectLabel, subjectName } from './subjects';
import type { Discovery, Experience, ExperienceKind, Moment, MomentKind, SubjectKey } from './types';

let counter = 0;
export function momentId(now: number): string {
  counter = (counter + 1) % 1e6;
  return `mom_${now.toString(36)}_${counter.toString(36)}`;
}

interface MomentInput {
  now: number;
  day: number;
  kind: MomentKind;
  title: string;
  story: string;
  tags: string[];
  icon: string;
  keyMoment?: boolean;
  subject?: SubjectKey | null;
  experienceIds?: string[];
  gameId?: Moment['gameId'];
  snapshotUri?: string | null;
}

export function makeMoment(i: MomentInput): Moment {
  return {
    id: momentId(i.now), createdAt: i.now, day: i.day, kind: i.kind, title: i.title, story: i.story, tags: i.tags,
    icon: i.icon, favorite: false, keyMoment: !!i.keyMoment, subject: i.subject ?? null, snapshotUri: i.snapshotUri ?? null,
    experienceIds: i.experienceIds ?? [], gameId: i.gameId ?? null,
  };
}

// Estado de ánimo en palabras (presentación de los valores reales)
export function moodSentence(name: string, s: PetStats): string {
  if (s.fear > 0.4) return `${name} estaba un poco asustado.`;
  if (s.fatigue > 0.7) return `Se notaba cansado, pero no quiso perdérselo.`;
  if (s.energy > 0.7 && s.boredom < 0.4) return `Estaba lleno de energía.`;
  if (s.affection > 0.75) return `Se le veía feliz y confiado.`;
  if (s.curiosity > 0.5) return `Tenía la curiosidad a flor de piel.`;
  return `Fue un momento tranquilo.`;
}

type FirstRule = { title: (n: string, s: SubjectKey | null) => string; story: (n: string, s: SubjectKey | null) => string; tags: string[]; icon: string; key?: boolean };

const FIRST_TIME: Partial<Record<ExperienceKind, FirstRule>> = {
  petted: { title: (n) => `La primera caricia de ${n}`, story: (n) => `Pasaste la mano por su lomo y ${n} se quedó quieto, sintiendo el contacto.`, tags: ['#Cariño', '#PrimeraVez'], icon: 'heart', key: true },
  greeted: { title: (n) => `${n} te saludó por primera vez`, story: (n) => `Al verte, ${n} levantó la patita y te saludó.`, tags: ['#Vínculo', '#PrimeraVez'], icon: 'wave', key: true },
  played: { title: (n, s) => `${n} jugó con ${subjectLabel(s)}`, story: (n, s) => `Se acercó a ${subjectLabel(s)} y empezó a jugar sin que nadie se lo pidiera.`, tags: ['#Juegos', '#PrimeraVez'], icon: 'ball' },
  picked_up: { title: (n, s) => `${n} recogió ${subjectLabel(s)}`, story: (n, s) => `Tomó ${subjectLabel(s)} entre sus patitas y lo llevó un rato consigo.`, tags: ['#Juegos'], icon: 'toys' },
  investigated: { title: (n, s) => `${n} descubrió ${subjectLabel(s)}`, story: (n, s) => `Olfateó ${subjectLabel(s)} con mucha atención antes de decidir qué hacer.`, tags: ['#Curiosidad'], icon: 'search' },
  scared: { title: (n, s) => `Un susto: ${subjectLabel(s)}`, story: (n, s) => `${n} se sobresaltó por ${subjectLabel(s)}. Poco a poco volvió la calma.`, tags: ['#Emociones'], icon: 'bolt' },
  slept: { title: (n) => `La primera siesta de ${n}`, story: (n) => `Se acurrucó en su camita y se quedó dormido.`, tags: ['#Descanso'], icon: 'moon' },
  danced: { title: (n) => `${n} bailó de alegría`, story: (n) => `Sin música, solo de felicidad, dio vueltitas y saltó.`, tags: ['#Alegría'], icon: 'music' },
  ate: { title: (n, s) => (s === 'treat' ? `${n} probó su primera galletita` : `${n} comió en su plato`), story: (n) => `Se acercó a comer con calma.`, tags: ['#Cuidados'], icon: 'food' },
  // v7: SE ACERCÓ (no es lo mismo que verlo, ni que conocerlo del todo)
  approached_object: { title: (n, s) => `La primera vez que ${n} se acercó a ${subjectLabel(s)}`, story: (n, s) => `Vio ${subjectLabel(s)} y, poco a poco, se acercó para olfatear de cerca.`, tags: ['#Curiosidad', '#PrimeraVez'], icon: 'search' },
  called_responded: { title: (n) => `${n} vino cuando lo llamaste`, story: (n) => `Escuchó tu voz, levantó las orejas y vino hacia ti.`, tags: ['#Vínculo', '#AprenderJuntos'], icon: 'wave', key: true },
};

export function composeFirstTime(exp: Experience, name: string, stats: PetStats): Moment | null {
  const rule = FIRST_TIME[exp.kind];
  if (!rule || exp.offline) return null;
  return makeMoment({
    now: exp.at, day: exp.day, kind: 'first_time',
    title: rule.title(name, exp.subject),
    story: `${rule.story(name, exp.subject)} ${moodSentence(name, stats)}`,
    tags: rule.tags, icon: rule.icon, keyMoment: rule.key, subject: exp.subject, experienceIds: [exp.id], gameId: exp.gameId,
  });
}

export function composeDiscovery(d: Discovery): Moment {
  return makeMoment({
    now: d.at, day: d.day, kind: 'discovery', title: d.title, story: d.text,
    tags: ['#Descubrimiento'], icon: d.icon, keyMoment: true, subject: d.subject,
  });
}

export function composeAdoption(name: string, now: number): Moment {
  return makeMoment({
    now, day: 1, kind: 'milestone', title: 'El día que nos conocimos',
    story: `${name} llegó a casa. Todavía no te conoce: cada caricia y cada juego irán moldeando su forma de ver el mundo.`,
    tags: ['#AmorAPrimeraVista'], icon: 'heart', keyMoment: true,
  });
}

export function subjectTitle(s: SubjectKey | null): string {
  return `${subjectEmoji(s)} ${subjectName(s)}`;
}
