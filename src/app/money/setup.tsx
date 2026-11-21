import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Btn, Card, Label, Screen, Sep, Sheet, T } from '../../components/ui';
import { MoneyField, MoneyInput, parseAmount, TxSheet, type TxDraft } from '../../components/MoneySheets';
import { metaArea, useData } from '../../lib/bus';
import { CURRENCIES, money, pocketBalances, type Pocket } from '../../lib/money';
import { MONEY_KEYS, moneyId, readMoneyCfg, readPockets, readTx, saveMoneyCfg, savePockets } from '../../lib/moneyStore';
import { confirm } from '../../lib/confirm';
import { showUndo } from '../../lib/undo';
import { useTheme } from '../../theme';

const COLORS = ['#8E8E93', '#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF', '#A2845E'];

/**
 * إعدادات الفلوس (`/money/setup`, ⚙︎ on the money tab): the goal (cash), each currency's rate in جنيه, the pockets (name,
 * color, a target), and the money you have now (رصيد البداية: one start balance per pocket and account, not income).
 */
export default function MoneySetup() {
  const t = useTheme();
  useData(metaArea(MONEY_KEYS.cfg), metaArea(MONEY_KEYS.pockets), metaArea(MONEY_KEYS.tx));
  const cfg = readMoneyCfg();
  const pockets = readPockets();
  const bal = pocketBalances(readTx(), cfg);
  const [goal, setGoal] = useState(String(cfg.goal));
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries(Object.keys(CURRENCIES).filter((c) => c !== 'EGP').map((c) => [c, cfg.rates[c] ? String(cfg.rates[c]) : ''])));
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const [edit, setEdit] = useState<Pocket | null>(null);

  const saveCfg = () => {
    const g = parseAmount(goal);
    const r: Record<string, number> = {};
    for (const [c, v] of Object.entries(rates)) if (parseAmount(v) > 0) r[c] = parseAmount(v);
    saveMoneyCfg({ ...cfg, goal: g > 0 ? g : cfg.goal, rates: r });
  };

  return (
    <Screen title="إعدادات الفلوس" onBack={() => router.back()}>
      <TxSheet visible={!!draft} draft={draft} onClose={() => setDraft(null)} />
      {edit ? <PocketSheet p={edit} onClose={() => setEdit(null)} pockets={pockets} used={!!bal[edit.id]} /> : null}

      <Label>اللي معاك دلوقتي</Label>
      <Card style={{ padding: 14, gap: 8 }}>
        <T style={{ fontSize: 13, color: t.mute, lineHeight: 20 }}>سجّل الفلوس اللي معاك فعلاً في كل جيب (كاش، بنك، محفظة، وبأي عملة). دي بداية، مش بتتحسب دخل.</T>
        <Btn label="+ رصيد بداية" kind="solid" onPress={() => setDraft({ kind: 'in', opening: true, note: 'رصيد البداية' })} />
      </Card>

      <Label>الهدف (كاش)</Label>
      <Card style={{ padding: 14 }}>
        <MoneyInput value={goal} onChangeText={setGoal} onEndEditing={saveCfg} keyboardType="number-pad" accessibilityLabel="الهدف" />
      </Card>

      <Label>أسعار العملات بالجنيه</Label>
      <Card style={{ padding: 14, gap: 10 }}>
        {Object.entries(rates).map(([c, v]) => (
          <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T style={{ width: 70, fontSize: 15 }}>الـ{CURRENCIES[c].label}</T>
            <MoneyInput value={v} onChangeText={(x) => setRates((r) => ({ ...r, [c]: x }))} onEndEditing={saveCfg} keyboardType="decimal-pad" placeholder="بكام؟" style={{ flex: 1 }} accessibilityLabel={`سعر ال${CURRENCIES[c].label}`} />
            <T style={{ color: t.mute }}>ج</T>
          </View>
        ))}
        <T style={{ fontSize: 12, color: t.mute }}>المبالغ بتفضل بعملتها، والمجموع بس اللي بيتحسب بالسعر ده.</T>
      </Card>

      <Label>الجيوب</Label>
      <Card>
        {pockets.map((p, i) => (
          <View key={p.id}>
            {i ? <Sep /> : null}
            <Pressable onPress={() => setEdit(p)} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
              <T style={{ flex: 1, fontSize: 15 }}>{p.name}</T>
              {p.target ? <T style={{ color: t.mute, fontSize: 12.5 }}>الهدف {money(p.target)}</T> : null}
              <Ionicons name="chevron-back" size={18} color={t.mute} />
            </Pressable>
          </View>
        ))}
        <Sep />
        <Pressable onPress={() => setEdit({ id: moneyId('p'), name: '', color: COLORS[pockets.length % COLORS.length], order: pockets.length })} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, opacity: pressed ? 0.6 : 1 })}>
          <Ionicons name="add" size={20} color={t.okText} />
          <T style={{ fontSize: 15, color: t.okText }}>جيب جديد</T>
        </Pressable>
      </Card>
    </Screen>
  );
}

function PocketSheet({ p, pockets, used, onClose }: { p: Pocket; pockets: Pocket[]; used: boolean; onClose: () => void }) {
  const t = useTheme();
  const [name, setName] = useState(p.name);
  const [target, setTarget] = useState(p.target ? String(p.target) : '');
  const [color, setColor] = useState(p.color);
  const known = pockets.some((x) => x.id === p.id);
  const save = () => {
    if (!name.trim()) return;
    const tg = parseAmount(target);
    const next: Pocket = { ...p, name: name.trim(), color, ...(tg > 0 ? { target: tg } : {}) };
    if (!(tg > 0)) delete next.target;
    showUndo('اتحفظ', savePockets(known ? pockets.map((x) => (x.id === p.id ? next : x)) : [...pockets, next]));
    onClose();
  };
  const remove = async () => {
    if (used) {
      await confirm({ title: 'فيه فلوس متسجلة على الجيب ده', body: 'حوّل اللي فيه لجيب تاني الأول، أو امسح حركاته.', confirmLabel: 'تمام' });
      return;
    }
    showUndo('اتمسح', savePockets(pockets.filter((x) => x.id !== p.id)));
    onClose();
  };
  return (
    <Sheet visible title={known ? 'الجيب' : 'جيب جديد'} onClose={onClose}>
      <MoneyField label="الاسم">
        <MoneyInput value={name} onChangeText={setName} placeholder="مثلاً: الجواز، العربية" />
      </MoneyField>
      <MoneyField label="هدف (اختياري، بالجنيه)">
        <MoneyInput value={target} onChangeText={setTarget} keyboardType="number-pad" placeholder="مثلاً 50000" />
      </MoneyField>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {COLORS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} accessibilityLabel="لون" style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: c === color ? 3 : 0, borderColor: t.fg }} />
        ))}
      </View>
      <Btn label="احفظ" kind="solid" onPress={save} style={{ opacity: name.trim() ? 1 : 0.4 }} />
      {known ? <Btn label="امسح الجيب" kind="danger" onPress={remove} /> : null}
    </Sheet>
  );
}
