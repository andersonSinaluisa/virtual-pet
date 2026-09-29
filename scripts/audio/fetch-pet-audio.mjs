#!/usr/bin/env node
/*
 * Descarga los ORIGINALES de audio de mascotas (licencias en pet_audio_sources.json)
 * a assets/audio/pets/_raw/ (ignorado por git). Solo hace falta para volver a
 * procesar: los WAV finales ya están en assets/audio/pets/<especie>/.
 *
 *   npm run audio:fetch      → descarga lo que falte
 *   npm run audio:process    → recorta/normaliza y regenera manifest + docs (python3 + numpy + ffmpeg)
 *
 * Freesound: se usa la preview HQ (MP3 128 kbps) — misma licencia que el original y
 * descargable sin cuenta. GitHub: el espejo del pack CC0 en un commit fijo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const rawDir = process.env.AUDIO_RAW_DIR ?? join(root, 'assets', 'audio', 'pets', '_raw');
const sources = JSON.parse(readFileSync(join(here, 'pet_audio_sources.json'), 'utf8'));

function downloadUrl(s) {
  // github.com/<o>/<r>/blob/<sha>/<path> → raw.githubusercontent.com/<o>/<r>/<sha>/<path>
  const m = s.downloadUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (!m) return s.downloadUrl;
  const path = m[4].split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${path}`;
}

let ok = 0, skipped = 0, failed = 0;
for (const s of sources) {
  const out = join(rawDir, s.raw);
  if (existsSync(out)) { skipped++; continue; }
  const url = downloadUrl(s);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    ok++;
    console.log(`✓ ${s.id}  ${s.license}  ${s.author} — ${s.title}`);
  } catch (e) {
    failed++;
    console.warn(`✗ ${s.id}  ${url}  (${e.message})`);
  }
}
console.log(`\n${ok} descargados · ${skipped} ya estaban · ${failed} fallidos → ${rawDir}`);
process.exit(failed ? 1 : 0);
