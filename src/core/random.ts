/*
 * RNG inyectable. El prototipo usaba Math.random directamente; aquí se pasa
 * por la configuración para que los tests y la validación sean deterministas.
 * En la app se usa Math.random (mismo comportamiento que el prototipo).
 */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

// Park–Miller (el mismo generador que usaba tools/harness.js)
export function seededRng(seed: number): Rng {
  let s = Math.floor(Math.abs(seed)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function makeId(prefix: string, rng: Rng = defaultRng): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(rng() * 1e9).toString(36)}`;
}
