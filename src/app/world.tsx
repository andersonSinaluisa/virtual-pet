/*
 * MUNDO: los lugares de la vida de la mascota (no un mapa RPG)
 * ------------------------------------------------------------
 *   🏠 Casa (habitación + jardín) · 🌳 Parque · (🌲 🏖️ algún día)
 *
 * El jugador cambia el MUNDO, no a la mascota:
 *   · abrir / cerrar la puerta del jardín (salir o no lo decide ella)
 *   · salir juntos (paseo): una transición intencional entre escenas
 * Sin niveles ni números: "parece listo para conocer el jardín", "muy familiar".
 *
 * Debajo, "Lugares y descubrimientos": lo que conoce y hasta dónde (lo ha
 * visto, se acercó, lo investigó, jugó con él).
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlaceSummary } from '@/core/session/GameSession';
import { IconButton, SoftButton, StrongButton } from '@/components/ui/Buttons';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { memoryStore, petStore } from '@/state/stores';
import { alpha, colors, radius, spacing } from '@/theme';

function PlaceCard({ p, children }: { p: PlaceSummary; children?: ReactNode }) {
  return (
    <Card tone={p.here ? 'warm' : 'white'} style={[styles.place, !p.available ? styles.dim : null]}>
      <View style={styles.placeHead}>
        <Text style={styles.emoji}>{p.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text variant="headlineSm">{p.name}{p.here ? ' · aquí' : ''}</Text>
          <Text variant="bodySm" color={colors.textMuted}>{p.familiarity}</Text>
        </View>
      </View>
      {p.readyHint ? <Text variant="bodySm" color={p.canBeThere ? colors.primary : colors.textMuted}>{p.readyHint}</Text> : null}
      {children}
    </Card>
  );
}

export default function WorldScreen() {
  useStore(memoryStore);
  const pet = useStore(petStore);
  const insets = useSafeAreaInsets();
  const s = SessionController.current;
  if (!s || !pet) return null;
  const places = s.places();
  const get = (id: PlaceSummary['id']) => places.find((x) => x.id === id) as PlaceSummary;
  const room = get('room'), garden = get('garden'), park = get('park');
  const doorOpen = pet.gardenDoorOpen;
  const found = s.objectDiscoveries();
  const name = pet.name;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text variant="labelSm" color={colors.primary} uppercase>El mundo de {name}</Text>
            <Text variant="headlineLg">Lugares</Text>
          </View>
          <IconButton icon="close" label="Cerrar" size={40} bg={colors.surfaceContainerHigh} color={colors.text} onPress={() => router.back()} />
        </View>

        <Text variant="labelMd" color={colors.textMuted} uppercase>🏠 Casa</Text>
        <PlaceCard p={room}>
          {pet.location !== 'room' && pet.location !== 'garden' ? (
            <StrongButton label="Volver a casa juntos" icon="home" onPress={() => { SessionController.goOuting('room'); router.back(); }} />
          ) : null}
        </PlaceCard>
        <PlaceCard p={garden}>
          {garden.canBeThere ? (
            <View style={styles.actions}>
              <SoftButton
                label={doorOpen ? 'Cerrar la puerta' : 'Abrir la puerta del jardín'} icon="home" tone={doorOpen ? 'neutral' : 'mint'}
                accessibilityHint="Cambia el mundo: salir o no lo decide tu mascota"
                onPress={() => SessionController.setGardenDoor(!doorOpen)}
              />
              {pet.location !== 'garden' ? <SoftButton label="Salir juntos" icon="spa" onPress={() => { SessionController.goOuting('garden'); router.back(); }} /> : null}
            </View>
          ) : null}
          {doorOpen && garden.canBeThere && pet.location === 'room' ? (
            <Text variant="bodyXs" color={colors.textMuted}>La puerta está abierta. Si sale o no, es cosa suya.</Text>
          ) : null}
        </PlaceCard>

        <Text variant="labelMd" color={colors.textMuted} uppercase>🌳 Fuera de casa</Text>
        <PlaceCard p={park}>
          {park.canBeThere && pet.location !== 'park' ? <SoftButton label="Ir al parque de paseo" icon="explore" tone="mint" onPress={() => { SessionController.goOuting('park'); router.back(); }} /> : null}
          {pet.location === 'park' ? <SoftButton label="Volver a casa" icon="home" onPress={() => { SessionController.goOuting('room'); router.back(); }} /> : null}
        </PlaceCard>
        <View style={styles.soonRow}>
          {places.filter((p) => !p.available).map((p) => (
            <Card key={p.id} tone="muted" style={styles.soon}>
              <Text style={styles.emojiSm}>{p.emoji}</Text>
              <Text variant="labelSm" color={colors.textMuted}>{p.name} · algún día</Text>
            </Card>
          ))}
        </View>

        <Text variant="headlineSm" style={{ marginTop: spacing.md }}>Lugares y descubrimientos</Text>
        <Card style={styles.journal}>
          {places.filter((p) => p.available).map((p) => (
            <View key={p.id} style={styles.jRow}>
              <Text style={styles.emojiSm}>{p.emoji}</Text>
              <Text variant="labelLg" style={{ flex: 1 }}>{p.name}</Text>
              <Text variant="bodySm" color={p.visited ? colors.text : colors.textMuted}>{p.familiarity}</Text>
            </View>
          ))}
        </Card>
        {found.length ? (
          <Card style={styles.journal}>
            {found.map((o) => (
              <View key={o.kind} style={styles.jRow}>
                <Text style={styles.emojiSm}>{o.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text variant="labelLg">{o.name}</Text>
                  <Text variant="bodyXs" color={colors.textMuted}>Día {o.firstSeenDay} · {o.familiarity}</Text>
                </View>
                <View style={styles.stage}><Text variant="labelXs" color={colors.onPrimaryContainer}>{o.stageWord}</Text></View>
              </View>
            ))}
          </Card>
        ) : (
          <Text variant="bodySm" color={colors.textMuted}>Todavía no ha descubierto nada fuera de sus cosas de siempre.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.margin, gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  place: { gap: spacing.xs + 2, padding: spacing.md, borderRadius: radius.xl },
  dim: { opacity: 0.6 },
  placeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji: { fontSize: 34 },
  emojiSm: { fontSize: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  soonRow: { flexDirection: 'row', gap: spacing.sm },
  soon: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm },
  journal: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.xl },
  jRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stage: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: alpha(colors.primaryContainer, 0.8) },
});
