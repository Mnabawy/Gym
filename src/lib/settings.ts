// User settings: plan overrides (sets, rest) and app toggles. Saved as JSON in storage meta; applied to PROGRAM on load and change.
// Two meta keys: `settings` (synced one field per row, cloudSync.ts) and `device` (this phone only: DEVICE_SETTINGS, e.g.
// the backup folder, app lock, location). Fields this build doesn't know are kept in `settings` (records.ts rule).
import { create } from 'zustand';
import { ALL_EXERCISES, applyPlan, applyProgram, DEFAULT_REST, DEFAULT_SETS, PLAN_WEEKDAYS, type ProgramEdit } from '../data/program';
import { isPdf, PAST_KEY, parsePast, pastJson, parseProgram, PROGRAM_KEY, remember } from './programEdit';
import { storage } from './storage';
import { useDataVersion } from './bus';
import { DEFAULT_BODY, parseBody, type Body } from './energy';
import { METHODS, parsePlace, type Method, type Place } from './prayer';
import { dateKey } from './logic';
import { addDays } from './gaps';
import { normHex } from './color';
import { DEVICE_SETTINGS } from './cloudSync';
import { isRec, type Rec } from './records';

export type Settings = {
  /** Only exercises changed from the PDF; missing id = default. */
  sets: Record<string, number>;
  restHeavy: number;
  restNormal: number;
  /** Start the rest timer when a set is ticked. */
  autoRest: boolean;
  /** Notification when rest ends while the app is in the background (phone only). */
  restAlert: boolean;
  /** Keep the screen on while the rest timer runs (phone only). */
  keepAwake: boolean;
  haptics: boolean;
  /** kg to add when every set hit the top of the rep range. */
  weightStep: number;
  /** Quran verse popup when the app opens. */
  verse: boolean;
  /** …and when coming back after a long time away. */
  verseOnReturn: boolean;
  /** Shopping trips per week; the list is split across them (src/lib/shop.ts). */
  shopTrips: number;
  /** Body data for the calorie calculator (/calories). */
  body: Body;
  /** Prayer times tab. */
  prayer: boolean;
  prayerMethod: Method;
  /** Last known location for prayer times (refreshed from the phone's location). */
  place: Place | null;
  /** Neon look on the workout tab (dark, glowing accents). */
  /** Items you put on another trip (shopping tab edit mode): "tripCount:itemId" → trip index. */
  shopMoves: Record<string, number>;
  /** Weight of the bar on barbell exercises, for the plate calculator (src/lib/plates.ts). */
  barKg: number;
  /** Daily workout reminder (phone only, src/lib/reminder.ts). */
  reminder: boolean;
  /** Minutes after midnight. */
  reminderTime: number;
  /** Your training weekdays (0 = Sunday): the workout reminder and the morning brief's training days. */
  reminderDays: number[];
  /** Morning brief notification: the day's workout, meals, water and what to get ready (src/lib/brief.ts). */
  brief: boolean;
  /** Minutes after midnight. */
  briefTime: number;
  /** A nightly nudge to empty your head (فضّي دماغك, src/lib/dump.ts) at `dumpTime` (minutes after midnight). */
  dumpRemind: boolean;
  dumpTime: number;
  /** Fingerprint / face lock when the app opens (src/lib/lock.ts). */
  appLock: boolean;
  /** Last day of a light week (deload): until then every exercise has half its sets. '' = none. */
  deloadUntil: string;
  /** Read daily steps from Android Health Connect (src/lib/steps.ts). */
  stepsSync: boolean;
  /** Ask how many reps were left after ticking a set (RIR). */
  askRir: boolean;
  /** Weekly automatic backup file (src/lib/autoBackup.ts). */
  autoBackup: boolean;
  /** Folder you picked for the automatic backups (Android content URI); empty = inside the app only. */
  backupDir: string;
  /** Your app color (#RRGGBB) for buttons, ticks and rings everywhere (the owner's red by default); '' = each theme's own. */
  accent: string;
  /** Design version the settings were saved under; 2 = the Apple look (old default red became system blue). */
  look: number;
};

export const DEFAULT_SETTINGS: Settings = {
  sets: {},
  restHeavy: DEFAULT_REST.heavy,
  restNormal: DEFAULT_REST.normal,
  autoRest: true,
  restAlert: true,
  keepAwake: true,
  haptics: true,
  weightStep: 2.5,
  verse: true,
  verseOnReturn: true,
  shopTrips: 1,
  body: DEFAULT_BODY,
  prayer: false,
  prayerMethod: 'egyptian',
  place: null,
  shopMoves: {},
  barKg: 20,
  reminder: false,
  reminderTime: 19 * 60,
  reminderDays: [...PLAN_WEEKDAYS],
  askRir: true,
  brief: false,
  briefTime: 6 * 60,
  dumpRemind: false,
  dumpTime: 22 * 60 + 30,
  appLock: false,
  deloadUntil: '',
  stepsSync: false,
  autoBackup: true,
  backupDir: '',
  accent: '#007AFF',
  look: 2,
};

const KEY = 'settings';
/** Phone-only meta: the DEVICE_SETTINGS fields (never synced; isLocalMeta). */
export const DEVICE_KEY = 'device';
const DEVICE = new Set<string>(DEVICE_SETTINGS);
const KNOWN = new Set(Object.keys(DEFAULT_SETTINGS));

function obj(raw: string | null | undefined): Rec | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isRec(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Parse saved settings, dropping unknown or wrong-typed fields so a bad value never breaks the app. `device`: the
 * phone-only part (meta `device`); when given, the phone-only fields come only from it (a pulled `settings` value never
 * sets them). Without it (saved before the split) they come from `raw`.
 */
export function parseSettings(raw: string | null, device?: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, sets: {}, body: { ...DEFAULT_BODY }, shopMoves: {}, reminderDays: [...DEFAULT_SETTINGS.reminderDays] };
  let o: Rec | null = obj(raw);
  if (device != null) {
    const dev = obj(device) ?? {};
    o = Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !DEVICE.has(k)));
    for (const k of DEVICE) if (k in dev) o[k] = dev[k];
  }
  if (!o) return out;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (['sets', 'body', 'place', 'prayerMethod', 'shopMoves', 'reminderDays'].includes(k)) continue;
    if (typeof o[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = o[k];
  }
  if (o.sets && typeof o.sets === 'object') {
    for (const [id, n] of Object.entries(o.sets as Record<string, unknown>)) {
      if (id in DEFAULT_SETS && typeof n === 'number' && Number.isFinite(n)) out.sets[id] = n;
    }
  }
  out.body = parseBody(o.body);
  out.place = parsePlace(o.place);
  if (o.shopMoves && typeof o.shopMoves === 'object') {
    for (const [key, t] of Object.entries(o.shopMoves as Record<string, unknown>)) if (typeof t === 'number' && Number.isInteger(t) && t >= 0) out.shopMoves[key] = t;
  }
  if (Array.isArray(o.reminderDays)) out.reminderDays = [...new Set(o.reminderDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!(out.reminderTime >= 0 && out.reminderTime < 24 * 60)) out.reminderTime = DEFAULT_SETTINGS.reminderTime;
  if (!(out.briefTime >= 0 && out.briefTime < 24 * 60)) out.briefTime = DEFAULT_SETTINGS.briefTime;
  if (!(out.dumpTime >= 0 && out.dumpTime < 24 * 60)) out.dumpTime = DEFAULT_SETTINGS.dumpTime;
  out.accent = out.accent === '' ? '' : normHex(out.accent) ?? DEFAULT_SETTINGS.accent;
  // Moving to the Apple look: the old default red becomes system blue once; a color picked after that stays.
  if (typeof o.look !== 'number' && out.accent === '#B93435') out.accent = DEFAULT_SETTINGS.accent;
  out.look = DEFAULT_SETTINGS.look;
  if (typeof o.prayerMethod === 'string' && o.prayerMethod in METHODS) out.prayerMethod = o.prayerMethod as Method;
  return out;
}

type Store = Settings & {
  update: (p: Partial<Settings>) => void;
  /** Set one exercise's sets; going back to the PDF number removes the override. */
  setSets: (id: string, n: number) => void;
  /** Save body data (doesn't touch the plan, so typing doesn't re-render the workout). */
  setBody: (p: Partial<Body>) => void;
  /** Save prayer settings / location (doesn't touch the plan). */
  setQuiet: (p: Partial<Pick<Settings, 'prayer' | 'prayerMethod' | 'place' | 'shopMoves' | 'barKg' | 'reminder' | 'reminderTime' | 'reminderDays' | 'askRir' | 'autoBackup' | 'backupDir' | 'brief' | 'briefTime' | 'dumpRemind' | 'dumpTime' | 'appLock' | 'stepsSync' | 'accent'>>) => void;
  /** Save your own program (null = back to the PDF's) and apply it everywhere. */
  setProgram: (edit: ProgramEdit | null) => void;
  reset: () => void;
  /** Re-read saved settings (after restoring a backup). */
  reload: () => void;
  /** A light week from today for 7 days (half the sets), or end it early. */
  startDeload: () => void;
  stopDeload: () => void;
  /** Re-apply the plan for today (a light week that ended halves nothing any more). Call when the day rolls over. */
  refreshPlan: () => void;
};

// Your edited program first: the saved sets overrides are checked against its exercises.
applyProgram(parseProgram(storage.getMeta(PROGRAM_KEY)));
/** A light week is on today. */
export const deloadOn = (s: Pick<Settings, 'deloadUntil'>, today: string = dateKey()) => !!s.deloadUntil && today <= s.deloadUntil;
/** The plan with the light week applied when it's on. */
const plan = (s: Settings) => ({ ...s, deload: deloadOn(s) });

/** The phone-only fields of `s`, as stored under `device`. */
const devicePart = (s: Settings): Rec => Object.fromEntries(DEVICE_SETTINGS.map((k) => [k, s[k]]));

/**
 * Settings as saved. The first time on this phone (saved before the phone-only fields moved out, or a backup from
 * then was put back) the phone-only fields move from `settings` to `device`.
 */
function load(): Settings {
  let device = storage.getMeta(DEVICE_KEY);
  if (!device) {
    device = JSON.stringify(devicePart(parseSettings(storage.getMeta(KEY))));
    storage.setMeta(DEVICE_KEY, device);
  }
  return parseSettings(storage.getMeta(KEY), device);
}

/**
 * Saves `next`: the phone-only fields under `device`; under `settings` only the fields that changed from `prev` go into
 * the stored value. Settings sync one field per row (newest wins), so a field this phone never set must not be written
 * as a fresh edit of its default (it would beat another phone's real choice); fields this build doesn't know (a newer
 * build's) stay as they are.
 */
function write(prev: Settings, next: Settings) {
  storage.setMeta(DEVICE_KEY, JSON.stringify(devicePart(next)));
  const o: Rec = obj(storage.getMeta(KEY)) ?? {};
  for (const k of DEVICE) delete o[k];
  for (const k of KNOWN) {
    if (DEVICE.has(k)) continue;
    const v = next[k as keyof Settings];
    if (JSON.stringify(v) !== JSON.stringify(prev[k as keyof Settings])) o[k] = v;
  }
  // Saved under the Apple look: parseSettings moves the old default red to blue only while `look` is missing, so a
  // stored color it moved goes in with it (or the red would come back on the next start). A color never stored stays
  // unwritten (it would beat another phone's real choice).
  if (o.look !== next.look) {
    o.look = next.look;
    if (o.accent !== undefined && o.accent !== next.accent) o.accent = next.accent;
  }
  storage.setMeta(KEY, JSON.stringify(o));
}

const initial = load();
applyPlan(plan(initial));

const pick = (s: Store): Settings => {
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = s[k as keyof Settings];
  return out as Settings;
};

export const useSettings = create<Store>((set, get) => {
  const commit = (next: Settings) => {
    const prev = pick(get());
    set(next);
    write(prev, next);
    applyPlan(plan(next));
    useDataVersion.getState().bumpAll(); // screens and exercise cards re-read the plan
  };
  const save = (next: Settings) => {
    const prev = pick(get());
    set(next);
    write(prev, next);
  };
  return {
    ...initial,
    update: (p) => commit({ ...pick(get()), ...p }),
    setSets: (id, n) => {
      const sets = { ...get().sets };
      if (n === DEFAULT_SETS[id]) delete sets[id];
      else sets[id] = n;
      commit({ ...pick(get()), sets });
    },
    setBody: (p) => save({ ...pick(get()), body: { ...get().body, ...p } }),
    setQuiet: (p) => save({ ...pick(get()), ...p }),
    // Body data and the saved location aren't "settings" to reset.
    reset: () => commit({ ...DEFAULT_SETTINGS, sets: {}, body: get().body, place: get().place, shopMoves: {}, reminderDays: [...DEFAULT_SETTINGS.reminderDays] }),
    setProgram: (edit) => {
      const keep = edit && !isPdf(edit) ? edit : null;
      // Remember every exercise you had, so a deleted one keeps its name on the progress page.
      const pastRaw = storage.getMeta(PAST_KEY);
      storage.setMeta(PAST_KEY, pastJson(pastRaw, remember(parsePast(pastRaw), [...ALL_EXERCISES, ...Object.values(edit ?? {}).flat()])));
      if (keep) storage.setMeta(PROGRAM_KEY, JSON.stringify(keep));
      else storage.setMeta(PROGRAM_KEY, '');
      applyProgram(keep);
      // Overrides for exercises that are gone are dropped.
      const sets = Object.fromEntries(Object.entries(get().sets).filter(([id]) => id in DEFAULT_SETS));
      commit({ ...pick(get()), sets });
    },
    reload: () => {
      applyProgram(parseProgram(storage.getMeta(PROGRAM_KEY)));
      const next = load();
      set(next);
      applyPlan(plan(next));
      useDataVersion.getState().bumpAll();
    },
    startDeload: () => commit({ ...pick(get()), deloadUntil: addDays(dateKey(), 6) }),
    stopDeload: () => commit({ ...pick(get()), deloadUntil: '' }),
    refreshPlan: () => {
      applyPlan(plan(pick(get())));
      useDataVersion.getState().bumpAll();
    },
  };
});
