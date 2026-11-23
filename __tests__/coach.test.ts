/// <reference types="jest" />
import { clientStats, clientStatus, parseStats, sortClients } from '../src/lib/coach';
import type { PlateauInput } from '../src/lib/plateau';

const x: PlateauInput = { stuck: [{ exId: 'b', name: 'Bench', sessions: 3, down: false }], attendance: { done: 10, due: 12 }, meals: 0.9, rate: -0.3, kg: 80, hardWeeks: 1, lightOn: false };
const plan = { days: ['جسم كامل أ'], goal: 'muscle', level: 'beginner', weekdays: [0, 2, 4] };

test('the summary only carries numbers and names, and reads back', () => {
  const s = clientStats(x, '2026-11-20', plan, new Date('2026-11-23T10:00:00Z'));
  expect(s).toEqual({ at: '2026-11-23T10:00:00.000Z', lastWorkout: '2026-11-20', attendance: { done: 10, due: 12 }, meals: 0.9, rate: -0.3, kg: 80, stuck: ['Bench'], plan });
  expect(parseStats(JSON.parse(JSON.stringify(s)))).toEqual(s);
  expect(parseStats({ at: 1 })).toBeNull();
});

test('status: away 5+ days or under half the sessions is an alert; stuck or low meals is watch', () => {
  const s = clientStats(x, '2026-11-20', plan);
  expect(clientStatus(s, '2026-11-23').flag).toBe('watch'); // a lift stuck
  expect(clientStatus({ ...s, stuck: [] }, '2026-11-23').flag).toBe('ok');
  expect(clientStatus({ ...s, stuck: [] }, '2026-11-26')).toMatchObject({ flag: 'alert', lines: expect.arrayContaining(['مااتمرنش بقاله 6 يوم']) });
  expect(clientStatus({ ...s, stuck: [], attendance: { done: 5, due: 12 } }, '2026-11-21').flag).toBe('alert');
  expect(clientStatus(null, '2026-11-21').flag).toBe('watch');
});

test('clients sorted: alerts first, then by name', () => {
  const c = (name: string, flag: 'ok' | 'watch' | 'alert') => ({ name, status: { flag } });
  expect(sortClients([c('ب', 'ok'), c('أ', 'ok'), c('ج', 'alert'), c('د', 'watch')]).map((x) => x.name)).toEqual(['ج', 'د', 'أ', 'ب']);
});
