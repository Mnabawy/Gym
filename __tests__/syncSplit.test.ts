/// <reference types="jest" />
// Map-shaped meta keys (food and body logs, notes, settings…) sync one entry per row (cloudSync.ts SPLIT_META):
// a first sign-in merges, two phones editing different entries both keep theirs, deletes travel, a whole value from an
// older build only adds, phone-only settings never leave the phone, and existing installs move over once.
import { applyRows, entriesOf, expandWhole, pushItems, type Dirty, type Pulled, type Target } from '../src/lib/cloudSync';
import { DATA_VERSION } from '../src/lib/dataVersion';
import { extrasJson, parseExtras } from '../src/lib/journal';
import { keepUnreadDated } from '../src/lib/records';
import { addMeasure, addWeighIn, measuresJson, parseMeasures, parseWeights, weightsJson } from '../src/lib/weight';
import { Sim } from '../test-utils/syncSim';

let sim: Sim;
beforeEach(() => {
  sim = new Sim();
  sim.install();
});
afterEach(() => sim.uninstall());

const A = 'a@x.test';
const W = (...x: [string, number][]) => JSON.stringify(x.map(([date, kg]) => ({ date, kg })));
const kgs = (d: { json<T>(k: string): T }) => (d.json<{ date: string; kg: number }[]>('weights') ?? []).map((x) => `${x.date}=${x.kg}`);
const row = (key: string) => sim.server.find(A, 'meta', key);
/** The split keys before this change (what an existing install has in `sync.split`). */
const OLD_SPLIT = 'tasks,focus,goals,quits,habits,habitLog,habitParts,taskTrash,dump';

describe('first sign-in merges entries logged before it', () => {
  test('water, weights, extras and notes: the phone\'s own entries and the server\'s both survive', async () => {
    const a = sim.device('A');
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500 }));
    a.setMeta('weights', W(['2026-11-01', 80]));
    a.setMeta('extras', JSON.stringify({ '2026-11-01': [{ name: 'koshary', kcal: 700, p: 20 }] }));
    a.setMeta('notes', JSON.stringify({ bench: 'elbows in' }));
    await a.signIn(A);

    const b = sim.device('B');
    b.setMeta('water', JSON.stringify({ '2026-11-03': 750 }));
    b.setMeta('weights', W(['2026-10-20', 82], ['2026-11-02', 81]));
    b.setMeta('extras', JSON.stringify({ '2026-11-03': [{ name: 'pizza', kcal: 900, p: 30 }] }));
    b.setMeta('notes', JSON.stringify({ squat: 'deep' }));
    sim.advance(1000);
    await b.signIn(A);

    expect(b.json('water')).toEqual({ '2026-11-03': 750, '2026-11-01': 500 });
    expect(kgs(b)).toEqual(['2026-10-20=82', '2026-11-01=80', '2026-11-02=81']); // in date order
    expect(Object.keys(b.json<object>('extras')).sort()).toEqual(['2026-11-01', '2026-11-03']);
    expect(b.json('notes')).toEqual({ squat: 'deep', bench: 'elbows in' });
    expect(row('water/2026-11-03')?.data).toBe(750); // B's own went up
    expect(row('weights/2026-10-20')?.data).toEqual({ date: '2026-10-20', kg: 82 });

    await a.sync();
    expect(a.json('water')).toEqual({ '2026-11-01': 500, '2026-11-03': 750 });
    expect(kgs(a)).toEqual(kgs(b));
    expect(a.json('notes')).toEqual({ bench: 'elbows in', squat: 'deep' });
    expect(a.dirtyKeys()).toEqual([]);
    expect(b.dirtyKeys()).toEqual([]);
  });

  test('the same entry on both: the server\'s wins (like a set), the others are merged', async () => {
    const a = sim.device('A');
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500 }));
    await a.signIn(A);
    const b = sim.device('B');
    b.setMeta('water', JSON.stringify({ '2026-11-01': 250, '2026-11-02': 1000 }));
    sim.advance(1000);
    await b.signIn(A);
    expect(b.json('water')).toEqual({ '2026-11-01': 500, '2026-11-02': 1000 });
    expect(row('water/2026-11-01')?.data).toBe(500);
  });
});

describe('two phones, one key', () => {
  test('different dates of weights and extras edited on each phone: both survive everywhere', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    await a.signIn(A);
    await b.signIn(A);
    sim.advance(1000);
    a.setMeta('weights', W(['2026-11-01', 80]));
    a.setMeta('extras', JSON.stringify({ '2026-11-01': [{ name: 'a', kcal: 100, p: 1 }] }));
    sim.advance(1000);
    b.setMeta('weights', W(['2026-11-02', 79.5]));
    b.setMeta('extras', JSON.stringify({ '2026-11-02': [{ name: 'b', kcal: 200, p: 2 }] }));
    await a.sync();
    await b.sync();
    await a.sync();
    expect(kgs(a)).toEqual(['2026-11-01=80', '2026-11-02=79.5']);
    expect(kgs(b)).toEqual(kgs(a));
    expect(Object.keys(parseExtras(a.meta('extras'))).sort()).toEqual(['2026-11-01', '2026-11-02']);
    expect(Object.keys(parseExtras(b.meta('extras'))).sort()).toEqual(['2026-11-01', '2026-11-02']);
  });

  test('deleting one entry reaches the other phone and leaves the rest', async () => {
    const a = sim.device('A');
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500, '2026-11-02': 300 }));
    a.setMeta('weights', W(['2026-11-01', 80], ['2026-11-02', 81]));
    await a.signIn(A);
    const b = sim.device('B');
    await b.signIn(A);
    sim.advance(1000);
    a.setMeta('water', JSON.stringify({ '2026-11-02': 300 }));
    a.setMeta('weights', W(['2026-11-01', 80]));
    expect(a.dirtyKeys()).toEqual(['meta:water/2026-11-01', 'meta:weights/2026-11-02']);
    await a.sync();
    expect(row('water/2026-11-01')?.deleted).toBe(true);
    await b.sync();
    expect(b.json('water')).toEqual({ '2026-11-02': 300 });
    expect(kgs(b)).toEqual(['2026-11-01=80']);
  });
});

describe('a whole value from an older build', () => {
  test('merges entry by entry: adds what is missing, never wipes or replaces', async () => {
    const a = sim.device('A');
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500, '2026-11-02': 300 }));
    a.setMeta('weights', W(['2026-11-01', 80]));
    await a.signIn(A);
    sim.advance(1000);
    // A phone still on the old build sends its whole values, newer than everything (it doesn't have A's entries).
    sim.server.put(A, { kind: 'meta', key: 'water', data: JSON.stringify({ '2026-11-02': 999, '2026-11-05': 250 }), updated_at: sim.time });
    sim.server.put(A, { kind: 'meta', key: 'weights', data: W(['2026-10-01', 85]), updated_at: sim.time });
    await a.sync();
    expect(a.json('water')).toEqual({ '2026-11-01': 500, '2026-11-02': 300, '2026-11-05': 250 }); // 300 kept, 250 added
    expect(kgs(a)).toEqual(['2026-10-01=85', '2026-11-01=80']);
    // A fresh phone gets the same: the per-entry rows plus what only the old row had.
    const c = sim.device('C');
    await c.signIn(A);
    expect(c.json<Record<string, number>>('water')['2026-11-05']).toBe(250);
    expect(c.json<Record<string, number>>('water')['2026-11-01']).toBe(500);
  });

  test('does not bring back an entry deleted here that is still waiting to be sent', async () => {
    const a = sim.device('A');
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500, '2026-11-02': 300 }));
    await a.signIn(A);
    sim.advance(1000);
    a.setMeta('water', JSON.stringify({ '2026-11-02': 300 })); // deleted here, not sent yet
    sim.server.put(A, { kind: 'meta', key: 'water', data: JSON.stringify({ '2026-11-01': 500, '2026-11-02': 300 }), updated_at: sim.time + 10 });
    await a.sync();
    expect(a.json('water')).toEqual({ '2026-11-02': 300 });
    expect(row('water/2026-11-01')?.deleted).toBe(true);
  });

  test('applyRows on its own: a legacy settings row never sets a phone-only field', () => {
    const meta: Record<string, string> = { settings: JSON.stringify({ accent: '#007AFF' }) };
    const t: Target = { saveSet() {}, deleteSet() {}, setMealCheck() {}, setShopCheck() {}, getMeta: (k) => meta[k] ?? null, setMeta: (k, v) => void (meta[k] = v) };
    const legacy: Pulled = { kind: 'meta', key: 'settings', data: JSON.stringify({ accent: '#FF0000', appLock: true, backupDir: 'content://x', verse: false }), deleted: false, updated_at: 5, rev: 1 };
    const field: Pulled = { kind: 'meta', key: 'settings/appLock', data: true, deleted: false, updated_at: 6, rev: 2 };
    expect(applyRows([legacy, field], {}, t)).toEqual({ changed: true, meta: ['settings'] });
    expect(JSON.parse(meta.settings)).toEqual({ accent: '#007AFF', verse: false }); // accent kept, verse added, nothing phone-only
  });
});

describe('settings', () => {
  test('phone-only fields never leave the phone; the rest merges field by field', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    await a.signIn(A);
    await b.signIn(A);
    sim.advance(1000);
    a.do(() => a.settings.useSettings.getState().setQuiet({ accent: '#34C759', appLock: true, backupDir: 'content://a', place: { lat: 30, lng: 31, name: 'Cairo' } as never }));
    a.do(() => a.settings.useSettings.getState().update({ haptics: false, keepAwake: false }));
    sim.advance(1000);
    b.do(() => b.settings.useSettings.getState().update({ restHeavy: 240 }));
    await a.sync();
    await b.sync();
    await a.sync();
    for (const d of [a, b]) {
      const s = d.settings.useSettings.getState();
      expect(s.accent).toBe('#34C759');
      expect(s.restHeavy).toBe(240);
    }
    const sb = b.settings.useSettings.getState();
    expect([sb.appLock, sb.backupDir, sb.haptics, sb.keepAwake, sb.place]).toEqual([false, '', true, true, null]);
    const sa = a.settings.useSettings.getState();
    expect([sa.appLock, sa.backupDir, sa.haptics, sa.keepAwake]).toEqual([true, 'content://a', false, false]);
    expect(JSON.stringify(sim.server.rowsOf(A))).not.toMatch(/appLock|backupDir|haptics|keepAwake|stepsSync|"place|content:/);
    expect(row('settings/accent')?.data).toBe('#34C759');
    expect(row('settings/restHeavy')?.data).toBe(240);
    expect(a.meta('device')).toContain('content://a');
    expect(a.meta('settings')).not.toContain('content://a');
  });

  test('an install that saved settings before the split: phone-only fields move to `device` on start and stay', async () => {
    const old = JSON.stringify({ accent: '#FF9500', appLock: true, backupDir: 'content://old', haptics: false, verse: false, futureField: 7 });
    const b = sim.device('A');
    // What a previous build saved on this phone; reload runs the same load (and migration) as settings.ts on start.
    b.raw.setMeta('settings', old);
    b.raw.setMeta('device', '');
    b.do(() => b.settings.useSettings.getState().reload());
    const r = b.settings.useSettings.getState();
    expect([r.appLock, r.backupDir, r.haptics, r.accent, r.verse]).toEqual([true, 'content://old', false, '#FF9500', false]);
    expect(JSON.parse(String(b.meta('device')))).toMatchObject({ appLock: true, backupDir: 'content://old', haptics: false });
    // The next save keeps the field this build doesn't know and drops the phone-only ones from `settings`.
    b.do(() => b.settings.useSettings.getState().update({ verse: true }));
    const saved = JSON.parse(String(b.meta('settings')));
    expect(saved.futureField).toBe(7);
    expect(saved).not.toHaveProperty('appLock');
    expect(saved).not.toHaveProperty('backupDir');
    await b.signIn(A);
    expect(row('settings/futureField')?.data).toBe(7);
    expect(row('settings/appLock')).toBeUndefined();
    expect(row('settings/backupDir')).toBeUndefined();
    // A later pull of a settings row doesn't override this phone's own fields either.
    sim.server.put(A, { kind: 'meta', key: 'settings', data: JSON.stringify({ appLock: false, backupDir: 'content://other' }), updated_at: sim.time + 1000 });
    await b.sync();
    expect(b.settings.useSettings.getState().backupDir).toBe('content://old');
    expect(b.settings.useSettings.getState().appLock).toBe(true);
  });
});

describe('existing installs move over once', () => {
  test('a phone synced under the old split list: re-pulls, sends each entry once, then nothing more', async () => {
    const other = sim.device('NEW');
    await other.signIn(A);
    sim.advance(1000);
    other.setMeta('water', JSON.stringify({ '2026-11-03': 400 })); // a per-entry row an older build would have skipped
    other.setMeta('notes', JSON.stringify({ deadlift: 'hook grip' }));
    await other.sync();

    // The existing install: signed in earlier, its pull already went past those rows (an older build ignored them),
    // its data as it was saved by the old build, its last whole value on the server.
    const a = sim.device('A');
    await a.signIn(A);
    a.raw.setMeta('water', JSON.stringify({ '2026-11-01': 500 }));
    a.raw.setMeta('notes', '{}');
    a.raw.setMeta('weights', W(['2026-11-01', 80]));
    a.raw.setMeta('sync.split', OLD_SPLIT);
    sim.server.put(A, { kind: 'meta', key: 'water', data: JSON.stringify({ '2026-11-01': 500 }), updated_at: sim.time });
    a.do(() => {
      const d = a.track.dirty();
      d['meta:weights'] = { t: sim.time }; // noted as a whole by the old build, never sent
      a.track.saveDirty();
    });
    sim.advance(1000);
    const n0 = sim.server.requests.length;
    await a.sync();

    expect(a.json('water')).toEqual({ '2026-11-01': 500, '2026-11-03': 400 }); // the skipped row came down
    expect(a.json('notes')).toEqual({ deadlift: 'hook grip' });
    expect(row('water/2026-11-01')?.data).toBe(500); // its own entries went up one per row
    expect(row('weights/2026-11-01')?.data).toEqual({ date: '2026-11-01', kg: 80 });
    expect(a.meta('sync.split')).toContain('weights');
    expect(a.dirtyKeys()).toEqual([]);
    const pulls = sim.server.requests.slice(n0).filter((r) => r.call === 'pull');
    expect(pulls[0].since).toBe(0); // pulled from the start once
    const pushed = sim.server.requests.slice(n0).filter((r) => r.call === 'push').flatMap((r) => r.items ?? []).map((x) => x.key);
    expect(pushed.filter((k) => k.startsWith('tasks/'))).toEqual([]); // keys split before aren't sent again
    expect(new Set(pushed).size).toBe(pushed.length);

    // Next sync (once the re-read window has settled): incremental again, nothing to send.
    sim.advance(3 * 60_000);
    await a.sync(); // one more pull after the window settled moves it up to the cursor
    const n1 = sim.server.requests.length;
    await a.sync();
    const later = sim.server.requests.slice(n1);
    expect(later.filter((r) => r.call === 'push')).toHaveLength(0);
    expect(later.find((r) => r.call === 'pull')?.since).toBeGreaterThan(0);
    await other.sync();
    expect(other.json('water')).toEqual({ '2026-11-03': 400, '2026-11-01': 500 });
    expect(kgs(other)).toEqual(['2026-11-01=80']);
  });
});

describe('data version', () => {
  test('this build writes version 2, and a phone on a version-1 build stops sending', async () => {
    expect(DATA_VERSION).toBe(2);
    const fresh = sim.device('NEW'); // the real build
    await fresh.signIn(A);
    expect(row('dataVersion')?.data).toBe('2');
    const old = sim.device('OLD', { dataVersion: 1 });
    old.setMeta('water', JSON.stringify({ '2026-11-01': 500 }));
    await expect(old.signIn(A)).rejects.toThrow('update the app');
    expect(row('water/2026-11-01')).toBeUndefined(); // nothing went up from the old build
    expect(row('water')).toBeUndefined();
    expect(old.status()).toMatchObject({ state: 'failed', reason: 'update' });
  });
});

describe('pure parts', () => {
  test('dated lists: one entry per date, rebuilt in date order', () => {
    const m = entriesOf('weights', W(['2026-11-02', 81], ['2026-11-01', 80]));
    expect([...m.keys()]).toEqual(['2026-11-02', '2026-11-01']);
    expect(entriesOf('settings', JSON.stringify({ accent: '#000000', appLock: true, place: null })).size).toBe(1);
  });

  test('a split key noted as a whole becomes one entry per record (unless the record has its own); one row per key on push', () => {
    const meta: Record<string, string> = { water: JSON.stringify({ a: 1, b: 2 }) };
    const own = { kind: 'meta' as const, key: 'water/a', data: 9, deleted: false, updated_at: 20 };
    const d: Dirty = { 'meta:water': { t: 10 }, 'meta:water/a': { t: 20, row: own } };
    const items = pushItems(d, (k) => meta[k] ?? null);
    expect(items.map((x) => x.row.key).sort()).toEqual(['water/a', 'water/b']); // never the same row twice in a batch
    expect(items.find((x) => x.row.key === 'water/a')?.row.data).toBe(9);
    expect(expandWhole(d, (k) => meta[k] ?? null)).toBe(true);
    expect(Object.keys(d).sort()).toEqual(['meta:water/a', 'meta:water/b']);
    expect(d['meta:water/a'].t).toBe(20);
    expect(d['meta:water/b']).toMatchObject({ t: 10, row: { key: 'water/b', data: 2 } });
  });

  test('records this build can\'t read and fields it doesn\'t know are kept on write', () => {
    const raw = JSON.stringify([{ date: '2026-11-01', kg: 80, src: 'scale' }, { date: '2026-11-03', kg: 'lbs:180' }]);
    const list = parseWeights(raw);
    expect(list).toEqual([{ date: '2026-11-01', kg: 80, src: 'scale' }]);
    const next = addWeighIn(list, '2026-11-01', 79);
    expect(next[0]).toEqual({ date: '2026-11-01', kg: 79, src: 'scale' });
    expect(JSON.parse(weightsJson(raw, next))).toEqual([{ date: '2026-11-01', kg: 79, src: 'scale' }, { date: '2026-11-03', kg: 'lbs:180' }]);
    const mRaw = JSON.stringify([{ date: '2026-11-01', waist: 80, bicepL: 35 }, { date: '2026-11-02', foo: 1 }]);
    const ms = parseMeasures(mRaw);
    expect(ms).toEqual([{ date: '2026-11-01', waist: 80, bicepL: 35 }]);
    expect(JSON.parse(measuresJson(mRaw, addMeasure(ms, { date: '2026-11-01', waist: 81 })))).toEqual([{ date: '2026-11-01', waist: 81, bicepL: 35 }, { date: '2026-11-02', foo: 1 }]);
    const eRaw = JSON.stringify({ '2026-11-01': [{ name: 'x', kcal: 100, p: 5, carbs: 10 }], '2026-11-02': [{ label: 'new shape' }] });
    const ex = parseExtras(eRaw);
    expect(ex['2026-11-01'][0]).toEqual({ name: 'x', kcal: 100, p: 5, carbs: 10 });
    expect(JSON.parse(extrasJson(eRaw, {}))).toEqual({ '2026-11-02': [{ label: 'new shape' }] });
    expect(keepUnreadDated(null, [], () => true)).toBe('[]');
  });
});

describe('review fixes', () => {
  /** Makes `d` look like a phone that was on an older build: old split list, and `key` noted as a whole at `t`. */
  const asOldBuild = (d: ReturnType<Sim['device']>, key: string, value: string, t: number) => {
    d.raw.setMeta('sync.split', OLD_SPLIT);
    d.raw.setMeta(key, value);
    d.do(() => {
      const log = d.track.dirty();
      log[`meta:${key}`] = { t };
      d.track.saveDirty();
    });
  };

  test('an edit made on an older build while it was blocked wins over the older per-record row after updating', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500 }));
    await a.sync();
    const b = sim.device('B');
    await b.signIn(A);
    sim.advance(1000);
    asOldBuild(b, 'water', JSON.stringify({ '2026-11-01': 1500 }), sim.time); // newer than A's row, never sent
    sim.advance(1000);
    await b.sync();
    expect(b.json('water')).toEqual({ '2026-11-01': 1500 });
    expect(row('water/2026-11-01')?.data).toBe(1500);
    await a.sync();
    expect(a.json('water')).toEqual({ '2026-11-01': 1500 });
    expect(b.dirtyKeys()).toEqual([]);
  });

  test('a delete made on an older build while it was blocked is not brought back, and reaches the others', async () => {
    const a = sim.device('A');
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500, '2026-11-02': 300 }));
    await a.signIn(A);
    // The old build's last whole value on the server.
    sim.server.put(A, { kind: 'meta', key: 'water', data: JSON.stringify({ '2026-11-01': 500, '2026-11-02': 300 }), updated_at: sim.time });
    const b = sim.device('B');
    await b.signIn(A);
    sim.advance(1000);
    asOldBuild(b, 'water', JSON.stringify({ '2026-11-01': 500 }), sim.time); // 2026-11-02 deleted while blocked
    sim.advance(1000);
    await b.sync();
    expect(b.json('water')).toEqual({ '2026-11-01': 500 });
    expect(row('water/2026-11-02')?.deleted).toBe(true);
    await a.sync();
    expect(a.json('water')).toEqual({ '2026-11-01': 500 });
    const c = sim.device('C');
    await c.signIn(A);
    expect(c.json('water')).toEqual({ '2026-11-01': 500 });
  });

  test('a record deleted one by one is not brought back by a whole value an older build sends later', async () => {
    const a = sim.device('A');
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500, '2026-11-02': 300 }));
    await a.signIn(A);
    const b = sim.device('B');
    await b.signIn(A);
    sim.advance(1000);
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500 }));
    await a.sync();
    await b.sync();
    expect(b.json('water')).toEqual({ '2026-11-01': 500 });
    sim.advance(1000);
    // A phone still on an older build (before the gate stopped it) sends its whole value, with the deleted day.
    sim.server.put(A, { kind: 'meta', key: 'water', data: JSON.stringify({ '2026-11-01': 500, '2026-11-02': 300, '2026-11-04': 200 }), updated_at: sim.time });
    await a.sync();
    await b.sync();
    expect(a.json('water')).toEqual({ '2026-11-01': 500, '2026-11-04': 200 }); // the new day is added, the deleted one isn't
    expect(b.json('water')).toEqual({ '2026-11-01': 500, '2026-11-04': 200 });
    const c = sim.device('C'); // a fresh phone sees the delete row first, then the whole value
    await c.signIn(A);
    expect(c.json<Record<string, number>>('water')['2026-11-02']).toBeUndefined();
    // Logged again on purpose: it comes back.
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500, '2026-11-02': 250, '2026-11-04': 200 }));
    await a.sync();
    await b.sync();
    expect(b.json<Record<string, number>>('water')['2026-11-02']).toBe(250);
  });

  test('stray plain keys an older build stored for record rows are never sent and are dropped on the update sync', async () => {
    const a = sim.device('A');
    a.setMeta('notes', JSON.stringify({ bench: 'new note' }));
    await a.signIn(A);
    const b = sim.device('B');
    await b.signIn(A);
    b.raw.setMeta('notes/bench', 'old note'); // what an older build did with the pulled row
    b.raw.setMeta('settings/accent', '#FF0000');
    b.raw.setMeta('sync.split', OLD_SPLIT);
    sim.advance(1000);
    await b.sync();
    expect(row('notes/bench')?.data).toBe('new note');
    expect(row('settings/accent')).toBeUndefined();
    expect(b.meta('notes/bench')).toBeFalsy();
    expect(b.meta('settings/accent')).toBeFalsy();
    expect(b.json('notes')).toEqual({ bench: 'new note' });
  });

  test('the old default red moved to blue stays blue after a save and a restart', () => {
    const d = sim.device('A');
    d.raw.setMeta('settings', JSON.stringify({ accent: '#B93435', verse: true }));
    d.raw.setMeta('device', '');
    d.do(() => d.settings.useSettings.getState().reload());
    expect(d.settings.useSettings.getState().accent).toBe('#007AFF');
    d.do(() => d.settings.useSettings.getState().update({ verse: false }));
    d.do(() => d.settings.useSettings.getState().reload());
    expect(d.settings.useSettings.getState().accent).toBe('#007AFF');
    expect(d.json<{ accent: string; look: number }>('settings')).toMatchObject({ accent: '#007AFF', look: 2 });
  });

  test('putting a backup back keeps this phone\'s own device settings', async () => {
    const d = sim.device('A');
    d.do(() => d.settings.useSettings.getState().setQuiet({ appLock: true, backupDir: 'content://mine' }));
    const file = { sets: [], meals: [], shop: [], meta: { device: JSON.stringify({ appLock: false, backupDir: 'content://other' }), settings: JSON.stringify({ verse: false }) } };
    await d.act(() => d.restoreMod.applyBackup(file, []));
    const s = d.settings.useSettings.getState();
    expect([s.appLock, s.backupDir, s.verse]).toEqual([true, 'content://mine', false]);
  });
});
