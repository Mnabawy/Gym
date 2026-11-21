import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Btn, Card, Label, Progress, Screen, Sep, Sheet, Stepper, SwitchRow, T } from '../../components/ui';
import { Segmented } from '../../components/GymSwitch';
import { Item } from '../../components/Motion';
import { ACTION, Swipe } from '../../components/Swipe';
import { AccountSwitch, AmountField, MoneyField, MoneyInput, parseAmount, PaySheet, PocketChips } from '../../components/MoneySheets';
import { metaArea, useData } from '../../lib/bus';
import { addMonths, BASE, CATS_IN, CATS_OUT, debtLeft, debtPaid, jamiyaState, money, monthName, monthOf, nextFixedDate, type Account, type Debt, type Fixed, type Jamiya } from '../../lib/money';
import {
  createDebt,
  deleteDebt,
  deleteFixed,
  deleteJamiya,
  MONEY_KEYS,
  moneyId,
  payDebt,
  payJamiya,
  readDebts,
  readFixed,
  readJamiya,
  readPockets,
  receiveJamiya,
  saveDebt,
  saveFixed,
  saveJamiya,
} from '../../lib/moneyStore';
import { confirm } from '../../lib/confirm';
import { showUndo } from '../../lib/undo';
import { useToday } from '../../lib/useToday';
import { useTheme } from '../../theme';

type Pay = { title: string; sub?: string; amount: number; cur: string; editable?: boolean; run: (amount: number, where: { pocket: string; account: Account }, date: string) => () => void };

/**
 * ليك وعليك (`/money/debts`): الجمعية (a box per month, paid ones filled, your turn in green, pay this month's share,
 * «قبضت» when your turn comes), money people owe you and you owe (payments, installments), and what's fixed every month
 * (salary, rent, bills: logged on their day, a reminder the evening before).
 */
export default function DebtsScreen() {
  const t = useTheme();
  const today = useToday();
  useData(metaArea(MONEY_KEYS.debts), metaArea(MONEY_KEYS.jamiya), metaArea(MONEY_KEYS.fixed), metaArea(MONEY_KEYS.tx));
  const jams = readJamiya();
  const debts = readDebts();
  const fixed = readFixed();
  const pockets = readPockets();
  const pname = (id: string) => pockets.find((p) => p.id === id)?.name ?? '';
  const [pay, setPay] = useState<Pay | null>(null);
  const [jamEdit, setJamEdit] = useState<Jamiya | null>(null);
  const [debtEdit, setDebtEdit] = useState<Debt | null>(null);
  const [fixEdit, setFixEdit] = useState<Fixed | null>(null);
  const ym = monthOf(today);

  const open = debts.filter((d) => !d.closed);
  const closed = debts.filter((d) => d.closed);

  return (
    <Screen title="ليك وعليك" onBack={() => router.back()}>
      {pay ? <PaySheet title={pay.title} sub={pay.sub} amount={pay.amount} cur={pay.cur} editable={pay.editable} onClose={() => setPay(null)} onSave={(a, w, d) => showUndo('اتسجّل', pay.run(a, w, d))} /> : null}
      {jamEdit ? <JamiyaSheet j={jamEdit} onClose={() => setJamEdit(null)} /> : null}
      {debtEdit ? <DebtSheet d={debtEdit} onClose={() => setDebtEdit(null)} /> : null}
      {fixEdit ? <FixedSheet f={fixEdit} onClose={() => setFixEdit(null)} /> : null}

      {/* الجمعية */}
      <Label>الجمعية</Label>
      {jams.map((j) => {
        const s0 = jamiyaState(j, today);
        return (
          <Card key={j.id} style={{ padding: 14, gap: 10 }}>
            <Pressable onPress={() => setJamEdit(j)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T w="semi" style={{ flex: 1, fontSize: 16 }}>{j.name}</T>
              <T style={{ color: t.mute, fontSize: 12.5 }}>{money(j.each, j.cur)} كل شهر</T>
              <Ionicons name="create-outline" size={18} color={t.mute} />
            </Pressable>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {s0.months.map((m, i) => {
                const paid = j.paid.includes(m);
                const turn = i + 1 === j.turn;
                const c = turn ? t.green : t.okText;
                return (
                  <View key={m} style={[s.box, { borderColor: turn ? t.green : paid ? t.okText : t.line, backgroundColor: paid ? c : m === ym ? t.soft : 'transparent' }]}>
                    <T w="num" style={{ fontSize: 11, color: paid ? (turn ? '#fff' : t.card) : turn ? t.green : t.mute }}>{i + 1}</T>
                  </View>
                );
              })}
            </View>
            <T style={{ fontSize: 13, color: t.mute, lineHeight: 20 }}>
              دفعت {money(j.paid.length * j.each, j.cur)} ({j.paid.length}/{j.months}) ·{' '}
              {j.got ? `قبضت ${money(s0.payout, j.cur)}` : s0.until > 0 ? `تقبض ${money(s0.payout, j.cur)} في ${monthName(s0.turnMonth, true)} (بعد ${s0.until} شهر)` : s0.until === 0 ? `دورك الشهر ده: ${money(s0.payout, j.cur)}` : `دورك كان ${monthName(s0.turnMonth)}`}
            </T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {s0.due ? <Btn label={`ادفع قسط ${monthName(s0.due)}`} kind="solid" style={{ flex: 1 }} onPress={() => setPay({ title: `قسط ${j.name}`, sub: monthName(s0.due!, true), amount: j.each, cur: j.cur, run: (_a, w, d) => payJamiya(j, s0.due!, w, d) })} /> : null}
              {!j.got && s0.until <= 0 ? <Btn label="قبضت" kind={s0.due ? 'ghost' : 'solid'} style={{ flex: 1 }} onPress={() => setPay({ title: `قبضت ${j.name}`, amount: s0.payout, cur: j.cur, run: (_a, w, d) => receiveJamiya(j, w, d) })} /> : null}
            </View>
          </Card>
        );
      })}
      <AddRow label="جمعية جديدة" onPress={() => setJamEdit({ id: moneyId('j'), name: 'الجمعية', each: 0, cur: BASE, months: 12, start: ym, turn: 1, paid: [] })} />

      {/* Debts both ways. */}
      {(['owed', 'owe'] as const).map((dir) => {
        const list = open.filter((d) => d.dir === dir);
        return (
          <React.Fragment key={dir}>
            <Label>{dir === 'owed' ? 'ليك عند حد' : 'عليك'}</Label>
            {list.length ? (
              <Card>
                {list.map((d, i) => {
                  const left = debtLeft(d);
                  return (
                    <Item key={d.id}>
                      {i ? <Sep /> : null}
                      <Swipe
                        start={[
                          { label: 'عدّل', icon: 'create-outline', color: ACTION.blue, onPress: () => setDebtEdit(d) },
                          { label: 'امسح', icon: 'trash-outline', color: ACTION.red, onPress: async () => { if (await confirm({ title: 'تمسحه؟', body: 'الحركات اللي اتسجلت بيه هتفضل.', confirmLabel: 'امسح', danger: true })) showUndo('اتمسح', deleteDebt(d.id)); } },
                        ]}>
                        <Pressable
                          onPress={() => setPay({ title: dir === 'owed' ? `${d.who} رجّع` : `دفعت لـ ${d.who}`, sub: `فاضل ${money(left, d.cur)}`, amount: d.monthly && d.monthly < left ? d.monthly : left, cur: d.cur, editable: true, run: (a, w, date) => payDebt(d, a, w, date) })}
                          style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1, backgroundColor: t.card }]}>
                          <View style={{ flex: 1, gap: 4 }}>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <T w="semi" style={{ flex: 1, fontSize: 15 }}>{d.who}</T>
                              <T w="num" style={{ fontSize: 15, fontWeight: '700', color: dir === 'owed' ? t.green : t.bad }}>{money(left, d.cur)}</T>
                            </View>
                            <Progress value={d.total ? debtPaid(d) / d.total : 0} height={4} color={dir === 'owed' ? t.green : t.bad} />
                            <T style={{ fontSize: 12, color: t.mute }}>
                              {[`من ${money(d.total, d.cur)}`, d.monthly ? `قسط ${money(d.monthly, d.cur)} في الشهر` : '', d.note ?? ''].filter(Boolean).join(' · ')}
                            </T>
                          </View>
                        </Pressable>
                      </Swipe>
                    </Item>
                  );
                })}
              </Card>
            ) : null}
            <AddRow label={dir === 'owed' ? 'سلّفت حد' : 'عليا لحد'} onPress={() => setDebtEdit({ id: moneyId('d'), dir, who: '', total: 0, cur: BASE, since: today, pays: [] })} />
          </React.Fragment>
        );
      })}
      {closed.length ? <T style={{ fontSize: 12.5, color: t.mute, paddingHorizontal: 16 }}>خلصت: {closed.map((d) => d.who).join('، ')}</T> : null}

      {/* Fixed every month. */}
      <Label>ثابت كل شهر</Label>
      {fixed.length ? (
        <Card>
          {fixed.map((f, i) => (
            <Item key={f.id}>
              {i ? <Sep /> : null}
              <Swipe
                start={[
                  { label: f.off ? 'شغّله' : 'وقّفه', icon: f.off ? 'play' : 'pause', color: ACTION.orange, onPress: () => showUndo(f.off ? 'اشتغل' : 'اتوقف', saveFixed({ ...f, off: !f.off })) },
                  { label: 'امسح', icon: 'trash-outline', color: ACTION.red, onPress: () => showUndo('اتمسح', deleteFixed(f.id)) },
                ]}>
                <Pressable onPress={() => setFixEdit(f)} style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : f.off ? 0.45 : 1, backgroundColor: t.card }]}>
                  <Ionicons name={f.kind === 'in' ? 'arrow-down-circle' : 'arrow-up-circle'} size={22} color={f.kind === 'in' ? t.green : t.mute} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <T style={{ fontSize: 15 }}>{f.title}</T>
                    <T style={{ fontSize: 12, color: t.mute }}>{f.off ? 'واقف' : `يوم ${f.day} · الجاي ${nextFixedDate(f, today).slice(5).split('-').reverse().join('/')}`} · {pname(f.pocket)}{f.remind ? ' · 🔔' : ''}</T>
                  </View>
                  <T w="num" style={{ fontSize: 15, fontWeight: '700', color: f.kind === 'in' ? t.green : t.fg }}>{money(f.amount, f.cur)}</T>
                </Pressable>
              </Swipe>
            </Item>
          ))}
        </Card>
      ) : null}
      <AddRow label="ثابت جديد (مرتب، إيجار، فاتورة)" onPress={() => setFixEdit({ id: moneyId('f'), title: '', kind: 'out', amount: 0, cur: BASE, pocket: 'personal', account: 'bank', day: 1, from: today, remind: true })} />
      <T style={{ fontSize: 12, color: t.mute, paddingHorizontal: 16, lineHeight: 18 }}>بيتسجّل لوحده في يومه. لو مبلغ شهر اختلف، عدّله من آخر الحركات في صفحة الفلوس.</T>
    </Screen>
  );
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: t.card, borderRadius: 12, opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name="add" size={20} color={t.okText} />
      <T style={{ fontSize: 15, color: t.okText }}>{label}</T>
    </Pressable>
  );
}

function JamiyaSheet({ j, onClose }: { j: Jamiya; onClose: () => void }) {
  const today = useToday();
  const known = readJamiya().some((x) => x.id === j.id);
  const [name, setName] = useState(j.name);
  const [each, setEach] = useState(j.each ? String(j.each) : '');
  const [cur, setCur] = useState(j.cur);
  const [months, setMonths] = useState(j.months);
  const ym = monthOf(today);
  const [y1, m1] = ym.split('-').map(Number);
  const [y2, m2] = j.start.split('-').map(Number);
  const [offset, setOffset] = useState((y2 - y1) * 12 + (m2 - m1));
  const [turn, setTurn] = useState(j.turn);
  const start = addMonths(ym, offset);
  // A new one: the months before this one count as paid.
  const n = parseAmount(each);
  const save = () => {
    if (!(n > 0)) return;
    const paid = known ? j.paid.filter((m) => m >= start && m <= addMonths(start, months - 1)) : Array.from({ length: Math.max(0, -offset) }, (_, i) => addMonths(start, i)).slice(0, months);
    showUndo('اتحفظت', saveJamiya({ ...j, name: name.trim() || 'الجمعية', each: n, cur, months, start, turn: Math.min(turn, months), paid }));
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={known ? 'الجمعية' : 'جمعية جديدة'} sub={known ? undefined : 'الشهور اللي فاتت من أولها هتتحسب مدفوعة (من غير ما تتسجل صرف).'}>
      <MoneyField label="الاسم">
        <MoneyInput value={name} onChangeText={setName} />
      </MoneyField>
      <MoneyField label="القسط كل شهر">
        <AmountField value={each} onChange={setEach} cur={cur} onCur={setCur} />
      </MoneyField>
      <Stepper label="كام شهر" value={months} min={2} max={36} onChange={setMonths} />
      <Stepper label="بدأت" value={offset} min={-36} max={12} onChange={setOffset} format={(v) => monthName(addMonths(ym, v), true)} />
      <Stepper label="دورك" value={Math.min(turn, months)} min={1} max={months} onChange={setTurn} format={(v) => `${v} · ${monthName(addMonths(start, v - 1), true)}`} />
      <Btn label="احفظ" kind="solid" onPress={save} style={{ opacity: n > 0 ? 1 : 0.4 }} />
      {known ? <Btn label="امسح الجمعية" kind="danger" onPress={() => { showUndo('اتمسحت', deleteJamiya(j.id)); onClose(); }} /> : null}
    </Sheet>
  );
}

function DebtSheet({ d, onClose }: { d: Debt; onClose: () => void }) {
  const known = readDebts().some((x) => x.id === d.id);
  const pockets = readPockets();
  const [dir, setDir] = useState(d.dir);
  const [who, setWho] = useState(d.who);
  const [total, setTotal] = useState(d.total ? String(d.total) : '');
  const [cur, setCur] = useState(d.cur);
  const [monthly, setMonthly] = useState(d.monthly ? String(d.monthly) : '');
  const [note, setNote] = useState(d.note ?? '');
  const [moved, setMoved] = useState(!known);
  const [pocket, setPocket] = useState(pockets[0]?.id ?? 'personal');
  const [account, setAccount] = useState<Account>('cash');
  const n = parseAmount(total);
  const ok = n > 0 && !!who.trim();
  const save = () => {
    if (!ok) return;
    const m = parseAmount(monthly);
    const next: Debt = { ...d, dir, who: who.trim(), total: n, cur, ...(m > 0 ? { monthly: m } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    if (!(m > 0)) delete next.monthly;
    if (!note.trim()) delete next.note;
    showUndo('اتحفظ', known ? saveDebt(next) : createDebt(next, moved ? { pocket, account } : null));
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={known ? who : dir === 'owed' ? 'ليك عند حد' : 'عليك لحد'}>
      {!known ? <Segmented options={[['owed', 'ليك عنده'], ['owe', 'عليك ليه']] as const} value={dir} onChange={setDir} /> : null}
      <MoneyField label="مين / إيه">
        <MoneyInput value={who} onChangeText={setWho} placeholder="مثلاً: أحمد، قسط الموبايل" />
      </MoneyField>
      <MoneyField label="المبلغ كله">
        <AmountField value={total} onChange={setTotal} cur={cur} onCur={known ? undefined : setCur} />
      </MoneyField>
      <MoneyField label="قسط شهري (اختياري)">
        <MoneyInput value={monthly} onChangeText={setMonthly} keyboardType="decimal-pad" />
      </MoneyField>
      <MoneyInput value={note} onChangeText={setNote} placeholder="ملاحظة (اختياري)" />
      {!known ? (
        <>
          <SwitchRow label={dir === 'owed' ? 'الفلوس طلعت من معايا دلوقتي' : 'الفلوس دخلت معايا دلوقتي'} sub="اقفله لو دين قديم أو قسط على حاجة" value={moved} onChange={setMoved} />
          {moved ? (
            <>
              <PocketChips pockets={pockets} value={pocket} onChange={setPocket} />
              <AccountSwitch value={account} onChange={setAccount} />
            </>
          ) : null}
        </>
      ) : null}
      <Btn label="احفظ" kind="solid" onPress={save} style={{ opacity: ok ? 1 : 0.4 }} />
    </Sheet>
  );
}

function FixedSheet({ f, onClose }: { f: Fixed; onClose: () => void }) {
  const t = useTheme();
  const known = readFixed().some((x) => x.id === f.id);
  const pockets = readPockets();
  const [kind, setKind] = useState(f.kind);
  const [title, setTitle] = useState(f.title);
  const [amount, setAmount] = useState(f.amount ? String(f.amount) : '');
  const [cur, setCur] = useState(f.cur);
  const [pocket, setPocket] = useState(f.pocket);
  const [account, setAccount] = useState<Account>(f.account);
  const [cat, setCat] = useState(f.cat ?? '');
  const [day, setDay] = useState(f.day);
  const [remind, setRemind] = useState(f.remind);
  const n = parseAmount(amount);
  const ok = n > 0 && !!title.trim();
  const save = () => {
    if (!ok) return;
    const next: Fixed = { ...f, kind, title: title.trim(), amount: n, cur, pocket, account, day, remind, ...(cat ? { cat } : {}) };
    if (!cat) delete next.cat;
    showUndo('اتحفظ', saveFixed(next));
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={known ? f.title : 'ثابت كل شهر'} sub={known ? undefined : 'بيتسجّل من الشهر ده لو يومه جه، أو من الشهر الجاي.'}>
      <Segmented options={[['out', 'صرف'], ['in', 'دخل']] as const} value={kind} onChange={setKind} />
      <MoneyInput value={title} onChangeText={setTitle} placeholder={kind === 'in' ? 'المرتب' : 'الإيجار، النت، الكهربا'} />
      <AmountField value={amount} onChange={setAmount} cur={cur} onCur={setCur} />
      <Stepper label="يوم كام في الشهر" value={day} min={1} max={28} onChange={setDay} />
      <MoneyField label="الجيب">
        <PocketChips pockets={pockets} value={pocket} onChange={setPocket} />
      </MoneyField>
      <AccountSwitch value={account} onChange={setAccount} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(kind === 'in' ? CATS_IN : CATS_OUT).map((c) => (
          <Pressable key={c} onPress={() => setCat(c === cat ? '' : c)} style={{ paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', borderRadius: 999, backgroundColor: c === cat ? t.ok : t.soft }}>
            <T style={{ fontSize: 13, color: c === cat ? t.onOk : t.fg }}>{c}</T>
          </Pressable>
        ))}
      </View>
      <SwitchRow label="فكّرني قبلها بيوم" value={remind} onChange={setRemind} />
      <Btn label="احفظ" kind="solid" onPress={save} style={{ opacity: ok ? 1 : 0.4 }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  box: { width: 30, height: 30, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
