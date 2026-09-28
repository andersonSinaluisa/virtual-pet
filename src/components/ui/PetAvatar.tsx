/*
 * Avatar de la mascota: la última captura real de su escena 3D si existe;
 * si no, la ilustración de Stitch (perro) o un emoji de la especie.
 */
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SpeciesKey } from '@/core/persistence/SaveGame';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { memoryStore } from '@/state/stores';
import { colors } from '@/theme';

import { Text } from './Text';

const EMOJI: Record<SpeciesKey, string> = { dog: '🐶', cat: '🐱', bear: '🐻', bunny: '🐰' };

export function PetAvatar({ size = 96, species, style, rounded = true }: { size?: number; species: SpeciesKey; style?: StyleProp<ViewStyle>; rounded?: boolean }) {
  useStore(memoryStore);
  const snap = SessionController.current?.memory.moments.find((m) => m.snapshotUri)?.snapshotUri ?? null;
  const r = rounded ? size / 2 : size * 0.22;
  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: r }, style]}>
      {snap ? (
        <Image source={{ uri: snap }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : species === 'dog' ? (
        <Image source={require('@/assets/images/pets/milo-avatar.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text style={{ fontSize: size * 0.5 }}>{EMOJI[species]}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryFixed, borderWidth: 3, borderColor: colors.card },
});
