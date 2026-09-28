/*
 * GROWTH INSPECTOR (solo desarrollo; la pantalla /dev redirige fuera de __DEV__).
 * Estado real del crecimiento + herramientas para estudiarlo sin esperar
 * semanas. La vista previa visual NO cambia el desarrollo real.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LIFE_STAGES } from '@/core/growth/LifeStage';
import { SoftButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { devStore, learningStore, petStore } from '@/state/stores';
import { colors, fonts, radius, spacing } from '@/theme';

const DAY = 86_400_000;
const PREVIEW = [0, 0.5, 1, 1.5, 2, 2.5, 3];

function Pill({ label, on, onPress, disabled }: { label: string; on?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Squishable onPress={onPress} disabled={disabled} style={[styles.pill, on ? styles.pillOn : null]}>
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

export function GrowthLab() {
  useStore(learningStore);
  const pet = useStore(petStore);
  const preview = useStore(devStore, (d) => d.growthPreview);
  const [status, setStatus] = useState<string | null>(null);
  const s = SessionController.current;
  if (!s || !pet) return null;
  const g = s.growth, now = SessionController.clock.now();
  const el = s.growthEligibility(now);
  const last = s.lastGrowth;
  const busy = status !== null;
  const days = async (n: number) => {
    setStatus(`Viviendo ${n} día(s)…`);
    try { await SessionController.fastForwardDays(n, setStatus); } finally { setStatus(null); }
  };

  return (
    <Card style={styles.card}>
      <Text variant="labelMd" color={colors.primary} uppercase>Crecimiento</Text>
      <Line k="etapa" v={`${g.stage}${g.state.pending ? ` · pendiente → ${g.state.pending.to}` : ''}`} />
      <Line k="edad cronológica" v={`${(g.ageMs(now) / DAY).toFixed(1)} d · en la etapa ${(g.timeInStage(now) / DAY).toFixed(1)} / ${(g.minDurationMs() / DAY).toFixed(1)} d`} />
      <Line k="desarrollo de la etapa" v={`${(g.progress * 100).toFixed(1)} % (${g.state.development.points.toFixed(1)} pt) · hoy ${g.state.development.dayPoints.toFixed(1)}`} />
      <Line k="elegible" v={`${el.eligible ? 'sí' : 'no'} · edad ${el.ageOk ? '✓' : '✗'} · desarrollo ${el.developmentOk ? '✓' : '✗'}`} />
      <Line k="plasticidad" v={`×${g.plasticityMultiplier.toFixed(2)}`} />
      <Line k="variación individual" v={`ritmo ×${g.state.modifiers.growthRate.toFixed(3)} · tamaño ×${g.state.modifiers.size.toFixed(3)} · desarrollo ×${g.state.modifiers.development.toFixed(3)}`} />
      <Line k="visual" v={`${g.visualValue(now).toFixed(2)}${preview !== null ? ` (vista previa ${preview})` : ''}`} />

      <Text variant="labelSm" color={colors.textMuted}>Desarrollo</Text>
      <View style={styles.wrap}>
        {[0, 0.5, 0.9, 1].map((p) => <Pill key={p} label={`${p * 100}%`} onPress={() => SessionController.devGrowth('progress', p)} />)}
        <Pill label="+5 pt" onPress={() => SessionController.devGrowth('add', 5)} />
        <Pill label="Edad mínima ✓" onPress={() => SessionController.devGrowth('age')} />
        <Pill label="Hacer elegible" onPress={() => SessionController.devGrowth('eligible')} />
        <Pill label="Crecer ahora" onPress={() => SessionController.devGrowth('trigger')} />
      </View>

      <Text variant="labelSm" color={colors.textMuted}>Vista previa (solo pantalla)</Text>
      <View style={styles.wrap}>
        <Pill label="Real" on={preview === null} onPress={() => SessionController.setGrowthPreview(null)} />
        {PREVIEW.map((v) => <Pill key={v} label={Number.isInteger(v) ? LIFE_STAGES[v] : String(v)} on={preview === v} onPress={() => SessionController.setGrowthPreview(v)} />)}
      </View>

      <Text variant="labelSm" color={colors.textMuted}>Simular desarrollo</Text>
      <View style={styles.wrap}>
        {[1, 7, 30].map((n) => <SoftButton key={n} label={`${n} día${n > 1 ? 's' : ''}`} disabled={busy} onPress={() => void days(n)} />)}
        {[100, 500].map((n) => <SoftButton key={n} label={`${n} exp.`} disabled={busy} onPress={() => { s.devSimulateExperiences(n); SessionController.devGrowth('add', 0); }} />)}
      </View>
      {status ? <Text style={styles.mono}>{status}</Text> : null}

      <Text variant="labelSm" color={colors.textMuted}>Cerebro antes / después del último crecimiento</Text>
      {last ? (
        <>
          <Line k={`${last.from} → ${last.to} (día ${last.petDay})`} v={last.brainPreserved ? 'pesos idénticos ✓' : 'PESOS CAMBIARON ✗'} />
          <Line k="hash" v={`${last.before.weightsHash.slice(0, 8)} → ${last.after.weightsHash.slice(0, 8)}`} />
          <Line k="recuerdos / experiencias" v={`${last.before.moments}/${last.before.experiences} → ${last.after.moments}/${last.after.experiences}`} />
        </>
      ) : <Text style={styles.mono}>todavía no ha crecido en esta sesión</Text>}
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
