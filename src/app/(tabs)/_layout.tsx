import { Redirect, Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GOOGLE_USER, googleSupported } from '../../lib/google';
import { WELCOME_KEY } from '../../lib/restore';
import { storage } from '../../lib/storage';
import { lastSection, SECTION_PATH } from '../../lib/section';
import { F, useTheme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function icon(name: string) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={22} color={color as string} />;
  };
}

/** Tab label that shrinks to fit (narrow phones, big system font). Line height leaves room for Arabic glyphs, which otherwise get clipped. */
function TabLabel({ color, children }: { color: ColorValue; children: string }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      maxFontSizeMultiplier={1.2}
      style={{ color, fontFamily: F.medium, fontSize: 11, lineHeight: 18, textAlign: 'center', paddingHorizontal: 2 }}>
      {children}
    </Text>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const inset = useSafeAreaInsets();
  // Android draws edge to edge: the bar must clear the system navigation bar itself. Phones with the gesture bar hidden
  // report no bottom inset at all, and their rounded screen corners then cut the outer labels, so Android keeps 14pt.
  // 64pt leaves the icon and an 18pt label line their full height; a shorter bar squeezes the label and clips the Arabic text.
  const bottom = Math.max(inset.bottom, Platform.OS === 'android' ? 14 : 8);
  const bar = { height: 64 + bottom, paddingTop: 4, paddingBottom: bottom };
  // First launch on the phone: the sign-in screen, until you sign in or skip it.
  if (googleSupported && !storage.getMeta(WELCOME_KEY) && !storage.getMeta(GOOGLE_USER)) return <Redirect href="/welcome" />;
  // The app opens on the section you were in last (الجيم, العادات or الأهداف); switching sections saves it first.
  if (lastSection() !== 'gym') return <Redirect href={SECTION_PATH[lastSection()]} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.okText,
        tabBarInactiveTintColor: t.mute,
        tabBarStyle: { ...bar, backgroundColor: t.card, borderTopColor: t.line },
        tabBarLabel: TabLabel,
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'التمرين', tabBarIcon: icon('barbell') }} />
      <Tabs.Screen name="food" options={{ title: 'الأكل', tabBarIcon: icon('restaurant') }} />
      <Tabs.Screen name="shop" options={{ title: 'المشتريات', tabBarIcon: icon('cart') }} />
    </Tabs>
  );
}
