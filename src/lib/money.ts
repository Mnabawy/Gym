// الفلوس (the owner's design of Nov 2026): cash only — what came in, what went out, where it sits — toward the first
// million in cash. Every amount is kept in its own currency (جنيه، دولار…) and totals are counted in جنيه at rates you
// set (`MoneyCfg.rates`). Money lives in pockets (who it's for: خاص، الطوارئ، الأغنام، الفريلانس…) and accounts (where
// it is: كاش، بنك، محفظة). Also: fixed monthly items posted on their day (المرتب، الإيجار…), money owed both ways,
// a جمعية, and freelance projects with their payments. Pure: unit tested in __tests__/money.test.ts; storage in
// src/lib/moneyStore.ts. Assets (gold, land, the sheep themselves) are not counted: the goal is cash.
import { isRec, keepExtra } from './records';

export const BASE = 'EGP';
export const CURRENCIES: Record<string, { label: string; sym: string }> = {
  EGP: { label: 'جنيه', sym: 'ج' },
  USD: { label: 'دولار', sym: '$' },
  SAR: { label: 'ريال', sym: 'ر.س' },
  AED: { label: 'درهم', sym: 'د.إ' },
  EUR: { label: 'يورو', sym: '€' },
};
export const ACCOUNTS = { cash: 'كاش', bank: 'بنك', wallet: 'محفظة' } as const;
export type Account = keyof typeof ACCOUNTS;
const isAccount = (v: unknown): v is Account => typeof v === 'string' && v in ACCOUNTS;

export const CATS_OUT = ['بيت', 'أكل', 'مواصلات', 'فواتير', 'خروجات', 'علف ودكتور', 'شغل وأدوات', 'تانية'] as const;
export const CATS_IN = ['مرتب', 'فريلانس', 'بيع', 'تانية'] as const;

export type Pocket = { id: string; name: string; color: string; /** A target in جنيه (the emergency fund). */ target?: number; order: number };
export const DEFAULT_POCKETS: Pocket[] = [
  { id: 'personal', name: 'خاص', color: '#8E8E93', order: 0 },
  { id: 'emergency', name: 'الطوارئ', color: '#0A84FF', order: 1 },
  { id: 'sheep', name: 'الأغنام', color: '#30D158', order: 2 },
  { id: 'freelance', name: 'الفريلانس', color: '#FF9F0A', order: 3 },
];

export type TxKind = 'in' | 'out' | 'move';
export type Tx = {
  id: string;
  date: string;
  kind: TxKind;
  amount: number;
  cur: string;
  pocket: string;
  account: Account;
  /** A move: where it went. */
  toPocket?: string;
  toAccount?: Account;
  cat?: string;
  note?: string;
  /** What it belongs to (kept out of income / spending when it's only money moving: a debt, a جمعية, a start balance). */
  project?: string;
  fixed?: string;
  debt?: string;
  jam?: string;
  opening?: boolean;
  created: number;
};

export type Fixed = { id: string; title: string; kind: 'in' | 'out'; amount: number; cur: string; pocket: string; account: Account; cat?: string; /** 1–28 */ day: number; from: string; remind: boolean; /** The last month posted, YYYY-MM. */ posted?: string; off?: boolean };
export type Debt = { id: string; /** owed = they owe you; owe = you owe them */ dir: 'owed' | 'owe'; who: string; total: number; cur: string; since: string; due?: string; note?: string; monthly?: number; pays: { date: string; amount: number }[]; closed?: string };
export type Jamiya = { id: string; name: string; each: number; cur: string; months: number; /** The first month, YYYY-MM. */ start: string; /** Your turn to collect, 1 = the first month. */ turn: number; paid: string[]; got?: string };
export type Milestone = { id: string; title: string; amount: number; due?: string; paid?: string };
export type Project = { id: string; title: string; client?: string; cur: string; miles: Milestone[]; closed?: string };
export type MoneyCfg = { goal: number; rates: Record<string, number> };
export const DEFAULT_CFG: MoneyCfg = { goal: 1_000_000, rates: { USD: 50 } };

// ---- parsing (unknown fields kept, like every synced record)

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
const opt = <K extends string, V>(k: K, v: V | undefined | null | '' | false) => (v === undefined || v === null || v === '' || v === false ? {} : ({ [k]: v } as Record<K, V>));

const TX_FIELDS = new Set(['id', 'date', 'kind', 'amount', 'cur', 'pocket', 'account', 'toPocket', 'toAccount', 'cat', 'note', 'project', 'fixed', 'debt', 'jam', 'opening', 'created']);
export function parseTx(x: unknown): Tx | null {
  if (!isRec(x) || !str(x.id) || !isDate(x.date) || !['in', 'out', 'move'].includes(str(x.kind)) || !(num(x.amount) > 0) || !str(x.pocket)) return null;
  return keepExtra<Tx>(x, TX_FIELDS, {
    id: str(x.id),
    date: x.date,
    kind: x.kind as TxKind,
    amount: num(x.amount),
    cur: str(x.cur) || BASE,
    pocket: str(x.pocket),
    account: isAccount(x.account) ? x.account : 'cash',
    ...opt('toPocket', str(x.toPocket)),
    ...opt('toAccount', isAccount(x.toAccount) ? x.toAccount : undefined),
    ...opt('cat', str(x.cat)),
    ...opt('note', str(x.note)),
    ...opt('project', str(x.project)),
    ...opt('fixed', str(x.fixed)),
    ...opt('debt', str(x.debt)),
    ...opt('jam', str(x.jam)),
    ...opt('opening', x.opening === true),
    created: num(x.created) || 0,
  });
}

const POCKET_FIELDS = new Set(['id', 'name', 'color', 'target', 'order']);
export function parsePocket(x: unknown): Pocket | null {
  if (!isRec(x) || !str(x.id) || !str(x.name).trim()) return null;
  return keepExtra<Pocket>(x, POCKET_FIELDS, { id: str(x.id), name: str(x.name).trim(), color: str(x.color) || '#8E8E93', ...opt('target', num(x.target) > 0 ? num(x.target) : undefined), order: num(x.order) || 0 });
}

const FIXED_FIELDS = new Set(['id', 'title', 'kind', 'amount', 'cur', 'pocket', 'account', 'cat', 'day', 'from', 'remind', 'posted', 'off']);
export function parseFixed(x: unknown): Fixed | null {
  if (!isRec(x) || !str(x.id) || !str(x.title).trim() || !['in', 'out'].includes(str(x.kind)) || !(num(x.amount) > 0) || !isDate(x.from)) return null;
  const day = Math.round(num(x.day));
  return keepExtra<Fixed>(x, FIXED_FIELDS, {
    id: str(x.id),
    title: str(x.title).trim(),
    kind: x.kind as 'in' | 'out',
    amount: num(x.amount),
    cur: str(x.cur) || BASE,
    pocket: str(x.pocket) || 'personal',
    account: isAccount(x.account) ? x.account : 'bank',
    ...opt('cat', str(x.cat)),
    day: day >= 1 && day <= 28 ? day : 1,
    from: x.from,
    remind: x.remind === true,
    ...opt('posted', isMonth(x.posted) ? x.posted : undefined),
    ...opt('off', x.off === true),
  });
}

const DEBT_FIELDS = new Set(['id', 'dir', 'who', 'total', 'cur', 'since', 'due', 'note', 'monthly', 'pays', 'closed']);
export function parseDebt(x: unknown): Debt | null {
  if (!isRec(x) || !str(x.id) || !['owed', 'owe'].includes(str(x.dir)) || !str(x.who).trim() || !(num(x.total) > 0) || !isDate(x.since)) return null;
  const pays = Array.isArray(x.pays) ? x.pays.filter((p): p is { date: string; amount: number } => isRec(p) && isDate(p.date) && num(p.amount) > 0) : [];
  return keepExtra<Debt>(x, DEBT_FIELDS, {
    id: str(x.id),
    dir: x.dir as 'owed' | 'owe',
    who: str(x.who).trim(),
    total: num(x.total),
    cur: str(x.cur) || BASE,
    since: x.since,
    ...opt('due', isDate(x.due) ? x.due : undefined),
    ...opt('note', str(x.note)),
    ...opt('monthly', num(x.monthly) > 0 ? num(x.monthly) : undefined),
    pays: pays.map((p) => ({ date: p.date, amount: p.amount })),
    ...opt('closed', isDate(x.closed) ? x.closed : undefined),
  });
}

const JAM_FIELDS = new Set(['id', 'name', 'each', 'cur', 'months', 'start', 'turn', 'paid', 'got']);
export function parseJamiya(x: unknown): Jamiya | null {
  if (!isRec(x) || !str(x.id) || !(num(x.each) > 0) || !isMonth(x.start)) return null;
  const months = Math.round(num(x.months));
  if (!(months >= 2 && months <= 60)) return null;
  const turn = Math.round(num(x.turn));
  return keepExtra<Jamiya>(x, JAM_FIELDS, {
    id: str(x.id),
    name: str(x.name).trim() || 'الجمعية',
    each: num(x.each),
    cur: str(x.cur) || BASE,
    months,
    start: x.start,
    turn: turn >= 1 && turn <= months ? turn : 1,
    paid: Array.isArray(x.paid) ? [...new Set(x.paid.filter(isMonth))].sort() : [],
    ...opt('got', isDate(x.got) ? x.got : undefined),
  });
}

const PROJECT_FIELDS = new Set(['id', 'title', 'client', 'cur', 'miles', 'closed']);
export function parseProject(x: unknown): Project | null {
  if (!isRec(x) || !str(x.id) || !str(x.title).trim()) return null;
  const miles = Array.isArray(x.miles)
    ? x.miles
        .filter((m): m is Record<string, unknown> => isRec(m) && !!str(m.id) && num(m.amount) > 0)
        .map((m) => ({ id: str(m.id), title: str(m.title).trim() || 'دفعة', amount: num(m.amount), ...opt('due', isDate(m.due) ? m.due : undefined), ...opt('paid', isDate(m.paid) ? m.paid : undefined) }))
    : [];
  return keepExtra<Project>(x, PROJECT_FIELDS, { id: str(x.id), title: str(x.title).trim(), ...opt('client', str(x.client)), cur: str(x.cur) || 'USD', miles, ...opt('closed', isDate(x.closed) ? x.closed : undefined) });
}

export function parseCfg(raw: string | null | undefined): MoneyCfg {
  try {
    const o: unknown = raw ? JSON.parse(raw) : null;
    if (!isRec(o)) return { ...DEFAULT_CFG, rates: { ...DEFAULT_CFG.rates } };
    const rates: Record<string, number> = {};
    if (isRec(o.rates)) for (const [k, v] of Object.entries(o.rates)) if (num(v) > 0) rates[k] = num(v);
    return { ...(o as object), goal: num(o.goal) > 0 ? num(o.goal) : DEFAULT_CFG.goal, rates };
  } catch {
    return { ...DEFAULT_CFG, rates: { ...DEFAULT_CFG.rates } };
  }
}

// ---- money math

/** An amount in جنيه (0 for a currency with no rate set: `missingRates` says which). */
export const toBase = (amount: number, cur: string, cfg: MoneyCfg) => (cur === BASE ? amount : amount * (cfg.rates[cur] ?? 0));
export const missingRates = (txs: readonly Tx[], cfg: MoneyCfg) => [...new Set(txs.map((t) => t.cur))].filter((c) => c !== BASE && !(cfg.rates[c] > 0));

/** Income and spending: real money in and out, not moves, start balances, debts or a جمعية. */
export const isFlow = (t: Tx) => t.kind !== 'move' && !t.opening && !t.debt && !t.jam;

type Bucket = Record<string, number>; // currency → amount
const add = (b: Bucket, cur: string, v: number) => {
  b[cur] = (b[cur] ?? 0) + v;
  if (Math.abs(b[cur]) < 1e-9) delete b[cur];
};

/** Each tx's effect: [pocket, account, cur, signed amount] (a move takes from one and gives to the other). */
function effects(t: Tx): [string, Account, string, number][] {
  if (t.kind === 'in') return [[t.pocket, t.account, t.cur, t.amount]];
  if (t.kind === 'out') return [[t.pocket, t.account, t.cur, -t.amount]];
  return [
    [t.pocket, t.account, t.cur, -t.amount],
    [t.toPocket ?? t.pocket, t.toAccount ?? t.account, t.cur, t.amount],
  ];
}

export type Balance = { byCur: Bucket; base: number };
const balanceOf = (b: Bucket, cfg: MoneyCfg): Balance => ({ byCur: b, base: Object.entries(b).reduce((a, [c, v]) => a + toBase(v, c, cfg), 0) });

/** Every pocket's balance (pockets with money but no longer listed still show up). */
export function pocketBalances(txs: readonly Tx[], cfg: MoneyCfg): Record<string, Balance> {
  const out: Record<string, Bucket> = {};
  for (const t of txs) for (const [p, , c, v] of effects(t)) add((out[p] ??= {}), c, v);
  return Object.fromEntries(Object.entries(out).map(([k, b]) => [k, balanceOf(b, cfg)]));
}

/** Where the money is: each account, and each foreign currency on its own. */
export function accountBalances(txs: readonly Tx[], cfg: MoneyCfg): Record<Account, Balance> {
  const out: Record<string, Bucket> = { cash: {}, bank: {}, wallet: {} };
  for (const t of txs) for (const [, a, c, v] of effects(t)) add(out[a], c, v);
  return Object.fromEntries(Object.entries(out).map(([k, b]) => [k, balanceOf(b, cfg)])) as Record<Account, Balance>;
}

/** All the cash, in جنيه. */
export const cashTotal = (txs: readonly Tx[], cfg: MoneyCfg) => Object.values(pocketBalances(txs, cfg)).reduce((a, b) => a + b.base, 0);

/** Every currency held, summed (for «دولار 1,300$» on the where-it-is line). */
export function byCurrency(txs: readonly Tx[]): Bucket {
  const b: Bucket = {};
  for (const t of txs) for (const [, , c, v] of effects(t)) add(b, c, v);
  return b;
}

export const monthOf = (date: string) => date.slice(0, 7);

export type MonthSum = { income: number; spent: number; saved: number | null; cats: { cat: string; amount: number }[] };
/** A month's income and spending in جنيه, its share saved, and spending by category (largest first). */
export function monthSum(txs: readonly Tx[], ym: string, cfg: MoneyCfg, pocket?: string): MonthSum {
  let income = 0;
  let spent = 0;
  const cats: Record<string, number> = {};
  for (const t of txs) {
    if (monthOf(t.date) !== ym || !isFlow(t) || (pocket && t.pocket !== pocket)) continue;
    const v = toBase(t.amount, t.cur, cfg);
    if (t.kind === 'in') income += v;
    else {
      spent += v;
      cats[t.cat || 'تانية'] = (cats[t.cat || 'تانية'] ?? 0) + v;
    }
  }
  return { income, spent, saved: income > 0 ? (income - spent) / income : null, cats: Object.entries(cats).map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount) };
}

export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * How fast the cash grows: the average net (income − spending) of the last 3 full months that have anything, and
 * the month it reaches the goal at that pace. Null when there's no history or the pace isn't positive.
 */
export function pace(txs: readonly Tx[], today: string, cfg: MoneyCfg): { perMonth: number; eta: string | null } | null {
  const cur = monthOf(today);
  const nets: number[] = [];
  for (let i = 1; i <= 12 && nets.length < 3; i++) {
    const s = monthSum(txs, addMonths(cur, -i), cfg);
    if (s.income || s.spent) nets.push(s.income - s.spent);
  }
  if (!nets.length) {
    const s = monthSum(txs, cur, cfg);
    if (!(s.income || s.spent)) return null;
    nets.push(s.income - s.spent);
  }
  const perMonth = nets.reduce((a, b) => a + b, 0) / nets.length;
  const left = cfg.goal - cashTotal(txs, cfg);
  if (left <= 0) return { perMonth, eta: cur };
  return { perMonth, eta: perMonth > 0 ? addMonths(cur, Math.ceil(left / perMonth)) : null };
}

/**
 * Fixed items due by today and not posted yet: one tx per month from the later of `from` and the month after
 * `posted`, up to this month once its day has come. Ids are stable (`fx-<id>-<YYYY-MM>`) so two phones never post twice.
 */
export function dueFixed(list: readonly Fixed[], today: string, now: number): { txs: Tx[]; fixed: Fixed[] } {
  const txs: Tx[] = [];
  const fixed = list.map((f) => {
    if (f.off) return f;
    let ym = f.posted ? addMonths(f.posted, 1) : monthOf(f.from);
    let last = f.posted;
    for (let guard = 0; guard < 36; guard++) {
      const date = `${ym}-${String(f.day).padStart(2, '0')}`;
      if (date > today) break;
      if (date >= f.from) txs.push({ id: `fx-${f.id}-${ym}`, date, kind: f.kind, amount: f.amount, cur: f.cur, pocket: f.pocket, account: f.account, ...(f.cat ? { cat: f.cat } : {}), note: f.title, fixed: f.id, created: now });
      last = ym;
      ym = addMonths(ym, 1);
    }
    return last !== f.posted ? { ...f, posted: last } : f;
  });
  return { txs, fixed };
}

/** The next date a fixed item falls on (today or later). */
export function nextFixedDate(f: Fixed, today: string): string {
  const ym = monthOf(today);
  const here = `${ym}-${String(f.day).padStart(2, '0')}`;
  const d = here >= today ? here : `${addMonths(ym, 1)}-${String(f.day).padStart(2, '0')}`;
  return d < f.from ? f.from : d;
}

export const debtPaid = (d: Debt) => d.pays.reduce((a, p) => a + p.amount, 0);
export const debtLeft = (d: Debt) => Math.max(0, d.total - debtPaid(d));

/** The جمعية's month for a number (1-based) and where you are: months paid, your turn's month, months until it. */
export function jamiyaState(j: Jamiya, today: string) {
  const turnMonth = addMonths(j.start, j.turn - 1);
  const cur = monthOf(today);
  const [y1, m1] = cur.split('-').map(Number);
  const [y2, m2] = turnMonth.split('-').map(Number);
  const until = (y2 - y1) * 12 + (m2 - m1);
  const end = addMonths(j.start, j.months - 1);
  const due = cur >= j.start && cur <= end && !j.paid.includes(cur) ? cur : null;
  return { paid: j.paid.length, turnMonth, until, payout: j.each * j.months, due, end, months: Array.from({ length: j.months }, (_, i) => addMonths(j.start, i)) };
}

export const projectGot = (p: Project) => p.miles.filter((m) => m.paid).reduce((a, m) => a + m.amount, 0);
export const projectTotal = (p: Project) => p.miles.reduce((a, m) => a + m.amount, 0);

/** «1,250» — whole numbers with thousands separators (two decimals only when there are some). */
export function amountText(v: number): string {
  const r = Math.round(v * 100) / 100;
  return r.toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(r) ? 0 : 2 });
}
/** «1,250 ج», «2,500$» */
export function money(v: number, cur: string = BASE): string {
  const s = CURRENCIES[cur]?.sym ?? cur;
  return cur === BASE || s.length > 1 ? `${amountText(v)} ${s}` : `${amountText(v)}${s}`;
}
/** A bucket as «45,000 ج + 1,300$». */
export const bucketText = (b: Bucket) =>
  Object.entries(b)
    .sort(([a], [c]) => (a === BASE ? -1 : c === BASE ? 1 : a < c ? -1 : 1))
    .map(([c, v]) => money(v, c))
    .join(' + ') || money(0);

/** The average monthly spending (جنيه) over the last `n` full months that have any: the emergency fund's yardstick. */
export function avgSpend(txs: readonly Tx[], today: string, cfg: MoneyCfg, n = 3): number {
  const cur = monthOf(today);
  const got: number[] = [];
  for (let i = 1; i <= 12 && got.length < n; i++) {
    const s = monthSum(txs, addMonths(cur, -i), cfg);
    if (s.spent) got.push(s.spent);
  }
  return got.length ? got.reduce((a, b) => a + b, 0) / got.length : 0;
}

/** A pocket's net this month (in − out, جنيه): the sheep's monthly profit. */
export const pocketMonthNet = (txs: readonly Tx[], pocket: string, ym: string, cfg: MoneyCfg) => {
  const s = monthSum(txs, ym, cfg, pocket);
  return s.income - s.spent;
};

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/** «نوفمبر», or «نوفمبر 2026» with the year. */
export const monthName = (ym: string, year = false) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]}${year ? ` ${y}` : ''}`;
};
