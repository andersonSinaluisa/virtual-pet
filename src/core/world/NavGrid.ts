/*
 * NAV GRID — navegación ligera para escenarios amueblados (sin librería de navmesh).
 *
 * Se evaluó un NavMesh (docs/environment-upgrade-plan.md): para estancias de
 * 5–15 m con 5–15 obstáculos, una rejilla de 10 cm por tamaño de cuerpo es
 * suficiente, barata y 100 % determinista:
 *
 *   celda caminable = dentro de los límites del lugar y sin sólido a menos del radio del cuerpo
 *   componentes conexas (BFS) → ¿se puede llegar? (los "bolsillos" más estrechos que el cuerpo no)
 *   A* 8-vecinos + "string pulling" por línea de visión → siguiente punto de paso
 *
 * Una rejilla por (lugar, radio del cuerpo redondeado a 5 cm): bebé y adulto
 * pasan por huecos distintos. Se cachea; las rutas también, por celda destino.
 */
import type { Point } from '../simulation/Pet';
import { fromMeters, locationSolids, metersOf, pushOut, toMeters } from './EnvironmentLayouts';
import { LOCATIONS, type LocationId } from './Locations';

const CELL = 0.1; // metros

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly walk: Uint8Array;
  readonly comp: Int32Array; // componente conexa (-1 = no caminable)
  private readonly ox: number; // origen (metros) de la celda 0,0
  private readonly oz: number;

  constructor(readonly loc: LocationId, readonly radius: number) {
    const m = metersOf(loc), b = LOCATIONS[loc].navigationBounds;
    const minX = (b.minX - 0.5) * m.w, maxX = (b.maxX - 0.5) * m.w, minZ = (b.minY - 0.5) * m.d, maxZ = (b.maxY - 0.5) * m.d;
    this.ox = minX; this.oz = minZ;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / CELL));
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / CELL));
    this.walk = new Uint8Array(this.cols * this.rows);
    const solids = locationSolids(loc);
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
      const x = Math.min(maxX, minX + (i + 0.5) * CELL), z = Math.min(maxZ, minZ + (j + 0.5) * CELL);
      this.walk[j * this.cols + i] = solids.some((s) => pushOut(s, x, z, radius) !== null) ? 0 : 1;
    }
    this.comp = new Int32Array(this.cols * this.rows).fill(-1);
    let c = 0;
    for (let k = 0; k < this.walk.length; k++) {
      if (!this.walk[k] || this.comp[k] >= 0) continue;
      const q = [k];
      this.comp[k] = c;
      while (q.length) {
        const cur = q.pop() as number, ci = cur % this.cols, cj = (cur - ci) / this.cols;
        for (const [di, dj] of NEIGH4) {
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= this.cols || nj >= this.rows) continue;
          const n = nj * this.cols + ni;
          if (this.walk[n] && this.comp[n] < 0) { this.comp[n] = c; q.push(n); }
        }
      }
      c++;
    }
  }

  cellOf(p: Point): number {
    const { x, z } = toMeters(this.loc, p);
    const i = Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.ox) / CELL)));
    const j = Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.oz) / CELL)));
    return j * this.cols + i;
  }

  centerOf(cell: number): Point {
    const i = cell % this.cols, j = (cell - i) / this.cols;
    return fromMeters(this.loc, this.ox + (i + 0.5) * CELL, this.oz + (j + 0.5) * CELL);
  }

  isWalkable(p: Point): boolean { return this.walk[this.cellOf(p)] === 1; }

  // Celda caminable más cercana a p (opcionalmente dentro de una componente)
  nearestWalkable(p: Point, comp = -1): number {
    const start = this.cellOf(p);
    if (this.walk[start] && (comp < 0 || this.comp[start] === comp)) return start;
    const si = start % this.cols, sj = (start - si) / this.cols;
    const maxR = Math.max(this.cols, this.rows);
    for (let r = 1; r < maxR; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = si + di, j = sj + dj;
        if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
        const k = j * this.cols + i;
        if (!this.walk[k] || (comp >= 0 && this.comp[k] !== comp)) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return start;
  }

  // Línea de visión en la rejilla (todas las celdas del segmento caminables)
  lineOfSight(a: Point, b: Point): boolean {
    const A = toMeters(this.loc, a), B = toMeters(this.loc, b);
    const n = Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / (CELL * 0.5));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const p = fromMeters(this.loc, A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t);
      if (!this.isWalkable(p)) return false;
    }
    return true;
  }

  // A* 8-vecinos (sin cortar esquinas); devuelve celdas de inicio a fin, o null
  path(fromCell: number, toCell: number): number[] | null {
    if (fromCell === toCell) return [toCell];
    const W = this.cols, N = this.walk.length;
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const ti = toCell % W, tj = (toCell - ti) / W;
    const h = (k: number) => { const i = k % W, j = (k - i) / W, dx = Math.abs(i - ti), dy = Math.abs(j - tj); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const open = new MinHeap();
    g[fromCell] = 0; open.push(fromCell, h(fromCell));
    while (open.size) {
      const cur = open.pop();
      if (cur === toCell) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % W, cj = (cur - ci) / W;
      for (const [di, dj] of NEIGH8) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.rows) continue;
        const n = nj * W + ni;
        if (!this.walk[n] || closed[n]) continue;
        if (di && dj && (!this.walk[cj * W + ni] || !this.walk[nj * W + ci])) continue; // no cortar esquinas
        const ng = g[cur] + (di && dj ? 1.414 : 1);
        if (ng < g[n]) { g[n] = ng; came[n] = cur; open.push(n, ng + h(n)); }
      }
    }
    if (came[toCell] < 0) return null;
    const out: number[] = [];
    for (let k = toCell; k !== -1; k = came[k]) { out.push(k); if (k === fromCell) break; }
    return out.reverse();
  }
}

const NEIGH4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const NEIGH8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  get size(): number { return this.k.length; }
  push(key: number, pri: number): void {
    this.k.push(key); this.p.push(pri);
    let i = this.k.length - 1;
    while (i > 0) { const par = (i - 1) >> 1; if (this.p[par] <= this.p[i]) break; this.swap(i, par); i = par; }
  }
  pop(): number {
    const top = this.k[0], lk = this.k.pop() as number, lp = this.p.pop() as number;
    if (this.k.length) {
      this.k[0] = lk; this.p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.p.length && this.p[l] < this.p[m]) m = l;
        if (r < this.p.length && this.p[r] < this.p[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void { [this.k[a], this.k[b]] = [this.k[b], this.k[a]]; [this.p[a], this.p[b]] = [this.p[b], this.p[a]]; }
}

const grids = new Map<string, NavGrid>();
export function navGrid(loc: LocationId, radius: number): NavGrid {
  const r = Math.round(radius / 0.05) * 0.05;
  const key = `${loc}:${r.toFixed(2)}`;
  let g = grids.get(key);
  if (!g) { g = new NavGrid(loc, r); grids.set(key, g); }
  return g;
}

/*
 * Siguiente punto de paso hacia `to` para un cuerpo de radio `radius`:
 *  - si hay línea de visión, el destino (proyectado a lo alcanzable);
 *  - si no, A* y el nodo más lejano de la ruta que se ve desde aquí.
 * `reachable=false` si el destino está en otra componente (bolsillo más estrecho que el cuerpo):
 * entonces se va al punto alcanzable más cercano.
 */
export interface GridStep { waypoint: Point; goal: Point; reachable: boolean; direct: boolean }

const routeCache = new Map<string, { goalCell: number; path: number[] }>();

export function gridStep(loc: LocationId, from: Point, to: Point, radius: number, cacheKey = 'pet'): GridStep {
  const g = navGrid(loc, radius);
  const fromCell = g.nearestWalkable(from);
  const comp = g.comp[fromCell];
  let goalCell = g.cellOf(to);
  const reachable = g.walk[goalCell] === 1 && g.comp[goalCell] === comp;
  if (!reachable) goalCell = g.nearestWalkable(to, comp);
  const goal = reachable ? to : g.centerOf(goalCell);
  // Pegado a un mueble tras chocar, su celda puede no ser "caminable": se razona desde la libre más cercana
  const origin = g.isWalkable(from) ? from : g.centerOf(fromCell);
  if (g.lineOfSight(origin, goal)) return { waypoint: goal, goal, reachable, direct: g.isWalkable(from) };
  const key = `${cacheKey}:${loc}:${radius.toFixed(2)}`;
  let cached = routeCache.get(key);
  if (!cached || cached.goalCell !== goalCell || !cached.path.includes(fromCell)) {
    const path = g.path(fromCell, goalCell);
    cached = { goalCell, path: path ?? [goalCell] };
    routeCache.set(key, cached);
  }
  const path = cached.path;
  const at = Math.max(0, path.indexOf(fromCell));
  // Siempre hacia DELANTE: el nodo más lejano de la ruta visible desde el origen (nunca la celda actual)
  let next = path[Math.min(path.length - 1, at + 1)];
  for (let k = path.length - 1; k > at; k--) { if (g.lineOfSight(origin, g.centerOf(path[k]))) { next = path[k]; break; } }
  return { waypoint: k2p(g, next, goal, path[path.length - 1]), goal, reachable, direct: false };
}

const k2p = (g: NavGrid, cell: number, goal: Point, last: number) => (cell === last ? goal : g.centerOf(cell));
