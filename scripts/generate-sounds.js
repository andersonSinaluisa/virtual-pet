/*
 * Genera los efectos de sonido de la app (WAV mono 22 kHz) por síntesis,
 * para no depender de assets externos ni de internet.
 *
 *   node scripts/generate-sounds.js
 *
 * Salida: assets/audio/*.wav
 */
const fs = require('fs');
const path = require('path');

const RATE = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'audio');

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

let seed = 17;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const env = (t, dur, a = 0.01, r = 0.6) => Math.min(1, t / a) * Math.pow(Math.max(0, 1 - t / dur), r * 3);

function tone(dur, f0, f1, { vol = 0.5, harm = 0.25, attack = 0.01, release = 0.6 } = {}) {
  const n = Math.floor(dur * RATE), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, f = f0 + (f1 - f0) * (t / dur);
    ph += (2 * Math.PI * f) / RATE;
    out[i] = (Math.sin(ph) + harm * Math.sin(2 * ph)) * env(t, dur, attack, release) * vol;
  }
  return out;
}

function noise(dur, { vol = 0.3, lp = 0.1, attack = 0.02, release = 0.8 } = {}) {
  const n = Math.floor(dur * RATE), out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += lp * (rnd() - y);
    out[i] = y * env(i / RATE, dur, attack, release) * vol * 4;
  }
  return out;
}

const concat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0), o = new Float32Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
const silence = (d) => new Float32Array(Math.floor(d * RATE));
const mix = (a, b) => { const o = new Float32Array(Math.max(a.length, b.length)); for (let i = 0; i < o.length; i++) o[i] = (a[i] || 0) + (b[i] || 0); return o; };

const sounds = {
  'ui-tap': tone(0.07, 880, 820, { vol: 0.25, harm: 0.1, release: 0.9 }),
  'pet-happy': concat(tone(0.09, 620, 980, { vol: 0.35 }), silence(0.03), tone(0.11, 700, 1250, { vol: 0.35 })),
  'pet-bark': mix(tone(0.16, 420, 260, { vol: 0.45, harm: 0.6, attack: 0.005 }), noise(0.12, { vol: 0.12, lp: 0.3, attack: 0.003 })),
  'pet-whimper': tone(0.42, 900, 520, { vol: 0.25, harm: 0.15, attack: 0.05, release: 0.4 }),
  discovery: concat(...[523, 659, 784, 1046].map((f) => tone(0.13, f, f, { vol: 0.3, harm: 0.4, release: 0.5 }))),
  'ball-throw': noise(0.28, { vol: 0.22, lp: 0.08, attack: 0.05, release: 0.5 }),
  'box-open': concat(noise(0.05, { vol: 0.3, lp: 0.5, attack: 0.002 }), tone(0.25, 1320, 1760, { vol: 0.2, harm: 0.5 })),
  'ambient-room': (() => {
    // Ronroneo suave y aire de habitación (bucle de 4 s sin clic)
    const d = 4, n = d * RATE, o = new Float32Array(n);
    const a = noise(d, { vol: 0.05, lp: 0.02, attack: 0.001, release: 0.0001 });
    for (let i = 0; i < n; i++) {
      const t = i / RATE, fade = Math.min(1, t / 0.4, (d - t) / 0.4);
      o[i] = (a[i] + 0.03 * Math.sin(2 * Math.PI * 28 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t))) * fade;
    }
    return o;
  })(),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, s] of Object.entries(sounds)) {
  fs.writeFileSync(path.join(OUT, `${name}.wav`), wav(s));
  console.log(`${name}.wav  ${(s.length / RATE).toFixed(2)} s`);
}
