/*
 * SESIÓN DE MINIJUEGO
 * Al entrar se inicia el juego en la simulación existente (mismo mundo y
 * mismo cerebro); al salir se termina y sus objetos se retiran.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { gameInfo, isGameId } from '@/core/games/catalog';
import { ChoicePanel } from '@/components/games/ChoicePanel';
import { ComeHerePanel } from '@/components/games/ComeHerePanel';
import { FetchPanel } from '@/components/games/FetchPanel';
import { MysteryPanel } from '@/components/games/MysteryPanel';
import { SessionHeader } from '@/components/games/SessionHeader';
import { SoftButton } from '@/components/ui/Buttons';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { gameStore, petStore } from '@/state/stores';
import { colors, spacing } from '@/theme';

export default function GameScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const view = useStore(gameStore);
  const pet = useStore(petStore);
  const valid = isGameId(gameId) && gameInfo(gameId).implemented;

  useEffect(() => {
    if (!valid) return;
    SessionController.startGame(gameId);
    return () => SessionController.endGame();
  }, [gameId, valid]);

  if (!valid || !pet) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text variant="headlineMd" align="center">Este juego llegará pronto</Text>
        <SoftButton label="Volver" icon="arrowBack" onPress={() => router.back()} />
      </View>
    );
  }
  const title = `${gameInfo(gameId).emoji} ${gameInfo(gameId).title}`;
  const props = { petName: pet.name, species: pet.species };

  return (
    <View style={styles.root}>
      <SessionHeader title={title} onClose={() => router.back()} />
      {view?.gameId === 'fetch' ? <FetchPanel view={view} {...props} />
        : view?.gameId === 'mystery-box' ? <MysteryPanel view={view} {...props} />
        : view?.gameId === 'choice' ? <ChoicePanel view={view} {...props} />
        : view?.gameId === 'come-here' ? <ComeHerePanel view={view} {...props} />
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
});
