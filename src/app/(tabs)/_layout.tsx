import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { F, useTheme } from '../../theme';

function icon(glyph: string) {
  return function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>;
  };
}

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.fg,
        tabBarInactiveTintColor: t.mute,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line },
        tabBarLabelStyle: { fontFamily: F.semi, fontSize: 11.5, lineHeight: 16 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'التمرين', tabBarIcon: icon('🏋') }} />
      <Tabs.Screen name="progress" options={{ title: 'التقدم', tabBarIcon: icon('📈') }} />
      <Tabs.Screen name="food" options={{ title: 'الأكل', tabBarIcon: icon('🍽') }} />
      <Tabs.Screen name="shop" options={{ title: 'المشتريات', tabBarIcon: icon('🛒') }} />
    </Tabs>
  );
}
