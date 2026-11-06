/// <reference types="jest" />
import { morningBrief, type BriefInput } from '../src/lib/brief';
import { currentWorkout } from '../src/lib/schedule';
import { fromTemplate, GOAL_TEMPLATES } from '../src/data/goalTemplates';

// Today Wed 4 Nov 2026; last session Mon 2 Nov was back (id 1), so chest (2) is due.
const TODAY = '2026-11-04';
const base: BriefInput = {
  today: TODAY,
  cur: currentWorkout([{ date: '2026-11-02', weekdays: [1], sets: 17 }], TODAY),
  days: [1, 2, 3, 5, 6],
  workoutAt: 19 * 60,
  picks: {},
  waterL: 3,
  weights: [{ date: '2026-11-03', kg: 80 }],
  shopTrips: 1,
  shopMoves: {},
};

test('training day: workout, meals with times, water, prep', () => {
  const b = morningBrief(TODAY, base);
  expect(b.title).toContain('الأربع');
  expect(b.title).toContain('صدر وبايسبس');
  expect(b.body).toContain('7 بالليل');
  expect(b.body).toContain('🍽 الفطار (8 الصبح)');
  expect(b.body).toContain('3.5 لتر'); // +0.5 on a training day
  expect(b.body).toContain('شنطة الجيم');
  expect(b.body).not.toContain('اتوزن'); // weighed yesterday
});

test('rest day: no workout, plain water, weigh-in when it has been a week', () => {
  const b = morningBrief('2026-11-05', { ...base, weights: [{ date: '2026-10-28', kg: 80 }] }); // Thursday
  expect(b.title).toContain('يوم راحة');
  expect(b.body).toContain('3 لتر');
  expect(b.body).not.toContain('شنطة الجيم');
  expect(b.body).toContain('اتوزن');
});

test('next training day gets the next workout in the sequence', () => {
  // Fri 6 Nov: Wed is chest, Fri is the next training day → hamstrings
  expect(morningBrief('2026-11-06', base).title).toContain('خلفية الفخد');
  expect(morningBrief('2026-11-06', base).body).toContain('طلّع الفراخ من الفريزر');
});

test('habits due that day', () => {
  const h = { id: 'h', name: 'ورد', icon: 'book', color: '#1BA6A8', remind: null, start: '2026-11-01' };
  const x = { ...base, habits: [{ ...h, days: [3] }, { ...h, id: 'g', name: 'قراءة', days: [4] }] };
  expect(morningBrief(TODAY, x).body).toContain('✅ عاداتك: ورد'); // Wednesday
  expect(morningBrief(TODAY, x).body).not.toContain('قراءة');
  expect(morningBrief(TODAY, { ...base, habits: [{ ...h, days: [3], cue: 'بعد الفجر' }] }).body).toContain('ورد (بعد الفجر)');
});

test('shopping day on Friday', () => {
  expect(morningBrief('2026-11-06', base).body).toContain('🛒');
  expect(morningBrief(TODAY, base).body).not.toContain('🛒');
});

test("each goal's next step", () => {
  const goal = fromTemplate(GOAL_TEMPLATES[0], TODAY, 1);
  const b = morningBrief(TODAY, { ...base, goals: [goal] }).body;
  expect(b).toContain(`🎯 ${goal.name}: ${goal.stages[0].tasks[0].title}`);
});

test('a goal whose weekly review is due', () => {
  const goal = { ...fromTemplate(GOAL_TEMPLATES[0], '2026-10-20', 1) };
  expect(morningBrief(TODAY, { ...base, goals: [goal] }).body).toContain(`📝 مراجعة الأسبوع لـ ${goal.name}`);
  expect(morningBrief(TODAY, { ...base, goals: [{ ...goal, startDate: TODAY }] }).body).not.toContain('📝');
});

test('quits: clean time without the habit name', () => {
  const q = { id: 'q', name: 'سر', icon: 'ban', color: '#7A5CFA', start: new Date('2026-10-25T06:00:00').getTime(), why: '', replace: '', costPerDay: 0, currency: 'ج.م', minutesPerDay: 0, slips: [], urges: [] };
  const b = morningBrief(TODAY, { ...base, quits: [q] }).body;
  expect(b).toContain('💪 10 يوم نضيف');
  expect(b).not.toContain('سر');
});
