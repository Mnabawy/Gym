import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ColorValue } from 'react-native';
import { crashBoundary } from '../../components/CrashScreen';
import { TabBar } from '../../components/TabBar';
import { TabBarSpace } from '../../components/tabSpace';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Filled icon on the open tab, outline on the rest; the bar picks the color. */
function icon(name: string) {
  return function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={size} color={color as string} />;
  };
}

/** A crash on this page shows a recovery screen instead of closing the app (src/components/CrashScreen.tsx). */
export const ErrorBoundary = crashBoundary('tabs');

/** The gym (src/app/(tabs)/(gym): التمرين · الأكل · المشتريات as a segmented control at the top) under the floating bar (src/components/TabBar.tsx). */
export default function TabsLayout() {
  return (
    // The bar floats over the pages (absolute), so each page leaves room for it (TabBarSpace → Screen).
    <TabBarSpace>
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, animation: 'none' }}>
      <Tabs.Screen name="(gym)" options={{ title: 'الجيم', tabBarIcon: icon('barbell') }} />
    </Tabs>
    </TabBarSpace>
  );
}
