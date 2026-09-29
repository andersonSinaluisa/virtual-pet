/*
 * WORLD INSPECTOR (solo desarrollo; /dev redirige fuera de __DEV__)
 * ----------------------------------------------------------------
 * Herramientas para estudiar el MUNDO VIVO sin tocar el cerebro:
 *   · crear / quitar / mover objetos, caja misteriosa, lanzar la pelota
 *   · provocar sonidos (detrás de la mascota), dejar caer una hoja
 *   · luz, hora, clima, ubicación, teletransporte (solo desarrollo)
 *   · capas de la escena: FOV, radio de oído, percibidos, atención, navegación
 *   · SENSOR DEBUG: elegir un objeto y ver qué percibe (distancia, ángulo,
 *     visibilidad, movimiento, novedad, familiaridad) y qué llega a la SNN
 *   · rendimiento: 10 / 25 / 50 objetos, FPS y tiempo de tick
 */
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ITEMS, NOVEL_KINDS, type ItemKind } from '@/core/world/Items';
import { LOCATIONS, PLAYABLE_LOCATIONS } from '@/core/world/Locations';
import { SoftButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { devStore, petStore, type WorldDebugState } from '@/state/stores';
import { colors, fonts, radius, spacing } from '@/theme';

const SPAWN: ItemKind[] = ['ball', 'teddy', 'mysteryBox', 'mirror', 'leaf', 'feather', 'butterfly', ...NOVEL_KINDS];
const WORLD_SENSORS = ['seesBall', 'seesTeddy', 'seesBox', 'toyAvailable', 'interestingObjectVisible', 'newObjectDetected', 'familiarObject', 'objectMoving', 'soundHeard', 'soundNovelty', 'loudSound', 'unfamiliarPlace', 'openSpace', 'ambientActivity', 'lightLevel'];
const LAYERS: [keyof WorldDebugState, string][] = [['fov', 'FOV'], ['hearing', 'Oído'], ['perceived', 'Percibidos'], ['attention', 'Atención'], ['navigation', 'Navegación'], ['labels', 'Novedad/familiaridad']];

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

const f2 = (v: number) => v.toFixed(2);

export function WorldInspector() {
  useStore(petStore); // refresco ~4 Hz
  const dev = useStore(devStore);
  const [tickMs, setTickMs] = useState<number | null>(null);
  const s = SessionController.current;
  if (!s) return null;
  const w = s.world;
  const inspect = dev.inspectId !== null ? w.getObject(dev.inspectId) : null;
  const percept = inspect ? w.perceptFor(inspect.id) : null;
  const readings = s.sim.sensors.lastReadings.filter((r) => WORLD_SENSORS.includes(r.key));
  const nav = w.navigation.lastStep;
  const setLayer = (k: keyof WorldDebugState, v: boolean) => devStore.set((d) => ({ ...d, world: { ...d.world, [k]: v } }));

  return (
    <Card style={styles.card}>
      <Text variant="labelMd" color={colors.primary} uppercase>World Inspector</Text>
      <Line k="ubicación" v={`${LOCATIONS[w.location].emoji} ${w.location} · luz ${f2(w.lightLevel)} · ${w.env.weatherState}`} />
      <Line k="ambiente" v={`actividad ${f2(w.env.ambientActivity)} · ruido ${f2(w.env.noiseLevel)} · novedad del lugar ${f2(w.env.novelty)}`} />
      <Line k="mascota" v={`(${f2(w.pet.x)}, ${f2(w.pet.y)}) · mira ${Math.round((w.pet.orientation * 180) / Math.PI)}°`} />
      <Line k="atención" v={w.attentionTarget ? (w.attentionTarget.type === 'object' ? `objeto #${w.attentionTarget.id} (${f2(w.attentionTarget.score)})` : `sonido (${f2(w.attentionTarget.score)})`) : '—'} />
      <Line k="navegación" v={nav ? `→ (${f2(nav.waypoint.x)}, ${f2(nav.waypoint.y)})${nav.exitId ? ` por ${nav.exitId}` : ''}${nav.final ? '' : ' · rodeo'}` : '—'} />

      <Text variant="labelSm" color={colors.textMuted}>Capas en la escena</Text>
      <View style={styles.wrap}>{LAYERS.map(([k, label]) => <Pill key={k} label={label} on={dev.world[k]} onPress={() => setLayer(k, !dev.world[k])} />)}</View>

      <Text variant="labelSm" color={colors.textMuted}>Ubicación · hora · clima · lámpara</Text>
      <View style={styles.wrap}>{PLAYABLE_LOCATIONS.map((l) => <Pill key={l} label={`${LOCATIONS[l].emoji} ${l}`} on={w.location === l} onPress={() => SessionController.devSetLocation(l)} />)}</View>
      <View style={styles.wrap}>{[7, 12, 18, 23].map((h) => <Pill key={h} label={`${h}:00`} onPress={() => SessionController.devSetHour(h)} />)}</View>
      <View style={styles.wrap}>
        {(['clear', 'cloudy', 'breezy'] as const).map((x) => <Pill key={x} label={x} on={w.env.weatherState === x} onPress={() => SessionController.devSetWeather(x)} />)}
        <Pill label={w.lightOn ? 'Lámpara ON' : 'Lámpara OFF'} on={w.lightOn} onPress={() => SessionController.setLamp(!w.lightOn)} />
      </View>
      <View style={styles.wrap}>
        <Pill label="Teletransportar al centro (dev)" onPress={() => SessionController.devTeleport(0.5, 0.55)} />
        <Pill label="Microeventos ×0" onPress={() => SessionController.devAmbientRate(0)} />
        <Pill label="×1" onPress={() => SessionController.devAmbientRate(1)} />
        <Pill label="×5" onPress={() => SessionController.devAmbientRate(5)} />
      </View>

      <Text variant="labelSm" color={colors.textMuted}>Estímulos (cambian el mundo, no la mascota)</Text>
      <View style={styles.wrap}>
        <Pill label="📦 Caja misteriosa delante" onPress={() => { const id = SessionController.devSpawn('mysteryBox'); if (id !== null) devStore.set((d) => ({ ...d, inspectId: id })); }} />
        <Pill label="⚽ Rodar pelota" onPress={() => SessionController.devRollBall()} />
        <Pill label="🍂 Soltar hoja" onPress={() => SessionController.devDropLeaf()} />
        <Pill label="🔊 Golpe detrás" onPress={() => SessionController.devSound('thud')} />
        <Pill label="🚪 Crujido detrás" onPress={() => SessionController.devSound('creak')} />
        <Pill label="🐦 Pájaro" onPress={() => SessionController.devSound('bird', false)} />
        <Pill label="💥 Ruido fuerte" onPress={() => SessionController.devSound('noise')} />
      </View>
      <View style={styles.wrap}>{SPAWN.map((k) => <Pill key={k} label={`${ITEMS[k].emoji} ${ITEMS[k].name}`} onPress={() => SessionController.devSpawn(k)} />)}</View>

      <Text variant="labelSm" color={colors.textMuted}>Sensor debug · toca un objeto</Text>
      <View style={styles.wrap}>
        {w.objects.map((o) => <Pill key={o.id} label={`${o.emoji}#${o.id}`} on={dev.inspectId === o.id} onPress={() => devStore.set((d) => ({ ...d, inspectId: d.inspectId === o.id ? null : o.id }))} />)}
      </View>
      {inspect && percept ? (
        <View style={styles.box}>
          <Text variant="labelMd">{ITEMS[inspect.kind].name.toUpperCase()} · {inspect.state}</Text>
          <Line k="distance" v={`${f2(percept.meters)} m (${f2(percept.distance)} u)`} />
          <Line k="visible" v={`${percept.perceived} · FOV ${percept.inFov} · visión ${f2(percept.vision)} · cerca ${f2(percept.near)}`} />
          <Line k="angle" v={`${Math.round(percept.angle)}°`} />
          <Line k="movement" v={f2(percept.movement)} />
          <Line k="novelty" v={f2(percept.novelty)} />
          <Line k="familiarity" v={f2(percept.familiarity)} />
          <Line k="signal / salience" v={`${f2(percept.signal)} / ${f2(percept.salience)}`} />
          <Line k="memoria" v={w.knowledge.object(inspect.kind)?.stage ?? 'desconocido'} />
          <View style={styles.wrap}>
            <Pill label="Quitar" onPress={() => { SessionController.devRemove(inspect.id); devStore.set((d) => ({ ...d, inspectId: null })); }} />
            <Pill label="Mover detrás de la mascota" onPress={() => SessionController.devMove(inspect.id, w.pet.x - Math.cos(w.pet.orientation) * 0.25, w.pet.y - Math.sin(w.pet.orientation) * 0.25)} />
            <Pill label="Mover delante" onPress={() => SessionController.devMove(inspect.id, w.pet.x + Math.cos(w.pet.orientation) * 0.25, w.pet.y + Math.sin(w.pet.orientation) * 0.25)} />
          </View>
        </View>
      ) : null}

      <Text variant="labelSm" color={colors.textMuted}>Lo que llega de verdad a la SNN (valor → corriente)</Text>
      <View style={styles.box}>
        {readings.map((r) => <Line key={r.key} k={r.key} v={`${f2(r.value)} → ${f2(r.current)}`} />)}
      </View>

      <Text variant="labelSm" color={colors.textMuted}>Rendimiento</Text>
      <View style={styles.rowBetween}>
        <Text variant="labelSm">Medidor de FPS (escena)</Text>
        <Switch value={dev.perfMeter} onValueChange={(v) => devStore.set((d) => ({ ...d, perfMeter: v, perf: v ? d.perf : null }))} />
      </View>
      {dev.perf ? <Line k="render" v={`${dev.perf.fps.toFixed(0)} fps · ${dev.perf.frameMs.toFixed(1)} ms/frame`} /> : null}
      {tickMs !== null ? <Line k="tick SNN+mundo" v={`${tickMs.toFixed(2)} ms (${w.objects.length} objetos)`} /> : null}
      <View style={styles.wrap}>
        {[10, 25, 50].map((n) => <Pill key={n} label={`+${n} objetos`} onPress={() => SessionController.devSpawnMany(n)} />)}
        <SoftButton label="Medir tick" icon="speed" onPress={() => setTickMs(SessionController.measureTick(30))} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  pillOn: { backgroundColor: colors.primaryContainer },
  box: { gap: 2, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceContainerLow },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  mono: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  monoR: { fontFamily: fonts.body, fontSize: 11, color: colors.text, flexShrink: 1, textAlign: 'right' },
});
