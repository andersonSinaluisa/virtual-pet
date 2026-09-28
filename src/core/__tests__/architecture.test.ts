/*
 * Regla de arquitectura: el Core no conoce React, React Native, Expo,
 * Three.js ni el DOM. Si este test falla, la lógica se está filtrando a
 * la capa equivocada.
 */
import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CORE = join(__dirname, '..');
const FORBIDDEN_IMPORT = /from\s+['"](react|react-native|expo[\w-]*|three|@expo\/[\w-]+|react-native-[\w-]+)(\/[^'"]*)?['"]/;
const FORBIDDEN_GLOBAL = /\b(window|document|localStorage|requestAnimationFrame|navigator)\s*[.(]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('Arquitectura del Core', () => {
  it.each(files(CORE).map((f) => [f.slice(CORE.length + 1), f]))('%s no importa plataforma ni usa el DOM', (_name, file) => {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(FORBIDDEN_IMPORT);
    expect(src).not.toMatch(FORBIDDEN_GLOBAL);
  });
});
