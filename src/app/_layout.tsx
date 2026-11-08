import { useEffect } from 'react';
import { AppState, I18nManager, Platform } from 'react-native';
import { router, Stack, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { VersePopup } from '../components/VersePopup';
import { AppLock } from '../components/AppLock';
import { UndoBar } from '../components/UndoBar';
import { ConfirmHost } from '../components/ConfirmHost';
import { useDataVersion } from '../lib/bus';
import { syncReminders } from '../lib/reminder';
import { runAutoBackup } from '../lib/autoBackup';
import { cloudConfigured, keepSynced } from '../lib/cloud';
import { onDirty } from '../lib/track';
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
  const [loaded] = useFonts({ AmiriQuran_400Regular });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);
  // Automatic backups, a little after opening so they don't slow the start.
  useEffect(() => {
    const id = setTimeout(async () => {
      await runAutoBackup().catch(() => {});
      if (useSettings.getState().stepsSync) await syncSteps(); // the last two weeks' steps from the phone
    }, 5000);
    return () => clearTimeout(id);
  }, []);

  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {/* iOS-style push on both phones; swipe back from anywhere on the page (iPhone). */}
      <Stack screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'ios_from_right' : 'default', fullScreenGestureEnabled: true }} />
      <VersePopup />
      <ReminderSync />
      <OpenFromNotification />
      <CloudSync />
      <UndoBar />
      <ConfirmHost />
      <AppLock />
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** A notification that carries a page (`data.url`, e.g. the adhkar list) opens it when tapped, also from a closed app. */
function OpenFromNotification() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const go = (r: Notifications.NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) setTimeout(() => router.push(url as Href), 300);
    };
    Notifications.getLastNotificationResponseAsync().then(go).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
  }, []);
  return null;
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
 * Supabase sync (src/lib/cloud.ts): a few seconds after each change, on opening, on coming back to the app and on
 * leaving it. Signed in to Google but sync not on yet (it failed before, or from before sync existed): it turns on by itself.
 */
function CloudSync() {
  useEffect(() => {
    if (!cloudConfigured) return;
    const go = () => void keepSynced();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const first = setTimeout(go, 1500);
    const off = onDirty(() => {
      clearTimeout(timer);
      timer = setTimeout(go, 4000);
    });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' || st === 'background') go();
    });
    return () => {
      clearTimeout(first);
      clearTimeout(timer);
      off();
      sub.remove();
    };
  }, []);
  return null;
}
