import { useEffect, useMemo } from 'react';
import { AppState, I18nManager, Platform } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider as NavTheme, Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UndoBar } from '../components/UndoBar';
import { ConfirmHost } from '../components/ConfirmHost';
import { useDataVersion } from '../lib/bus';
import { syncReminders } from '../lib/reminder';
import { runAutoBackup } from '../lib/autoBackup';
import { hasLocalData } from '../lib/safety';
import { repairRecoveries } from '../lib/safetyIO';
import { metaMigrations, storage } from '../lib/storage';
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
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  // Automatic backups, a little after opening so they don't slow the start.
  useEffect(() => {
    const id = setTimeout(async () => {
      await runAutoBackup().catch((e) => report(e, 'autoBackup'));
    }, 5000);
    return () => clearTimeout(id);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AppTheme>
      {/* iOS-style push on both phones; swipe back from anywhere on the page (iPhone). */}
      <Stack screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'ios_from_right' : 'default', fullScreenGestureEnabled: true }} />
      </AppTheme>
      <ReminderSync />
      <RepairRecoveries />
      <UndoBar />
      <ConfirmHost />
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Keeps the reminders in step with the settings and the log (a few seconds after the last change), and fresh each time the app comes back (the morning brief's text is built from today). */
function ReminderSync() {
  const on = useSettings((s) => s.reminder);
  const time = useSettings((s) => s.reminderTime);
  const days = useSettings((s) => s.reminderDays);
  const brief = useSettings((s) => s.brief);
  const briefTime = useSettings((s) => s.briefTime);
  const shopTrips = useSettings((s) => s.shopTrips);
  const shopMoves = useSettings((s) => s.shopMoves);
  const v = useDataVersion((s) => s.v);
  useEffect(() => {
    const id = setTimeout(() => syncReminders(), 2000);
    return () => clearTimeout(id);
  }, [on, time, days, brief, briefTime, shopTrips, shopMoves, v]);
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

/** After an interrupted restore: put the photos back and delete old recovery folders (src/lib/safetyIO.ts). */
function RepairRecoveries() {
  useEffect(() => {
    try {
      void repairRecoveries(hasLocalData(storage.dump())).catch((e) => report(e, 'repairRecoveries'));
    } catch (e) {
      report(e, 'repairRecoveries');
    }
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
