import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ColorValue } from 'react-native';
import { GOOGLE_USER, googleSupported } from '../../lib/google';
import { WELCOME_KEY } from '../../lib/restore';
import { storage } from '../../lib/storage';
import { hubSeen } from '../../lib/section';
import { crashBoundary } from '../../components/CrashScreen';
import { TabBar } from '../../components/TabBar';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Filled icon on the open tab, outline on the rest; the bar picks the color. */
function icon(name: string) {
  return function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={size} color={color as string} />;
  };
}

/** A crash on this page shows a recovery screen instead of closing the app (src/components/CrashScreen.tsx). */
export const ErrorBoundary = crashBoundary('tabs');

/**
 * The app's sections as tabs at the bottom (classic bar, no animation: src/components/TabBar.tsx): أسبوعك (the weekly
 * dashboard, `/`, what the app opens on), الجيم (src/app/(tabs)/(gym): التمرين · الأكل · المشتريات as a segmented
 * control at the top), مهامي, الأهداف, بطّل.
 */
export default function TabsLayout() {
  const welcome = googleSupported && !storage.getMeta(WELCOME_KEY) && !storage.getMeta(GOOGLE_USER);
  // The launch redirects are done once the tabs show: a page from a tapped notification can open now.
  useEffect(() => {
    if (!welcome) hubSeen();
  }, [welcome]);
  // First launch on the phone: the sign-in screen, until you sign in or skip it.
  if (welcome) return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, animation: 'none' }}>
      <Tabs.Screen name="index" options={{ title: 'أسبوعك', tabBarIcon: icon('speedometer') }} />
      <Tabs.Screen name="(gym)" options={{ title: 'الجيم', tabBarIcon: icon('barbell') }} />
      <Tabs.Screen name="tasks" options={{ title: 'مهامي', tabBarIcon: icon('checkbox') }} />
      <Tabs.Screen name="goals" options={{ title: 'الأهداف', tabBarIcon: icon('flag') }} />
      <Tabs.Screen name="quit" options={{ title: 'بطّل', tabBarIcon: icon('hand-left') }} />
    </Tabs>
  );
}
