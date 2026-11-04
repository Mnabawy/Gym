import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View, type ColorValue } from 'react-native';
import { PrayerFloat } from '../../components/PrayerFloat';
import { useSettings } from '../../lib/settings';
import { F, useTheme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function icon(name: string) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={23} color={color as string} />;
  };
}

/** Tab label that shrinks to fit: five Arabic labels on a narrow Android phone (or a big system font) otherwise get cut ("المشتريا…"). */
function TabLabel({ color, children }: { color: ColorValue; children: string }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      maxFontSizeMultiplier={1.2}
      style={{ color, fontFamily: F.medium, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 2 }}>
      {children}
    </Text>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const prayer = useSettings((s) => s.prayer); // the prayer tab only shows when it's turned on in settings
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.okText,
        tabBarInactiveTintColor: t.mute,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line },
        tabBarLabel: TabLabel,
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'التمرين', tabBarIcon: icon('barbell') }} />
      <Tabs.Screen name="progress" options={{ title: 'التقدم', tabBarIcon: icon('stats-chart') }} />
      <Tabs.Screen name="food" options={{ title: 'الأكل', tabBarIcon: icon('restaurant') }} />
      <Tabs.Screen name="shop" options={{ title: 'المشتريات', tabBarIcon: icon('cart') }} />
      <Tabs.Screen name="prayer" options={{ title: 'الصلاة', tabBarIcon: icon('moon'), href: prayer ? undefined : null }} />
    </Tabs>
    <PrayerFloat />
    </View>
  );
}
