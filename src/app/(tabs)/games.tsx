/*
 * JUEGOS (Stitch: jugar_juntos_hub_de_actividades, versión simplificada)
 * Qué dice la mascota + 4 juegos grandes y claros. Los demás del catálogo
 * se anuncian en una sola línea.
 */
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GAMES, type GameInfo } from '@/core/games/catalog';
import { GameCard } from '@/components/games/GameCard';
import { AppHeader } from '@/components/ui/AppHeader';
import { TAB_BAR_SPACE } from '@/components/ui/MiloTabBar';
import { PetAvatar } from '@/components/ui/PetAvatar';
import { Text } from '@/components/ui/Text';
import { ThoughtBubble } from '@/components/ui/ThoughtBubble';
import { useStore } from '@/state/createStore';
import { petStore } from '@/state/stores';
import { colors, spacing } from '@/theme';

export default function Games() {
  const pet = useStore(petStore);
  if (!pet) return null;
  const tired = pet.stats.energy < 0.3 || pet.stats.fatigue > 0.75;
  const play = (g: GameInfo) => router.push({ pathname: '/games/[gameId]', params: { gameId: g.id } });
  const soon = GAMES.filter((g) => !g.implemented).map((g) => g.emoji).join(' ');

  return (
    <View style={styles.root}>
      <AppHeader title="Juegos" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_SPACE + spacing.md }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <PetAvatar species={pet.species} size={72} />
          <ThoughtBubble text={tired ? `${pet.name} está cansadito 😴` : '¡Vamos a jugar! 🐾'} style={styles.bubble} />
        </View>
        {GAMES.filter((g) => g.implemented).map((g) => (
          <GameCard key={g.id} game={g} petName={pet.name} onPlay={() => play(g)} />
        ))}
        <Text variant="labelMd" color={colors.textSubtle} align="center">Muy pronto: {soon}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.margin, gap: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bubble: { flex: 1, alignSelf: 'auto' },
});
