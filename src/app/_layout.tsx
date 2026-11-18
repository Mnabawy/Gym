import { useEffect, useMemo } from 'react';
import { AppState, I18nManager, Platform } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider as NavTheme, router, Stack, type Href } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { isPackage } from '../lib/apps';
import { openApp } from '../lib/appsIO';
import { AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { VersePopup } from '../components/VersePopup';
import { AppLock } from '../components/AppLock';
import { UndoBar } from '../components/UndoBar';
import { ConfirmHost } from '../components/ConfirmHost';
import { useDataVersion } from '../lib/bus';
import { syncReminders } from '../lib/reminder';
import { HABITS_OFF } from '../lib/hidden';
import { openQueue } from '../lib/openQueue';
import { afterHub } from '../lib/section';
import { runAutoBackup } from '../lib/autoBackup';
import { cloudConfigured, keepSynced } from '../lib/cloud';
import { onDirty } from '../lib/track';
import { hasLocalData } from '../lib/safety';
import { repairRecoveries } from '../lib/safetyIO';
import { metaMigrations, storage } from '../lib/storage';
import { syncSteps } from '../lib/steps';
import { useSettings } from '../lib/settings';
import { crashBoundary } from '../components/CrashScreen';
import { report } from '../lib/errlog';
import { useTheme } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
// A one-time meta change that failed at start (src/lib/metaMigrations.ts) runs again on the next start; noted for a bug report.
if (metaMigrations.error) report(metaMigrations.error, 'metaMigrations');

// RTL: app.json sets forcesRTL for builds; this also covers dev clients.
if (Platform.OS !== 'web' && !I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
}

/** A crash on this page shows a recovery screen instead of closing the app (src/components/CrashScreen.tsx). */
export const ErrorBoundary = crashBoundary('root');

export default function RootLayout() {
  const [loaded] = useFonts({ AmiriQuran_400Regular });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);
  // Automatic backups, a little after opening so they don't slow the start.
  useEffect(() => {
    const id = setTimeout(async () => {
      await runAutoBackup().catch((e) => report(e, 'autoBackup'));
      if (useSettings.getState().stepsSync) await syncSteps(); // the last two weeks' steps from the phone
    }, 5000);
    return () => clearTimeout(id);
  }, []);

  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AppTheme>
      {/* iOS-style push on both phones; swipe back from anywhere on the page (iPhone). */}
      <Stack screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'ios_from_right' : 'default', fullScreenGestureEnabled: true }} />
      </AppTheme>
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

/** A notification that carries a page (`data.url`, e.g. the adhkar list) or an app (`data.app`) opens it when tapped, also from a closed app. */
function OpenFromNotification() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    // From a closed app the page waits until the launch redirect (welcome) is done and the tabs show, so they can't replace it.
    const q = openQueue((url) => setTimeout(() => router.push(url as Href), 300));
    const go = (r: Notifications.NotificationResponse | null) => {
      if (!r || !q.first(`${r.notification.request.identifier}|${r.actionIdentifier}`)) return;
      const data = r.notification.request.content.data;
      const url = data?.url;
      if (typeof url === 'string' && url.startsWith('/')) q.open(url);
      // A habit's app (e.g. the Quran app): open it straight away.
      if (typeof data?.app === 'string' && isPackage(data.app)) void openApp(data.app);
    };
    Notifications.getLastNotificationResponseAsync().then(go).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    const off = afterHub(q.ready);
    return () => {
      sub.remove();
      off();
    };
  }, []);
  return null;
}

/** Keeps the reminders in step with the settings and the log (a few seconds after the last change), and fresh each time the app comes back (the morning brief's text is built from today). */
function ReminderSync() {
  const on = useSettings((s) => s.reminder);
  const time = useSettings((s) => s.reminderTime);
  const days = useSettings((s) => s.reminderDays);
  const brief = useSettings((s) => s.brief);
  const briefTime = useSettings((s) => s.briefTime);
  const dumpRemind = useSettings((s) => s.dumpRemind);
  const dumpTime = useSettings((s) => s.dumpTime);
  const shopTrips = useSettings((s) => s.shopTrips);
  const shopMoves = useSettings((s) => s.shopMoves);
  // Prayer place and method only time habit reminders.
  const place = useSettings((s) => (HABITS_OFF ? null : s.place));
  const method = useSettings((s) => (HABITS_OFF ? null : s.prayerMethod));
  const v = useDataVersion((s) => s.v);
  useEffect(() => {
    const id = setTimeout(() => syncReminders(), 2000);
    return () => clearTimeout(id);
  }, [on, time, days, brief, briefTime, dumpRemind, dumpTime, shopTrips, shopMoves, place, method, v]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let id: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      clearTimeout(id);
      id = setTimeout(() => syncReminders(), 1000);
    });
    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, []);
  return null;
}

/**
 * Supabase sync (src/lib/cloud.ts): a few seconds after each change, on opening, on coming back to the app and on
 * leaving it. Signed in to Google but sync not on yet (it failed before, or from before sync existed): it turns on by itself.
 */
function CloudSync() {
  // After an interrupted wipe: put the photos back (or note the wipe), and delete old recovery folders. Works offline.
  useEffect(() => {
    try {
      void repairRecoveries(hasLocalData(storage.dump())).catch((e) => report(e, 'repairRecoveries'));
    } catch (e) {
      report(e, 'repairRecoveries');
    }
  }, []);
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

/**
 * Light or dark for the whole app, from the phone's setting: the navigators' own colors (page backgrounds while a page
 * slides in, the tabs' scene) and the app's root background (behind the keyboard and between pages) follow the theme
 * tokens, so dark mode never flashes a light frame.
 */
function AppTheme({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const dark = t.bg === '#000000';
  const nav = useMemo(
    () => ({ ...(dark ? DarkTheme : DefaultTheme), colors: { ...(dark ? DarkTheme : DefaultTheme).colors, primary: t.ok, background: t.bg, card: t.card, text: t.fg, border: t.line, notification: t.bad } }),
    [dark, t],
  );
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);
  return <NavTheme value={nav}>{children}</NavTheme>;
}
