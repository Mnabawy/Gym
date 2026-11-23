// User settings: plan overrides (sets, rest) and app toggles. Saved as JSON in storage meta; applied to PROGRAM on load and change.
// Two meta keys: `settings` and `device` (this phone only: DEVICE_SETTINGS, e.g. the backup folder; a backup put back on
// another phone keeps that phone's). Fields this build doesn't know are kept in `settings` (records.ts rule).
import { create } from 'zustand';
import { ALL_EXERCISES, applyBase, applyPlan, applyProgram, DEFAULT_REST, DEFAULT_SETS, PAST_DAYS, PLAN_WEEKDAYS, PROGRAM, type ProgramEdit, type Template } from '../data/program';
import { parsePastDays, parseTemplate, PAST_DAYS_KEY, TEMPLATE_KEY } from './template';
import { isPdf, PAST_KEY, parsePast, pastJson, parseProgram, PROGRAM_KEY, remember } from './programEdit';
import { storage } from './storage';
import { useDataVersion } from './bus';
import { DEFAULT_BODY, parseBody, type Body } from './energy';
import { addDays, dateKey } from './dates';
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
  /** Shopping trips per week; the list is split across them (src/lib/shop.ts). */
  shopTrips: number;
  /** Body data for the calorie calculator (/calories). */
  body: Body;
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
  /** Last day of a light week (deload): until then every exercise has half its sets. '' = none. */
  deloadUntil: string;
  /** Ask how many reps were left after ticking a set (RIR). */
  askRir: boolean;
  /** Auto progression (progression.ts): sets start from this session's target and the card shows why. Off: last time's numbers, no chip. */
  autoProgress: boolean;
  /** Weekly automatic backup file (src/lib/autoBackup.ts). */
  autoBackup: boolean;
  /** Folder you picked for the automatic backups (Android content URI); empty = inside the app only. */
  backupDir: string;
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
  shopTrips: 1,
  body: DEFAULT_BODY,
  shopMoves: {},
  barKg: 20,
  reminder: false,
  reminderTime: 19 * 60,
  reminderDays: [...PLAN_WEEKDAYS],
  askRir: true,
  autoProgress: true,
  brief: false,
  briefTime: 6 * 60,
  deloadUntil: '',
  autoBackup: true,
  backupDir: '',
};

const KEY = 'settings';
/** Settings that belong to one phone (a folder URI only valid there, screen and buzz): kept under meta `device`. */
export const DEVICE_SETTINGS = ['backupDir', 'keepAwake', 'haptics'] as const;
/** Phone-only meta: the DEVICE_SETTINGS fields (isLocalMeta). */
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
    if (['sets', 'body', 'shopMoves', 'reminderDays'].includes(k)) continue;
    if (typeof o[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = o[k];
  }
  if (o.sets && typeof o.sets === 'object') {
    for (const [id, n] of Object.entries(o.sets as Record<string, unknown>)) {
      if (id in DEFAULT_SETS && typeof n === 'number' && Number.isFinite(n)) out.sets[id] = n;
    }
  }
  out.body = parseBody(o.body);
  if (o.shopMoves && typeof o.shopMoves === 'object') {
    for (const [key, t] of Object.entries(o.shopMoves as Record<string, unknown>)) if (typeof t === 'number' && Number.isInteger(t) && t >= 0) out.shopMoves[key] = t;
  }
  if (Array.isArray(o.reminderDays)) out.reminderDays = [...new Set(o.reminderDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!(out.reminderTime >= 0 && out.reminderTime < 24 * 60)) out.reminderTime = DEFAULT_SETTINGS.reminderTime;
  if (!(out.briefTime >= 0 && out.briefTime < 24 * 60)) out.briefTime = DEFAULT_SETTINGS.briefTime;
  return out;
}

type Store = Settings & {
  update: (p: Partial<Settings>) => void;
  /** Set one exercise's sets; going back to the PDF number removes the override. */
  setSets: (id: string, n: number) => void;
  /** Save body data (doesn't touch the plan, so typing doesn't re-render the workout). */
  setBody: (p: Partial<Body>) => void;
  /** Save settings that don't touch the plan. */
  setQuiet: (p: Partial<Pick<Settings, 'shopMoves' | 'barKg' | 'reminder' | 'reminderTime' | 'reminderDays' | 'askRir' | 'autoProgress' | 'autoBackup' | 'backupDir' | 'brief' | 'briefTime'>>) => void;
  /** Save your own program (null = back to the base's) and apply it everywhere. */
  setProgram: (edit: ProgramEdit | null) => void;
  /**
   * Switch to a generated plan (null = back to the PDF): your edits on the old one go, its days and exercises are
   * remembered for old sessions, and your training days become the plan's.
   */
  setTemplate: (t: Template | null) => void;
  reset: () => void;
  /** Re-read saved settings (after restoring a backup). */
  reload: () => void;
  /** A light week from today for 7 days (half the sets), or end it early. */
  startDeload: () => void;
  stopDeload: () => void;
  /** Re-apply the plan for today (a light week that ended halves nothing any more). Call when the day rolls over. */
  refreshPlan: () => void;
};

/** Base program (the PDF or your generated plan), then your edits on it: the saved sets overrides are checked against its exercises. */
function applySaved() {
  const past = parsePastDays(storage.getMeta(PAST_DAYS_KEY));
  for (const k of Object.keys(PAST_DAYS)) delete PAST_DAYS[Number(k)];
  Object.assign(PAST_DAYS, past);
  applyBase(parseTemplate(storage.getMeta(TEMPLATE_KEY)));
  applyProgram(parseProgram(storage.getMeta(PROGRAM_KEY)));
}
applySaved();
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
 * the stored value; fields this build doesn't know stay as they are.
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
    // Body data isn't a "setting" to reset.
    reset: () => commit({ ...DEFAULT_SETTINGS, sets: {}, body: get().body, shopMoves: {}, reminderDays: [...DEFAULT_SETTINGS.reminderDays] }),
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
    setTemplate: (t) => {
      // Old days and exercises keep their names where their logged sets show up.
      const pastRaw = storage.getMeta(PAST_KEY);
      storage.setMeta(PAST_KEY, pastJson(pastRaw, remember(parsePast(pastRaw), ALL_EXERCISES)));
      const days = { ...parsePastDays(storage.getMeta(PAST_DAYS_KEY)), ...Object.fromEntries(PROGRAM.map((d) => [d.weekday, d.titleAr])) };
      storage.setMeta(PAST_DAYS_KEY, JSON.stringify(days));
      storage.setMeta(TEMPLATE_KEY, t ? JSON.stringify(t) : '');
      storage.setMeta(PROGRAM_KEY, '');
      applySaved();
      const sets = Object.fromEntries(Object.entries(get().sets).filter(([id]) => id in DEFAULT_SETS));
      commit({ ...pick(get()), sets, reminderDays: [...PLAN_WEEKDAYS] });
    },
    reload: () => {
      applySaved();
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
