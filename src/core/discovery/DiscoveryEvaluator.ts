/*
 * DISCOVERY EVALUATOR
 * -------------------
 *   historial de experiencias → evidencia → Discovery → UI
 *
 * Un descubrimiento NO se dispara con una sola interacción (salvo eventos
 * únicos declarados como tales). Ejemplo: varias interacciones positivas con
 * la pelota → "Parece que Milo disfruta mucho la pelota."
 */
import type { BrainConfig } from '../brain/BrainConfig';
import type { PetMemory } from '../memory/PetMemory';
import { subjectLabel, subjectName } from '../memory/subjects';
import type { Discovery, ExperienceKind, SubjectKey } from '../memory/types';
import { computeTraits } from './Personality';

export const DISCOVERY_RULES = {
  likeMinPositive: 4,
  likeMinScore: 0.25,
  dislikeMinNegative: 3,
  dislikeMaxScore: -0.2,
} as const;

// Eventos únicos: basta con que ocurran una vez
const UNIQUE: Partial<Record<ExperienceKind, { key: string; title: (n: string) => string; text: (n: string, s: SubjectKey | null) => string; icon: string }>> = {
  mystery_opened: {
    key: 'unique:first_mystery', title: (n) => `¡${n} abrió su primera caja!`,
    text: (n, s) => `Se atrevió a investigar la caja misteriosa hasta abrirla. Dentro había ${subjectLabel(s)}.`, icon: 'box',
  },
  fetch_returned: {
    key: 'unique:first_fetch', title: (n) => `¡${n} te trajo la pelota!`,
    text: (n) => `Por primera vez, ${n} recogió la pelota y volvió contigo. Nadie se lo ordenó.`, icon: 'ball',
  },
};

let counter = 0;
function discoveryId(now: number): string {
  counter = (counter + 1) % 1e6;
  return `dis_${now.toString(36)}_${counter.toString(36)}`;
}

export function evaluateDiscoveries(memory: PetMemory, config: BrainConfig, petName: string, now: number, day: number): Discovery[] {
  const found: Discovery[] = [];
  const push = (d: Omit<Discovery, 'id' | 'at' | 'day'>) => {
    if (memory.hasDiscovery(d.key) || found.some((f) => f.key === d.key)) return;
    found.push({ ...d, id: discoveryId(now), at: now, day });
  };

  // Gustos y disgustos (evidencia repetida)
  for (const p of memory.preferences()) {
    if (p.subject === 'player') continue;
    if (p.positive >= DISCOVERY_RULES.likeMinPositive && p.score >= DISCOVERY_RULES.likeMinScore) {
      push({
        key: `likes:${p.subject}`, title: `¡Le fascina ${subjectLabel(p.subject)}!`,
        text: `Parece que ${petName} disfruta mucho ${subjectLabel(p.subject)}.`, icon: 'heart', evidence: p.positive, subject: p.subject,
      });
    }
    if (p.negative >= DISCOVERY_RULES.dislikeMinNegative && p.score <= DISCOVERY_RULES.dislikeMaxScore) {
      push({
        key: `dislikes:${p.subject}`, title: `${subjectName(p.subject)}: mejor con calma`,
        text: `${petName} se pone nervioso con ${subjectLabel(p.subject)}.`, icon: 'shield', evidence: p.negative, subject: p.subject,
      });
    }
  }

  // Sustos por ruido (no es un objeto; se cuenta aparte)
  const loud = memory.stats.scaredBy.loudSound ?? 0;
  if (loud >= DISCOVERY_RULES.dislikeMinNegative) {
    push({ key: 'dislikes:loudSound', title: 'Los ruidos lo asustan', text: `Cada ruido fuerte sobresalta a ${petName}. Busca refugio y calma.`, icon: 'volume', evidence: loud, subject: 'loudSound' });
  }

  // Vínculo contigo
  const player = memory.preference('player');
  if (player && player.positive >= 6 && player.score >= 0.3) {
    push({ key: 'likes:player', title: 'Confía en ti', text: `${petName} busca tu compañía y disfruta de tus caricias.`, icon: 'heartHand', evidence: player.positive, subject: 'player' });
  }

  // Rasgos de personalidad revelados
  for (const t of computeTraits(config, memory.stats)) {
    if (!t.revealed) continue;
    push({ key: `trait:${t.key}`, title: t.label, text: t.description, icon: t.icon, evidence: t.evidence, subject: null });
  }

  // Eventos únicos
  for (const [kind, rule] of Object.entries(UNIQUE) as [ExperienceKind, NonNullable<(typeof UNIQUE)[ExperienceKind]>][]) {
    if (!(memory.stats.experiencesByKind[kind] ?? 0)) continue;
    const last = [...memory.experiences].reverse().find((e) => e.kind === kind);
    push({ key: rule.key, title: rule.title(petName), text: rule.text(petName, last?.subject ?? null), icon: rule.icon, evidence: 1, subject: last?.subject ?? null });
  }

  return found;
}
