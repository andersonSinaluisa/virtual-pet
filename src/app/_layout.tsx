import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GrowthCelebration } from '@/components/growth/GrowthCelebration';
import { DiscoveryHost } from '@/components/learning/DiscoveryHost';
import { PrimaryButton } from '@/components/ui/Buttons';
import { Text } from '@/components/ui/Text';
import { ToastHost } from '@/components/ui/ToastHost';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { sessionStore } from '@/state/stores';
import { colors, fontAssets, spacing } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const status = useStore(sessionStore, (s) => s.status);

  useEffect(() => { void SessionController.boot(); }, []);

  const ready = (fontsLoaded || !!fontError) && status !== 'booting';
  useEffect(() => { if (ready) void SplashScreen.hideAsync(); }, [ready]);
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {status === 'error' ? <BootError /> : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade_from_bottom' }}>
            <Stack.Protected guard={status === 'onboarding'}>
              <Stack.Screen name="onboarding" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'ready'}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="games/[gameId]" options={{ gestureEnabled: false }} />
              <Stack.Screen name="brain" />
              <Stack.Screen name="memory/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="away" options={{ presentation: 'transparentModal', animation: 'fade' }} />
              <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
              <Stack.Screen name="dev" options={{ presentation: 'modal' }} />
            </Stack.Protected>
          </Stack>
        )}
        {status === 'ready' ? <DiscoveryHost /> : null}
        {status === 'ready' ? <GrowthCelebration /> : null}
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function BootError() {
  const error = useStore(sessionStore, (s) => s.error);
  return (
    <View style={styles.center}>
      <Text variant="headlineMd" align="center">No pudimos abrir la casa de tu mascota</Text>
      <Text variant="bodyMd" color={colors.textMuted} align="center">Tu partida guardada no se ha modificado.</Text>
      {__DEV__ && error ? <Text variant="bodyXs" color={colors.error}>{error}</Text> : null}
    </View>
  );
}

// Error Boundary de Expo Router: una pantalla que falla no pierde la partida
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.center}>
      <Text variant="headlineMd" align="center">Algo no salió como esperábamos</Text>
      <Text variant="bodyMd" color={colors.textMuted} align="center">Tu mascota y sus recuerdos están a salvo.</Text>
      {__DEV__ ? <Text variant="bodyXs" color={colors.error}>{error.message}</Text> : null}
      <PrimaryButton label="Reintentar" icon="refresh" onPress={() => { void SessionController.save(); void retry(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
});
