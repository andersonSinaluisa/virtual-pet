/*
 * Informe de escenarios (docs/environment-results.md). Solo se ejecuta a mano:
 *   npm run report:environments
 * Métricas de Node (contenido de la escena, carga, navegación). Los FPS reales
 * solo se miden en el dispositivo (Ajustes → Herramientas → Environment Lab).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { seededRng } from '@/core/random';
import { GameSession } from '@/core/session/GameSession';
import { TestClock } from '@/core/time/WorldClock';
import { insideSolid, locationSolids } from '@/core/world/EnvironmentLayouts';
import { navGrid } from '@/core/world/NavGrid';
import { LOCATIONS, type LocationId } from '@/core/world/Locations';

import { assetsFor } from '../EnvironmentAssetInfo';
import { EnvironmentAssetManager } from '../EnvironmentAssetManager';
import { buildEnvironmentGLB } from '../EnvironmentBuilder';

const run = process.env.ENV_REPORT === '1' || process.argv.some((a) => a.includes('environmentReport')) ? describe : describe.skip;
const ROOT = join(__dirname, '../../../assets/environments');
const bytes = async (id: string) => { const b = readFileSync(join(ROOT, `${id}.glb`)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

run('Informe de escenarios', () => {
  it('genera las métricas', async () => {
    const out: string[] = [];
    for (const loc of ['room', 'garden', 'park'] as LocationId[]) {
      const ids = assetsFor(loc);
      const kb = ids.reduce((s, id) => s + statSync(join(ROOT, `${id}.glb`)).size, 0) / 1024;
      const m = new EnvironmentAssetManager(bytes);
      const t0 = Date.now();
      await m.preload(ids);
      const loadMs = Date.now() - t0;
      const tris = ids.reduce((s, id) => s + (m.get(id)?.triangles ?? 0), 0);
      out.push(`ASSETS ${loc}: ${ids.length} GLB · ${kb.toFixed(0)} KB · ${Math.round(tris)} tri (plantillas) · carga+parse Node ${loadMs} ms`);
      for (const q of ['low', 'medium', 'high'] as const) {
        const env = await buildEnvironmentGLB(loc, m, q);
        out.push(`  ${q}: props ${env.stats.props} · mallas ${env.stats.meshes} (fusionadas desde ${env.stats.batchedFrom}) · tri ${env.stats.triangles} · construir ${env.stats.buildMs} ms · sway ${env.sway.length} · oclusores ${env.occluders.length} · puertas ${env.doors.length} · luces extra ${env.lampLight ? 1 : 0}`);
      }
      const solids = locationSolids(loc);
      out.push(`  semántica: ${solids.length} sólidos (${solids.filter((s) => s.kind === 'box').length} cajas) · ${LOCATIONS[loc].zones.length} zonas · ${LOCATIONS[loc].interactionPoints.exits.length} salidas`);
      for (const stage of ['BABY', 'ADULT'] as const) {
        const s = GameSession.create({ name: 'M', species: 'dog' }, { rng: seededRng(5), clock: new TestClock(1e12), lifeStage: stage });
        if (loc !== 'room') s.world.changeLocation(loc, undefined, 'dev');
        const w = s.world, g = navGrid(loc, w.bodyRadius), b = LOCATIONS[loc].navigationBounds, rng = seededRng(17);
        const walkable = g.walk.reduce((a, v) => a + v, 0) / g.walk.length;
        let reached = 0, ticks = 0, inside = 0;
        const N = 60;
        const t1 = Date.now();
        for (let i = 0; i < N; i++) {
          const target = { x: b.minX + 0.03 + rng() * (b.maxX - b.minX - 0.06), y: b.minY + 0.03 + rng() * (b.maxY - b.minY - 0.06) };
          for (let t = 0; t < 900; t++) {
            const step = w.navigation.plan({ location: loc, point: target, stop: 0.02 });
            s.sim.movement.apply(w, [{ kind: 'seek', target: step.waypoint, speed: 1, stop: step.stop }]);
            ticks++;
            if (insideSolid(loc, w.pet, w.bodyRadius * 0.85)) inside++;
            if (w.distance(w.pet, w.freePoint(target, w.bodyRadius)) < 0.05) { reached++; break; }
          }
        }
        out.push(`  navegación ${stage} (radio ${w.bodyRadius.toFixed(2)} m): rejilla ${g.cols}×${g.rows} · ${(walkable * 100).toFixed(0)} % caminable · ${reached}/${N} destinos · ticks dentro de sólidos ${inside} · ${((Date.now() - t1) / ticks).toFixed(3)} ms/tick de navegación`);
      }
    }
    console.log(out.join('\n'));
    expect(out.length).toBeGreaterThan(0);
  }, 600_000);
});
