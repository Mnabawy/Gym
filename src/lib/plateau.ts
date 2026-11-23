// Plateau detector: which lifts stopped moving, and the likely reason, from training, food and body weight together.
// Pure — unit tested in __tests__/plateau.test.ts. Data: plateauInput (src/lib/plateauData.ts).
//
// A lift is stuck when it has no new best e1RM for STALL_SESSIONS sessions, or is going down (gaps.ts trendOf).
// Reasons are checked in order, most likely first (the usual checklist: recovery, consistency, food, body weight;
// e.g. Helms, "The Muscle and Strength Pyramid"):
//   - many lifts stuck at once, or 6+ hard weeks without a light one → fatigue: a light week
//   - under 75% of planned sessions in the last 4 weeks → consistency
//   - under 70% of planned meals ticked in the last 2 weeks → food
//   - losing more than 1% of body weight a week → eating too little to get stronger
//   - else → the exercise itself: swap it for an alternative for 4–6 weeks

export type Stuck = { exId: string; name: string; sessions: number; down: boolean };
export type PlateauInput = {
  stuck: Stuck[];
  /** Sessions trained vs owed in the last 4 weeks. */
  attendance: { done: number; due: number };
  /** Share of planned meals ticked in the last 2 weeks (null: food not tracked). */
  meals: number | null;
  /** Body weight change, kg a week (null: not enough weigh-ins), and the latest weight. */
  rate: number | null;
  kg: number | null;
  /** Full weeks in a row without a light week. */
  hardWeeks: number;
  /** A light week is on now. */
  lightOn: boolean;
};
export type Cause = 'fatigue' | 'attendance' | 'food' | 'cut' | 'exercise';
export type Plateau = { stuck: Stuck[]; cause: Cause; title: string; body: string };

/** Lifts stuck at once that point to fatigue rather than the exercises. */
export const MANY_STUCK = 3;
export const ATTEND_MIN = 0.75;
export const MEALS_MIN = 0.7;
/** Losing faster than this share of body weight a week. */
export const FAST_LOSS = 0.01;
export const HARD_WEEKS = 6;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const names = (s: readonly Stuck[]) => s.map((x) => x.name).join('، ');

/** null when nothing is stuck (or a light week is on: it's the fix already). */
export function plateau(x: PlateauInput): Plateau | null {
  if (!x.stuck.length || x.lightOn) return null;
  const stuck = [...x.stuck].sort((a, b) => Number(b.down) - Number(a.down) || b.sessions - a.sessions);
  const base = { stuck };
  if (stuck.length >= MANY_STUCK || x.hardWeeks >= HARD_WEEKS || stuck.some((s) => s.down)) {
    return {
      ...base,
      cause: 'fatigue',
      title: 'جسمك محتاج راحة',
      body: `${names(stuck)} ${stuck.length > 1 ? 'واقفين' : 'واقف'}${x.hardWeeks >= HARD_WEEKS ? ` وبقالك ${x.hardWeeks} أسابيع من غير أسبوع خفيف` : ''}. ده غالباً تعب متراكم مش ضعف. خد أسبوع خفيف (نص المجموعات) وارجع أقوى.`,
    };
  }
  if (x.attendance.due >= 4 && x.attendance.done / x.attendance.due < ATTEND_MIN) {
    return {
      ...base,
      cause: 'attendance',
      title: 'الغياب موقّف تقدمك',
      body: `اتمرنت ${x.attendance.done} من ${x.attendance.due} تمرين في آخر 4 أسابيع (${pct(x.attendance.done / x.attendance.due)}). العضلة محتاجة تتمرن بانتظام عشان تقوى. لو الأيام كتير عليك، اعمل برنامج بأيام أقل من الإعدادات.`,
    };
  }
  if (x.meals != null && x.meals < MEALS_MIN) {
    return {
      ...base,
      cause: 'food',
      title: 'الأكل مش مكفّي',
      body: `علّمت ${pct(x.meals)} بس من وجباتك آخر أسبوعين. من غير أكل وبروتين كفاية، الأوزان مش هتطلع. ركّز على البروتين في كل وجبة.`,
    };
  }
  if (x.rate != null && x.kg && x.rate < -FAST_LOSS * x.kg) {
    return {
      ...base,
      cause: 'cut',
      title: 'وزنك بينزل بسرعة',
      body: `بتنزل حوالي ${Math.abs(x.rate)} كجم في الأسبوع. في النزول السريع ده الأوزان بتقف أو تنزل. زوّد حوالي 200 سعر في اليوم لو عايز تفضل تقوى.`,
    };
  }
  return {
    ...base,
    cause: 'exercise',
    title: 'التمرين نفسه واقف',
    body: `تمرينك وأكلك ومواعيدك تمام. ${names(stuck)} ممكن يكون محتاج تغيير: بدّله بتمرين شبهه 4–6 أسابيع (زرار «بدّل» على التمرين)، أو قلّل الوزن 10% وابني تاني.`,
  };
}
