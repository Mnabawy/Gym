import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Btn, INPUT, Pill, Sheet, T } from './ui';
import { Segmented } from './GymSwitch';
import { ACCOUNTS, BASE, CATS_IN, CATS_OUT, CURRENCIES, type Account, type MoneyCfg, type Pocket, type Tx, type TxKind } from '../lib/money';
import { deleteTx, moneyId, readMoneyCfg, readPockets, saveTx } from '../lib/moneyStore';
import { addDays } from '../lib/dates';
import { showUndo } from '../lib/undo';
import { useToday } from '../lib/useToday';
import { useTheme } from '../theme';

/** The currencies to offer: جنيه, then every one with a rate set (the dollar always). */
export const curOptions = (cfg: MoneyCfg) => [...new Set([BASE, 'USD', ...Object.keys(cfg.rates)])].filter((c) => c === BASE || CURRENCIES[c] || cfg.rates[c]);
const curLabel = (c: string) => CURRENCIES[c]?.label ?? c;

/** A number field that takes Arabic digits and commas too. */
export const parseAmount = (s: string) => {
  const n = Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,،\s]/g, '').replace('٫', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export function AmountField({ value, onChange, cur, onCur, big }: { value: string; onChange: (s: string) => void; cur: string; onCur?: (c: string) => void; big?: boolean }) {
  const t = useTheme();
  const cfg = readMoneyCfg();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.soft, borderRadius: 12, paddingHorizontal: 14, height: big ? 60 : 44 }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={t.mute}
          accessibilityLabel="المبلغ"
          style={[INPUT, { flex: 1, color: t.fg, fontSize: big ? 30 : 17, fontWeight: '700', textAlign: 'right' }]}
        />
        <T w="semi" style={{ color: t.mute, fontSize: 15 }}>{CURRENCIES[cur]?.sym ?? cur}</T>
      </View>
      {onCur ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {curOptions(cfg).map((c) => (
            <Pill key={c} label={curLabel(c)} on={c === cur} onPress={() => onCur(c)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function PocketChips({ pockets, value, onChange, skip }: { pockets: Pocket[]; value: string; onChange: (id: string) => void; skip?: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {pockets
        .filter((p) => p.id !== skip)
        .map((p) => (
          <Pill key={p.id} label={p.name} color={p.color} on={p.id === value} onPress={() => onChange(p.id)} />
        ))}
    </View>
  );
}

export const AccountSwitch = ({ value, onChange }: { value: Account; onChange: (a: Account) => void }) => (
  <Segmented options={Object.entries(ACCOUNTS) as [Account, string][]} value={value} onChange={onChange} small />
);

/** النهارده / امبارح / أول امبارح. */
export function DayPick({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const today = useToday();
  const days: [string, string][] = [
    [today, 'النهارده'],
    [addDays(today, -1), 'امبارح'],
    [addDays(today, -2), 'أول امبارح'],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {days.map(([d, l]) => (
        <Pill key={d} label={l} on={d === value} onPress={() => onChange(d)} />
      ))}
      {!days.some(([d]) => d === value) ? <Pill label={value} on onPress={() => {}} /> : null}
    </View>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T style={{ color: t.mute, fontSize: 12.5 }}>{label}</T>
      {children}
    </View>
  );
};
export { Field as MoneyField };

export type TxDraft = Partial<Tx> & { kind?: TxKind };
const KINDS: [TxKind, string][] = [
  ['out', 'صرف'],
  ['in', 'دخل'],
  ['move', 'تحويل بين جيوب'],
];

/**
 * Add or fix one transaction: صرف / دخل / تحويل بين جيوب, the amount in any currency, which pocket and account
 * (دفعت منين / دخلت فين), a category, a note and the day. A move takes from one pocket (and account) and puts it in another:
 * it's not income or spending.
 */
export function TxSheet({ visible, onClose, draft }: { visible: boolean; onClose: () => void; draft: TxDraft | null }) {
  // A fresh form each time it opens (keyed on the draft).
  return visible && draft ? <TxForm key={draft.id ?? 'new'} onClose={onClose} draft={draft} /> : null;
}

function TxForm({ onClose, draft }: { onClose: () => void; draft: TxDraft }) {
  const t = useTheme();
  const today = useToday();
  const pockets = readPockets();
  const editing = !!draft.created;
  const [kind, setKind] = useState<TxKind>(draft.kind ?? 'out');
  const [amount, setAmount] = useState(draft.amount ? String(draft.amount) : '');
  const [cur, setCur] = useState(draft.cur ?? BASE);
  const [pocket, setPocket] = useState(draft.pocket ?? pockets[0]?.id ?? 'personal');
  const [toPocket, setToPocket] = useState(draft.toPocket ?? pockets.find((p) => p.id !== (draft.pocket ?? pockets[0]?.id))?.id ?? 'emergency');
  const [account, setAccount] = useState<Account>(draft.account ?? 'cash');
  const [toAccount, setToAccount] = useState<Account>(draft.toAccount ?? draft.account ?? 'cash');
  const [cat, setCat] = useState(draft.cat ?? '');
  const [note, setNote] = useState(draft.note ?? '');
  const [date, setDate] = useState(draft.date ?? today);
  const n = parseAmount(amount);
  const ok = n > 0 && (kind !== 'move' || toPocket !== pocket || toAccount !== account);
  const cats = kind === 'in' ? CATS_IN : kind === 'out' ? CATS_OUT : [];

  const save = () => {
    if (!ok) return;
    const now = Date.now();
    const tx: Tx = {
      ...(draft as Tx),
      id: draft.id ?? moneyId('t', now),
      date,
      kind,
      amount: n,
      cur,
      pocket,
      account,
      created: draft.created ?? now,
      ...(kind === 'move' ? { toPocket, toAccount } : { toPocket: undefined, toAccount: undefined }),
      cat: kind === 'move' ? undefined : cat || undefined,
      note: note.trim() || undefined,
    };
    for (const k of Object.keys(tx) as (keyof Tx)[]) if (tx[k] === undefined) delete tx[k];
    const undo = saveTx(tx);
    showUndo(editing ? 'اتعدّلت' : kind === 'out' ? 'اتسجّل الصرف' : kind === 'in' ? 'اتسجّل الدخل' : 'اتحوّلت', undo);
    onClose();
  };
  const remove = () => {
    if (!draft.id) return;
    const undo = deleteTx(draft.id);
    showUndo('اتمسحت', undo);
    onClose();
  };

  return (
    <Sheet visible onClose={onClose} title={editing ? 'عدّل' : 'سجّل'}>
      <Segmented options={KINDS} value={kind} onChange={setKind} />
      <AmountField value={amount} onChange={setAmount} cur={cur} onCur={setCur} big />
      <Field label={kind === 'move' ? 'من جيب' : 'الجيب'}>
        <PocketChips pockets={pockets} value={pocket} onChange={setPocket} />
      </Field>
      {kind === 'move' ? (
        <Field label="لجيب">
          <PocketChips pockets={pockets} value={toPocket} onChange={setToPocket} />
        </Field>
      ) : null}
      <Field label={kind === 'out' ? 'دفعت منين' : kind === 'in' ? 'دخلت فين' : 'من'}>
        <AccountSwitch value={account} onChange={setAccount} />
      </Field>
      {kind === 'move' ? (
        <Field label="لـ">
          <AccountSwitch value={toAccount} onChange={setToAccount} />
        </Field>
      ) : null}
      {cats.length ? (
        <Field label="النوع">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {cats.map((c) => (
              <Pill key={c} label={c} on={c === cat} onPress={() => setCat(c === cat ? '' : c)} />
            ))}
          </View>
        </Field>
      ) : null}
      <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة (اختياري)" placeholderTextColor={t.mute} style={[INPUT, { backgroundColor: t.soft, borderRadius: 12, paddingHorizontal: 14, height: 44, color: t.fg, fontSize: 15, textAlign: 'right' }]} />
      <Field label="امتى">
        <DayPick value={date} onChange={setDate} />
      </Field>
      <Btn label={editing ? 'احفظ' : 'سجّل'} kind="solid" onPress={save} style={{ opacity: ok ? 1 : 0.4 }} />
      {editing ? <Btn label="امسحها" kind="danger" onPress={remove} /> : null}
    </Sheet>
  );
}

export type Where = { pocket: string; account: Account };
/**
 * Where a payment comes from or goes to (a debt, the جمعية, a project): the amount (fixed or editable), its pocket and
 * account, and the day.
 */
export function PaySheet({ title, sub, amount, cur, editable, pocket, onSave, onClose }: { title: string; sub?: string; amount: number; cur: string; editable?: boolean; pocket?: string; onSave: (amount: number, where: Where, date: string) => void; onClose: () => void }) {
  const today = useToday();
  const pockets = readPockets();
  const [a, setA] = useState(String(amount));
  const [p, setP] = useState(pocket ?? pockets[0]?.id ?? 'personal');
  const [acc, setAcc] = useState<Account>('cash');
  const [date, setDate] = useState(today);
  const n = parseAmount(a);
  return (
    <Sheet visible onClose={onClose} title={title} sub={sub}>
      {editable ? <AmountField value={a} onChange={setA} cur={cur} /> : <T w="num" style={{ fontSize: 26, fontWeight: '800' }}>{a && n > 0 ? `${a} ${CURRENCIES[cur]?.sym ?? cur}` : ''}</T>}
      <Field label="الجيب">
        <PocketChips pockets={pockets} value={p} onChange={setP} />
      </Field>
      <Field label="منين / فين">
        <AccountSwitch value={acc} onChange={setAcc} />
      </Field>
      <Field label="امتى">
        <DayPick value={date} onChange={setDate} />
      </Field>
      <Btn
        label="تمام"
        kind="solid"
        style={{ opacity: n > 0 ? 1 : 0.4 }}
        onPress={() => {
          if (!(n > 0)) return;
          onSave(n, { pocket: p, account: acc }, date);
          onClose();
        }}
      />
    </Sheet>
  );
}

/** A plain text field in the sheets' look. */
export function MoneyInput(p: React.ComponentProps<typeof TextInput>) {
  const t = useTheme();
  return <TextInput placeholderTextColor={t.mute} {...p} style={[INPUT, { backgroundColor: t.soft, borderRadius: 12, paddingHorizontal: 14, height: 44, color: t.fg, fontSize: 15, textAlign: 'right' }, p.style]} />;
}
