// One calendar for the whole app (/calendar): pick what it shows — the gym, habits, goals or quitting — and each day
// gets a mark for how it went. Pure: the page reads the data and passes it in.
import { addDays } from './gaps';
import { isDue, logKey, partsDone, type Habit, type Log, type PartsLog } from './habits';
import { schedule, type Goal } from './goals';
import type { Quit } from './quit';

export type CalSource = 'gym' | 'habits' | 'goals' | 'quit';
export const CAL_SOURCES: { key: CalSource; label: string; icon: string }[] = [
  { key: 'gym', label: 'الجيم', icon: 'barbell-outline' },
  { key: 'habits', label: 'العادات', icon: 'repeat-outline' },
  { key: 'goals', label: 'الأهداف', icon: 'flag-outline' },
  { key: 'quit', label: 'بطّل', icon: 'hand-left-outline' },
];

/**
 * How a day went: `done` (all of it), `part` (some: `v` 0–1), `plan` (something planned for it, nothing done yet),
 * `bad` (missed / slipped), `clean` (a clean day while quitting). `lines` = what happened, for the day's details.
 */
export type DayMark = { tone: 'done' | 'part' | 'plan' | 'bad' | 'clean'; v: number; lines: string[] };
export type Marks = Record<string, DayMark>;

/** Every day from `from` to `to` (inclusive). */
export function daysIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Gym: a day with sets ticked is a workout day. `title` names the program day(s) from their weekday ids. */
export function gymMarks(trained: readonly { date: string; weekdays: number[]; sets: number }[], title: (weekday: number) => string): Marks {
  const out: Marks = {};
  for (const d of trained) out[d.date] = { tone: 'done', v: 1, lines: [`${d.weekdays.map(title).filter(Boolean).join(' + ') || 'تمرين'} · ${d.sets} مجموعة`] };
  return out;
}

/**
 * Habits: the share of the day's due habits you did (parts count as a share of their habit). One habit (`only`):
 * done / excused / missed. Days before today with nothing done are `bad` only when something was due.
 */
export function habitMarks(habits: readonly Habit[], log: Log, parts: PartsLog, days: readonly string[], today: string, only?: string): Marks {
  const out: Marks = {};
  const list = only ? habits.filter((h) => h.id === only) : habits;
  for (const d of days) {
    if (d > today) continue;
    let due = 0;
    let got = 0;
    const lines: string[] = [];
    for (const h of list) {
      const mark = log[logKey(h.id, d)];
      if (!isDue(h, d) && mark !== 'done') continue;
      if (mark === 'skip') {
        lines.push(`${h.name}: معذور`);
        continue;
      }
      due++;
      const n = h.parts?.length ?? 0;
      const share = mark === 'done' ? 1 : n ? partsDone(h, log, parts, d).length / n : 0;
      got += share;
      lines.push(`${h.name}: ${share === 1 ? 'عملتها ✓' : share > 0 ? `${Math.round(share * n)} من ${n}` : d === today ? 'لسه' : 'فاتت'}`);
    }
    if (!due && !lines.length) continue;
    const v = due ? got / due : 1;
    out[d] = { tone: v >= 1 ? 'done' : v > 0 ? 'part' : d === today ? 'plan' : 'bad', v, lines };
  }
  return out;
}

/**
 * Goals: steps ticked and progress logged on a day are `done`; a step planned for a day (the goal's spread-out
 * schedule) and not done yet is `plan` (`bad` once its day has passed). One goal (`only`) or all of them.
 */
export function goalMarks(goals: readonly Goal[], today: string, only?: string): Marks {
  const out: Marks = {};
  const add = (d: string, kind: 'done' | 'plan', line: string) => {
    const m = out[d] ?? (out[d] = { tone: 'plan', v: 0, lines: [] });
    m.lines.push(line);
    if (kind === 'done') m.tone = 'done';
    else if (m.tone !== 'done') m.tone = d < today ? 'bad' : 'plan';
    m.v = m.tone === 'done' ? 1 : 0;
  };
  for (const g of goals) {
    if (only && g.id !== only) continue;
    const pre = only ? '' : `${g.name}: `;
    const plan = schedule(g);
    for (const st of g.stages)
      for (const t of st.tasks) {
        if (t.done) add(t.done, 'done', `${pre}✓ ${t.title}`);
        else if (plan?.task[t.id]) add(plan.task[t.id], 'plan', `${pre}${t.title}`);
      }
    for (const e of g.entries) add(e.date, 'done', `${pre}${e.amount > 0 ? '+' : ''}${e.amount}${g.unit ? ` ${g.unit}` : ''}${e.note ? ` · ${e.note}` : ''}`);
  }
  return out;
}

const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Quitting: every day since you stopped is `clean` unless you slipped that day (`bad`); urges you beat are noted. */
export function quitMarks(quits: readonly Quit[], days: readonly string[], today: string, only?: string): Marks {
  const out: Marks = {};
  const list = only ? quits.filter((q) => q.id === only) : quits;
  for (const d of days) {
    if (d > today) continue;
    const lines: string[] = [];
    let any = false;
    let slipped = false;
    for (const q of list) {
      if (d < dayOf(q.start)) continue;
      any = true;
      const pre = only ? '' : `${q.name}: `;
      const slips = q.slips.filter((x) => dayOf(x.at) === d).length;
      const beat = q.urges.filter((x) => x.resisted && dayOf(x.at) === d).length;
      if (slips) {
        slipped = true;
        lines.push(`${pre}وقعت${slips > 1 ? ` ${slips} مرات` : ''}`);
      } else lines.push(`${pre}نضيف${beat ? ` · غلبت ${beat} رغبة` : ''}`);
    }
    if (any) out[d] = { tone: slipped ? 'bad' : 'clean', v: slipped ? 0 : 1, lines };
  }
  return out;
}

/** One line about the month for the source. */
export function monthSummary(src: CalSource, marks: Marks, days: readonly string[], today: string): string {
  const ms = days.filter((d) => d <= today).map((d) => marks[d]).filter((m): m is DayMark => !!m);
  const done = ms.filter((m) => m.tone === 'done').length;
  if (src === 'gym') return done ? `${done} يوم تمرين الشهر ده` : 'مفيش تمرين الشهر ده لسه';
  if (src === 'habits') {
    if (!ms.length) return 'مفيش عادات في الشهر ده';
    const avg = Math.round((ms.reduce((a, m) => a + m.v, 0) / ms.length) * 100);
    return `${done} يوم كامل · متوسط ${avg}%`;
  }
  if (src === 'goals') {
    const planned = days.filter((d) => d > today && marks[d]?.tone === 'plan').length;
    const late = ms.filter((m) => m.tone === 'bad').length;
    return [`${done} يوم فيه تقدّم`, late ? `${late} يوم فيه خطوات اتأخرت` : '', planned ? `${planned} يوم جاي فيه خطوات` : ''].filter(Boolean).join(' · ');
  }
  const clean = ms.filter((m) => m.tone === 'clean').length;
  const bad = ms.filter((m) => m.tone === 'bad').length;
  return ms.length ? `${clean} يوم نضيف${bad ? ` · ${bad} يوم وقعت` : ''}` : 'مفيش حاجة بتبطّلها في الشهر ده';
}

/** One color per step on the goals calendar (iOS system colors, cycled). */
export const STEP_COLORS = ['#007AFF', '#FF9500', '#34C759', '#AF52DE', '#FF2D55', '#30B0C7', '#FFCC00', '#5856D6', '#A2845E', '#FF3B30'] as const;

/** A step's time on the calendar: from the day after the step before it ends (or the goal's start) to its own date. */
export type Span = { id: string; goal: string; lane: number; n: number; title: string; from: string; to: string; color: string; done: boolean };

/**
 * Every step of every goal with a time frame (or just `only`) as a span, in road order: step 1 runs from the goal's
 * start to its date, step 2 from the next day to its date, and so on (dates from `schedule`, yours kept). Each goal
 * gets its own lane, so goals' steps can overlap on the calendar while one goal's steps sit end to end.
 */
export function goalSpans(goals: readonly Goal[], only?: string): Span[] {
  const out: Span[] = [];
  let lane = 0;
  for (const g of goals) {
    if (only && g.id !== only) continue;
    const plan = schedule(g);
    if (!plan) continue;
    let prev: string | null = null;
    let n = 0;
    for (const st of g.stages)
      for (const t of st.tasks) {
        const to = plan.task[t.id];
        if (!to) continue;
        let from = prev ? addDays(prev, 1) : g.startDate;
        if (from > to) from = to;
        out.push({ id: t.id, goal: g.id, lane, n: n + 1, title: t.title, from, to, color: STEP_COLORS[n % STEP_COLORS.length], done: !!t.done });
        prev = to > (prev ?? '') ? to : prev;
        n++;
      }
    if (n) lane++;
  }
  return out;
}

/** The pieces of each lane inside one week (7 dates): which columns each span covers. */
export function weekPieces(spans: readonly Span[], week: readonly string[]): { lane: number; c0: number; c1: number; span: Span }[] {
  const out: { lane: number; c0: number; c1: number; span: Span }[] = [];
  const first = week[0];
  const last = week[week.length - 1];
  for (const sp of spans) {
    if (sp.to < first || sp.from > last) continue;
    const c0 = Math.max(0, week.indexOf(sp.from < first ? first : sp.from));
    const c1 = week.indexOf(sp.to > last ? last : sp.to);
    out.push({ lane: sp.lane, c0, c1, span: sp });
  }
  return out;
}
