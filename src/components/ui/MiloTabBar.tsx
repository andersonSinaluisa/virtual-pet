/*
 * Barra de navegación inferior de Stitch: cápsula blanca flotante a todo el
 * ancho con la pestaña activa como píldora melocotón (icono + etiqueta).
 * Respeta la barra de gestos de iOS y la de navegación de Android.
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/services/haptics';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Squishable } from './Squishable';
import { Text } from './Text';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Mundo', icon: 'home' },
  games: { label: 'Juegos', icon: 'toys' },
  memories: { label: 'Recuerdos', icon: 'book' },
  backpack: { label: 'Mochila', icon: 'backpack' },
  milo: { label: 'Milo', icon: 'paw' },
};

export function MiloTabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, i) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === i;
          const label = (descriptors[route.key]?.options.title as string | undefined) ?? meta.label;
          const color = focused ? colors.onPrimaryContainer : colors.textMuted;
          return (
            <Squishable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) { haptic('select'); navigation.navigate(route.name); }
              }}
              style={[styles.tab, focused ? styles.tabActive : null]}
            >
              <Icon name={meta.icon} size={22} color={color} />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.label, { color }]}>{label}</Text>
            </Squishable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.sm + 4 },
  bar: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: colors.card, borderRadius: radius.full, padding: 5, gap: 2, ...shadows.float },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 2, borderRadius: radius.full, gap: 2, minHeight: 56 },
  tabActive: { backgroundColor: colors.primaryContainer },
  label: { fontFamily: fonts.heading, fontSize: 11, lineHeight: 14, letterSpacing: 0.2 },
});

// Altura aproximada para dejar espacio al contenido desplazable
export const TAB_BAR_SPACE = 100;
