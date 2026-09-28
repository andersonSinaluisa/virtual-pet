/*
 * ROUTINE LAB (solo desarrollo): hora del mundo, luz, jugador, zona y
 * actividad reciente; hábitos detectados y rutinas interpretadas. Controles
 * para mover el reloj, la lámpara y al jugador, acelerar el tiempo o vivir
 * días completos. Se refresca con los snapshots (≤ 4 Hz), nunca por tick.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { interpretRoutines, routineHeadline } from '@/core/routines/RoutineInterpreter';
import { SoftButton, StrongButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController, type RoutineLabPet } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { devStore, memoryStore, petStore } from '@/state/stores';
import { colors, fonts, radius, spacing } from '@/theme';

const SPEEDS = [1, 10, 100, 1000];
const HOUR = 3_600_000;
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

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

function LabResult({ pet }: { pet: RoutineLabPet }) {
  const f = pet.freeRun;
  return (
    <View style={styles.result}>
      <Text variant="labelLg">{pet.name}</Text>
      <Text variant="bodySm" color={colors.textMuted}>{pet.headline}</Text>
      {pet.cards.map((c) => <Text key={c.id} variant="bodyXs">{c.emoji} {c.lines.join(' ')}</Text>)}
      <Text style={styles.mono}>mismo contexto · sueño de noche {(f.nightShare * 100).toFixed(0)}% · selectividad {f.selectivity.toFixed(2)}</Text>
    </View>
  );
}

export function RoutineLab() {
  useStore(memoryStore);
  const pet = useStore(petStore);
  const clockSpeed = useStore(devStore, (d) => d.clockSpeed);
  const [status, setStatus] = useState<string | null>(null);
  const [lab, setLab] = useState<{ milo: RoutineLabPet; luna: RoutineLabPet } | null>(null);
  const s = SessionController.current;
  if (!s || !pet) return null;
  const habits = s.habits();
  const cards = interpretRoutines(habits, pet.name);

  const busy = status !== null;
  const run = async (days: number) => {
    setStatus(`Viviendo ${days} día(s)…`);
    try { await SessionController.fastForwardDays(days, setStatus); } finally { setStatus(null); }
  };
  const runLab = async () => {
    setStatus('Preparando…');
    try { setLab(await SessionController.runRoutineLab(30, setStatus)); } finally { setStatus(null); }
  };

  return (
    <Card style={styles.card}>
      <Text variant="labelMd" color={colors.primary} uppercase>Rutinas · reloj del mundo</Text>
      <Line k="hora del mundo" v={`${hhmm(pet.minuteOfDay)} · ${pet.timeOfDay} · ×${clockSpeed}`} />
      <Line k="luz (natural + lámpara)" v={`${pet.lightLevel.toFixed(2)}${pet.lampOn ? ' · lámpara' : ''}`} />
      <Line k="jugador" v={pet.playerPresent ? 'presente' : 'fuera'} />
      <Line k="zona" v={pet.area} />
      <Line k="actividad reciente" v={pet.recentActivity.toFixed(2)} />

      <View style={styles.wrap}>
        <Text variant="labelSm" color={colors.textMuted}>Hora</Text>
        <Pill label="+1 h" onPress={() => SessionController.advanceClock(HOUR)} />
        <Pill label="+6 h" onPress={() => SessionController.advanceClock(6 * HOUR)} />
        <Pill label="+12 h" onPress={() => SessionController.advanceClock(12 * HOUR)} />
      </View>
      <View style={styles.wrap}>
        <Text variant="labelSm" color={colors.textMuted}>Velocidad</Text>
        {SPEEDS.map((v) => <Pill key={v} label={`${v}×`} on={clockSpeed === v} onPress={() => SessionController.setClockSpeed(v)} />)}
      </View>
      <View style={styles.wrap}>
        <Pill label={pet.lampOn ? 'Apagar lámpara' : 'Encender lámpara'} onPress={() => SessionController.setLamp(!pet.lampOn)} />
        <Pill label="Jugador se va" onPress={() => SessionController.setPlayerPresent(false)} />
        <Pill label="Jugador vuelve" onPress={() => SessionController.setPlayerPresent(true)} />
      </View>

      <Text variant="labelSm" color={colors.textMuted}>Hábitos detectados (interpretación)</Text>
      {habits.length ? habits.map((h) => (
        <Line key={h.id} k={h.type} v={`${h.confidence.toFixed(2)} · ${h.evidenceCount} ep · ${h.days} d`} />
      )) : <Text style={styles.mono}>ninguno todavía</Text>}
      <Text variant="bodySm" color={colors.textMuted}>{routineHeadline(habits, pet.name)}</Text>
      {cards.map((c) => <Text key={c.id} variant="bodyXs">{c.emoji} {c.lines.join(' ')}</Text>)}

      <Text variant="labelSm" color={colors.textMuted}>Vivir días (1 min de mundo por tick, comida automática)</Text>
      <View style={styles.wrap}>
        {[1, 7, 30].map((d) => <SoftButton key={d} label={`${d} día${d > 1 ? 's' : ''}`} disabled={busy} onPress={() => void run(d)} />)}
      </View>
      <StrongButton label="Milo vs Luna · 30 días" icon="moon" disabled={busy} onPress={() => void runLab()} />
      {status ? <Text style={styles.mono}>{status}</Text> : null}
      {lab ? (<><LabResult pet={lab.milo} /><LabResult pet={lab.luna} /></>) : null}
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
  monoR: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  result: { gap: 2, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
});
