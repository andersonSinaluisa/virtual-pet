import { Tabs } from 'expo-router/js-tabs';

import { MiloTabBar } from '@/components/ui/MiloTabBar';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <MiloTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Mundo' }} />
      <Tabs.Screen name="games" options={{ title: 'Juegos' }} />
      <Tabs.Screen name="memories" options={{ title: 'Recuerdos' }} />
      <Tabs.Screen name="backpack" options={{ title: 'Mochila' }} />
      <Tabs.Screen name="milo" options={{ title: 'Milo' }} />
    </Tabs>
  );
}
