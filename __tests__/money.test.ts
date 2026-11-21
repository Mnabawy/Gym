import {
  accountBalances,
  addMonths,
  avgSpend,
  bucketText,
  byCurrency,
  cashTotal,
  DEFAULT_CFG,
  debtLeft,
  dueFixed,
  isFlow,
  jamiyaState,
  missingRates,
  money,
  monthSum,
  nextFixedDate,
  pace,
  parseCfg,
  parseDebt,
  parseFixed,
  parseJamiya,
  parseProject,
  parseTx,
  pocketBalances,
  pocketMonthNet,
  projectGot,
  projectTotal,
  type Fixed,
  type Tx,
} from '../src/lib/money';

const cfg = { goal: 1_000_000, rates: { USD: 50 } };
let n = 0;
const tx = (p: Partial<Tx>): Tx => ({ id: `t${++n}`, date: '2026-11-10', kind: 'out', amount: 100, cur: 'EGP', pocket: 'personal', account: 'cash', created: 0, ...p });

describe('parse', () => {
  it('keeps good records, drops broken ones, keeps unknown fields', () => {
    expect(parseTx(tx({ id: 'a' }))).toMatchObject({ id: 'a', amount: 100 });
    expect(parseTx({ ...tx({}), amount: 0 })).toBeNull();
    expect(parseTx({ ...tx({}), kind: 'gift' })).toBeNull();
    expect(parseTx({ ...tx({}), account: 'mattress', extra: 1 })).toMatchObject({ account: 'cash', extra: 1 });
    expect(parseFixed({ id: 'f', title: 'مرتب', kind: 'in', amount: 5, from: '2026-01-01', day: 40 })?.day).toBe(1);
    expect(parseDebt({ id: 'd', dir: 'owed', who: 'x', total: 10, since: '2026-11-01', pays: [{ date: '2026-11-02', amount: 3 }, { date: 'x', amount: 1 }] })?.pays).toHaveLength(1);
    expect(parseJamiya({ id: 'j', each: 2000, months: 12, start: '2026-07', turn: 99 })?.turn).toBe(1);
    expect(parseJamiya({ id: 'j', each: 2000, months: 1, start: '2026-07' })).toBeNull();
    expect(parseProject({ id: 'p', title: 'app', miles: [{ id: 'm', amount: 5 }, { id: 'z' }] })?.miles).toHaveLength(1);
  });
  it('config falls back to the defaults', () => {
    expect(parseCfg(null)).toEqual(DEFAULT_CFG);
    expect(parseCfg('{"goal":2000000,"rates":{"USD":48,"SAR":-1}}')).toMatchObject({ goal: 2_000_000, rates: { USD: 48 } });
    expect(parseCfg('nope')).toEqual(DEFAULT_CFG);
  });
});

describe('balances', () => {
  const txs = [
    tx({ kind: 'in', amount: 1000, opening: true }),
    tx({ kind: 'in', amount: 40000, pocket: 'personal', account: 'bank', cat: 'مرتب' }),
    tx({ kind: 'out', amount: 500, cat: 'أكل' }),
    tx({ kind: 'in', amount: 100, cur: 'USD', pocket: 'freelance', account: 'bank' }),
    tx({ kind: 'move', amount: 10000, pocket: 'personal', account: 'bank', toPocket: 'emergency', toAccount: 'bank' }),
  ];
  it('per pocket, in each currency and in جنيه', () => {
    const b = pocketBalances(txs, cfg);
    expect(b.personal.base).toBe(1000 + 40000 - 500 - 10000);
    expect(b.emergency.base).toBe(10000);
    expect(b.freelance).toEqual({ byCur: { USD: 100 }, base: 5000 });
  });
  it('per account, and the cash total', () => {
    const a = accountBalances(txs, cfg);
    expect(a.cash.base).toBe(500);
    expect(a.bank.base).toBe(40000 + 5000);
    expect(a.wallet.base).toBe(0);
    expect(cashTotal(txs, cfg)).toBe(45500);
    expect(byCurrency(txs)).toEqual({ EGP: 40500, USD: 100 });
  });
  it('a currency without a rate counts 0 and is reported', () => {
    const t = [tx({ kind: 'in', amount: 10, cur: 'SAR' })];
    expect(cashTotal(t, cfg)).toBe(0);
    expect(missingRates(t, cfg)).toEqual(['SAR']);
  });
});

describe('month and pace', () => {
  it('only real income and spending count; categories sorted', () => {
    const txs = [
      tx({ kind: 'in', amount: 10000, cat: 'مرتب' }),
      tx({ kind: 'out', amount: 2000, cat: 'بيت' }),
      tx({ kind: 'out', amount: 3000, cat: 'أكل' }),
      tx({ kind: 'out', amount: 999, debt: 'd1' }),
      tx({ kind: 'in', amount: 999, opening: true }),
      tx({ kind: 'out', amount: 5, date: '2026-10-30' }),
    ];
    expect(isFlow(txs[3])).toBe(false);
    const m = monthSum(txs, '2026-11', cfg);
    expect(m).toMatchObject({ income: 10000, spent: 5000, saved: 0.5 });
    expect(m.cats.map((c) => c.cat)).toEqual(['أكل', 'بيت']);
    expect(monthSum(txs, '2026-11', cfg, 'sheep').income).toBe(0);
  });
  it('pace: average net of recent full months and when the goal is reached', () => {
    const txs = [
      tx({ kind: 'in', amount: 100000, opening: true, date: '2026-08-01' }),
      tx({ kind: 'in', amount: 30000, date: '2026-09-05' }),
      tx({ kind: 'out', amount: 10000, date: '2026-09-10' }),
      tx({ kind: 'in', amount: 30000, date: '2026-10-05' }),
      tx({ kind: 'out', amount: 10000, date: '2026-10-10' }),
    ];
    // cash 140,000, 20,000 a month → 860,000 left → 43 months after 2026-11
    expect(pace(txs, '2026-11-21', cfg)).toEqual({ perMonth: 20000, eta: addMonths('2026-11', 43) });
    expect(pace([], '2026-11-21', cfg)).toBeNull();
    expect(pace([tx({ kind: 'out', amount: 50, date: '2026-10-01' })], '2026-11-21', cfg)?.eta).toBeNull();
  });
});

describe('fixed monthly items', () => {
  const f: Fixed = { id: 'sal', title: 'المرتب', kind: 'in', amount: 40000, cur: 'EGP', pocket: 'personal', account: 'bank', day: 1, from: '2026-09-15', remind: false };
  it('posts each month since it started, once its day has come', () => {
    const r = dueFixed([f], '2026-11-21', 7);
    expect(r.txs.map((t) => t.date)).toEqual(['2026-10-01', '2026-11-01']);
    expect(r.txs[0]).toMatchObject({ id: 'fx-sal-2026-10', fixed: 'sal', note: 'المرتب', kind: 'in' });
    expect(r.fixed[0].posted).toBe('2026-11');
  });
  it('nothing twice, nothing before its day, nothing when off', () => {
    expect(dueFixed([{ ...f, posted: '2026-11' }], '2026-11-30', 7).txs).toEqual([]);
    expect(dueFixed([{ ...f, day: 25, posted: '2026-10' }], '2026-11-21', 7).txs).toEqual([]);
    expect(dueFixed([{ ...f, off: true }], '2026-11-21', 7).txs).toEqual([]);
  });
  it('next date', () => {
    expect(nextFixedDate({ ...f, day: 25 }, '2026-11-21')).toBe('2026-11-25');
    expect(nextFixedDate({ ...f, day: 1 }, '2026-11-21')).toBe('2026-12-01');
  });
});

describe('debts, جمعية, projects', () => {
  it('debt left', () => {
    const d = parseDebt({ id: 'd', dir: 'owe', who: 'قسط', total: 4000, since: '2026-08-01', pays: [{ date: '2026-09-01', amount: 1000 }, { date: '2026-10-01', amount: 5000 }] })!;
    expect(debtLeft(d)).toBe(0);
  });
  it('جمعية: turn month, months until it, what is due', () => {
    const j = parseJamiya({ id: 'j', name: 'الجمعية', each: 2000, months: 12, start: '2026-07', turn: 8, paid: ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'] })!;
    const s = jamiyaState(j, '2026-11-21');
    expect(s).toMatchObject({ paid: 5, turnMonth: '2027-02', until: 3, payout: 24000, due: null, end: '2027-06' });
    expect(jamiyaState({ ...j, paid: j.paid.slice(0, 4) }, '2026-11-21').due).toBe('2026-11');
    expect(s.months).toHaveLength(12);
  });
  it('project: got and total', () => {
    const p = parseProject({ id: 'p', title: 'app', cur: 'USD', miles: [{ id: 'a', amount: 2000, paid: '2026-11-03' }, { id: 'b', amount: 1500, paid: '2026-11-18' }, { id: 'c', amount: 2500, due: '2026-12-20' }] })!;
    expect(projectGot(p)).toBe(3500);
    expect(projectTotal(p)).toBe(6000);
  });
});

describe('text', () => {
  it('money and buckets', () => {
    expect(money(1250)).toBe('1,250 ج');
    expect(money(2500, 'USD')).toBe('2,500$');
    expect(money(10.5, 'SAR')).toBe('10.5 ر.س');
    expect(bucketText({ USD: 1300, EGP: 45000 })).toBe('45,000 ج + 1,300$');
    expect(bucketText({})).toBe('0 ج');
  });
});

describe('yardsticks', () => {
  it('average spend and a pocket net', () => {
    const txs = [tx({ amount: 3000, date: '2026-10-02' }), tx({ amount: 1000, date: '2026-09-02' }), tx({ kind: 'in', amount: 500, pocket: 'sheep', date: '2026-11-02' }), tx({ amount: 200, pocket: 'sheep', date: '2026-11-03' })];
    expect(avgSpend(txs, '2026-11-21', cfg)).toBe(2000);
    expect(pocketMonthNet(txs, 'sheep', '2026-11', cfg)).toBe(300);
  });
});
