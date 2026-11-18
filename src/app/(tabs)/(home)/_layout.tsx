import { Tabs } from 'expo-router';

/** The first tab opens on يومي. */
export const unstable_settings = { initialRouteName: 'index' };

/**
 * النهارده: يومي (`/`, the day's timeline, what the app opens on) · أسبوعك (`/week`, the weekly dashboard). Like الجيم:
 * a tab navigator without its own bar, switched by the segmented control at the top of each page (HomeSwitch).
 */
export default function HomeLayout() {
  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false, animation: 'none' }}>
      <Tabs.Screen name="index" options={{ title: 'يومي' }} />
      <Tabs.Screen name="week" options={{ title: 'أسبوعك' }} />
    </Tabs>
  );
}
