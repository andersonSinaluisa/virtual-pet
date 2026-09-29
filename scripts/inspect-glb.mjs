#!/usr/bin/env node
/*
 * ASSET INSPECTOR — analiza GLB antes de aceptarlos (sin dependencias).
 *
 *   node scripts/inspect-glb.mjs <archivo.glb | carpeta> [--json salida.json]
 *
 * Informa por archivo: tamaño, nodos, mallas, primitivas (≈ draw calls),
 * materiales, texturas (dimensiones y bytes), animaciones, triángulos y caja
 * envolvente en unidades del modelo (aplicando las transformaciones de nodo).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('no es GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}

function imageSize(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20), mime: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m >= 0xc0 && m <= 0xc3) return { w: bytes.readUInt16BE(i + 7), h: bytes.readUInt16BE(i + 5), mime: 'jpeg' };
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }
  return { w: 0, h: 0, mime: 'other' };
}

// Matrices 4x4 column-major
const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

export function inspect(file) {
  const buf = readFileSync(file);
  const { json: g, bin } = parseGlb(buf);
  let triangles = 0, primitives = 0, vertices = 0;
  for (const m of g.meshes ?? []) for (const p of m.primitives) {
    primitives++;
    const pos = g.accessors[p.attributes.POSITION];
    vertices += pos.count;
    const n = p.indices !== undefined ? g.accessors[p.indices].count : pos.count;
    const mode = p.mode ?? 4;
    triangles += mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0;
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const visit = (idx, parent) => {
    const n = g.nodes[idx], m = mul(parent, trs(n));
    if (n.mesh !== undefined) for (const p of g.meshes[n.mesh].primitives) {
      const a = g.accessors[p.attributes.POSITION];
      if (!a.min || !a.max) continue;
      for (let c = 0; c < 8; c++) {
        const v = apply(m, [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]]);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
      }
    }
    for (const ch of n.children ?? []) visit(ch, m);
  };
  const scene = g.scenes?.[g.scene ?? 0];
  for (const r of scene?.nodes ?? []) visit(r, I());
  const textures = (g.images ?? []).map((img, i) => {
    let bytes = null;
    if (img.bufferView !== undefined && bin) { const bv = g.bufferViews[img.bufferView]; bytes = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength); }
    const sz = bytes ? imageSize(bytes) : { w: 0, h: 0, mime: img.uri ? 'external' : '?' };
    return { index: i, name: img.name ?? null, ...sz, bytes: bytes?.length ?? 0 };
  });
  return {
    file: basename(file), bytes: buf.length,
    nodes: g.nodes?.length ?? 0, meshes: g.meshes?.length ?? 0, primitives, materials: g.materials?.length ?? 0,
    materialNames: (g.materials ?? []).map((m) => m.name ?? ''), textures, animations: (g.animations ?? []).map((a) => a.name ?? ''),
    triangles, vertices, extensions: g.extensionsUsed ?? [],
    bbox: { min: min.map((v) => +v.toFixed(3)), max: max.map((v) => +v.toFixed(3)), size: max.map((v, k) => +(v - min[k]).toFixed(3)) },
    nodeNames: (g.nodes ?? []).map((n) => n.name ?? ''),
  };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
  const target = args.find((a) => !a.startsWith('--') && a !== jsonOut);
  if (!target) { console.error('uso: node scripts/inspect-glb.mjs <archivo.glb | carpeta> [--json salida.json]'); process.exit(1); }
  const files = statSync(target).isDirectory() ? readdirSync(target).filter((f) => extname(f) === '.glb').map((f) => join(target, f)) : [target];
  const rows = files.map(inspect).sort((a, b) => b.bytes - a.bytes);
  for (const r of rows) {
    const tex = r.textures.map((t) => `${t.w}x${t.h}`).join(',') || '-';
    console.log(`${r.file.padEnd(34)} ${(r.bytes / 1024).toFixed(0).padStart(6)} KB  tris ${String(Math.round(r.triangles)).padStart(6)}  draws ${String(r.primitives).padStart(2)}  mats ${r.materials}  tex ${tex}  anim ${r.animations.length}  size ${r.bbox.size.join('×')}`);
  }
  const total = rows.reduce((s, r) => ({ bytes: s.bytes + r.bytes, tris: s.tris + r.triangles, draws: s.draws + r.primitives }), { bytes: 0, tris: 0, draws: 0 });
  console.log(`TOTAL ${rows.length} archivos · ${(total.bytes / 1024 / 1024).toFixed(2)} MB · ${Math.round(total.tris)} triángulos · ${total.draws} primitivas`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
}

if (process.argv[1] && process.argv[1].endsWith('inspect-glb.mjs')) main();
