import { useEffect } from 'react';
import { AppState, I18nManager, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold, ReadexPro_700Bold } from '@expo-google-fonts/readex-pro';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { VersePopup } from '../components/VersePopup';
import { AppLock } from '../components/AppLock';
import { UndoBar } from '../components/UndoBar';
import { ConfirmHost } from '../components/ConfirmHost';
import { useDataVersion } from '../lib/bus';
import { syncReminders } from '../lib/reminder';
import { runAutoBackup } from '../lib/autoBackup';
import { syncDrive } from '../lib/drive';
import { syncSteps } from '../lib/steps';
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
  // Automatic backups, a little after opening so they don't slow the start.
  useEffect(() => {
    const id = setTimeout(async () => {
      await runAutoBackup().catch(() => {});
      await syncDrive(false, true).catch(() => {}); // Google Drive: whatever changed since last time
      if (useSettings.getState().stepsSync) await syncSteps(); // the last two weeks' steps from the phone
    }, 5000);
    return () => clearTimeout(id);
  }, []);

  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
      <VersePopup />
      <ReminderSync />
      <DriveSync />
      <UndoBar />
      <ConfirmHost />
      <AppLock />
    </SafeAreaProvider>
  );
}

/** Keeps the workout reminders in step with the settings and the log (a few seconds after the last change). */
function ReminderSync() {
  const on = useSettings((s) => s.reminder);
  const time = useSettings((s) => s.reminderTime);
  const days = useSettings((s) => s.reminderDays);
  const brief = useSettings((s) => s.brief);
  const briefTime = useSettings((s) => s.briefTime);
  const v = useDataVersion((s) => s.v);
  useEffect(() => {
    const id = setTimeout(() => syncReminders(), 2000);
    return () => clearTimeout(id);
  }, [on, time, days, brief, briefTime, v]);
  return null;
}

/**
 * Keeps the Google Drive copy current: once you've stopped changing things for 2 minutes (a whole workout of ticks
 * makes one upload, not dozens), and right away when the app goes to the background — so deleting the app or losing
 * the phone loses next to nothing.
 */
function DriveSync() {
  const v = useDataVersion((s) => s.v);
  useEffect(() => {
    const id = setTimeout(() => syncDrive(false, true).catch(() => {}), 120000);
    return () => clearTimeout(id);
  }, [v]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') syncDrive(false, true).catch(() => {});
    });
    return () => sub.remove();
  }, []);
  return null;
}
