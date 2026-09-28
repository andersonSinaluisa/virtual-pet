/*
 * MOCHILA (sin pantalla Stitch: ObjectSlots + tarjetas del design system)
 * Objetos propios, cuidados y lo que aún queda por descubrir en cajas.
 */
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { NOVEL_KINDS } from '@/core/world/Items';
import { ObjectsPanel } from '@/components/home/InventorySheet';
import { AppHeader } from '@/components/ui/AppHeader';
import { SoftButton } from '@/components/ui/Buttons';
import { TAB_BAR_SPACE } from '@/components/ui/MiloTabBar';
import { Card, SectionTitle } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { memoryStore, petStore } from '@/state/stores';
import { colors, spacing } from '@/theme';

export default function Backpack() {
  useStore(memoryStore);
  const name = useStore(petStore, (p) => p?.name ?? '');
  const owned = SessionController.current?.inventory.owned ?? [];
  const missing = NOVEL_KINDS.filter((k) => !owned.includes(k)).length;

  return (
    <View style={styles.root}>
      <AppHeader title="Mochila" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_SPACE + spacing.md }]}>
        <Text variant="headlineLg">🎒 Tu mochila</Text>
        <Text variant="bodyMd" color={colors.textMuted}>Toca un juguete para dárselo a {name}.</Text>
        <SectionTitle title="🧸 Juguetes" />
        <ObjectsPanel onPlaced={() => router.navigate('/')} />
        <Card tone="muted" style={styles.locked}>
          <View style={{ flex: 1 }}>
            <Text variant="headlineSm">{missing ? `🔒 ${missing} juguetes escondidos` : '🎉 ¡Los tienes todos!'}</Text>
            <Text variant="bodySm" color={colors.textMuted}>Se encuentran en las cajas misteriosas.</Text>
          </View>
        </Card>
        {missing ? <SoftButton label="Jugar a Caja Misteriosa" icon="box" tone="mint"
          onPress={() => router.push({ pathname: '/games/[gameId]', params: { gameId: 'mystery-box' } })} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.margin, gap: spacing.md },
  locked: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
