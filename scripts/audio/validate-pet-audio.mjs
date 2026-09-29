#!/usr/bin/env node
/*
 * VALIDADOR DE ASSETS DE AUDIO DE MASCOTAS (sin TypeScript: para CI o un pre-commit)
 *   - cada receta apunta a una fuente registrada con licencia permitida y URL
 *   - cada asset generado existe, es WAV válido y su duración es razonable
 *   - especie e intenciones válidas; sin ids ni archivos duplicados
 *   - las fuentes CC-BY llevan atribución (y aparecen en docs/audio-licenses.md)
 * El test src/core/__tests__/petAudio.test.ts comprueba lo mismo contra el manifest TS.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const sources = new Map(JSON.parse(readFileSync(join(here, 'pet_audio_sources.json'), 'utf8')).map((s) => [s.id, s]));
const recipes = JSON.parse(readFileSync(join(here, 'pet_audio_recipes.json'), 'utf8'));
const report = JSON.parse(readFileSync(join(root, 'assets/audio/pets/assets.report.json'), 'utf8'));
const doc = readFileSync(join(root, 'docs/audio-licenses.md'), 'utf8');

const SPECIES = new Set(['dog', 'cat', 'bear', 'rabbit', 'foley']);
const INTENTS = new Set(['GREETING', 'ATTENTION', 'HAPPY', 'EXCITED', 'AFFECTION', 'RELAXED', 'CURIOUS', 'PLAYFUL', 'SCARED', 'ALERT', 'UNCOMFORTABLE', 'SLEEPY', 'SLEEPING']);
const LICENSES = new Set(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0']);
const errors = [];
const err = (m) => errors.push(m);

function wavMs(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return -1;
  const ch = b.readUInt16LE(22), rate = b.readUInt32LE(24), bits = b.readUInt16LE(34);
  for (let off = 12; off < b.length - 8;) {
    const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === 'data') return (size / (ch * (bits / 8)) / rate) * 1000;
    off += 8 + size;
  }
  return -1;
}

const ids = new Set();
for (const r of recipes) {
  if (ids.has(r.id)) err(`id duplicado: ${r.id}`);
  ids.add(r.id);
  const s = sources.get(r.src);
  if (!s) { err(`${r.id}: fuente no registrada ${r.src}`); continue; }
  if (!LICENSES.has(s.license)) err(`${r.id}: licencia no permitida ${s.license}`);
  if (!/^https:\/\//.test(s.url)) err(`${r.id}: fuente sin URL`);
  if (s.license !== 'CC0-1.0' && !s.attributionRequired) err(`${s.id}: CC-BY sin atribución`);
  if (s.attributionRequired && !doc.includes(s.url)) err(`${s.id}: falta en docs/audio-licenses.md`);
  if (!SPECIES.has(r.species)) err(`${r.id}: especie inválida ${r.species}`);
  for (const i of r.intents) if (!INTENTS.has(i)) err(`${r.id}: intención inválida ${i}`);
}
const files = new Set();
for (const a of report) {
  if (files.has(a.file)) err(`archivo duplicado: ${a.file}`);
  files.add(a.file);
  const p = join(root, a.file);
  if (!existsSync(p)) { err(`${a.id}: no existe ${a.file}`); continue; }
  const ms = wavMs(p);
  if (ms < 0) err(`${a.id}: WAV inválido`);
  const [lo, hi] = a.kind === 'layer' ? [5000, 31000] : a.kind === 'foley' ? [50, 8000] : [80, 3500];
  if (ms < lo || ms > hi) err(`${a.id}: duración ${Math.round(ms)} ms fuera de [${lo}, ${hi}]`);
}
for (const r of recipes) if (!report.find((a) => a.id === r.id)) err(`${r.id}: receta sin asset generado (¿falta npm run audio:fetch + audio:process?)`);

if (errors.length) { console.error(errors.map((e) => `✗ ${e}`).join('\n')); process.exit(1); }
console.log(`✓ ${report.length} assets de audio válidos · ${sources.size} fuentes registradas`);
