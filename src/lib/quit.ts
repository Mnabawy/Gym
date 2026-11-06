// Quitting a bad habit (the بطّل section): a live count of clean time since the last slip, milestones, urges you rode
// out, slips with what set them off, and what you saved. Saved as JSON in storage meta `quits`. Pure — unit tested in
// __tests__/quit.test.ts.
//
// How it helps, and why:
// - A slip doesn't wipe your record. Treating one lapse as total failure ("abstinence violation effect", Marlatt &
//   Gordon 1985, Relapse Prevention) makes a full relapse more likely, so the longest run and the share of clean days
//   stay on screen after a slip, and the copy after one is about the next step, not the reset.
// - Urges rise, peak and fade on their own, usually within minutes, if you don't act on them ("urge surfing",
//   Bowen & Marlatt 2009). The urge button gives 15 minutes with slow breathing (in 4 s, out 6 s), your reason and
//   your replacement, then asks how it went.
// - Knowing your triggers is the core of relapse prevention: each slip or urge can carry one (boredom, stress, anger,
//   loneliness, tiredness, hunger — HALT — plus places/people and the phone), and the page shows the most common one
//   and the time of day you slip most.
// - A replacement behaviour for the same cue (competing response, from habit reversal training, Azrin & Nunn 1973).
// - Milestones at 1, 3, 7, 14, 30, 60, 90, 180 and 365 days give near goals instead of one far one.
import { dateKey } from './logic';

export const QUITS_KEY = 'quits';
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Minutes the urge screen runs. */
export const URGE_MINUTES = 15;
export const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;

export const TRIGGERS = {
  bored: 'زهق',
  stress: 'توتر',
  angry: 'زعل',
  lonely: 'وحدة',
  tired: 'تعب',
  hungry: 'جوع',
  place: 'مكان أو ناس',
  phone: 'الموبايل',
} as const;
export type Trigger = keyof typeof TRIGGERS;

export type Slip = { at: number; trigger?: Trigger; note?: string };
export type Urge = { at: number; resisted: boolean; trigger?: Trigger };
export type Quit = {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** When you stopped (ms). */
  start: number;
  /** Why you're quitting, shown when an urge comes. */
  why: string;
  /** What you do instead when the urge comes. */
  replace: string;
  /** Money it cost a day, and its currency. */
  costPerDay: number;
  currency: string;
  /** Minutes it took a day. */
  minutesPerDay: number;
  slips: Slip[];
  urges: Urge[];
};

export const QUIT_ICONS = ['ban', 'flame', 'phone-portrait', 'logo-no-smoking', 'cafe', 'fast-food', 'game-controller', 'tv', 'bed', 'wine', 'cash', 'chatbubbles'] as const;
export const QUIT_COLORS = ['#7A5CFA', '#E0609B', '#D55E00', '#1BA6A8', '#2563EB', '#3E9A68'] as const;

const num = (n: unknown, d = 0) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : d);
const str = (s: unknown) => (typeof s === 'string' ? s : '');
const trig = (t: unknown): Trigger | undefined => (typeof t === 'string' && t in TRIGGERS ? (t as Trigger) : undefined);

export function parseQuits(raw: string | null): Quit[] {
  let data: unknown;
  try {
    data = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: Quit[] = [];
  for (const q of data) {
    if (!q || typeof q !== 'object') continue;
    const o = q as Record<string, unknown>;
    if (typeof o.id !== 'string' || seen.has(o.id) || !str(o.name).trim() || !(num(o.start) > 0)) continue;
    seen.add(o.id);
    const list = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && num(x.at) > 0) : []);
    out.push({
      id: o.id,
      name: str(o.name).trim(),
      icon: str(o.icon) || QUIT_ICONS[0],
      color: /^#[0-9a-f]{6}$/i.test(str(o.color)) ? str(o.color) : QUIT_COLORS[0],
      start: num(o.start),
      why: str(o.why),
      replace: str(o.replace),
      costPerDay: num(o.costPerDay),
      currency: str(o.currency) || 'ج.م',
      minutesPerDay: num(o.minutesPerDay),
      slips: list(o.slips).map((s) => ({ at: s.at as number, ...(trig(s.trigger) ? { trigger: trig(s.trigger) } : {}), ...(str(s.note) ? { note: str(s.note) } : {}) })).sort((a, b) => a.at - b.at),
      urges: list(o.urges).map((u) => ({ at: u.at as number, resisted: u.resisted === true, ...(trig(u.trigger) ? { trigger: trig(u.trigger) } : {}) })).sort((a, b) => a.at - b.at),
    });
  }
  return out;
}

export const quitId = (now: number = Date.now()) => `q${now.toString(36)}`;

/** Start of the current clean run: the last slip, or when you stopped. */
export const runStart = (q: Quit) => Math.max(q.start, ...q.slips.map((s) => s.at));

/** The current run split into days, hours, minutes and seconds. */
export function clean(q: Quit, now: number): { ms: number; days: number; hours: number; minutes: number; seconds: number } {
  const ms = Math.max(0, now - runStart(q));
  return { ms, days: Math.floor(ms / DAY_MS), hours: Math.floor(ms / 3600000) % 24, minutes: Math.floor(ms / 60000) % 60, seconds: Math.floor(ms / 1000) % 60 };
}

/** The milestone you're heading for, the one before it, and how far between them (0–1). Past a year: every 365 days. */
export function milestone(ms: number): { next: number; prev: number; share: number } {
  const d = ms / DAY_MS;
  let prev: number;
  let next: number;
  if (d < 365) {
    next = MILESTONES.find((m) => m > d)!;
    prev = [...MILESTONES].reverse().find((m) => m <= d) ?? 0;
  } else {
    prev = Math.floor(d / 365) * 365;
    next = prev + 365;
  }
  return { next, prev, share: (d - prev) / (next - prev) };
}

/** Your longest clean run in ms (the current one counts). */
export function longest(q: Quit, now: number): number {
  const marks = [q.start, ...q.slips.map((s) => s.at).filter((t) => t >= q.start), now];
  let best = 0;
  for (let i = 1; i < marks.length; i++) best = Math.max(best, marks[i] - marks[i - 1]);
  return best;
}

/** Days since you stopped (today counts), and how many of them had no slip. */
export function cleanDays(q: Quit, now: number): { total: number; clean: number; rate: number } {
  const startDay = dateKey(new Date(q.start));
  const days = Math.max(1, Math.round((new Date(`${dateKey(new Date(now))}T12:00:00`).getTime() - new Date(`${startDay}T12:00:00`).getTime()) / DAY_MS) + 1);
  const slipDays = new Set(q.slips.filter((s) => s.at >= q.start).map((s) => dateKey(new Date(s.at)))).size;
  const ok = Math.max(0, days - slipDays);
  return { total: days, clean: ok, rate: ok / days };
}

/** Money and minutes not spent: per clean day, counted in hours since you stopped minus the slip days. */
export function saved(q: Quit, now: number): { money: number; minutes: number } {
  const days = Math.max(0, (now - q.start) / DAY_MS);
  const slipDays = new Set(q.slips.filter((s) => s.at >= q.start).map((s) => dateKey(new Date(s.at)))).size;
  const n = Math.max(0, days - slipDays);
  return { money: Math.round(q.costPerDay * n), minutes: Math.round(q.minutesPerDay * n) };
}

/** What sets you off most: triggers on slips and on urges, most common first. */
export function triggerCounts(q: Quit): { trigger: Trigger; slips: number; urges: number }[] {
  const m = new Map<Trigger, { slips: number; urges: number }>();
  const add = (t: Trigger | undefined, k: 'slips' | 'urges') => {
    if (!t) return;
    const v = m.get(t) ?? { slips: 0, urges: 0 };
    v[k]++;
    m.set(t, v);
  };
  q.slips.forEach((s) => add(s.trigger, 'slips'));
  q.urges.forEach((u) => add(u.trigger, 'urges'));
  return [...m.entries()].map(([trigger, v]) => ({ trigger, ...v })).sort((a, b) => b.slips + b.urges - (a.slips + a.urges) || b.slips - a.slips);
}

export const PARTS_OF_DAY = [
  { key: 'morning', label: 'الصبح', from: 5, to: 12 },
  { key: 'noon', label: 'الضهر والعصر', from: 12, to: 17 },
  { key: 'evening', label: 'بالليل', from: 17, to: 22 },
  { key: 'late', label: 'آخر الليل', from: 22, to: 29 },
] as const;

/** The part of the day you slip or get urges most (null with fewer than 2). */
export function riskyTime(q: Quit): (typeof PARTS_OF_DAY)[number] | null {
  const times = [...q.slips.map((s) => s.at), ...q.urges.map((u) => u.at)];
  if (times.length < 2) return null;
  const count = PARTS_OF_DAY.map((p) => times.filter((t) => {
    const h = new Date(t).getHours();
    const hh = h < 5 ? h + 24 : h;
    return hh >= p.from && hh < p.to;
  }).length);
  const best = count.indexOf(Math.max(...count));
  return PARTS_OF_DAY[best];
}

/** Urges you rode out, of all the ones you logged. */
export const urgeScore = (q: Quit) => ({ resisted: q.urges.filter((u) => u.resisted).length, total: q.urges.length });

/** The milestone days already reached in the current run. */
export const reached = (ms: number) => MILESTONES.filter((m) => ms >= m * DAY_MS);

export type QuitWeek = { id: string; cleanDays: number; slips: number; resisted: number; urges: number };

/** Each quit's week (from–to, date keys): clean days, slips, urges ridden out. */
export function quitsWeek(quits: readonly Quit[], from: string, to: string, today: string): QuitWeek[] {
  const end = to < today ? to : today;
  return quits
    .filter((q) => dateKey(new Date(q.start)) <= end)
    .map((q) => {
      const inWeek = (t: number) => {
        const d = dateKey(new Date(t));
        return d >= from && d <= end;
      };
      const startDay = dateKey(new Date(q.start));
      const first = startDay > from ? startDay : from;
      const days = Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${first}T12:00:00`).getTime()) / DAY_MS) + 1;
      const slipDays = new Set(q.slips.filter((s) => inWeek(s.at)).map((s) => dateKey(new Date(s.at)))).size;
      return { id: q.id, cleanDays: Math.max(0, days - slipDays), slips: q.slips.filter((s) => inWeek(s.at)).length, resisted: q.urges.filter((u) => u.resisted && inWeek(u.at)).length, urges: q.urges.filter((u) => inWeek(u.at)).length };
    });
}

/** "12 يوم" / "يوم واحد" / "5 ساعات" — the run in words for small places. */
export function runLabel(ms: number): string {
  const d = Math.floor(ms / DAY_MS);
  if (d >= 2) return `${d} يوم`;
  if (d === 1) return 'يوم واحد';
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `${h} ساعة` : `${Math.floor(ms / 60000)} دقيقة`;
}
