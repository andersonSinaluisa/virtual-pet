/*
 * Detalle de un recuerdo (modal): imagen grande, relato completo, etiquetas,
 * favorito y las experiencias reales que lo originaron.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gameInfo } from '@/core/games/catalog';
import { formatWhen, MomentImage } from '@/components/memories/MemoryCard';
import { IconButton, SecondaryButton } from '@/components/ui/Buttons';
import { Chip } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { memoryStore } from '@/state/stores';
import { colors, spacing } from '@/theme';

export default function MemoryDetail() {
  useStore(memoryStore);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const session = SessionController.current;
  const m = session?.memory.moment(id);
  if (!session || !m) {
    return <View style={styles.root}><Text variant="bodyMd" align="center" style={{ marginTop: 80 }}>Este recuerdo ya no existe.</Text></View>;
  }
  const exps = session.memory.experiences.filter((e) => m.experienceIds.includes(e.id));

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.top}>
          <Chip label={m.keyMoment ? 'Hito clave' : 'Recuerdo'} icon={m.keyMoment ? 'verified' : 'book'} bg={colors.primaryFixed} color={colors.primary} />
          <IconButton icon="close" label="Cerrar" size={40} bg={colors.surfaceContainerHigh} color={colors.text} onPress={() => router.back()} />
        </View>
        <MomentImage moment={m} height={280} />
        <Text variant="headlineLg">{m.title}</Text>
        <Text variant="labelMd" color={colors.textMuted}>Día {m.day} · {formatWhen(m.createdAt)}{m.gameId ? ` · ${gameInfo(m.gameId).title}` : ''}</Text>
        <Text variant="bodyLg" style={styles.story}>“{m.story}”</Text>
        <View style={styles.tags}>{m.tags.map((t) => <Chip key={t} label={t} bg={colors.surfaceContainerLow} color={colors.secondary} />)}</View>
        {exps.length ? (
          <Text variant="bodySm" color={colors.textSubtle}>
            Basado en {exps.length} {exps.length === 1 ? 'experiencia registrada' : 'experiencias registradas'} por su memoria (tick {exps[0].tick}).
          </Text>
        ) : null}
        <SecondaryButton label={m.favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'} icon={m.favorite ? 'heartFill' : 'heart'} onPress={() => SessionController.toggleFavorite(m.id)} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.margin, gap: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  story: { fontFamily: 'NunitoSans_400Regular_Italic', color: colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
