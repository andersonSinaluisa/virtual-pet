/*
 * ENVIRONMENT LAB (solo desarrollo): escenarios GLB con métricas REALES del
 * renderer (draw calls, triángulos, geometrías, texturas) y del constructor
 * (props, mallas fusionadas, tiempo de carga). Lugar, hora del mundo, calidad
 * y capas semánticas. El medidor de FPS se activa al abrir esta tarjeta.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { clockInfo } from '@/core/time/WorldClock';
import type { LocationId } from '@/core/world/Locations';
import { Squishable } from '@/components/ui/Squishable';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { devStore, petStore, settingsStore, type WorldDebugState } from '@/state/stores';
import { colors, fonts, radius, spacing } from '@/theme';

const HOUR = 3_600_000;
const PLACES: { id: LocationId; label: string }[] = [{ id: 'room', label: 'HOME' }, { id: 'garden', label: 'GARDEN' }, { id: 'park', label: 'PARK' }];
const TIMES = [{ h: 8, label: 'Mañana' }, { h: 13, label: 'Mediodía' }, { h: 19.5, label: 'Atardecer' }, { h: 23, label: 'Noche' }];
const QUALITY = [{ q: 'low', label: 'Low' }, { q: 'medium', label: 'Medium' }, { q: 'high', label: 'High' }] as const;
const LAYERS: { key: keyof WorldDebugState; label: string }[] = [
  { key: 'semantic', label: 'Walkable · obstáculos · interacción · spawn · transición' },
  { key: 'fov', label: 'Pet FOV' }, { key: 'navigation', label: 'Navigation path' }, { key: 'perceived', label: 'Percibidos' },
];

function Pill({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Squishable onPress={onPress} style={[styles.pill, on ? styles.pillOn : null]}>
      <Text variant="labelSm" color={on ? colors.onPrimaryContainer : colors.text}>{label}</Text>
    </Squishable>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.mono}>{k}</Text>
      <Text style={styles.monoR}>{v}</Text>
    </View>
  );
}

// Salta el reloj del mundo hasta la próxima vez que sea `hour` (sin retroceder: el tiempo no vuelve atrás)
function goToHour(hour: number): void {
  const now = SessionController.clock.now();
  const m = clockInfo(now).minuteOfDay;
  let delta = hour * 60 - m;
  if (delta <= 0) delta += 24 * 60;
  SessionController.advanceClock(delta * 60_000);
}

export function EnvironmentLab() {
  const pet = useStore(petStore);
  const metrics = useStore(devStore, (d) => d.sceneMetrics);
  const perf = useStore(devStore, (d) => d.perf);
  const layers = useStore(devStore, (d) => d.world);
  const quality = useStore(settingsStore, (s) => s.graphicsQuality ?? 'medium');
  useEffect(() => { devStore.set((d) => ({ ...d, perfMeter: true })); }, []);
  const loc = SessionController.current?.world.location ?? 'room';
  const env = metrics?.env;

  return (
    <Card style={styles.card}>
      <Text variant="labelMd" color={colors.primary} uppercase>Environment Lab</Text>
      <View style={styles.wrap}>{PLACES.map((p) => <Pill key={p.id} label={p.label} on={loc === p.id} onPress={() => SessionController.devSetLocation(p.id)} />)}</View>
      <View style={styles.wrap}>{TIMES.map((t) => <Pill key={t.label} label={t.label} onPress={() => goToHour(t.h)} />)}</View>
      <View style={styles.wrap}>{QUALITY.map((q) => <Pill key={q.q} label={q.label} on={quality === q.q} onPress={() => SessionController.updateSettings({ graphicsQuality: q.q })} />)}</View>

      <Line k="escenario" v={`${metrics?.location ?? '—'} · ${metrics?.source ?? '—'}${metrics?.source === 'procedural' ? ' (cargando o respaldo)' : ''}`} />
      <Line k="FPS · frame" v={perf ? `${perf.fps.toFixed(0)} · ${perf.frameMs.toFixed(1)} ms` : 'midiendo…'} />
      <Line k="draw calls · triángulos" v={metrics ? `${metrics.drawCalls} · ${metrics.triangles}` : '—'} />
      <Line k="geometrías · texturas (GPU)" v={metrics ? `${metrics.geometries} · ${metrics.textures}` : '—'} />
      <Line k="escenario: props · mallas · tris" v={env ? `${env.props} · ${env.meshes} (de ${env.batchedFrom + env.meshes}) · ${env.triangles}` : '—'} />
      <Line k="carga (lugar → GLB listo)" v={metrics?.loadMs !== null && metrics?.loadMs !== undefined ? `${metrics.loadMs} ms (construir ${env?.buildMs ?? '—'} ms)` : '—'} />
      <Line k="luz del mundo (sensor)" v={pet ? `${pet.lightLevel.toFixed(2)}${pet.lampOn ? ' · lámpara' : ''}` : '—'} />
      {metrics?.errors.length ? <Text style={[styles.mono, { color: colors.error }]}>{metrics.errors.slice(-3).join('\n')}</Text> : null}

      <Text variant="labelSm" color={colors.textMuted}>Capas</Text>
      <View style={styles.wrap}>
        {LAYERS.map((l) => (
          <Pill key={l.key} label={l.label} on={!!layers[l.key]} onPress={() => devStore.set((d) => ({ ...d, world: { ...d.world, [l.key]: !d.world[l.key] } }))} />
        ))}
        <Pill label={`Lámpara ${pet?.lampOn ? 'ON' : 'OFF'}`} on={!!pet?.lampOn} onPress={() => SessionController.setLamp(!pet?.lampOn)} />
        <Pill label="+1 h" onPress={() => SessionController.advanceClock(HOUR)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  pillOn: { backgroundColor: colors.primaryContainer },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mono: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  monoR: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text, fontVariant: ['tabular-nums'], marginLeft: 'auto', flexShrink: 1, textAlign: 'right' },
});
