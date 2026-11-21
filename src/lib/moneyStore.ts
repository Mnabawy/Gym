// Reading and writing الفلوس (src/lib/money.ts) in storage meta. Lists sync one row per record (SPLIT_META in
// cloudSync.ts): moneyTx, moneyPockets, moneyFixed, moneyDebts, moneyJamiya, moneyProjects; the settings (goal, rates)
// are one whole value, moneyCfg. Every action returns its undo (the keys it touched, put back as they were); actions
// that write more than one key run in one storage transaction.
import { atomic } from './atomic';
import { useDataVersion } from './bus';
import { dateKey } from './dates';
import {
  DEFAULT_POCKETS,
  dueFixed,
  parseCfg,
  parseDebt,
  parseFixed,
  parseJamiya,
  parsePocket,
  parseProject,
  parseTx,
  type Account,
  type Debt,
  type Fixed,
  type Jamiya,
  type MoneyCfg,
  type Pocket,
  type Project,
  type Tx,
} from './money';
import { keepUnread, parseList } from './records';
import { storage } from './storage';

export const MONEY_KEYS = { tx: 'moneyTx', pockets: 'moneyPockets', fixed: 'moneyFixed', debts: 'moneyDebts', jamiya: 'moneyJamiya', projects: 'moneyProjects', cfg: 'moneyCfg' } as const;

const bump = () => useDataVersion.getState().bump();
export const moneyId = (p: string, now: number = Date.now()) => `${p}${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

function list<T extends { id: string }>(key: string, one: (x: unknown) => T | null) {
  return {
    read: () => parseList(storage.getMeta(key), one),
    write: (l: readonly T[]) => storage.setMeta(key, keepUnread(storage.getMeta(key), l, one)),
  };
}
const TX = list<Tx>(MONEY_KEYS.tx, parseTx);
const POCKETS = list<Pocket>(MONEY_KEYS.pockets, parsePocket);
const FIXED = list<Fixed>(MONEY_KEYS.fixed, parseFixed);
const DEBTS = list<Debt>(MONEY_KEYS.debts, parseDebt);
const JAM = list<Jamiya>(MONEY_KEYS.jamiya, parseJamiya);
const PROJECTS = list<Project>(MONEY_KEYS.projects, parseProject);

export const readTx = TX.read;
export const readFixed = FIXED.read;
export const readDebts = DEBTS.read;
export const readJamiya = JAM.read;
export const readProjects = PROJECTS.read;
/** Your pockets (the four defaults until you change them), in order. */
export const readPockets = (): Pocket[] => {
  const l = POCKETS.read();
  return (l.length ? l : DEFAULT_POCKETS).slice().sort((a, b) => a.order - b.order);
};
export const readMoneyCfg = (): MoneyCfg => parseCfg(storage.getMeta(MONEY_KEYS.cfg));

/** Runs `f` in one transaction and returns an undo that puts the given keys back as they were. */
function change(keys: readonly string[], f: () => void): () => void {
  const before = keys.map((k) => [k, storage.getMeta(k)] as const);
  atomic(f);
  bump();
  return () => {
    atomic(() => {
      for (const [k, v] of before) storage.setMeta(k, v ?? '[]');
    });
    bump();
  };
}
const upsert = <T extends { id: string }>(l: T[], x: T) => {
  const i = l.findIndex((y) => y.id === x.id);
  if (i >= 0) l[i] = x;
  else l.unshift(x);
  return l;
};

export const saveTx = (t: Tx) => change([MONEY_KEYS.tx], () => TX.write(upsert(TX.read(), t)));
export const saveTxs = (ts: readonly Tx[]) => change([MONEY_KEYS.tx], () => TX.write([...ts, ...TX.read()]));
export const deleteTx = (id: string) => change([MONEY_KEYS.tx], () => TX.write(TX.read().filter((t) => t.id !== id)));
export const savePockets = (l: readonly Pocket[]) => change([MONEY_KEYS.pockets], () => POCKETS.write(l.map((p, i) => ({ ...p, order: i }))));
export const saveMoneyCfg = (c: MoneyCfg) => change([MONEY_KEYS.cfg], () => storage.setMeta(MONEY_KEYS.cfg, JSON.stringify(c)));

export const saveFixed = (f: Fixed) => change([MONEY_KEYS.fixed], () => FIXED.write(upsert(FIXED.read(), f)));
export const deleteFixed = (id: string) => change([MONEY_KEYS.fixed], () => FIXED.write(FIXED.read().filter((f) => f.id !== id)));

/** Posts the fixed items whose day has come (the money tab runs this when it opens). Returns how many were posted. */
export function postFixed(today: string = dateKey(new Date()), now: number = Date.now()): number {
  const r = dueFixed(FIXED.read(), today, now);
  if (!r.txs.length) return 0;
  const have = new Set(TX.read().map((t) => t.id));
  const fresh = r.txs.filter((t) => !have.has(t.id));
  atomic(() => {
    if (fresh.length) TX.write([...fresh, ...TX.read()]);
    FIXED.write(r.fixed);
  });
  bump();
  return fresh.length;
}

type Where = { account: Account; pocket: string };

/** A new debt; when the money moved now (you lent it / borrowed it), that move is recorded too. */
export function createDebt(d: Debt, moved: Where | null, now: number = Date.now()) {
  return change([MONEY_KEYS.debts, MONEY_KEYS.tx], () => {
    DEBTS.write(upsert(DEBTS.read(), d));
    if (moved) TX.write([{ id: moneyId('t', now), date: d.since, kind: d.dir === 'owed' ? 'out' : 'in', amount: d.total, cur: d.cur, ...moved, debt: d.id, note: d.dir === 'owed' ? `سلّفت ${d.who}` : `استلفت من ${d.who}`, created: now }, ...TX.read()]);
  });
}
export const saveDebt = (d: Debt) => change([MONEY_KEYS.debts], () => DEBTS.write(upsert(DEBTS.read(), d)));
export const deleteDebt = (id: string) => change([MONEY_KEYS.debts], () => DEBTS.write(DEBTS.read().filter((d) => d.id !== id)));

/** A payment on a debt: in when they pay you back, out when you pay; closes it once nothing is left. */
export function payDebt(d: Debt, amount: number, where: Where, date: string, now: number = Date.now()) {
  return change([MONEY_KEYS.debts, MONEY_KEYS.tx], () => {
    const pays = [...d.pays, { date, amount }];
    const left = d.total - pays.reduce((a, p) => a + p.amount, 0);
    DEBTS.write(upsert(DEBTS.read(), { ...d, pays, ...(left <= 0 ? { closed: date } : {}) }));
    TX.write([{ id: moneyId('t', now), date, kind: d.dir === 'owed' ? 'in' : 'out', amount, cur: d.cur, ...where, debt: d.id, note: d.dir === 'owed' ? `رجّع ${d.who}` : `دفعت لـ ${d.who}`, created: now }, ...TX.read()]);
  });
}

export const saveJamiya = (j: Jamiya) => change([MONEY_KEYS.jamiya], () => JAM.write(upsert(JAM.read(), j)));
export const deleteJamiya = (id: string) => change([MONEY_KEYS.jamiya], () => JAM.write(JAM.read().filter((j) => j.id !== id)));
/** Pays this month's جمعية share (out of the pocket and account you pick). */
export function payJamiya(j: Jamiya, ym: string, where: Where, date: string, now: number = Date.now()) {
  return change([MONEY_KEYS.jamiya, MONEY_KEYS.tx], () => {
    JAM.write(upsert(JAM.read(), { ...j, paid: [...new Set([...j.paid, ym])].sort() }));
    TX.write([{ id: moneyId('t', now), date, kind: 'out', amount: j.each, cur: j.cur, ...where, jam: j.id, note: `قسط ${j.name}`, created: now }, ...TX.read()]);
  });
}
/** Your turn came: the whole payout in. */
export function receiveJamiya(j: Jamiya, where: Where, date: string, now: number = Date.now()) {
  return change([MONEY_KEYS.jamiya, MONEY_KEYS.tx], () => {
    JAM.write(upsert(JAM.read(), { ...j, got: date }));
    TX.write([{ id: moneyId('t', now), date, kind: 'in', amount: j.each * j.months, cur: j.cur, ...where, jam: j.id, note: `قبضت ${j.name}`, created: now }, ...TX.read()]);
  });
}

export const saveProject = (p: Project) => change([MONEY_KEYS.projects], () => PROJECTS.write(upsert(PROJECTS.read(), p)));
export const deleteProject = (id: string) => change([MONEY_KEYS.projects], () => PROJECTS.write(PROJECTS.read().filter((p) => p.id !== id)));
/** A project payment arrived: income in the freelance pocket (its currency), the payment marked paid. */
export function receiveMilestone(p: Project, mileId: string, account: Account, date: string, now: number = Date.now()) {
  const m = p.miles.find((x) => x.id === mileId);
  if (!m) return () => {};
  return change([MONEY_KEYS.projects, MONEY_KEYS.tx], () => {
    const miles = p.miles.map((x) => (x.id === mileId ? { ...x, paid: date } : x));
    PROJECTS.write(upsert(PROJECTS.read(), { ...p, miles, ...(miles.every((x) => x.paid) ? { closed: date } : {}) }));
    TX.write([{ id: moneyId('t', now), date, kind: 'in', amount: m.amount, cur: p.cur, pocket: 'freelance', account, cat: 'فريلانس', project: p.id, note: `${p.title}: ${m.title}`, created: now }, ...TX.read()]);
  });
}
