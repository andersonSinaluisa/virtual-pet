/*
 * LEARNING LAB (solo desarrollo): control y observación del aprendizaje con
 * datos REALES del core. Se refresca con los snapshots (≤ 4 Hz) y con la
 * versión de aprendizaje (≤ 1 Hz), nunca por cada cambio de peso.
 */
import { useState } from 'react';
import { Alert, Share, StyleSheet, Switch, TextInput, View } from 'react-native';

import type { PreferenceReport } from '@/core/learning/experiments';
import { computeTelemetry } from '@/core/learning/Telemetry';
import { SoftButton, StrongButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { learningStore, petStore } from '@/state/stores';
import { colors, fonts, radius, spacing } from '@/theme';

const RATES = [0.01, 0.02, 0.04, 0.08, 0.16];

function Pill({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Squishable onPress={onPress} style={[styles.pill, on ? styles.pillOn : null]}>
      <Text variant="labelSm" color={on ? colors.onPrimaryContainer : colors.text}>{label}</Text>
    </Squishable>
  );
}

const f3 = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`;

export function LearningLab() {
  useStore(learningStore);
  useStore(petStore, (p) => p?.tick); // refresco con los ticks
  const [json, setJson] = useState('');
  const [sim, setSim] = useState<{ status: string; result?: { base: PreferenceReport; ball: PreferenceReport; teddy: PreferenceReport } } | null>(null);
  const s = SessionController.current;
  if (!s) return null;
  const p = s.plasticity;
  const eligible = [...p.entries].filter((e) => e.synapse.eligibility > 0.01).sort((a, b) => b.synapse.eligibility - a.synapse.eligibility).slice(0, 8);
  const tel = computeTelemetry(s);

  const share = async (text: string, title: string) => { await Share.share({ message: text, title }); };
  const runSim = async () => {
    setSim({ status: 'Preparando…' });
    const result = await SessionController.runLearningSimulation(60, (status) => setSim({ status }));
    setSim({ status: 'Listo', result });
  };

  return (
    <>
      <Card style={styles.card}>
        <Text variant="labelMd" color={colors.primary} uppercase>Aprendizaje</Text>
        <View style={styles.row}>
          <Text variant="labelMd" style={{ flex: 1 }}>Learning {p.enabled ? 'ON' : 'OFF'}{p.frozen ? ' · evaluación (congelado)' : ''}</Text>
          <Switch value={p.enabled} onValueChange={(v) => SessionController.setLearningEnabled(v)} />
        </View>
        <View style={styles.wrap}>
          <Text variant="labelSm" color={colors.textMuted}>Learning rate</Text>
          {RATES.map((r) => <Pill key={r} label={String(r)} on={Math.abs(p.learningRate - r) < 1e-9} onPress={() => SessionController.setLearningRate(r)} />)}
        </View>
        <View style={styles.wrap}>
          <SoftButton label="Inject Reward +1" tone="mint" onPress={() => SessionController.injectReward(1)} />
          <SoftButton label="Inject Reward −1" onPress={() => SessionController.injectReward(-1)} />
        </View>
        <Text variant="bodyXs" color={colors.textMuted}>
          {p.experiencesApplied} experiencias aplicadas · Σ|Δw| {p.totalAbsDelta.toFixed(3)} · {tel.changedCount}/{tel.plasticCount} sinapsis cambiadas
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text variant="labelMd" color={colors.primary} uppercase>Elegibilidad ahora</Text>
        {eligible.length ? eligible.map((e) => (
          <View key={e.key} style={styles.line}>
            <Text style={styles.mono} numberOfLines={1}>{e.key}</Text>
            <View style={styles.bar}><View style={[styles.fill, { width: `${Math.round(e.synapse.eligibility * 100)}%` }]} /></View>
            <Text style={styles.monoR}>{e.synapse.eligibility.toFixed(2)}</Text>
          </View>
        )) : <Text variant="bodySm" color={colors.textMuted}>Ninguna sinapsis plástica ha participado en los últimos ticks.</Text>}
      </Card>

      <Card style={styles.card}>
        <Text variant="labelMd" color={colors.primary} uppercase>Cambios de peso (de por vida)</Text>
        {p.topChanged(10).map((e) => (
          <View key={e.key} style={styles.line}>
            <Text style={styles.mono} numberOfLines={1}>{e.key}</Text>
            <Text style={styles.monoR}>{e.synapse.initialWeight.toFixed(3)} → {e.synapse.weight.toFixed(3)} ({f3(e.synapse.lifetimeDelta)})</Text>
          </View>
        ))}
        <SoftButton label="Reset Learned Weights" onPress={() => Alert.alert('¿Olvidar lo aprendido?', 'Los pesos plásticos vuelven a los iniciales. La memoria no se toca.', [
          { text: 'Cancelar', style: 'cancel' }, { text: 'Resetear', style: 'destructive', onPress: () => SessionController.resetLearnedWeights() }])} />
      </Card>

      <Card style={styles.card}>
        <Text variant="labelMd" color={colors.primary} uppercase>Learning Inspector</Text>
        {p.log.slice(0, 8).map((ev) => (
          <View key={ev.id} style={styles.event}>
            <Text variant="labelSm">{ev.source.toUpperCase()}{ev.subject ? ` · ${ev.subject}` : ''} <Text variant="labelSm" color={ev.reward >= 0 ? colors.secondary : colors.error}>reward {f3(ev.reward)}</Text></Text>
            {ev.changes.slice(0, 4).map((c) => (
              <Text key={c.key} style={styles.mono}>{c.key}: {c.before.toFixed(3)} {f3(c.delta)} → {c.after.toFixed(3)} (e {c.eligibility.toFixed(2)})</Text>
            ))}
            {ev.changedCount > 4 ? <Text style={styles.mono}>… y {ev.changedCount - 4} más{ev.capped ? ' · tope por experiencia' : ''}{ev.homeostasis ? ` · homeostasis ${ev.homeostasis}` : ''}</Text> : null}
          </View>
        ))}
        {!p.log.length ? <Text variant="bodySm" color={colors.textMuted}>Aún no hay eventos de aprendizaje.</Text> : null}
      </Card>

      <Card style={styles.card}>
        <Text variant="labelMd" color={colors.primary} uppercase>Telemetría local ({tel.window} ticks)</Text>
        <Text style={styles.mono}>spikes/neurona/tick · sensores {tel.spikeRate.sensors.toFixed(3)} · circuitos {tel.spikeRate.circuits.toFixed(3)} · salidas {tel.spikeRate.outputs.toFixed(3)}</Text>
        <Text style={styles.mono}>potencial medio · {tel.avgPotential.sensors.toFixed(2)} / {tel.avgPotential.circuits.toFixed(2)} / {tel.avgPotential.outputs.toFixed(2)}</Text>
        <Text style={styles.mono}>salidas más frecuentes · {tel.topOutputs.map((o) => `${o.action} ${(o.rate * 100).toFixed(0)}%`).join(' · ')}</Text>
        <Text style={styles.mono}>pesos plásticos · {tel.weightHistogram.map((b) => b.count).join(' ')}  ({tel.weightHistogram[0].from}…{tel.weightHistogram[tel.weightHistogram.length - 1].to})</Text>
        <Text style={styles.mono}>Δ de por vida · {tel.deltaHistogram.map((b) => b.count).join(' ')} · media |Δ| {tel.meanAbsDelta.toFixed(4)}</Text>
        <Text style={styles.mono}>recompensas (−1…1) · {tel.rewardHistogram.join(' ')}</Text>
      </Card>

      <Card style={styles.card}>
        <Text variant="labelMd" color={colors.primary} uppercase>Cerebro: exportar / importar</Text>
        <View style={styles.wrap}>
          <SoftButton label="Export Brain" onPress={() => { const j = SessionController.exportBrain(true); if (j) void share(j, 'milo-brain.json'); }} />
          <SoftButton label="Clone Pet Brain" onPress={() => { const j = SessionController.exportBrain(false); if (j) { setJson(j); void share(j, 'milo-brain-clone.json'); } }} />
        </View>
        <TextInput value={json} onChangeText={setJson} placeholder="Pega aquí un cerebro exportado (JSON)" placeholderTextColor={colors.textSubtle} multiline style={styles.input} />
        <StrongButton label="Import Brain" disabled={!json.trim()} onPress={() => {
          try { SessionController.importBrain(json.trim()); setJson(''); Alert.alert('Cerebro importado', 'Pesos iniciales y aprendidos aplicados a esta mascota.'); }
          catch (e) { Alert.alert('No válido', e instanceof Error ? e.message : String(e)); }
        }} />
      </Card>

      <Card style={styles.card}>
        <Text variant="labelMd" color={colors.primary} uppercase>Run Learning Simulation</Text>
        <Text variant="bodyXs" color={colors.textMuted}>Dos copias nuevas con el mismo cerebro: una juega con ⚽, otra con 🧸. No afecta a tu mascota.</Text>
        <StrongButton label={sim && sim.status !== 'Listo' ? sim.status : 'Ejecutar'} disabled={!!sim && sim.status !== 'Listo'} onPress={() => void runSim()} />
        {sim?.result ? (
          <View>
            <Text style={styles.mono}>cuota ⚽ sin entrenar: {sim.result.base.share.toFixed(3)}</Text>
            <Text style={styles.mono}>cuota ⚽ tras jugar con ⚽: {sim.result.ball.share.toFixed(3)}</Text>
            <Text style={styles.mono}>cuota ⚽ tras jugar con 🧸: {sim.result.teddy.share.toFixed(3)}</Text>
          </View>
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  pillOn: { backgroundColor: colors.primaryContainer },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mono: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  monoR: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  bar: { width: 70, height: 6, borderRadius: 3, backgroundColor: colors.surfaceContainerHigh, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.tertiaryContainer },
  event: { gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.divider },
  input: { minHeight: 80, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.vanilla, fontFamily: fonts.body, fontSize: 12, color: colors.text, textAlignVertical: 'top' },
});
