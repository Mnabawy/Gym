// User settings: plan overrides (sets, rest) and app toggles. Saved as JSON in storage meta; applied to PROGRAM on load and change.
import { create } from 'zustand';
import { applyPlan, DEFAULT_REST, DEFAULT_SETS, PLAN_WEEKDAYS } from '../data/program';
import { storage } from './storage';
import { useDataVersion } from './bus';
import { DEFAULT_BODY, parseBody, type Body } from './energy';
import { METHODS, parsePlace, type Method, type Place } from './prayer';

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
  neonMode: boolean;
  /** Items you put on another trip (shopping tab edit mode): "tripCount:itemId" → trip index. */
  shopMoves: Record<string, number>;
  /** Weight of the bar on barbell exercises, for the plate calculator (src/lib/plates.ts). */
  barKg: number;
  /** Daily workout reminder (phone only, src/lib/reminder.ts). */
  reminder: boolean;
  /** Minutes after midnight. */
  reminderTime: number;
  /** Weekdays (0 = Sunday) to remind on. */
  reminderDays: number[];
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
  neonMode: true,
  barKg: 20,
  reminder: false,
  reminderTime: 19 * 60,
  reminderDays: [...PLAN_WEEKDAYS],
};

const KEY = 'settings';

/** Parse saved settings, dropping unknown or wrong-typed fields so a bad value never breaks the app. */
export function parseSettings(raw: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, sets: {}, body: { ...DEFAULT_BODY }, shopMoves: {}, reminderDays: [...DEFAULT_SETTINGS.reminderDays] };
  if (!raw) return out;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!v || typeof v !== 'object') return out;
  const o = v as Record<string, unknown>;
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
  setQuiet: (p: Partial<Pick<Settings, 'prayer' | 'prayerMethod' | 'place' | 'shopMoves' | 'neonMode' | 'barKg' | 'reminder' | 'reminderTime' | 'reminderDays'>>) => void;
  reset: () => void;
  /** Re-read saved settings (after restoring a backup). */
  reload: () => void;
};

const initial = parseSettings(storage.getMeta(KEY));
applyPlan(initial);

const pick = (s: Store): Settings => {
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = s[k as keyof Settings];
  return out as Settings;
};

export const useSettings = create<Store>((set, get) => {
  const commit = (next: Settings) => {
    set(next);
    storage.setMeta(KEY, JSON.stringify(next));
    applyPlan(next);
    useDataVersion.getState().bumpAll(); // screens and exercise cards re-read the plan
  };
  const save = (next: Settings) => {
    set(next);
    storage.setMeta(KEY, JSON.stringify(next));
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
    reload: () => {
      const next = parseSettings(storage.getMeta(KEY));
      set(next);
      applyPlan(next);
      useDataVersion.getState().bumpAll();
    },
  };
});
