import { useEffect } from 'react';
import { I18nManager, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold, ReadexPro_700Bold } from '@expo-google-fonts/readex-pro';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { VersePopup } from '../components/VersePopup';
import { useDataVersion } from '../lib/bus';
import { syncReminders } from '../lib/reminder';
import { useSettings } from '../lib/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

// RTL: app.json sets forcesRTL for builds; this also covers dev clients.
if (Platform.OS !== 'web' && !I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
}

export default function RootLayout() {
  const [loaded] = useFonts({ ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold, ReadexPro_700Bold, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, AmiriQuran_400Regular });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
      <VersePopup />
      <ReminderSync />
    </SafeAreaProvider>
  );
}

/** Keeps the workout reminders in step with the settings and the log (a few seconds after the last change). */
function ReminderSync() {
  const on = useSettings((s) => s.reminder);
  const time = useSettings((s) => s.reminderTime);
  const days = useSettings((s) => s.reminderDays);
  const v = useDataVersion((s) => s.v);
  useEffect(() => {
    const id = setTimeout(() => syncReminders(), 2000);
    return () => clearTimeout(id);
  }, [on, time, days, v]);
  return null;
}
