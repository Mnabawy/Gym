// Auto progression: what to lift this time, from your last sessions of the same exercise (same variant).
// Pure — unit tested in __tests__/progression.test.ts.
//
// Double progression (the usual rule for hypertrophy rep ranges, e.g. Helms, "The Muscle and Strength Pyramid: Training"):
//   - add reps at the same weight until every set reaches the top of the range, then add one weight step and start
//     again from the bottom of the range;
//   - RIR 3+ on every set while in the range also means the weight is too light (increaseTip 'easy', Zourdos et al. 2016).
// Stalls: two sessions in a row with every set below the range at the same weight → drop ~10% (a common reset, e.g.
// Rippetoe's "Starting Strength" resets), rounded to the weight step.
// Light week: no change, the same numbers as last time.
import type { Exercise } from '../data/program';
import { increaseTip, type SetEntry } from './logic';

/**
 * up: add one weight step, reps from the bottom of the range. reps: same weight, one more rep per set.
 * hold: same weight, aim for the bottom of the range (last time fell short once). down: two misses in a row, lighter.
 * same: light week, or every set already at the top without a weight (bodyweight): repeat.
 */
export type ProgressKind = 'up' | 'reps' | 'hold' | 'down' | 'same';
export type Progress = { kind: ProgressKind; why: 'top' | 'easy' | 'short' | 'stall' | 'deload' | 'more'; sets: SetEntry[] };

/** Share taken off after a stall. */
export const STALL_DROP = 0.1;

/** Round to the nearest weight step (never below 0). */
export const toStep = (kg: number, step: number) => (step > 0 ? Math.max(0, Math.round(kg / step) * step) : Math.max(0, kg));

/** Sets of a session that were worked: logged numbers, in plan order (only the plan's sets count). */
const worked = (ex: Exercise, s: SetEntry[] | undefined) => (s ?? []).slice(0, ex.sets).filter((x) => x.reps != null && x.reps > 0);

const topKg = (sets: SetEntry[]) => sets.reduce((m, s) => Math.max(m, s.kg ?? 0), 0);

/** Every worked set below the rep range (and there was a weight). */
const allShort = (ex: Exercise, sets: SetEntry[]) => sets.length > 0 && topKg(sets) > 0 && sets.every((s) => (s.reps ?? 0) < ex.repLow);

/**
 * This session's targets, one per plan set. `sessions`: your previous sessions of this exercise (same variant), newest
 * first (only the first two are read). null when there's nothing to go on yet (first time).
 */
export function progressFor(ex: Exercise, sessions: readonly SetEntry[][], step: number, deload: boolean): Progress | null {
  const last = sessions[0];
  const sets = worked(ex, last);
  if (!sets.length) return null;
  // Missing sets last time (fewer done than planned) repeat the last set's numbers.
  const base = Array.from({ length: ex.sets }, (_, i) => last[i]?.reps ? last[i] : sets[sets.length - 1]);
  const map = (f: (s: SetEntry) => { kg: number | null; reps: number | null }): SetEntry[] => base.map((s) => ({ ...f(s), done: false }));

  if (deload) return { kind: 'same', why: 'deload', sets: map((s) => ({ kg: s.kg, reps: s.reps })) };

  const tip = increaseTip(ex, last);
  if (tip) return { kind: 'up', why: tip, sets: map((s) => ({ kg: toStep((s.kg ?? 0) + step, step), reps: ex.repLow })) };

  if (allShort(ex, sets)) {
    const before = worked(ex, sessions[1]);
    if (allShort(ex, before) && topKg(before) === topKg(sets)) {
      return { kind: 'down', why: 'stall', sets: map((s) => ({ kg: toStep((s.kg ?? 0) * (1 - STALL_DROP), step), reps: ex.repLow })) };
    }
    return { kind: 'hold', why: 'short', sets: map((s) => ({ kg: s.kg, reps: ex.repLow })) };
  }

  const next = map((s) => ({ kg: s.kg, reps: Math.min(ex.repHigh, Math.max(ex.repLow, (s.reps ?? 0) + 1)) }));
  const more = next.some((n, i) => (n.reps ?? 0) > (base[i].reps ?? 0));
  return more ? { kind: 'reps', why: 'more', sets: next } : { kind: 'same', why: 'top', sets: next };
}

/** Short chip text for the open exercise (null: nothing to show). */
export function progressChip(p: Progress | null, step: number): string | null {
  if (!p) return null;
  if (p.kind === 'up') return `+${step} ↑`;
  if (p.kind === 'reps') return '+1 تكرار';
  if (p.kind === 'down') return 'خفّف ↓';
  return null;
}

/** The popup's title and text: why these numbers. */
export function progressWhy(p: Progress, ex: Exercise, step: number): { title: string; body: string } {
  const range = `${ex.repLow}–${ex.repHigh}`;
  switch (p.kind) {
    case 'up':
      return {
        title: `زوّد ${step} كجم`,
        body:
          p.why === 'easy'
            ? `آخر مرة كان فاضلك 3 تكرارات أو أكتر في كل المجموعات، فالوزن خفيف عليك. زوّده ${step} كجم وابدأ من ${ex.repLow} تكرار.`
            : `آخر مرة وصلت ${ex.repHigh} تكرار في كل المجموعات، فالوزن بقى خفيف عليك. زوّده ${step} كجم وابدأ من ${ex.repLow} تكرار.`,
      };
    case 'reps':
      return { title: 'تكرار زيادة', body: `نفس الوزن، وحاول تزوّد تكرار في كل مجموعة. أول ما توصل ${ex.repHigh} في كلهم هنزوّد الوزن.` };
    case 'down':
      return { title: 'خفّف الوزن شوية', body: `آخر مرتين كنت تحت ${range} تكرار بنفس الوزن. نزّلناه حوالي 10% عشان ترجع للمدى وتطلع تاني أقوى.` };
    case 'hold':
      return { title: 'نفس الوزن', body: `آخر مرة كنت تحت ${range} تكرار. خليك على نفس الوزن وحاول توصل ${ex.repLow} على الأقل.` };
    default:
      return p.why === 'deload'
        ? { title: 'أسبوع خفيف', body: 'نفس أرقام آخر مرة من غير زيادة، الأسبوع ده للراحة.' }
        : { title: 'نفس الأرقام', body: `وصلت آخر المدى. كرّر نفس الأرقام.` };
  }
}

/**
 * First time on an exercise (no history as this variant): how to pick the starting weight. Picking a weight you could
 * lift for a few more reps than the top of the range (RIR 2–3) is the usual way to start (Helms et al. 2016); auto
 * progression takes it from there.
 */
export function firstTimeHint(ex: Exercise): string {
  return `أول مرة: اختار وزن تعمل بيه ${ex.repHigh} تكرار وانت لسه قادر تعمل 2–3 كمان. لو تقيل نزّل، لو سهل زوّد. التطبيق هيظبط الأوزان بعد كده.`;
}

/** The first workout ever: what to do, in order. */
export const FIRST_WORKOUT_TIPS: readonly string[] = [
  'اتحمّى 5 دقايق مشي أو عجلة، وابدأ كل تمرين بمجموعة خفيفة.',
  'ابدأ بأوزان خفيفة النهارده: الهدف تتعلم الحركة صح. دوس «فيديو» على أي تمرين تشوف الطريقة.',
  'اكتب الوزن والتكرارات ودوس ✓ بعد كل مجموعة، وقول كان فاضلك كام تكرار.',
  'المرة الجاية التطبيق هيقولك تشيل كام بالظبط.',
];
