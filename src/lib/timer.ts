// Rest timer store. The countdown is based on an end timestamp, so it stays correct after backgrounding.
import { create } from 'zustand';
import { AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSettings } from './settings';

type TimerState = {
  endAt: number | null;
  /** Full rest length in seconds (grows with +30), for the countdown ring. */
  total: number;
  label: string;
  start: (sec: number, label: string) => void;
  add: (sec: number) => void;
  stop: () => void;
};

let notifId: string | null = null;
const KEEP = 'rest-timer';
const native = Platform.OS !== 'web';

if (native) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function ensurePermission(): Promise<boolean> {
  if (!native) return false;
  try {
    if (Platform.OS === 'android') {
      // eslint-disable-next-line import/namespace -- exported via export * (tsc resolves it)
      await Notifications.setNotificationChannelAsync('rest', { name: 'Rest timer', importance: Notifications.AndroidImportance.HIGH });
    }
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    const req = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return req.granted;
  } catch {
    return false;
  }
}

async function cancelNotif() {
  if (notifId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notifId);
    } catch {}
    notifId = null;
  }
}

async function scheduleNotif(endAt: number, label: string) {
  await cancelNotif();
  const seconds = Math.round((endAt - Date.now()) / 1000);
  if (seconds < 1 || !(await ensurePermission())) return;
  try {
    notifId = await Notifications.scheduleNotificationAsync({
      content: { title: 'الراحة خلصت', body: `يلا المجموعة الجاية · ${label}`, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false, channelId: 'rest' },
    });
  } catch {}
}

export const useTimer = create<TimerState>((set, get) => ({
  endAt: null,
  total: 0,
  label: '',
  start: (sec, label) => {
    set({ endAt: Date.now() + sec * 1000, total: sec, label });
    if (native && useSettings.getState().keepAwake) activateKeepAwakeAsync(KEEP).catch(() => {});
  },
  add: (sec) => {
    const { endAt: e, total } = get();
    if (e) set({ endAt: e + sec * 1000, total: total + sec });
  },
  stop: () => {
    set({ endAt: null });
    cancelNotif();
    if (native) {
      try {
        deactivateKeepAwake(KEEP);
      } catch {}
    }
  },
}));

// Schedule a notification only while the app is in the background.
if (native) {
  AppState.addEventListener('change', (s) => {
    const { endAt, label } = useTimer.getState();
    if (s === 'background' && endAt && endAt > Date.now() && useSettings.getState().restAlert) scheduleNotif(endAt, label);
    if (s === 'active') cancelNotif();
  });
}

export function buzz() {
  if (native && useSettings.getState().haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
/** Something you tried didn't go through (e.g. ticking a set with no weight or reps). */
export function nope() {
  if (native && useSettings.getState().haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
export function tap() {
  if (native && useSettings.getState().haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
