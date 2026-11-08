// بومودورو on the phone: sessions, settings and the running clock in storage meta (src/lib/focus.ts), plus a
// notification when the phase ends so you hear it with the app closed.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useDataVersion } from './bus';
import { dateKey } from './logic';
import { storage } from './storage';
import { buzz } from './timer';
import { FOCUS_CFG_KEY, FOCUS_KEY, FOCUS_STATE_KEY, finish, parseCfg, parseSessions, parseState, pause, PHASE_AR, reset, start, type Cfg, type State } from './focus';

const native = Platform.OS !== 'web';
const NOTIF = 'focus-end';

export const readCfg = () => parseCfg(storage.getMeta(FOCUS_CFG_KEY));
export const readSessions = () => parseSessions(storage.getMeta(FOCUS_KEY));
export const readFocus = () => parseState(storage.getMeta(FOCUS_STATE_KEY));

export function saveCfg(c: Cfg) {
  storage.setMeta(FOCUS_CFG_KEY, JSON.stringify(c));
  useDataVersion.getState().bump();
}

async function notify(s: State) {
  if (!native) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF).catch(() => {});
    if (s.endAt == null) return;
    const seconds = Math.round((s.endAt - Date.now()) / 1000);
    if (seconds < 1) return;
    if (Platform.OS === 'android') {
      // eslint-disable-next-line import/namespace -- exported via export * (tsc resolves it)
      await Notifications.setNotificationChannelAsync('focus', { name: 'بومودورو', importance: Notifications.AndroidImportance.HIGH });
    }
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && !(await Notifications.requestPermissionsAsync()).granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF,
      content: s.phase === 'focus' ? { title: 'خلصت فترة التركيز 🎉', body: 'خد راحة. قوم اتحرك واشرب ماية', sound: true } : { title: `${PHASE_AR[s.phase]} خلصت`, body: 'يلا نرجع نركّز', sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false, channelId: 'focus' },
    });
  } catch {}
}

function write(s: State) {
  storage.setMeta(FOCUS_STATE_KEY, JSON.stringify(s));
  void notify(s);
  useDataVersion.getState().bump();
}

export const setFocus = (p: Partial<Pick<State, 'kind' | 'task'>>) => {
  const s = { ...readFocus(), ...p };
  if (!s.task) delete s.task;
  write(s);
};
export const startFocus = () => write(start(readFocus(), readCfg(), Date.now()));
export const pauseFocus = () => write(pause(readFocus(), Date.now()));
export const resetFocus = () => write(reset(readFocus()));

/** Ends the phase (on time or skipped), logs the focus block, and moves on. */
export function endPhase(done: boolean) {
  const now = Date.now();
  const r = finish(readFocus(), readCfg(), now, done, `f${now.toString(36)}`, dateKey());
  if (r.session) storage.setMeta(FOCUS_KEY, JSON.stringify([...readSessions(), r.session]));
  if (done) buzz();
  write(r.state);
}

/** Called every second while the page is open (and on open): ends the phase once its time is up. */
export function tickFocus(now: number) {
  const s = readFocus();
  if (s.endAt != null && now >= s.endAt) endPhase(true);
}
