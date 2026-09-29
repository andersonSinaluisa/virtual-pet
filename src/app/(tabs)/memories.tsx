/*
 * NUESTROS RECUERDOS (Stitch: nuestros_recuerdos)
 * Línea de tiempo con filtros (Todos / Favoritos / Hitos clave), tarjetas de
 * recuerdo y la invitación a capturar un momento nuevo.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import type { Moment } from '@/core/memory/types';
import { MemoryCard } from '@/components/memories/MemoryCard';
import { AppHeader } from '@/components/ui/AppHeader';
import { StrongButton } from '@/components/ui/Buttons';
import { Icon, iconFor } from '@/components/ui/Icon';
import { TAB_BAR_SPACE } from '@/components/ui/MiloTabBar';
import { Squishable } from '@/components/ui/Squishable';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { memoryStore } from '@/state/stores';
import { alpha, colors, radius, shadows, spacing } from '@/theme';

type Filter = 'all' | 'fav' | 'key';

export default function Memories() {
  useStore(memoryStore);
  const [filter, setFilter] = useState<Filter>('all');
  const all = SessionController.current?.memory.moments ?? [];
  const list = all.filter((m) => filter === 'all' || (filter === 'fav' ? m.favorite : m.keyMoment));
  const oldestId = all[all.length - 1]?.id;

  const header = (
    <View style={styles.head}>
      <Text variant="headlineLg">📖 Nuestros Recuerdos</Text>
      <View style={styles.filters} accessibilityRole="tablist">
        {([['all', `Todos (${all.length})`], ['fav', '❤️ Favoritos'], ['key', '⭐ Especiales']] as const).map(([k, label]) => (
          <Squishable key={k} accessibilityRole="tab" accessibilityState={{ selected: filter === k }} onPress={() => setFilter(k)}
            style={[styles.filter, filter === k ? styles.filterOn : null]}>
            <Text variant="labelMd" color={filter === k ? colors.onPrimary : colors.text}>{label}</Text>
          </Squishable>
        ))}
      </View>
    </View>
  );

  // v7: los lugares y lo que ha descubierto en ellos (sin números)
  const places = (
    <Squishable onPress={() => router.push('/world')} accessibilityLabel="Lugares y descubrimientos">
      <Card tone="warm" style={styles.capture}>
        <View style={styles.camera}><Icon name="explore" size={26} color={colors.onPrimaryContainer} /></View>
        <View style={{ flex: 1 }}>
          <Text variant="headlineSm">🗺️ Lugares y descubrimientos</Text>
          <Text variant="bodySm" color={colors.textMuted}>Lo que conoce de su mundo</Text>
        </View>
      </Card>
    </Squishable>
  );

  const capture = (
    <Card style={styles.capture}>
      <View style={styles.camera}><Icon name="camera" size={26} color={colors.onPrimaryContainer} /></View>
      <View style={{ flex: 1 }}>
        <Text variant="headlineSm">📸 ¡Hazle una foto!</Text>
      </View>
      <StrongButton label="Capturar" icon="camera" onPress={() => router.navigate({ pathname: '/', params: { capture: '1' } })} />
    </Card>
  );

  return (
    <View style={styles.root}>
      <AppHeader title="Recuerdos" />
      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={<View style={{ gap: spacing.md }}>{header}{places}</View>}
        ListFooterComponent={capture}
        ListEmptyComponent={<Text variant="bodyMd" color={colors.textMuted} align="center" style={{ padding: spacing.xl }}>Aún no hay recuerdos aquí.</Text>}
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_SPACE + spacing.md }]}
        renderItem={({ item }) => <TimelineItem moment={item} first={item.id === oldestId} />}
        initialNumToRender={4}
        windowSize={7}
      />
    </View>
  );
}

function TimelineItem({ moment, first }: { moment: Moment; first: boolean }) {
  return (
    <View style={styles.item}>
      <View style={styles.rail}>
        <View style={[styles.node, moment.keyMoment ? styles.nodeKey : null]}>
          <Icon name={iconFor(moment.icon)} size={16} color={moment.keyMoment ? colors.onPrimary : colors.primary} />
        </View>
        <View style={styles.line} />
      </View>
      <View style={{ flex: 1 }}><MemoryCard moment={moment} first={first} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.margin, gap: spacing.md },
  head: { gap: spacing.sm, marginBottom: spacing.sm },
  headChips: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  filters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surfaceContainerLow },
  filterOn: { backgroundColor: colors.primary },
  item: { flexDirection: 'row', gap: spacing.sm },
  rail: { width: 32, alignItems: 'center' },
  node: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryFixed, alignItems: 'center', justifyContent: 'center', marginTop: 10, ...shadows.soft },
  nodeKey: { backgroundColor: colors.primary },
  line: { flex: 1, width: 3, marginTop: 4, marginBottom: -spacing.md, borderRadius: 2, backgroundColor: alpha(colors.secondaryFixed, 0.8) },
  capture: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, experimental_backgroundImage: `linear-gradient(90deg, ${colors.primaryFixed} 0%, ${colors.surfaceContainerLowest} 100%)` },
  camera: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
});
