import { Tabs } from 'expo-router';

/** Opening the gym tab lands on the workout. */
export const unstable_settings = { initialRouteName: 'workout' };

/**
 * الجيم: التمرين · الأكل · المشتريات. They keep their place when you switch (a tab navigator without its own bar); the
 * switch is the segmented control at the top of each page (src/components/GymSwitch.tsx), so the app has one bottom bar.
 */
export default function GymLayout() {
  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false, animation: 'none' }}>
      <Tabs.Screen name="workout" options={{ title: 'التمرين' }} />
      <Tabs.Screen name="food" options={{ title: 'الأكل' }} />
      <Tabs.Screen name="shop" options={{ title: 'المشتريات' }} />
    </Tabs>
  );
}
