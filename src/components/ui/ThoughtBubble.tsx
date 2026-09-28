/*
 * PetThought: bocadillo de pensamiento (DESIGN.md → Speech & Dialogue
 * Bubbles): esquinas asimétricas 28/28/28/8 y cola hacia la mascota.
 * El texto se anima suavemente al cambiar (FadeIn), sin abusar.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { colors, fonts, shadows } from '@/theme';

import { Text } from './Text';

interface Props {
  text: string;
  sub?: string;
  emoji?: string;
  tail?: 'left' | 'center' | 'none';
  size?: 'sm' | 'lg';
  style?: StyleProp<ViewStyle>;
}

export function ThoughtBubble({ text, sub, emoji = '💭', tail = 'left', size = 'sm', style }: Props) {
  const lg = size === 'lg';
  return (
    <View style={[styles.wrap, style]} accessibilityRole="text" accessibilityLabel={`Pensamiento: ${text}`}>
      <View style={[styles.bubble, lg ? styles.bubbleLg : null]}>
        <Text style={lg ? styles.emojiLg : styles.emoji}>{emoji}</Text>
        <Animated.View key={text} entering={FadeIn.duration(260)} style={styles.texts}>
          <Text variant={lg ? 'headlineSm' : 'bodySm'} style={lg ? null : styles.semibold}>{text}</Text>
          {sub ? <Text variant="bodySm" color={colors.textMuted}>{sub}</Text> : null}
        </Animated.View>
      </View>
      {tail !== 'none' ? <View style={[styles.tail, tail === 'center' ? styles.tailCenter : null]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', maxWidth: 320 },
  bubble: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomRightRadius: 22, borderBottomLeftRadius: 6,
    ...shadows.bubble,
  },
  bubbleLg: { paddingHorizontal: 20, paddingVertical: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomRightRadius: 28, borderBottomLeftRadius: 8 },
  emoji: { fontSize: 18 },
  emojiLg: { fontSize: 24, alignSelf: 'flex-start' },
  texts: { flexShrink: 1, gap: 2 },
  semibold: { fontFamily: fonts.bodySemi },
  tail: {
    width: 12, height: 10, marginLeft: 16, marginTop: -1, backgroundColor: 'rgba(255,255,255,0.96)',
    borderBottomRightRadius: 12,
  },
  tailCenter: { alignSelf: 'center', marginLeft: 0, transform: [{ rotate: '45deg' }], marginTop: -6, width: 14, height: 14, borderBottomRightRadius: 3 },
});
