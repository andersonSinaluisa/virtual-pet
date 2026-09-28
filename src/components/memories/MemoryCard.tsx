/*
 * MemoryCard (Stitch: nuestros_recuerdos): imagen del momento (captura real
 * de la escena 3D o ilustración de respaldo), fecha, favorito, título, día,
 * relato entre comillas y etiquetas.
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { subjectEmoji } from '@/core/memory/subjects';
import type { Moment } from '@/core/memory/types';
import { Icon, iconFor } from '@/components/ui/Icon';
import { Squishable } from '@/components/ui/Squishable';
import { Chip } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { alpha, colors, radius, shadows, spacing } from '@/theme';

const KIND_BG: Record<Moment['kind'], [string, string]> = {
  first_time: [colors.primaryFixed, colors.secondaryFixed],
  game: [colors.secondaryFixed, colors.primaryFixed],
  discovery: [colors.tertiaryFixed, colors.primaryFixed],
  milestone: [colors.primaryFixed, colors.tertiaryFixed],
  captured: [colors.surfaceContainerHigh, colors.primaryFixed],
  away: [colors.tertiaryFixed, colors.surfaceContainerHigh],
};

export function formatWhen(t: number): string {
  const d = new Date(t), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return `Hoy, ${hm}`;
  if (days === 1) return `Ayer, ${hm}`;
  return `Hace ${days} días`;
}

export function MomentImage({ moment, height }: { moment: Moment; height: number }) {
  const [a, b] = KIND_BG[moment.kind];
  if (moment.snapshotUri) {
    return <Image source={{ uri: moment.snapshotUri }} style={{ height, borderRadius: radius.lg }} contentFit="cover" transition={200} />;
  }
  return (
    <View style={[styles.art, { height, experimental_backgroundImage: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }]}>
      <Text style={styles.artEmoji}>{subjectEmoji(moment.subject)}</Text>
      <View style={styles.artIcon}><Icon name={iconFor(moment.icon)} size={22} color={colors.primary} /></View>
    </View>
  );
}

export function MemoryCard({ moment, first }: { moment: Moment; first?: boolean }) {
  return (
    <Squishable scaleTo={0.985} onPress={() => router.push({ pathname: '/memory/[id]', params: { id: moment.id } })}
      accessibilityLabel={moment.title} style={[styles.card, moment.keyMoment ? styles.key : null]}>
      {first ? (
        <View style={styles.ribbons}>
          <Chip small label="El comienzo" bg={colors.primaryFixed} color={colors.primary} />
          <Chip small label="Inolvidable" bg={colors.primaryFixed} color={colors.primary} />
        </View>
      ) : null}
      <View>
        <MomentImage moment={moment} height={first ? 200 : 170} />
        <View style={styles.when}><Text variant="labelSm">{moment.kind === 'milestone' ? `Día ${moment.day}` : formatWhen(moment.createdAt)}</Text></View>
        <Squishable onPress={() => SessionController.toggleFavorite(moment.id)} accessibilityLabel={moment.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} style={styles.fav}>
          <Icon name={moment.favorite ? 'heartFill' : 'heart'} size={18} color={colors.primary} />
        </Squishable>
      </View>
      <View style={styles.titleRow}>
        <Text variant="headlineSm" style={{ flex: 1 }}>{moment.title}</Text>
        <View style={styles.day}><Text variant="labelXs" color={colors.textMuted}>Día</Text><Text variant="labelSm">{moment.day}</Text></View>
      </View>
      <Text variant="thought" color={colors.textMuted} numberOfLines={3}>“{moment.story}”</Text>
    </Squishable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.sm + 4, gap: spacing.sm, ...shadows.card },
  key: { borderWidth: 2, borderColor: alpha(colors.primaryContainer, 0.5) },
  ribbons: { flexDirection: 'row', justifyContent: 'space-between' },
  art: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  artEmoji: { fontSize: 64 },
  artIcon: { position: 'absolute', left: 12, bottom: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: alpha('#ffffff', 0.85), alignItems: 'center', justifyContent: 'center' },
  when: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: alpha('#ffffff', 0.9) },
  fav: { position: 'absolute', top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: alpha('#ffffff', 0.9), alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  day: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md, backgroundColor: colors.surfaceContainerLow },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
});
