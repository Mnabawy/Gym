import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Btn, Card, Label, Progress, Screen, Sheet, T } from '../../components/ui';
import { Segmented } from '../../components/GymSwitch';
import { AccountSwitch, AmountField, DayPick, MoneyField, MoneyInput, parseAmount, TxSheet, type TxDraft } from '../../components/MoneySheets';
import { metaArea, useData } from '../../lib/bus';
import { bucketText, money, pocketBalances, projectGot, projectTotal, toBase, type Account, type Milestone, type Project } from '../../lib/money';
import { deleteProject, MONEY_KEYS, moneyId, readMoneyCfg, readProjects, readTx, receiveMilestone, saveProject } from '../../lib/moneyStore';
import { confirm } from '../../lib/confirm';
import { showUndo } from '../../lib/undo';
import { useToday } from '../../lib/useToday';
import { useTheme } from '../../theme';

const short = (d: string) => d.slice(5).split('-').reverse().join('/');

/**
 * الفريلانس (`/money/freelance`): the freelance pocket's balance, «حوّل لخاص» (a move between pockets, not income), and
 * each project with its payments: paid ✓ with the day, or expected by a day; «وصلت» logs it as income in the freelance
 * pocket in the project's currency; spending on a project is logged against it, so each shows its profit.
 */
export default function FreelanceScreen() {
  const t = useTheme();
  useData(metaArea(MONEY_KEYS.projects), metaArea(MONEY_KEYS.tx), metaArea(MONEY_KEYS.cfg));
  const cfg = readMoneyCfg();
  const txs = readTx();
  const projects = readProjects();
  const bal = pocketBalances(txs, cfg).freelance;
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const [edit, setEdit] = useState<Project | null>(null);
  const [got, setGot] = useState<{ p: Project; m: Milestone } | null>(null);
  const openP = projects.filter((p) => !p.closed);
  const done = projects.filter((p) => p.closed);

  const card = (p: Project) => {
    const spent = txs.filter((x) => x.project === p.id && x.kind === 'out').reduce((a, x) => a + toBase(x.amount, x.cur, cfg), 0);
    const g = projectGot(p);
    const total = projectTotal(p);
    return (
      <Card key={p.id} style={{ padding: 14, gap: 8, opacity: p.closed ? 0.7 : 1 }}>
        <Pressable onPress={() => setEdit(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <T w="semi" style={{ fontSize: 16 }}>{p.title}</T>
            {p.client ? <T style={{ fontSize: 12.5, color: t.mute }}>{p.client}</T> : null}
          </View>
          <T w="num" style={{ fontSize: 15, fontWeight: '700' }}>{money(g, p.cur)} / {money(total, p.cur)}</T>
        </Pressable>
        <Progress value={total ? g / total : 0} height={5} color={t.sec.focus} />
        {p.miles.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}>
            <Ionicons name={m.paid ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={m.paid ? t.green : t.mute} />
            <T style={{ flex: 1, fontSize: 14 }}>{m.title}</T>
            <T style={{ fontSize: 12, color: t.mute }}>{m.paid ? short(m.paid) : m.due ? `متوقع ${short(m.due)}` : ''}</T>
            <T w="num" style={{ fontSize: 14 }}>{money(m.amount, p.cur)}</T>
            {!m.paid ? (
              <Pressable onPress={() => setGot({ p, m })} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 10, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: t.ok, opacity: pressed ? 0.6 : 1 })}>
                <T style={{ color: t.onOk, fontSize: 12.5 }}>وصلت</T>
              </Pressable>
            ) : null}
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T style={{ flex: 1, fontSize: 12.5, color: t.mute }}>{spent ? `صرفت عليه ${money(spent)} · المكسب ${money(toBase(g, p.cur, cfg) - spent)}` : ''}</T>
          <Pressable onPress={() => setDraft({ kind: 'out', pocket: 'freelance', project: p.id, cat: 'شغل وأدوات', note: p.title })} hitSlop={8}>
            <T style={{ fontSize: 13, color: t.okText }}>+ صرف عليه</T>
          </Pressable>
        </View>
      </Card>
    );
  };

  return (
    <Screen title="الفريلانس" onBack={() => router.back()}>
      <TxSheet visible={!!draft} draft={draft} onClose={() => setDraft(null)} />
      {edit ? <ProjectSheet p={edit} onClose={() => setEdit(null)} /> : null}
      {got ? <GotSheet p={got.p} m={got.m} onClose={() => setGot(null)} /> : null}

      <Card style={{ padding: 14, gap: 8 }}>
        <T style={{ color: t.mute, fontSize: 13 }}>في جيب الفريلانس</T>
        <T w="num" style={{ fontSize: 26, fontWeight: '800' }}>{bal ? bucketText(bal.byCur) : money(0)}</T>
        {bal && Object.keys(bal.byCur).length > 1 ? <T style={{ color: t.mute, fontSize: 12.5 }}>≈ {money(bal.base)}</T> : null}
        <Btn label="حوّل لخاص" onPress={() => setDraft({ kind: 'move', pocket: 'freelance', toPocket: 'personal' })} />
      </Card>

      <Label>المشاريع</Label>
      {openP.map(card)}
      <Pressable onPress={() => setEdit({ id: moneyId('pr'), title: '', cur: 'USD', miles: [] })} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: t.card, borderRadius: 12, opacity: pressed ? 0.6 : 1 }]}>
        <Ionicons name="add" size={20} color={t.okText} />
        <T style={{ fontSize: 15, color: t.okText }}>مشروع جديد</T>
      </Pressable>
      {done.length ? (
        <>
          <Label>خلصت</Label>
          {done.map(card)}
        </>
      ) : null}
    </Screen>
  );
}

function GotSheet({ p, m, onClose }: { p: Project; m: Milestone; onClose: () => void }) {
  const today = useToday();
  const [account, setAccount] = useState<Account>('bank');
  const [date, setDate] = useState(today);
  return (
    <Sheet visible onClose={onClose} title={`وصلت ${money(m.amount, p.cur)}`} sub={`${p.title}: ${m.title} · هتدخل جيب الفريلانس`}>
      <MoneyField label="دخلت فين">
        <AccountSwitch value={account} onChange={setAccount} />
      </MoneyField>
      <MoneyField label="امتى">
        <DayPick value={date} onChange={setDate} />
      </MoneyField>
      <Btn
        label="تمام"
        kind="solid"
        onPress={() => {
          showUndo('اتسجّلت الدفعة', receiveMilestone(p, m.id, account, date));
          onClose();
        }}
      />
    </Sheet>
  );
}

type Row = { id: string; title: string; amount: string; paid?: string; due?: string };

function ProjectSheet({ p, onClose }: { p: Project; onClose: () => void }) {
  const t = useTheme();
  const known = readProjects().some((x) => x.id === p.id);
  const [title, setTitle] = useState(p.title);
  const [client, setClient] = useState(p.client ?? '');
  const [cur, setCur] = useState(p.cur);
  const [rows, setRows] = useState<Row[]>(() => (p.miles.length ? p.miles.map((m) => ({ ...m, amount: String(m.amount) })) : [{ id: moneyId('m'), title: 'دفعة أولى', amount: '' }]));
  const [total, setTotal] = useState('');
  const sum = rows.reduce((a, r) => a + (parseAmount(r.amount) || 0), 0);
  const ok = !!title.trim() && rows.some((r) => parseAmount(r.amount) > 0);
  const set = (i: number, patch: Partial<Row>) => setRows((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const split = (n: number) => {
    const tot = parseAmount(total);
    if (!(tot > 0)) return;
    const each = Math.round((tot / n) * 100) / 100;
    setRows(Array.from({ length: n }, (_, i) => ({ id: moneyId(`m${i}`), title: n === 1 ? 'المشروع كله' : `دفعة ${i + 1}`, amount: String(i === n - 1 ? Math.round((tot - each * (n - 1)) * 100) / 100 : each) })));
  };
  const save = () => {
    if (!ok) return;
    const miles: Milestone[] = rows
      .filter((r) => parseAmount(r.amount) > 0)
      .map((r) => ({ id: r.id, title: r.title.trim() || 'دفعة', amount: parseAmount(r.amount), ...(r.due ? { due: r.due } : {}), ...(r.paid ? { paid: r.paid } : {}) }));
    const next: Project = { ...p, title: title.trim(), cur, miles, ...(client.trim() ? { client: client.trim() } : {}) };
    if (!client.trim()) delete next.client;
    if (next.closed && miles.some((m) => !m.paid)) delete next.closed;
    showUndo('اتحفظ', saveProject(next));
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={known ? p.title : 'مشروع جديد'}>
      <MoneyInput value={title} onChangeText={setTitle} placeholder="اسم المشروع" />
      <MoneyInput value={client} onChangeText={setClient} placeholder="العميل (اختياري)" />
      {!known ? (
        <MoneyField label="المبلغ كله (وقسّمه دفعات)">
          <AmountField value={total} onChange={setTotal} cur={cur} onCur={setCur} />
          <Segmented options={[[1, 'مرة واحدة'], [2, 'دفعتين'], [3, '٣ دفعات'], [4, '٤']] as const} value={null} onChange={split} small />
        </MoneyField>
      ) : null}
      <MoneyField label={`الدفعات · ${money(sum, cur)}`}>
        {rows.map((r, i) => (
          <View key={r.id} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <MoneyInput value={r.title} onChangeText={(v) => set(i, { title: v })} style={{ flex: 1.3 }} editable={!r.paid} />
            <MoneyInput value={r.amount} onChangeText={(v) => set(i, { amount: v })} keyboardType="decimal-pad" style={{ flex: 1 }} editable={!r.paid} placeholder="المبلغ" />
            {r.paid ? (
              <Ionicons name="checkmark-circle" size={22} color={t.green} />
            ) : (
              <Pressable onPress={() => setRows((l) => l.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="شيلها">
                <Ionicons name="close" size={20} color={t.bad} />
              </Pressable>
            )}
          </View>
        ))}
        <Pressable onPress={() => setRows((l) => [...l, { id: moneyId('m'), title: `دفعة ${l.length + 1}`, amount: '' }])} hitSlop={6}>
          <T style={{ fontSize: 14, color: t.okText }}>+ دفعة</T>
        </Pressable>
      </MoneyField>
      <Btn label="احفظ" kind="solid" onPress={save} style={{ opacity: ok ? 1 : 0.4 }} />
      {known ? (
        <Btn
          label="امسح المشروع"
          kind="danger"
          onPress={async () => {
            if (await confirm({ title: 'تمسح المشروع؟', body: 'الدفعات اللي اتسجلت دخل هتفضل في الحركات.', confirmLabel: 'امسح', danger: true })) {
              showUndo('اتمسح', deleteProject(p.id));
              onClose();
            }
          }}
        />
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
});
