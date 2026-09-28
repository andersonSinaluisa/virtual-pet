/*
 * DESCUBRIENDO A MILO (Stitch: descubriendo_a_milo)
 * Los rasgos NO se eligen ni se guardan como etiqueta: se calculan de sus
 * pesos + la conducta observada (computeTraits) y solo se revelan con
 * evidencia suficiente. El "Diario de preferencias" muestra la evidencia real.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { interpretObjectPreferences } from '@/core/discovery/PersonalityInterpreter';
import { subjectEmoji, subjectName } from '@/core/memory/subjects';
import { GrowthSection } from '@/components/growth/GrowthSection';
import { RoutineSection } from '@/components/routines/RoutineSection';
import { AppHeader } from '@/components/ui/AppHeader';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SoftButton, StrongButton } from '@/components/ui/Buttons';
import { Icon, iconFor } from '@/components/ui/Icon';
import { TAB_BAR_SPACE } from '@/components/ui/MiloTabBar';
import { PetAvatar } from '@/components/ui/PetAvatar';
import { Card, Chip, IconBadge } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { memoryStore, petStore } from '@/state/stores';
import { accents, alpha, colors, radius, shadows, spacing } from '@/theme';

export default function DiscoveringMilo() {
  useStore(memoryStore);
  const pet = useStore(petStore);
  const [diary, setDiary] = useState(false);
  const session = SessionController.current;
  if (!pet || !session) return null;
  const traits = session.traits();
  const revealed = traits.filter((t) => t.revealed);
  const hidden = traits.filter((t) => !t.revealed);
  const last = session.memory.discoveries[0];
  const prefs = session.memory.preferences().sort((a, b) => b.score - a.score);
  // Interpretación (no decide nada): cuánto cambió el cerebro con cada objeto
  const brainByKind = new Map(interpretObjectPreferences(session.memory, session.plasticity).map((o) => [o.kind as string, o.brain]));

  return (
    <View style={styles.root}>
      <AppHeader title={pet.name} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_SPACE + spacing.md }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <PetAvatar species={pet.species} size={112} />
          <Chip label="Naturaleza: en formación activa" dot={colors.secondary} small bg={colors.secondaryContainer} color={colors.onSecondaryContainer} style={styles.center} />
          <Text variant="headlineLg" align="center">Descubriendo a {pet.name}</Text>
          <Text variant="bodyMd" color={colors.textMuted} align="center">Juega con {pet.name} y descubre cómo es. ⭐ {revealed.length} de {traits.length}</Text>
        </View>

        <View style={styles.sectionHead}>
          <Text variant="headlineMd">✨ Así es {pet.name}</Text>
        </View>
        {revealed.length === 0 ? (
          <Card tone="muted"><Text variant="bodySm" color={colors.textMuted}>Todavía lo estás conociendo. ¡Juega con él y acarícialo!</Text></Card>
        ) : revealed.map((t) => (
          <Card key={t.key} style={styles.trait}>
            <IconBadge icon={iconFor(t.icon)} bg={accents[t.accent].bg} color={accents[t.accent].fg} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headlineSm">{t.label}</Text>
              <Text variant="bodySm" color={colors.textMuted}>{t.description}</Text>
              <View style={styles.row}>
                <Icon name="verified" size={14} color={colors.secondary} />
                <Text variant="labelSm" color={colors.secondary}>Lo has visto {t.evidence} veces</Text>
              </View>
            </View>
          </Card>
        ))}

        {hidden.length ? (
          <Card tone="muted" style={styles.trait}>
            <Text style={{ fontSize: 28 }}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSm">{hidden.length} secretos por descubrir</Text>
              <Text variant="bodySm" color={colors.textMuted}>Aparecerán cuando lo conozcas mejor.</Text>
            </View>
          </Card>
        ) : null}

        <GrowthSection session={session} />

        <RoutineSection session={session} name={pet.name} />

        {last ? (
          <View style={styles.last}>
            <View style={styles.row}><Icon name="star" size={16} color={colors.primary} /><Text variant="labelSm" color={colors.primary} uppercase>Último descubrimiento</Text></View>
            <View style={styles.lastRow}>
              <IconBadge icon={iconFor(last.icon, 'heart')} bg={colors.primaryContainer} color={colors.card} size={52} />
              <View style={{ flex: 1 }}>
                <Text variant="headlineSm">{last.title}</Text>
                <Text variant="bodySm" color={colors.textMuted}>{last.text}</Text>
              </View>
            </View>
            <StrongButton label="Abrir Diario de Preferencias" icon="menuBook" onPress={() => setDiary(true)} />
          </View>
        ) : (
          <SoftButton label="Abrir Diario de Preferencias" icon="menuBook" onPress={() => setDiary(true)} />
        )}
      </ScrollView>

      <BottomSheet visible={diary} onClose={() => setDiary(false)} title="Diario de preferencias" subtitle="Evidencia acumulada de sus experiencias.">
        {prefs.length === 0 ? <Text variant="bodySm" color={colors.textMuted}>Aún no hay suficientes experiencias.</Text> : prefs.map((p) => (
          <View key={p.subject} style={styles.pref}>
            <Text style={styles.prefEmoji}>{subjectEmoji(p.subject)}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="labelLg">{subjectName(p.subject)}</Text>
              <View style={styles.prefBar}>
                <View style={styles.prefZero} />
                <View style={[styles.prefFill, p.score >= 0 ? { left: '50%', width: `${Math.min(50, p.score * 50)}%`, backgroundColor: colors.secondaryFixedDim } : { right: '50%', width: `${Math.min(50, -p.score * 50)}%`, backgroundColor: colors.rose }]} />
              </View>
              <Text variant="bodyXs" color={colors.textMuted}>{p.positive} buenas · {p.negative} difíciles · {p.interactions} en total</Text>
              {(brainByKind.get(p.subject) ?? 0) > 0.05 ? <Text variant="bodyXs" color={colors.tertiary}>🧠 Su cerebro ya lo asocia con cosas buenas</Text> : null}
            </View>
          </View>
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.margin, gap: spacing.md },
  hero: {
    alignItems: 'center', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.xxl, ...shadows.card,
    experimental_backgroundImage: `linear-gradient(160deg, ${colors.surfaceContainerLowest} 40%, ${alpha(colors.secondaryContainer, 0.5)} 100%)`,
  },
  center: { alignSelf: 'center' },
  stats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  divider: { width: 1, backgroundColor: colors.outlineVariant },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  trait: { flexDirection: 'row', gap: spacing.md },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceContainerHighest, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.tertiaryContainer },
  last: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.xl, ...shadows.card, experimental_backgroundImage: `linear-gradient(135deg, ${colors.primaryFixed} 0%, ${colors.surfaceContainerLowest} 100%)` },
  lastRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  pref: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  prefEmoji: { fontSize: 28 },
  prefBar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceContainerHigh, overflow: 'hidden' },
  prefZero: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: colors.outline },
  prefFill: { position: 'absolute', top: 0, bottom: 0 },
});
