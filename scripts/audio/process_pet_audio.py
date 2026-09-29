#!/usr/bin/env python3
"""
PROCESADO DE AUDIO DE MASCOTAS
------------------------------
  pet_audio_sources.json   procedencia y licencia de cada grabación (verificada a mano)
  pet_audio_recipes.json   qué fragmento de qué grabación se convierte en qué asset
  assets/audio/pets/_raw/  descargas originales (npm run audio:fetch; no se versionan)

Para cada receta: recorta, filtra graves, (opcional) cambia el tono con `rate`,
recorta silencios, normaliza por RMS con techo de pico, aplica fundidos (o un
crossfade de bucle sin clics) y escribe WAV mono 16-bit 24 kHz en
assets/audio/pets/<especie>/<id>.wav.

Genera:
  src/core/audio/petAudioAssets.generated.ts      (datos puros: sin require)
  src/core/audio/petAudioSources.generated.ts     (licencias)
  src/services/audio/petAudioFiles.generated.ts   (mapa id → require)
  docs/audio-licenses.md                          (procedencia de cada asset)

Requiere python3 + numpy + ffmpeg. Uso: python3 scripts/audio/process_pet_audio.py
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SR = 24000
RAW = os.path.join(ROOT, 'assets', 'audio', 'pets', '_raw')
OUT = os.path.join(ROOT, 'assets', 'audio', 'pets')
FOLDER = {'dog': 'dog', 'cat': 'cat', 'bear': 'bear', 'rabbit': 'rabbit', 'foley': 'foley'}
LOOP_XF = 0.6  # s de crossfade en los bucles


def decode(path, start, dur, hp, rate):
    af = [f'highpass=f={hp}', 'lowpass=f=10000']
    if rate and rate != 1:
        af.insert(0, f'asetrate=44100*{rate},aresample=44100')
    cmd = ['ffmpeg', '-v', 'error']
    if start is not None:
        cmd += ['-ss', str(start)]
    if dur is not None:
        cmd += ['-t', str(dur)]
    cmd += ['-i', path, '-af', 'aresample=44100,' + ','.join(af), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def db(x):
    return 20 * np.log10(max(x, 1e-9))


def trim_silence(x, rel_db=-32, pad=0.05):
    win = int(SR * 0.01)
    n = len(x) // win
    if n == 0:
        return x
    e = np.sqrt((x[: n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-12)
    # umbral entre el ruido de fondo (percentil 10) y el pico: robusto aunque la grabación tenga siseo
    floor, peak = np.percentile(e, 10), e.max()
    fdb, pdb = db(floor), db(peak)
    thr = 10 ** (max(pdb + rel_db, fdb + 0.4 * (pdb - fdb)) / 20)
    idx = np.where(e > thr)[0]
    if not len(idx):
        return x
    a = max(0, idx[0] * win - int(pad * SR))
    b = min(len(x), (idx[-1] + 1) * win + int(pad * 2 * SR))
    return x[a:b]


def active_rms(x):
    win = int(SR * 0.02)
    n = max(1, len(x) // win)
    e = np.sqrt((x[: n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-12)
    keep = e[e > e.max() * 0.1]
    return float(np.sqrt((keep ** 2).mean())) if len(keep) else float(e.mean())


def normalize(x, target_db, peak_db=-1.0):
    g = 10 ** (target_db / 20) / max(active_rms(x), 1e-9)
    peak = np.abs(x).max() * g
    cap = 10 ** (peak_db / 20)
    if peak > cap:
        g *= cap / peak
    return x * g


def fades(x, fin=0.008, fout=0.04):
    x = x.copy()
    a, b = int(fin * SR), int(min(fout * SR, len(x) // 3))
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def loopify(x, length):
    """Bucle sin clics: la cola (después de `length`) se funde sobre el inicio (potencia constante)."""
    n = int(length * SR)
    xf = int(LOOP_XF * SR)
    if len(x) < n + xf:
        n = len(x) - xf
    body = x[:n].copy()
    t = np.linspace(0, np.pi / 2, xf)
    body[:xf] = x[n:n + xf] * np.cos(t) + body[:xf] * np.sin(t)
    return body


def write_wav(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = np.clip(x, -1, 1)
    pcm = (pcm * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def ts(v):
    return json.dumps(v, ensure_ascii=False)


def main():
    here = os.path.dirname(__file__)
    sources = {s['id']: s for s in json.load(open(os.path.join(here, 'pet_audio_sources.json'), encoding='utf-8'))}
    recipes = json.load(open(os.path.join(here, 'pet_audio_recipes.json'), encoding='utf-8'))
    assets, missing = [], []
    for r in recipes:
        src = sources.get(r['src'])
        if not src:
            sys.exit(f"receta {r['id']}: fuente desconocida {r['src']}")
        path = os.path.join(RAW, src['raw'])
        if not os.path.exists(path):
            missing.append(r['id'])
            continue
        loop = bool(r.get('loop'))
        dur = r.get('dur')
        whole = r.get('start') is None  # archivo completo (packs de un sonido por archivo)
        read_dur = None if whole else dur + (LOOP_XF + 0.1 if loop else 0)
        x = decode(path, r.get('start'), read_dur, r.get('hp', 100), r.get('rate'))
        if not loop:
            x = trim_silence(x)  # fuera los silencios de los bordes (no hay que esperar al sonido)
            if whole and dur:
                x = x[: int(dur * SR)]
        x = normalize(x, r.get('rms', -24))
        if loop:
            x = loopify(x, dur / (r.get('rate') or 1) if r.get('rate') else dur)
        else:
            x = fades(x)
        folder = FOLDER[r['species']]
        rel = f"assets/audio/pets/{folder}/{r['id']}.wav"
        write_wav(os.path.join(ROOT, rel), x)
        assets.append({
            'id': r['id'], 'species': r['species'], 'kind': r.get('kind', 'vocal'), 'intents': r['intents'],
            'file': rel, 'durationMs': int(round(len(x) / SR * 1000)), 'loop': loop, 'sourceId': r['src'],
            'stages': r.get('stages'), 'foley': r.get('foley'), 'rate': r.get('rate', 1),
            'segment': [r.get('start'), dur], 'peakDb': round(db(np.abs(x).max()), 1), 'rmsDb': round(db(active_rms(x)), 1),
            'note': r.get('note'),
        })
        print(f"  {r['id']:<26} {len(x)/SR:5.2f}s  pk {db(np.abs(x).max()):5.1f} dB")

    # ---------- generados ----------
    head = '// GENERADO por scripts/audio/process_pet_audio.py — no editar a mano.\n'
    used = {}
    for a in assets:
        used.setdefault(a['sourceId'], []).append(a['id'])
    with open(os.path.join(ROOT, 'src/core/audio/petAudioAssets.generated.ts'), 'w', encoding='utf-8') as f:
        f.write(head + "import type { PetAudioAsset } from './types';\n\nexport const PET_AUDIO_ASSETS: readonly PetAudioAsset[] = [\n")
        for a in assets:
            fields = {k: v for k, v in a.items() if v is not None and k not in ('segment', 'peakDb', 'rmsDb', 'note')}
            f.write('  ' + ts(fields) + ',\n')
        f.write('];\n')
    with open(os.path.join(ROOT, 'src/core/audio/petAudioSources.generated.ts'), 'w', encoding='utf-8') as f:
        f.write(head + "import type { AudioSourceRecord } from './types';\n\nexport const PET_AUDIO_SOURCES: readonly AudioSourceRecord[] = [\n")
        for s in sources.values():
            if s['id'] not in used:
                continue
            rec = {k: s[k] for k in ('id', 'provider', 'title', 'author', 'url', 'license', 'licenseUrl', 'attributionRequired', 'originalFilename', 'species')}
            f.write('  ' + ts(rec) + ',\n')
        f.write('];\n')
    os.makedirs(os.path.join(ROOT, 'src/services/audio'), exist_ok=True)
    with open(os.path.join(ROOT, 'src/services/audio/petAudioFiles.generated.ts'), 'w', encoding='utf-8') as f:
        f.write(head + '// Único lugar con require() de audio de mascotas: los componentes nunca usan rutas.\n')
        f.write('export const PET_AUDIO_FILES: Readonly<Record<string, number>> = {\n')
        for a in assets:
            f.write(f"  {a['id']}: require('@/{a['file']}') as number,\n")
        f.write('};\n')
    write_license_doc(sources, assets, used)
    json.dump(assets, open(os.path.join(ROOT, 'assets/audio/pets/assets.report.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'{len(assets)} assets; {len(missing)} recetas sin descarga: {missing[:12]}')
    return 0


def write_license_doc(sources, assets, used):
    by_id = {a['id']: a for a in assets}
    lines = [
        '# Licencias de audio de mascotas',
        '',
        '> Generado por `scripts/audio/process_pet_audio.py` a partir de `scripts/audio/pet_audio_sources.json` (verificado a mano en la página de cada sonido) y `pet_audio_recipes.json`. No editar a mano.',
        '',
        'Política: **CC0 primero**; CC-BY solo cuando no existía alternativa CC0 real; nada con licencia NC, Sampling+, desconocida, YouTube/TikTok, voces humanas, imitaciones ni TTS.',
        '',
        '## Atribución obligatoria (mostrar en la app: Ajustes → Créditos de sonido)',
        '',
    ]
    for s in sources.values():
        if s['id'] in used and s['attributionRequired']:
            lines.append(f"- \"{s['title']}\" por **{s['author']}** — {s['url']} — {s['license']} ({s['licenseUrl']}). Modificado (recortado, filtrado, normalizado{', tono' if any(by_id[i]['rate'] != 1 for i in used[s['id']]) else ''}).")
    lines += ['', '## Fuentes', '', '| Fuente | Autor | Licencia | Atribución | Archivo original | Especie | Assets derivados | Uso |', '|---|---|---|---|---|---|---|---|']
    for s in sources.values():
        if s['id'] not in used:
            continue
        ids = used[s['id']]
        intents = sorted({i for a in ids for i in by_id[a]['intents']} | {by_id[a]['foley'] for a in ids if by_id[a].get('foley')})
        lines.append(f"| [{s['title']}]({s['url']}) | {s['author']} | [{s['license']}]({s['licenseUrl']}) | {'**sí**' if s['attributionRequired'] else 'no'} | `{s['originalFilename']}` | {s['species']} | {', '.join('`'+i+'`' for i in ids)} | {', '.join(intents)} |")
    lines += ['', '## Assets', '', '| Asset | Archivo | Fuente | Fragmento (s) | Tono | Duración | Intenciones / uso | Nota |', '|---|---|---|---|---|---|---|---|']
    for a in assets:
        seg = a['segment']
        segs = 'completo' if seg[0] is None else f"{seg[0]:.2f} + {seg[1]:.2f}"
        use = ', '.join(a['intents']) or (a.get('foley') or '')
        lines.append(f"| `{a['id']}` | `{a['file']}` | `{a['sourceId']}` | {segs} | ×{a['rate']} | {a['durationMs']} ms{' (bucle)' if a['loop'] else ''} | {use} | {a.get('note') or ''} |")
    lines += ['', '## Descargas', '', 'Los originales se descargan con `npm run audio:fetch` (previews HQ MP3 de Freesound —misma licencia que el original—, BigSoundBank o el espejo en GitHub de los packs CC0) en `assets/audio/pets/_raw/` (ignorado por git).', '']
    with open(os.path.join(ROOT, 'docs/audio-licenses.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


if __name__ == '__main__':
    sys.exit(main())
