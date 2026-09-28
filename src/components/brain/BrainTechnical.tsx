/*
 * BRAIN VIEW — TÉCNICO ("Red Neuronal SNN")
 * Lee el estado REAL de la Network en cada refresco: potencial, umbral, fuga,
 * spikes del último tick, sinapsis y pesos, tick actual y un raster de los
 * últimos ticks. Pausa / Paso a paso disponibles en modo desarrollo.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { NeuronId } from '@/core/neural/Neuron';
import type { Synapse } from '@/core/neural/Synapse';
import type { GameSession } from '@/core/session/GameSession';
import { SoftButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Card, Chip } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { devStore, learningStore } from '@/state/stores';
import { alpha, colors, fonts, radius, spacing } from '@/theme';

const RASTER_TICKS = 40;

function NeuronRow({ session, id, selected, onPress, extra }: { session: GameSession; id: NeuronId; selected: boolean; onPress: () => void; extra?: string }) {
  const n = session.sim.network.neurons[id];
  const d = session.sim.brain.describe(id);
  const spiked = session.sim.network.spikedIds.includes(id);
  // Potencial al integrar (antes del reset) relativo al umbral: 1 = dispara
  const p = n.peakPotential / n.threshold;
  return (
    <Squishable onPress={onPress} scaleTo={0.99} accessibilityLabel={`${d.label}, potencial ${n.peakPotential.toFixed(2)}`} style={[styles.row, selected ? styles.rowSel : null]}>
      <View style={[styles.spike, { backgroundColor: spiked ? colors.primaryContainer : colors.surfaceContainerHighest }]} />
      <Text variant="labelSm" color={colors.textSubtle} style={styles.nid}>N{id}</Text>
      <Text variant="labelSm" numberOfLines={1} style={styles.nlabel}>{d.label}</Text>
      <View style={styles.bar}>
        <View style={styles.zero} />
        <View style={[styles.fill, p >= 0 ? { left: '20%', width: `${Math.min(80, p * 80)}%`, backgroundColor: spiked ? colors.primaryContainer : colors.tertiaryContainer } : { right: '80%', width: `${Math.min(20, -p * 20)}%`, backgroundColor: colors.error }]} />
      </View>
      <Text style={styles.num}>{extra ?? n.peakPotential.toFixed(2)}</Text>
    </Squishable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={styles.section}>
      <Text variant="labelMd" color={colors.primary} uppercase>{title}</Text>
      {children}
    </Card>
  );
}

export function BrainTechnical({ session }: { session: GameSession }) {
  const [selected, setSelected] = useState<NeuronId | null>(null);
  const [showChanged, setShowChanged] = useState(false);
  useStore(learningStore);
  const running = useStore(devStore, (d) => d.running);
  const speed = useStore(devStore, (d) => d.speed);
  const brain = session.sim.brain, net = session.sim.network;
  const readings = session.sim.sensors.lastReadings;
  const trace = session.sim.trace.all().slice(-RASTER_TICKS);
  const leak = brain.config.neuron.leak, theta = brain.config.neuron.threshold;

  const rows = (ids: NeuronId[], extra?: (id: NeuronId) => string | undefined) =>
    ids.map((id) => <NeuronRow key={id} session={session} id={id} selected={selected === id} onPress={() => setSelected(id === selected ? null : id)} extra={extra?.(id)} />);

  return (
    <View style={styles.root}>
      <Card style={styles.header}>
        <View style={styles.stats}>
          <Chip label={`Tick ${net.tickCount}`} icon="timer" bg={colors.surfaceContainerLow} color={colors.text} />
          <Chip label={`${net.neurons.length} neuronas LIF`} bg={colors.surfaceContainerLow} color={colors.textMuted} />
          <Chip label={`θ ${theta} · λ ${leak}`} bg={colors.surfaceContainerLow} color={colors.textMuted} />
          <Chip label={`${net.spikedIds.length} spikes`} dot={colors.primaryContainer} bg={colors.surfaceContainerLow} color={colors.textMuted} />
        </View>
        {__DEV__ ? (
          <View style={styles.controls}>
            <SoftButton label={running ? 'Pausar' : 'Seguir'} icon={running ? 'pause' : 'play'} tone="lavender" onPress={() => SessionController.setRunning(!running)} />
            <SoftButton label="Paso" icon="step" onPress={() => SessionController.step()} />
            {[0.5, 1, 2, 4].map((s) => (
              <Squishable key={s} onPress={() => SessionController.setSpeed(s)} style={[styles.speed, speed === s ? styles.speedOn : null]}>
                <Text variant="labelSm" color={speed === s ? colors.onPrimaryContainer : colors.textMuted}>{s}×</Text>
              </Squishable>
            ))}
          </View>
        ) : null}
        <Text variant="bodyXs" color={colors.textSubtle}>La barra muestra el potencial integrado respecto al umbral (derecha = dispara; rojo = inhibición).</Text>
      </Card>

      {selected !== null ? <Inspector session={session} id={selected} onSelect={setSelected} /> : null}

      <Card style={styles.section}>
        <View style={styles.rowBetween}>
          <Text variant="labelMd" color={colors.primary} uppercase>Aprendizaje · {session.plasticity.experiencesApplied} experiencias</Text>
          <SoftButton label={showChanged ? 'Ocultar' : 'Conexiones que más cambiaron'} onPress={() => setShowChanged(!showChanged)} />
        </View>
        {showChanged ? (
          session.plasticity.topChanged(12).length ? session.plasticity.topChanged(12).map((e) => (
            <Squishable key={e.key} onPress={() => setSelected(e.synapse.toNeuron)} style={styles.syn} scaleTo={0.98}>
              <Text variant="labelSm" numberOfLines={1} style={{ flex: 1 }}>{e.key} <Text variant="labelXs" color={colors.textSubtle}>N{e.synapse.fromNeuron}→N{e.synapse.toNeuron}</Text></Text>
              <SynapseNumbers syn={e.synapse} />
            </Squishable>
          )) : <Text variant="bodySm" color={colors.textMuted}>Todavía no ha cambiado ninguna conexión.</Text>
        ) : null}
      </Card>

      <GrowthBrainCard session={session} />

      <ContextPathways session={session} onSelect={setSelected} />

      <Section title="Capa 1 · Sensores">{rows(brain.sensorLayer.map((n) => n.id), (id) => {
        const r = readings.find((x) => x.neuron === id);
        return r ? r.value.toFixed(2) : undefined;
      })}</Section>
      <Section title="Capa 2 · Circuitos">{rows(brain.circuitLayer.map((n) => n.id))}</Section>
      <Section title="Capa 3 · Acciones">{rows(brain.outputLayer.map((n) => n.id))}</Section>

      <Section title={`Raster · últimos ${trace.length} ticks`}>
        {[...brain.circuitLayer, ...brain.outputLayer].map((n) => (
          <View key={n.id} style={styles.rasterRow}>
            <Text style={styles.rasterLabel} numberOfLines={1}>{brain.tag(n.id)}</Text>
            <View style={styles.rasterTrack}>
              {trace.map((e, i) => e.spiked.includes(n.id) ? (
                <View key={i} style={[styles.rasterDot, { left: `${(i / RASTER_TICKS) * 100}%`, backgroundColor: brain.outputNeuronToAction[n.id] ? colors.primary : colors.tertiary }]} />
              ) : null)}
            </View>
          </View>
        ))}
      </Section>
    </View>
  );
}

function Inspector({ session, id, onSelect }: { session: GameSession; id: NeuronId; onSelect: (id: NeuronId) => void }) {
  const net = session.sim.network, brain = session.sim.brain;
  const n = net.neurons[id], d = brain.describe(id);
  const incoming = net.incoming(id).filter((s) => s.weight !== 0).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 12);
  const outgoing = net.outgoing(id).filter((s) => s.weight !== 0).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 8);
  const syn = (other: NeuronId, s: Synapse, key: string) => (
    <Squishable key={key} onPress={() => onSelect(other)} style={styles.syn} scaleTo={0.98}>
      <Text variant="labelSm" numberOfLines={1} style={{ flex: 1 }}>{brain.describe(other).label} <Text variant="labelXs" color={colors.textSubtle}>N{other}{s.plastic ? ' · plástica' : ''}</Text></Text>
      {s.plastic ? <SynapseNumbers syn={s} /> : (
        <Text style={[styles.num, { color: s.weight > 0 ? colors.secondary : colors.error }]}>{s.weight > 0 ? '+' : ''}{s.weight.toFixed(2)}</Text>
      )}
    </Squishable>
  );
  return (
    <Card tone="warm" style={styles.section}>
      <Text variant="labelMd" color={colors.primary} uppercase>Inspector · N{id} ({d.role})</Text>
      <Text variant="headlineSm">{d.label}</Text>
      <View style={styles.stats}>
        <Chip small label={`potencial ${n.potential.toFixed(3)}`} bg={colors.card} color={colors.text} />
        <Chip small label={`pico ${n.peakPotential.toFixed(3)}`} bg={colors.card} color={colors.text} />
        <Chip small label={`umbral ${n.threshold}`} bg={colors.card} color={colors.text} />
        <Chip small label={`fuga ${n.leak}`} bg={colors.card} color={colors.text} />
        <Chip small label={`input ${n.lastInput.toFixed(3)}`} bg={colors.card} color={colors.text} />
        <Chip small label={`último spike t${n.lastSpikeTick}`} bg={colors.card} color={colors.text} />
        <Chip small label={`${n.spikeCount} spikes`} bg={colors.card} color={colors.text} />
      </View>
      {incoming.length ? <Text variant="labelSm" color={colors.textMuted}>Sinapsis entrantes (peso)</Text> : null}
      {incoming.map((s) => syn(s.fromNeuron, s, `i${s.fromNeuron}`))}
      {outgoing.length ? <Text variant="labelSm" color={colors.textMuted}>Sinapsis salientes (peso)</Text> : null}
      {outgoing.map((s) => syn(s.toNeuron, s, `o${s.toNeuron}`))}
    </Card>
  );
}

// v6: el cerebro a lo largo del crecimiento (la etapa modula la plasticidad; los pesos no se reinician)
function GrowthBrainCard({ session }: { session: GameSession }) {
  const g = session.growth;
  const learned = session.plasticity.entries.filter((e) => Math.abs(e.synapse.lifetimeDelta) > 1e-4).length;
  const blocked = Object.entries(g.blockedCounts).map(([a, n]) => `${a}×${n}`).join(' ') || '—';
  const stages = g.state.history.map((h) => `${h.stage} (día ${h.petDay})`).join(' → ');
  return (
    <Card style={styles.section}>
      <Text variant="labelMd" color={colors.primary} uppercase>Desarrollo del cerebro</Text>
      <Text style={styles.small}>Etapa: {g.stage} · desarrollo de la etapa {(g.progress * 100).toFixed(0)} % · plasticidad ×{g.plasticityMultiplier.toFixed(2)}</Text>
      <Text style={styles.small}>Experiencias vividas: {session.memory.experiences.length} · aprendidas (con cambio de pesos): {session.plasticity.experiencesApplied} · sinapsis que cambiaron: {learned} de {session.plasticity.entries.length}</Text>
      <Text style={styles.small}>Salidas que el cuerpo aún no puede ejecutar: {blocked}</Text>
      <Text style={styles.small}>Historia: {stages}</Text>
      <Text style={styles.small}>Cerebro inicial vs actual: ver «Conexiones que más cambiaron» (inicial → actual).</Text>
    </Card>
  );
}

// v5: vías de CONTEXTO (hora, luz, lugar, actividad) → descanso/actividad: inicial → actual.
// Muestra lo que aprendió sobre "cuándo/dónde" sin interpretarlo.
const CONTEXT_ROWS = ['time00', 'time04', 'time08', 'time12', 'time16', 'time20', 'lightLevel', 'darkness', 'zoneBed', 'recentActivity'] as const;
const CONTEXT_TARGETS = ['restCircuit', 'activityCircuit'] as const;

function ContextPathways({ session, onSelect }: { session: GameSession; onSelect: (id: NeuronId) => void }) {
  const [open, setOpen] = useState(false);
  const entries = session.plasticity.entries.filter((e) => (CONTEXT_ROWS as readonly string[]).includes(e.from) && (CONTEXT_TARGETS as readonly string[]).includes(e.to));
  return (
    <Card style={styles.section}>
      <View style={styles.rowBetween}>
        <Text variant="labelMd" color={colors.primary} uppercase>Contexto · hora, luz, lugar</Text>
        <SoftButton label={open ? 'Ocultar' : 'Ver vías'} onPress={() => setOpen(!open)} />
      </View>
      {open ? entries.map((e) => (
        <Squishable key={e.key} onPress={() => onSelect(e.synapse.toNeuron)} style={styles.syn} scaleTo={0.98}>
          <Text variant="labelSm" numberOfLines={1} style={{ flex: 1 }}>{e.key}</Text>
          <SynapseNumbers syn={e.synapse} />
        </Squishable>
      )) : null}
    </Card>
  );
}

// Datos REALES de una sinapsis plástica: inicial → actual (Δ de por vida), elegibilidad, última recompensa
function SynapseNumbers({ syn }: { syn: Synapse }) {
  const d = syn.lifetimeDelta;
  return (
    <View style={styles.synNums}>
      <Text style={styles.small}>{syn.initialWeight.toFixed(3)} → {syn.weight.toFixed(3)}</Text>
      <Text style={[styles.small, { color: d > 0 ? colors.secondary : d < 0 ? colors.error : colors.textSubtle }]}>Δ {d >= 0 ? '+' : ''}{d.toFixed(3)}</Text>
      <Text style={styles.small}>e {syn.eligibility.toFixed(2)} · últ. e {syn.lastEligibility.toFixed(2)} · r {syn.lastReward >= 0 ? '+' : ''}{syn.lastReward.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  synNums: { alignItems: 'flex-end' },
  small: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' },
  root: { gap: spacing.md },
  header: { gap: spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  speed: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  speedOn: { backgroundColor: colors.primaryContainer },
  section: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 4, borderRadius: radius.sm },
  rowSel: { backgroundColor: alpha(colors.primaryFixed, 0.8) },
  spike: { width: 8, height: 8, borderRadius: 4 },
  nid: { width: 30 },
  nlabel: { width: 108 },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceContainerHigh, overflow: 'hidden' },
  zero: { position: 'absolute', left: '20%', top: 0, bottom: 0, width: 1, backgroundColor: colors.outlineVariant },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  num: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.textMuted, width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] },
  rasterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 12 },
  rasterLabel: { width: 110, fontSize: 9, fontFamily: fonts.bodySemi, color: colors.textMuted },
  rasterTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceContainerLow, borderRadius: 2 },
  rasterDot: { position: 'absolute', top: 1, width: 5, height: 6, borderRadius: 1 },
  syn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: alpha('#ffffff', 0.6) },
});
