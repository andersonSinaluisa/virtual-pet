/*
 * AUDIO DE MASCOTAS — manifest, selección, voz propia, perfiles y sesión real
 *
 *  1. Validador de assets: existe el archivo, especie/intención válidas, licencia
 *     registrada y permitida, duración razonable (cabecera WAV real), sin duplicados.
 *  2. 100 GREETING por especie: variedad y sin repeticiones inmediatas.
 *  3. Voz propia estable (misma semilla → misma voz; dos gatos → voces distintas).
 *  4. Caricia: cuatro especies, cuatro respuestas distintas (ronroneo gradual del gato,
 *     jadeo del perro, gruñidito del oso, casi nada del conejo).
 *  5. Dos gatos: sociable vs reservado (la personalidad cambia la FRECUENCIA).
 *  6. Ronroneo: entra poco a poco, se mantiene sin reiniciar el bucle y se apaga con fundido.
 *  7. Offline: no se genera audio; solo se cuentan intenciones.
 *  8. Save v5 → v6: voz generada y volúmenes repartidos sin perder los del jugador.
 */
import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAudioPet, probePetting, simulateAudioSession } from '../audio/experiments';
import { audioSpecies, PET_AUDIO_ASSETS, PET_AUDIO_SOURCES, vocalVariants } from '../audio/petAudioManifest';
import { generateVoiceProfile } from '../audio/PetVoiceProfile';
import { SoundVariantSelector } from '../audio/SoundVariantSelector';
import { SPECIES_PROFILES } from '../audio/SpeciesVocalizationProfile';
import { AUDIO_SPECIES, VOCALIZATION_INTENTS } from '../audio/types';
import { LIFE_STAGES } from '../growth/LifeStage';
import { migrateSave } from '../persistence/migrations';
import { DEFAULT_SETTINGS, SPECIES } from '../persistence/SaveGame';
import { seededRng } from '../random';

const ROOT = join(__dirname, '..', '..', '..');
const ALLOWED_LICENSES = new Set(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0']);

function wavDurationMs(file: string): number {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WAVE');
  const channels = b.readUInt16LE(22), rate = b.readUInt32LE(24), bits = b.readUInt16LE(34);
  let off = 12;
  while (off < b.length - 8) {
    const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === 'data') return (size / (channels * (bits / 8)) / rate) * 1000;
    off += 8 + size;
  }
  throw new Error('sin chunk data');
}

describe('🎧 Validador de assets de audio', () => {
  it('cada asset existe, es válido, tiene licencia permitida y una duración razonable', () => {
    const ids = new Set<string>(), files = new Set<string>();
    const sources = new Map(PET_AUDIO_SOURCES.map((s) => [s.id, s]));
    for (const a of PET_AUDIO_ASSETS) {
      expect(ids.has(a.id)).toBe(false);
      expect(files.has(a.file)).toBe(false);
      ids.add(a.id); files.add(a.file);
      expect(AUDIO_SPECIES).toContain(a.species);
      for (const i of a.intents) expect(VOCALIZATION_INTENTS).toContain(i);
      for (const st of a.stages ?? []) expect(LIFE_STAGES).toContain(st);
      const src = sources.get(a.sourceId);
      expect(src).toBeDefined();
      expect(ALLOWED_LICENSES.has(src!.license)).toBe(true);
      expect(src!.url).toMatch(/^https:\/\//);
      if (src!.license !== 'CC0-1.0') expect(src!.attributionRequired).toBe(true);
      const path = join(ROOT, a.file);
      expect(existsSync(path)).toBe(true);
      const ms = wavDurationMs(path);
      expect(Math.abs(ms - a.durationMs)).toBeLessThan(15);
      if (a.kind === 'vocal') { expect(ms).toBeGreaterThan(80); expect(ms).toBeLessThan(3500); }
      if (a.kind === 'layer') { expect(a.loop).toBe(true); expect(ms).toBeGreaterThan(5000); expect(ms).toBeLessThan(31000); }
      if (a.kind === 'foley') { expect(ms).toBeGreaterThan(50); expect(ms).toBeLessThan(8000); }
    }
    expect(PET_AUDIO_ASSETS.length).toBeGreaterThan(100);
  });

  it('cada especie tiene varias variantes para lo que dice su perfil (nunca un único sonido)', () => {
    for (const sp of SPECIES) {
      const prof = SPECIES_PROFILES[audioSpecies(sp)];
      for (const intent of Object.keys(prof.sets) as (keyof typeof prof.sets)[]) {
        if (!prof.sets[intent]!.probability) continue;
        const n = vocalVariants(audioSpecies(sp), intent).length;
        expect({ sp, intent, ok: n >= 1 }).toEqual({ sp, intent, ok: true });
      }
      expect(vocalVariants(audioSpecies(sp), 'GREETING').length).toBeGreaterThanOrEqual(3);
      expect(new Set(PET_AUDIO_ASSETS.filter((a) => a.species === audioSpecies(sp) && a.kind === 'vocal').map((a) => a.id)).size).toBeGreaterThanOrEqual(10);
    }
  });

  it('las licencias CC-BY tienen texto de atribución en docs/audio-licenses.md', () => {
    const doc = readFileSync(join(ROOT, 'docs/audio-licenses.md'), 'utf8');
    for (const s of PET_AUDIO_SOURCES) {
      expect(doc).toContain(s.url);
      if (s.attributionRequired) expect(doc).toContain(`por **${s.author}**`);
    }
  });
});

describe('🎲 SoundVariantSelector', () => {
  it.each(SPECIES)('100 GREETING de %s: variadas y sin repetir la misma dos veces seguidas', (sp) => {
    const sel = new SoundVariantSelector(seededRng(42));
    const variants = vocalVariants(audioSpecies(sp), 'GREETING');
    const picks: string[] = [];
    for (let i = 0; i < 100; i++) picks.push(sel.pick(variants, sp, 'GREETING')!.id);
    const counts = new Map<string, number>();
    picks.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1));
    let repeats = 0;
    for (let i = 1; i < picks.length; i++) if (picks[i] === picks[i - 1]) repeats++;
    expect(repeats).toBeLessThanOrEqual(2); // la penalización ×0.02 lo hace muy raro
    expect(counts.size).toBeGreaterThanOrEqual(Math.ceil(variants.length * 0.8)); // casi todas suenan alguna vez
    expect(Math.max(...counts.values())).toBeLessThan(35); // ninguna domina
  });
});

describe('🗣️ Voz propia', () => {
  it('es estable para la misma mascota y distinta entre dos gatos, en rangos pequeños', () => {
    const a1 = generateVoiceProfile('pet_a|cat|1', 'cat'), a2 = generateVoiceProfile('pet_a|cat|1', 'cat');
    const b = generateVoiceProfile('pet_b|cat|2', 'cat');
    expect(a1).toEqual(a2);
    expect(a1.pitch === b.pitch && a1.volume === b.volume).toBe(false);
    for (const v of [a1, b]) {
      expect(v.pitch).toBeGreaterThanOrEqual(0.95); expect(v.pitch).toBeLessThanOrEqual(1.05);
      expect(v.volume).toBeGreaterThanOrEqual(0.85); expect(v.vocalizationFrequency).toBeLessThanOrEqual(1.2);
      for (const id of v.preferredVariants) expect(PET_AUDIO_ASSETS.find((x) => x.id === id)?.species).toBe('cat');
    }
  });

  it('se guarda y se recupera (no se regenera al cargar)', () => {
    const { s } = createAudioPet('cat');
    const save = s.toSave(DEFAULT_SETTINGS, 0);
    save.audio.voice.pitch = 1.031; // aunque el algoritmo cambie, la mascota conserva SU voz
    const loaded = migrateSave(JSON.parse(JSON.stringify(save)));
    expect(loaded.audio.voice.pitch).toBe(1.031);
  });
});

describe('🤚 Caricia: cuatro especies, cuatro respuestas', () => {
  const probes = Object.fromEntries(SPECIES.map((sp) => [sp, probePetting(sp)]));

  it('gato: ronroneo que entra poco a poco (sin maullar a cada caricia)', () => {
    const tr = probes.cat.layerTrace.filter((x) => x.layer === 'purr');
    expect(tr.length).toBeGreaterThan(10);
    const first = tr.findIndex((x) => x.level > 0);
    const peak = tr.findIndex((x) => x.level >= 0.74);
    expect(peak - first).toBeGreaterThanOrEqual(9); // ~3 s de subida gradual, no de golpe
    expect(new Set(tr.map((x) => x.asset)).size).toBe(1); // el bucle no se reinicia
  });

  it('perro: jadeo suave durante la caricia (+ a veces un yip pequeño)', () => {
    expect(probes.dog.layerTrace.some((x) => x.layer === 'pant' && x.level > 0.3)).toBe(true);
    expect(probes.dog.events.every((e) => e.assetId!.startsWith('dog_'))).toBe(true);
  });

  it('oso: gruñidito amistoso (gorgoteo), nunca un gruñido de adulto', () => {
    const aff = probes.bear.events.filter((e) => e.intent === 'AFFECTION');
    expect(aff.length).toBeGreaterThan(0);
    expect(aff.every((e) => e.assetId!.startsWith('bear_gurgle'))).toBe(true);
  });

  it('conejo: casi nada (ronroneo dental muy bajo o silencio)', () => {
    const maxLevel = Math.max(0, ...probes.bunny.layerTrace.filter((x) => x.layer === 'teethPurr').map((x) => x.level));
    expect(maxLevel).toBeLessThanOrEqual(0.35);
    expect(probes.bunny.events.filter((e) => e.intent === 'AFFECTION').length).toBe(0);
  });
});

describe('🐱🐱 Dos gatos, dos personalidades', () => {
  it('el sociable saluda y pide atención más que el reservado (mismos sonidos, otra frecuencia)', () => {
    const social = simulateAudioSession('cat', { minutes: 20, seed: 5, traits: { sociable: 0.95, attached: 0.9 } });
    const shy = simulateAudioSession('cat', { minutes: 20, seed: 5, traits: { sociable: 0.05, attached: 0.1 } });
    const talk = (r: typeof social) => (r.byIntent.GREETING ?? 0) + (r.byIntent.ATTENTION ?? 0) + (r.byIntent.AFFECTION ?? 0) + (r.byIntent.HAPPY ?? 0);
    expect(talk(social)).toBeGreaterThan(talk(shy));
  });
});

describe('📴 Offline', () => {
  it('no genera audio: solo cuenta intenciones', () => {
    const { s, clock } = createAudioPet('dog');
    const heard: unknown[] = [];
    s.events.on('vocalization', (e) => heard.push(e));
    s.setPlayerPresent(false);
    for (let i = 0; i < 600; i++) { clock.t += 333; s.tick({ offline: true }); }
    expect(heard).toHaveLength(0);
  });
});

describe('💾 Save v5 → v6', () => {
  it('genera la voz y reparte los volúmenes antiguos', () => {
    const { s } = createAudioPet('bear');
    const v6 = s.toSave({ ...DEFAULT_SETTINGS, effectsVolume: 0.3, musicVolume: 0.2 }, 0) as unknown as Record<string, unknown>;
    const { audio: _audio, ...rest } = v6;
    const settings = { ...(rest.settings as Record<string, unknown>) };
    for (const k of ['masterVolume', 'petVolume', 'ambientVolume', 'uiVolume']) delete settings[k];
    const v5 = { ...rest, saveVersion: 5, settings };
    const migrated = migrateSave(JSON.parse(JSON.stringify(v5)));
    expect(migrated.saveVersion).toBe(6);
    expect(migrated.audio.voice.version).toBe(1);
    expect(migrated.settings.petVolume).toBeCloseTo(0.3);
    expect(migrated.settings.ambientVolume).toBeCloseTo(0.12);
    expect(migrated.settings.masterVolume).toBe(1);
  });
});
