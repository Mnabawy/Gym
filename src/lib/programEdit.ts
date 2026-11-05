// Your own program, edited in the app (/program): exercises per program day, saved as JSON under meta key `program`.
// The five program days themselves stay (their ids are stored with every logged set); what's in them is yours.
// Pure — unit tested in __tests__/programEdit.test.ts. Applying it: applyProgram (src/data/program.ts) via src/lib/settings.ts.
import { MUSCLE_AR, PDF_PROGRAM, SETS_MAX, SETS_MIN, slug, type ExerciseDef, type Muscle, type ProgramEdit, type Tag } from '../data/program';

export const PROGRAM_KEY = 'program';
export const REPS_MIN = 1;
export const REPS_MAX = 50;
const TAGS: Tag[] = ['heavy', 'fail', 'drop', null];
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** A saved exercise, or null if any field is broken. */
export function parseDef(v: unknown): ExerciseDef | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id || typeof o.name !== 'string' || !o.name.trim()) return null;
  if (typeof o.muscle !== 'string' || !(o.muscle in MUSCLE_AR)) return null;
  if (!int(o.sets, SETS_MIN, SETS_MAX) || !int(o.repLow, REPS_MIN, REPS_MAX) || !int(o.repHigh, REPS_MIN, REPS_MAX) || o.repLow > o.repHigh) return null;
  if (!TAGS.includes((o.tag ?? null) as Tag)) return null;
  return { id: o.id, name: o.name.trim(), muscle: o.muscle as Muscle, sets: o.sets, repLow: o.repLow, repHigh: o.repHigh, tag: (o.tag ?? null) as Tag, perLeg: o.perLeg === true };
}

/** Saved program → edit, or null when there's none (the PDF's). Unknown days, broken exercises and repeated ids are dropped; a day left empty keeps the PDF's. */
export function parseProgram(raw: string | null): ProgramEdit | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: ProgramEdit = {};
  const seen = new Set<string>();
  for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
    const wd = Number(k);
    if (!(wd in PDF_PROGRAM) || !Array.isArray(list)) continue;
    const defs: ExerciseDef[] = [];
    for (const x of list) {
      const d = parseDef(x);
      if (d && !seen.has(d.id)) {
        seen.add(d.id);
        defs.push(d);
      }
    }
    if (defs.length) out[wd] = defs;
  }
  return Object.keys(out).length ? out : null;
}

/** Id for a new exercise: its name's slug, with -2, -3 … when another exercise already has it. */
export function newId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slug(name);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** True when the edit is the same as the PDF program (so it can be dropped). */
export function isPdf(edit: ProgramEdit): boolean {
  return Object.entries(PDF_PROGRAM).every(([wd, defs]) => {
    const mine = edit[Number(wd)] ?? defs;
    return mine.length === defs.length && mine.every((d, i) => JSON.stringify({ ...d, perLeg: !!d.perLeg }) === JSON.stringify({ ...defs[i], perLeg: !!defs[i].perLeg }));
  });
}

/** Moves the item at `i` by `by` places (clamped). */
export function move<T>(list: readonly T[], i: number, by: number): T[] {
  const j = Math.max(0, Math.min(list.length - 1, i + by));
  const out = [...list];
  const [x] = out.splice(i, 1);
  out.splice(j, 0, x);
  return out;
}
