import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ColorValue } from 'react-native';
import { useSettings } from '../../lib/settings';
import { F, useTheme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function icon(name: string) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={23} color={color as string} />;
  };
}

export default function TabsLayout() {
  const t = useTheme();
  const prayer = useSettings((s) => s.prayer); // the prayer tab only shows when it's turned on in settings
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.okText,
        tabBarInactiveTintColor: t.mute,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line },
        tabBarLabelStyle: { fontFamily: F.medium, fontSize: 11, lineHeight: 16 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'التمرين', tabBarIcon: icon('barbell') }} />
      <Tabs.Screen name="progress" options={{ title: 'التقدم', tabBarIcon: icon('stats-chart') }} />
      <Tabs.Screen name="food" options={{ title: 'الأكل', tabBarIcon: icon('restaurant') }} />
      <Tabs.Screen name="shop" options={{ title: 'المشتريات', tabBarIcon: icon('cart') }} />
      <Tabs.Screen name="prayer" options={{ title: 'الصلاة', tabBarIcon: icon('moon'), href: prayer ? undefined : null }} />
    </Tabs>
  );
}
