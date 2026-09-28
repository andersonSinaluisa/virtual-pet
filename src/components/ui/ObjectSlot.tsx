/*
 * ObjectSlot (DESIGN.md → Tactile Item Slots): contenedor cuadrado con
 * hueco "acolchado" (fondo vainilla + sombra interior) y halo menta cuando
 * el objeto está en la habitación.
 */
import { StyleSheet, View } from 'react-native';

import { ITEMS, type ItemKind } from '@/core/world/Items';
import { colors, radius, spacing } from '@/theme';

import { Icon } from './Icon';
import { Squishable } from './Squishable';
import { Text } from './Text';

interface Props {
  kind: ItemKind;
  placed?: boolean;
  tag?: string;
  tagColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
}

export function ObjectSlot({ kind, placed, tag, tagColor = colors.textSubtle, onPress, onLongPress, selected }: Props) {
  const def = ITEMS[kind];
  return (
    <Squishable onPress={onPress} onLongPress={onLongPress} accessibilityLabel={`${def.name}${placed ? ', en la habitación' : ''}`}
      style={[styles.slot, placed || selected ? styles.slotOn : null]}>
      <View style={styles.well}>
        <Text style={styles.emoji}>{def.emoji}</Text>
      </View>
      <Text variant="labelMd" align="center" numberOfLines={2}>{def.name}</Text>
      {tag ? <Text variant="labelXs" color={tagColor} uppercase>{tag}</Text> : null}
      {placed || selected ? (
        <View style={styles.check}><Icon name="check" size={14} color={colors.onSecondary} /></View>
      ) : null}
    </Squishable>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1, minWidth: 96, alignItems: 'center', gap: 6, padding: spacing.sm, paddingVertical: spacing.md,
    borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent',
  },
  slotOn: { borderColor: colors.mint, backgroundColor: '#F2FBF7' },
  well: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.vanilla, boxShadow: 'inset 0 2px 6px rgba(160,120,100,0.08)',
  },
  emoji: { fontSize: 32 },
  check: { position: 'absolute', top: -6, left: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
});
