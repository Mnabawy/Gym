import { Redirect, Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ColorValue } from 'react-native';
import { GOOGLE_USER, googleSupported } from '../../lib/google';
import { WELCOME_KEY } from '../../lib/restore';
import { storage } from '../../lib/storage';
import { hubWasSeen, lastSection, SECTION_PATH } from '../../lib/section';
import { crashBoundary } from '../../components/CrashScreen';
import { TabBar } from '../../components/TabBar';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function icon(name: string) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={22} color={color as string} />;
  };
}

/** A crash on this page shows a recovery screen instead of closing the app (src/components/CrashScreen.tsx). */
export const ErrorBoundary = crashBoundary('tabs');

export default function TabsLayout() {
  // First launch on the phone: the sign-in screen, until you sign in or skip it.
  if (googleSupported && !storage.getMeta(WELCOME_KEY) && !storage.getMeta(GOOGLE_USER)) return <Redirect href="/welcome" />;
  // The app opens on its home page (the sections as cards); after that this layout is the gym.
  if (!hubWasSeen()) return <Redirect href="/sections" />;
  if (lastSection() !== 'gym') return <Redirect href={SECTION_PATH[lastSection()]} />;
  return (
    // Custom bar (src/components/TabBar.tsx): the open tab is a pill with icon + name, the others just their icon.
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'التمرين', tabBarIcon: icon('barbell') }} />
      <Tabs.Screen name="food" options={{ title: 'الأكل', tabBarIcon: icon('restaurant') }} />
      <Tabs.Screen name="shop" options={{ title: 'المشتريات', tabBarIcon: icon('cart') }} />
    </Tabs>
  );
}
