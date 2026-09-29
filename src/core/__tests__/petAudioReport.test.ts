/*
 * Informe reproducible de la voz de las mascotas:
 *   docs/pet-audio-matrix.md   cobertura REAL (especie × intención → assets que existen)
 *   docs/pet-audio-results.md  simulación de 30 min por especie, caricia, dos gatos, 100 saludos
 * Solo se ejecuta si se invoca explícitamente:   npm run report:audio
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { probePetting, simulateAudioSession, type AudioSimReport } from '../audio/experiments';
import { audioSpecies, layerAssets, PET_AUDIO_ASSETS, PET_AUDIO_SOURCES, sourceOf, vocalVariants } from '../audio/petAudioManifest';
import { SoundVariantSelector } from '../audio/SoundVariantSelector';
import { SPECIES_PROFILES, type LayerId } from '../audio/SpeciesVocalizationProfile';
import { VOCALIZATION_INTENTS } from '../audio/types';
import { SPECIES, type SpeciesKey } from '../persistence/SaveGame';
import { seededRng } from '../random';

const run = process.env.AUDIO_REPORT === '1' || process.argv.some((a) => a.includes('petAudioReport')) ? describe : describe.skip;
const ROOT = join(__dirname, '..', '..', '..');
const f = (v: number, d = 2) => v.toFixed(d);
const NAME: Record<SpeciesKey, string> = { dog: 'Perro', cat: 'Gato', bear: 'Oso', bunny: 'Conejo' };

function matrix(): string {
  const out: string[] = [
    '# Matriz de audio de mascotas (cobertura real)',
    '',
    '> Generado por `npm run report:audio` desde el manifest (`src/core/audio/petAudioAssets.generated.ts`). Solo aparece lo que EXISTE en `assets/audio/pets/`.',
    '> **p** = probabilidad de vocalizar cuando surge la intención (el resto es silencio) · **cd** = cooldown de esa intención · — = la especie calla (silencio válido).',
    '',
  ];
  for (const sp of SPECIES) {
    const a = audioSpecies(sp), prof = SPECIES_PROFILES[a];
    out.push(`## ${NAME[sp]} (\`${a}\`) — cooldown global ${prof.globalCooldownMs / 1000} s · máx. ${prof.maxPerMinute}/min`, '');
    out.push('| Intención | p | cd | Variantes | Assets | Fuentes (licencia) |', '|---|---|---|---|---|---|');
    for (const intent of VOCALIZATION_INTENTS) {
      if (intent === 'SLEEPING') continue;
      const set = prof.sets[intent];
      const vs = set && set.probability > 0 ? vocalVariants(a, intent) : [];
      const srcs = [...new Set(vs.map((v) => { const s = sourceOf(v); return s ? `${s.author} (${s.license})` : '?'; }))];
      out.push(`| ${intent} | ${set ? set.probability : '—'} | ${set ? `${set.cooldownMs / 1000} s` : '—'} | ${vs.length || '— (silencio)'} | ${vs.map((v) => `\`${v.id}\``).join(' ') || ''} | ${srcs.join('; ')} |`);
    }
    const layers = (Object.keys(prof.layers) as LayerId[]).map((l) => {
      const spec = prof.layers[l]!;
      const assets = layerAssets(a, spec.intent);
      return `- **${l}**: ${spec.maxGain ? assets.map((x) => `\`${x.id}\` (${f(x.durationMs / 1000, 1)} s)`).join(', ') : '— (silencio: un conejo dormido no se oye)'} · entra ${spec.fadeInMs} ms · sale ${spec.fadeOutMs} ms · nivel máx. ${spec.maxGain}`;
    });
    out.push('', 'Capas continuas:', '', ...layers, '');
    const stageOnly = PET_AUDIO_ASSETS.filter((x) => x.species === a && x.stages);
    if (stageOnly.length) out.push(`Assets por etapa: ${stageOnly.map((x) => `\`${x.id}\` → ${x.stages!.join('/')}`).join(', ')}`, '');
  }
  const foley = PET_AUDIO_ASSETS.filter((x) => x.kind === 'foley');
  const kinds = [...new Set(foley.map((x) => x.foley))];
  out.push('## Foley (todas las especies; ganancia y tono según el peso de la especie)', '', '| Tipo | Variantes | Fuente |', '|---|---|---|');
  for (const k of kinds) {
    const vs = foley.filter((x) => x.foley === k);
    out.push(`| ${k} | ${vs.length} | ${[...new Set(vs.map((v) => sourceOf(v)?.author))].join('; ')} |`);
  }
  out.push('', '## Huecos conocidos (no inventados)', '',
    '- **Oso**: no existe grabación CC0 de osezno; se usan grabaciones reales CC-BY 4.0 de Yle Archives (1975) con el tono subido ×1.08–1.12. Para dormir se usa la respiración de un perro dormido con el tono bajado ×0.82 (documentado en `docs/audio-licenses.md`).',
    '- **Perro**: no hay bostezo real con licencia apta; SLEEPY usa suspiros. Los ladridos son de un terrier pequeño (no hay aullidos ni gruñidos de ataque a propósito).',
    '- **Gato**: no hay "chattering" (castañeteo a los pájaros) con licencia apta. El bufido es un recorte corto y bajo de una pelea real (solo para SCARED).',
    '- **Conejo**: la mayor parte del tiempo es silencio a propósito; su "voz" son resoplidos, honks muy bajos, ronroneo dental y el golpe de pata.',
    `- **Total**: ${PET_AUDIO_ASSETS.length} assets de ${PET_AUDIO_SOURCES.length} fuentes.`, '');
  return out.join('\n');
}

run('Informe de audio de mascotas', () => {
  it('genera la matriz y los resultados', () => {
    writeFileSync(join(ROOT, 'docs/pet-audio-matrix.md'), matrix());

    const sims: AudioSimReport[] = SPECIES.map((sp) => simulateAudioSession(sp, { minutes: 30, seed: 7 }));
    const out: string[] = [];
    const log = (s = '') => out.push(s);
    log('## 30 minutos por especie (mismo guion de jugador)');
    log('');
    log('Guion: el jugador está presente, sale 40 s cada 5 min, acaricia 8 s cada 2 min (15 caricias), lanza la pelota cada 90 s, hace un ruido fuerte en los min 7 y 22 y trae la caja misteriosa en el min 10. Simulación completa (SNN, mundo, memoria) a 3 ticks/s.');
    log('');
    log('| Especie | Vocalizaciones | por minuto | máx. en 1 min | silencios elegidos | bloqueadas (cooldown/techo) | repeticiones inmediatas | solapes < 400 ms | assets distintos | ronroneo/jadeo (s) | dormido (s) |');
    log('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of sims) {
      const layer = r.layerSeconds.purr + r.layerSeconds.pant + r.layerSeconds.teethPurr;
      log(`| ${NAME[r.species]} | ${r.total} | ${f(r.perMinute)} | ${r.maxInAnyMinute} | ${r.silences} | ${r.blocked} | ${r.immediateRepeats} | ${r.overlaps} | ${r.distinctAssets} | ${f(layer, 0)} | ${f(r.layerSeconds.sleep, 0)} |`);
    }
    log('');
    log('Por intención:');
    log('');
    for (const r of sims) log(`- **${NAME[r.species]}**: ${Object.entries(r.byIntent).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    log('');
    log('Primeros 10 minutos del perro (qué dijo y por qué):');
    log('');
    const dog = sims[0];
    for (const e of dog.events.filter((e) => e.atMs - dog.events[0].atMs < 600_000).slice(0, 18)) {
      log(`- ${f((e.atMs - dog.events[0].atMs) / 1000, 0)} s · ${e.intent} · ${e.trigger} → \`${e.assetId}\` (gain ${f(e.gain)}, rate ${f(e.rate, 3)})`);
    }

    log('');
    log('## Caricia (6 s): cuatro especies, cuatro respuestas');
    log('');
    for (const sp of SPECIES) {
      const p = probePetting(sp);
      const trace = p.layerTrace.filter((_, i) => i % 3 === 0).map((x) => (x.layer ? `${x.layer} ${f(x.level)}` : '·')).join(' → ');
      log(`- **${NAME[sp]}**: one-shots: ${p.events.map((e) => `${e.intent}→\`${e.assetId}\``).join(', ') || '(ninguno)'}`);
      log(`  - capa por segundo: ${trace}`);
    }

    log('');
    log('## Dos gatos (mismos sonidos, distinta personalidad; 20 min)');
    log('');
    const social = simulateAudioSession('cat', { minutes: 20, seed: 5, traits: { sociable: 0.95, attached: 0.9 } });
    const shy = simulateAudioSession('cat', { minutes: 20, seed: 5, traits: { sociable: 0.05, attached: 0.1 } });
    for (const [label, r] of [['Sociable', social], ['Reservado', shy]] as const) {
      log(`- **${label}**: ${r.total} vocalizaciones (${f(r.perMinute)}/min) · ${Object.entries(r.byIntent).map(([k, v]) => `${k} ${v}`).join(' · ')} · silencios ${r.silences}`);
    }
    expect(social.total).toBeGreaterThan(shy.total);

    log('');
    log('## 100 GREETING por especie (selector)');
    log('');
    for (const sp of SPECIES) {
      const sel = new SoundVariantSelector(seededRng(42));
      const vs = vocalVariants(audioSpecies(sp), 'GREETING');
      const picks = Array.from({ length: 100 }, () => sel.pick(vs, sp, 'GREETING')!.id);
      const counts = new Map<string, number>();
      picks.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1));
      let rep = 0;
      for (let i = 1; i < picks.length; i++) if (picks[i] === picks[i - 1]) rep++;
      log(`- **${NAME[sp]}**: ${vs.length} variantes · usadas ${counts.size} · la más usada ${Math.max(...counts.values())}/100 · repeticiones inmediatas ${rep}`);
    }

    const results = readFileSync(join(ROOT, 'docs/pet-audio-results.md'), 'utf8');
    const START = '<!-- report:start -->', END = '<!-- report:end -->';
    const i = results.indexOf(START), j = results.indexOf(END);
    const body = `${START}\n\n${out.join('\n')}\n\n${END}`;
    writeFileSync(join(ROOT, 'docs/pet-audio-results.md'), i >= 0 && j > i ? results.slice(0, i) + body + results.slice(j + END.length) : `${results}\n${body}\n`);
  }, 600_000);
});
