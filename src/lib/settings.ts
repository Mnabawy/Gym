// User settings: plan overrides (sets, rest) and app toggles. Saved as JSON in storage meta; applied to PROGRAM on load and change.
import { create } from 'zustand';
import { applyPlan, DEFAULT_REST, DEFAULT_SETS } from '../data/program';
import { storage } from './storage';
import { useDataVersion } from './bus';

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
};

const KEY = 'settings';

/** Parse saved settings, dropping unknown or wrong-typed fields so a bad value never breaks the app. */
export function parseSettings(raw: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, sets: {} };
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
    if (k === 'sets') continue;
    if (typeof o[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = o[k];
  }
  if (o.sets && typeof o.sets === 'object') {
    for (const [id, n] of Object.entries(o.sets as Record<string, unknown>)) {
      if (id in DEFAULT_SETS && typeof n === 'number' && Number.isFinite(n)) out.sets[id] = n;
    }
  }
  return out;
}

type Store = Settings & {
  update: (p: Partial<Settings>) => void;
  /** Set one exercise's sets; going back to the PDF number removes the override. */
  setSets: (id: string, n: number) => void;
  reset: () => void;
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
    useDataVersion.getState().bump(); // screens re-read the plan
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
    reset: () => commit({ ...DEFAULT_SETTINGS, sets: {} }),
  };
});
