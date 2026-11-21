import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Item } from '../../components/Motion';
import { Card, HeaderBtn, Label, Progress, Screen, Sep, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { ACTION, Swipe } from '../../components/Swipe';
import { TxSheet, type TxDraft } from '../../components/MoneySheets';
import { metaArea, useData } from '../../lib/bus';
import {
  ACCOUNTS,
  accountBalances,
  avgSpend,
  bucketText,
  byCurrency,
  cashTotal,
  debtLeft,
  jamiyaState,
  missingRates,
  money,
  monthName,
  monthOf,
  monthSum,
  pace,
  pocketBalances,
  pocketMonthNet,
  toBase,
  type Account,
  type Tx,
} from '../../lib/money';
import { deleteTx, MONEY_KEYS, postFixed, readDebts, readJamiya, readMoneyCfg, readPockets, readProjects, readTx } from '../../lib/moneyStore';
import { showUndo } from '../../lib/undo';
import { useToday } from '../../lib/useToday';
import { useTheme } from '../../theme';

const CAT_COLORS = ['#0A84FF', '#FF9F0A', '#30D158', '#BF5AF2', '#FF375F', '#64D2FF', '#FFD60A', '#8E8E93'];
const ACCOUNT_ICON: Record<Account, React.ComponentProps<typeof Ionicons>['name']> = { cash: 'cash-outline', bank: 'business-outline', wallet: 'phone-portrait-outline' };

/**
 * الفلوس: cash only, toward the first million. The hero (cash in جنيه against the goal, this month's change, when you
 * get there at this pace), where the money is (each account), the pockets, this month (income, spending, saved, by
 * category), ليك وعليك + الجمعية, الفريلانس, and the latest moves. ＋ logs one. Fixed monthly items post when it opens.
 */
export default function MoneyTab() {
  const t = useTheme();
  const today = useToday();
  useData(...Object.values(MONEY_KEYS).map(metaArea));
  useEffect(() => {
    postFixed(today);
  }, [today]);
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const [only, setOnly] = useState<string | null>(null);

  const cfg = readMoneyCfg();
  const txs = readTx();
  const pockets = readPockets();
  const ym = monthOf(today);
  const total = cashTotal(txs, cfg);
  const sp = pace(txs, today, cfg);
  const month = monthSum(txs, ym, cfg);
  const net = month.income - month.spent;
  const accounts = accountBalances(txs, cfg);
  const foreign = Object.entries(byCurrency(txs)).filter(([c, v]) => c !== 'EGP' && v);
  const pb = pocketBalances(txs, cfg);
  const missing = missingRates(txs, cfg);
  const spend = avgSpend(txs, today, cfg);
  const debts = readDebts().filter((d) => !d.closed);
  const owed = debts.filter((d) => d.dir === 'owed').reduce((a, d) => a + toBase(debtLeft(d), d.cur, cfg), 0);
  const owe = debts.filter((d) => d.dir === 'owe').reduce((a, d) => a + toBase(debtLeft(d), d.cur, cfg), 0);
  const jam = readJamiya().find((j) => !j.got);
  const js = jam ? jamiyaState(jam, today) : null;
  const projects = readProjects().filter((p) => !p.closed);
  const pocketName = useMemo(() => Object.fromEntries(pockets.map((p) => [p.id, p])), [pockets]);
  const recent = txs.filter((x) => !only || x.pocket === only || x.toPocket === only).sort((a, b) => (a.date === b.date ? b.created - a.created : a.date < b.date ? 1 : -1)).slice(0, 25);

  const remove = (x: Tx) => showUndo('اتمسحت', deleteTx(x.id));

  return (
    <Screen
      title="الفلوس"
      action={
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <HeaderBtn icon="options-outline" label="إعدادات الفلوس" onPress={() => router.push('/money/setup')} />
          <MenuButton />
        </View>
      }
      footer={
        <View pointerEvents="box-none" style={s.bar}>
          <Pressable
            onPress={() => setDraft({ kind: 'out', ...(only ? { pocket: only } : {}) })}
            accessibilityRole="button"
            accessibilityLabel="سجّل"
            style={({ pressed }) => [s.fab, { backgroundColor: t.ok, boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.22)', transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <Ionicons name="add" size={30} color={t.onOk} />
          </Pressable>
        </View>
      }>
      <TxSheet visible={!!draft} draft={draft} onClose={() => setDraft(null)} />

      {/* The goal: cash only. */}
      <Card style={{ padding: 16, gap: 8 }}>
        <T style={{ color: t.mute, fontSize: 13 }}>لحد أول {cfg.goal >= 1_000_000 && cfg.goal % 1_000_000 === 0 ? (cfg.goal === 1_000_000 ? 'مليون' : `${cfg.goal / 1_000_000} مليون`) : money(cfg.goal)} · كاش</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <T w="num" style={{ fontSize: 32, fontWeight: '800' }}>{money(total)}</T>
          <T style={{ color: t.mute, fontSize: 14 }}>{Math.max(0, Math.round((total / cfg.goal) * 1000) / 10)}%</T>
        </View>
        <Progress value={Math.max(0, Math.min(1, total / cfg.goal))} height={8} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <T style={{ fontSize: 13, color: net >= 0 ? t.green : t.bad }}>{net >= 0 ? '+' : '−'}{money(Math.abs(net))} {monthName(ym)}</T>
          <T style={{ fontSize: 13, color: t.mute }}>
            {!txs.length ? 'سجّل اللي معاك من ⚙︎ عشان نبدأ' : sp?.eta ? `بالسرعة دي: ${monthName(sp.eta, true)}` : sp ? 'السرعة دلوقتي مش بتقرّب' : ''}
          </T>
        </View>
        {missing.length ? (
          <Pressable onPress={() => router.push('/money/setup')}>
            <T style={{ fontSize: 12.5, color: t.warn }}>حط سعر {missing.join('، ')} عشان يتحسب في المجموع</T>
          </Pressable>
        ) : null}
      </Card>

      {/* Where it is. */}
      <Card style={{ flexDirection: 'row', padding: 12 }}>
        {(Object.keys(ACCOUNTS) as Account[]).map((a) => (
          <View key={a} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Ionicons name={ACCOUNT_ICON[a]} size={18} color={t.mute} />
            <T w="num" style={{ fontSize: 14, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit>{money(accounts[a].base)}</T>
            <T style={{ fontSize: 12, color: t.mute }}>{ACCOUNTS[a]}</T>
          </View>
        ))}
      </Card>
      {foreign.length ? <T style={{ fontSize: 12.5, color: t.mute, paddingHorizontal: 16 }}>منهم {foreign.map(([c, v]) => money(v, c)).join(' + ')}</T> : null}

      {/* Pockets. */}
      <Label>الجيوب</Label>
      <Card>
        {pockets.map((p, i) => {
          const b = pb[p.id];
          const sub =
            p.id === 'emergency' && spend
              ? `تكفي ${Math.floor(((b?.base ?? 0) / spend) * 10) / 10} شهر${p.target ? ` · الهدف ${money(p.target)}` : ''}`
              : p.id === 'sheep'
                ? `${monthName(ym)}: ${(() => {
                    const v = pocketMonthNet(txs, p.id, ym, cfg);
                    return `${v >= 0 ? 'مكسب' : 'خسارة'} ${money(Math.abs(v))}`;
                  })()}`
                : p.target
                  ? `الهدف ${money(p.target)}`
                  : '';
          const on = only === p.id;
          return (
            <View key={p.id}>
              {i ? <Sep /> : null}
              <Pressable onPress={() => setOnly(on ? null : p.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1, backgroundColor: on ? t.soft : 'transparent' }]}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
                <View style={{ flex: 1, gap: 1 }}>
                  <T w="semi" style={{ fontSize: 15 }}>{p.name}</T>
                  {sub ? <T style={{ fontSize: 12, color: t.mute }}>{sub}</T> : null}
                  {p.target ? <Progress value={Math.min(1, Math.max(0, (b?.base ?? 0) / p.target))} color={p.color} height={4} /> : null}
                </View>
                <T w="num" style={{ fontSize: 15, fontWeight: '700' }}>{b ? bucketText(b.byCur) : money(0)}</T>
              </Pressable>
            </View>
          );
        })}
      </Card>

      {/* This month. */}
      <Label>{monthName(ym)}</Label>
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row' }}>
          {[
            ['دخل', money(month.income), t.green],
            ['صرف', money(month.spent), t.fg],
            ['وفّرت', month.saved == null ? '—' : `${Math.round(month.saved * 100)}%`, month.saved != null && month.saved < 0 ? t.bad : t.fg],
          ].map(([l, v, c]) => (
            <View key={l} style={{ flex: 1, gap: 2 }}>
              <T style={{ fontSize: 12, color: t.mute }}>{l}</T>
              <T w="num" style={{ fontSize: 16, fontWeight: '700', color: c }} numberOfLines={1} adjustsFontSizeToFit>{v}</T>
            </View>
          ))}
        </View>
        {month.cats.length ? (
          <>
            <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              {month.cats.map((c, i) => (
                <View key={c.cat} style={{ flex: c.amount, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
              {month.cats.map((c, i) => (
                <View key={c.cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />
                  <T style={{ fontSize: 12 }}>{c.cat} {money(c.amount)}</T>
                </View>
              ))}
            </View>
          </>
        ) : (
          <T style={{ fontSize: 12.5, color: t.mute }}>لسه مفيش صرف الشهر ده</T>
        )}
      </Card>

      {/* Owed, owing, the جمعية, freelance. */}
      <Card>
        <Pressable onPress={() => router.push('/money/debts')} style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="swap-horizontal" size={20} color={t.sec.tasks} />
          <View style={{ flex: 1, gap: 1 }}>
            <T w="semi" style={{ fontSize: 15 }}>ليك وعليك</T>
            <T style={{ fontSize: 12, color: t.mute }} numberOfLines={2}>
              {[owed ? `ليك ${money(owed)}` : '', owe ? `عليك ${money(owe)}` : '', js && jam ? (js.until > 0 ? `${jam.name}: تقبض بعد ${js.until} شهر` : js.until === 0 ? `${jam.name}: دورك الشهر ده` : `${jam.name}: ${js.paid}/${jam.months}`) : '', js?.due ? 'قسط الشهر ده لسه' : ''].filter(Boolean).join(' · ') || 'الديون، الجمعية، والثابت كل شهر'}
            </T>
          </View>
          <Ionicons name="chevron-back" size={18} color={t.mute} />
        </Pressable>
        <Sep />
        <Pressable onPress={() => router.push('/money/freelance')} style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="laptop-outline" size={20} color={t.sec.focus} />
          <View style={{ flex: 1, gap: 1 }}>
            <T w="semi" style={{ fontSize: 15 }}>الفريلانس</T>
            <T style={{ fontSize: 12, color: t.mute }}>{projects.length ? `${projects.length} مشروع شغّال` : 'المشاريع ودفعاتها'}</T>
          </View>
          <Ionicons name="chevron-back" size={18} color={t.mute} />
        </Pressable>
      </Card>

      {/* Latest. */}
      <Label>{only ? `آخر حركات ${pocketName[only]?.name ?? ''}` : 'آخر الحركات'}</Label>
      {recent.length ? (
        <Card>
          {recent.map((x, i) => (
            <Item key={x.id}>
              {i ? <Sep /> : null}
              <Swipe
                start={[
                  { label: 'عدّل', icon: 'create-outline', color: ACTION.blue, onPress: () => setDraft(x) },
                  { label: 'امسح', icon: 'trash-outline', color: ACTION.red, onPress: () => remove(x) },
                ]}>
                <Pressable onPress={() => setDraft(x)} style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1, backgroundColor: t.card }]}>
                  <Ionicons name={x.kind === 'in' ? 'arrow-down-circle' : x.kind === 'out' ? 'arrow-up-circle' : 'swap-horizontal'} size={22} color={x.kind === 'in' ? t.green : x.kind === 'out' ? t.mute : t.sec.gym} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <T style={{ fontSize: 14.5 }} numberOfLines={1}>{x.note || x.cat || (x.kind === 'move' ? `${pocketName[x.pocket]?.name ?? ''} ← ${pocketName[x.toPocket ?? '']?.name ?? ''}` : x.opening ? 'رصيد البداية' : x.kind === 'in' ? 'دخل' : 'صرف')}</T>
                    <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>
                      {[x.date === today ? 'النهارده' : x.date.slice(5).split('-').reverse().join('/'), pocketName[x.pocket]?.name, ACCOUNTS[x.account], x.note && x.cat ? x.cat : ''].filter(Boolean).join(' · ')}
                    </T>
                  </View>
                  <T w="num" style={{ fontSize: 15, fontWeight: '700', color: x.kind === 'in' ? t.green : t.fg }}>
                    {x.kind === 'in' ? '+' : x.kind === 'out' ? '−' : ''}{money(x.amount, x.cur)}
                  </T>
                </Pressable>
              </Swipe>
            </Item>
          ))}
        </Card>
      ) : (
        <Card style={{ padding: 16 }}>
          <T style={{ color: t.mute, fontSize: 13.5, lineHeight: 21 }}>ابدأ بالفلوس اللي معاك دلوقتي من ⚙︎ (رصيد البداية لكل جيب)، وبعدين سجّل أي دخل أو صرف من ＋.</T>
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 10 },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
