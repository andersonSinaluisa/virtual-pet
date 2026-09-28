/*
 * Mochila: colocar objetos y cuidados rápidos. Todo son cambios del MUNDO
 * (poner comida, un juguete, apagar la luz...); lo que haga la mascota con
 * ello lo decide su red.
 */
import { StyleSheet, View } from 'react-native';

import type { WorldInteraction } from '@/core/session/GameSession';
import { ITEMS } from '@/core/world/Items';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ObjectSlot } from '@/components/ui/ObjectSlot';
import { Squishable } from '@/components/ui/Squishable';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { memoryStore, petStore } from '@/state/stores';
import { accents, colors, radius, spacing, type Accent } from '@/theme';

const CARE: { kind: WorldInteraction; label: string; icon: IconName; accent: Accent }[] = [
  { kind: 'food', label: 'Comida', icon: 'food', accent: 'secondary' },
  { kind: 'water', label: 'Agua', icon: 'water', accent: 'sky' },
  { kind: 'treat', label: 'Galletita', icon: 'cookie', accent: 'butter' },
  { kind: 'call', label: 'Llamar', icon: 'voice', accent: 'primary' },
  { kind: 'light', label: 'Lámpara', icon: 'light', accent: 'tertiary' },
  { kind: 'noise', label: 'Ruido', icon: 'noise', accent: 'rose' },
];

export function CarePanel() {
  const lightOn = useStore(petStore, (p) => p?.lampOn ?? false);
  return (
    <View style={styles.careGrid}>
      {CARE.map((c) => {
        const label = c.kind === 'light' ? (lightOn ? 'Apagar lámpara' : 'Encender lámpara') : c.label;
        return (
          <Squishable key={c.kind} style={styles.care} accessibilityLabel={label} onPress={() => SessionController.interact(c.kind)}>
            <View style={[styles.careIcon, { backgroundColor: accents[c.accent].bg }]}>
              <Icon name={c.icon} size={22} color={accents[c.accent].fg} />
            </View>
            <Text variant="labelSm" numberOfLines={1}>{label}</Text>
          </Squishable>
        );
      })}
    </View>
  );
}

export function ObjectsPanel({ onPlaced }: { onPlaced?: () => void } = {}) {
  useStore(memoryStore); // re-render al desbloquear/colocar objetos
  const session = SessionController.current;
  const owned = session?.inventory.owned.filter((k) => ITEMS[k].inventory) ?? [];
  const inRoom = new Set(session?.world.objects.filter((o) => o.tag === null).map((o) => o.kind) ?? []);
  return (
    <View style={styles.grid}>
      {owned.map((k) => (
        <View key={k} style={styles.cell}>
          <ObjectSlot kind={k} placed={inRoom.has(k)} tag={inRoom.has(k) ? 'En la habitación' : 'Colocar'}
            tagColor={inRoom.has(k) ? colors.secondary : colors.textSubtle}
            onPress={() => { if (SessionController.placeItem(k)) onPlaced?.(); }}
            onLongPress={() => SessionController.storeItem(k)} />
        </View>
      ))}
    </View>
  );
}

export function InventorySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="🎒 Mochila" subtitle="Toca un juguete y mira qué hace.">
      <ObjectsPanel onPlaced={onClose} />
      <Text variant="bodyXs" color={colors.textSubtle} align="center">Mantén pulsado para guardarlo.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  careGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  care: { width: 96, flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.card },
  careIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: '31%', flexGrow: 1 },
});
