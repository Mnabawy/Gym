import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, HeaderBtn, Label, Pill, Ring, Screen, Stepper, T } from '../../components/ui';
import { countAr, shopWeekKey, TIMES } from '../../lib/logic';
import { CUSTOM_GROUPS, daysLabel, isCustom, movesFor, splitShopping, tripDays, tripFor, withCustom } from '../../lib/shop';
import { useSettings } from '../../lib/settings';
import { storage } from '../../lib/storage';
import { useDataVersion } from '../../lib/bus';
import { F, useTheme } from '../../theme';

const daysText = (days: string[]) => (days.length === 7 ? 'كل يوم' : days.join('، '));

export default function Shop() {
  const t = useTheme();
  const week = shopWeekKey();
  const { bump } = useDataVersion();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', buy: '', group: CUSTOM_GROUPS[CUSTOM_GROUPS.length - 1] });

  // Trips per week, your own items and items you moved all come from the settings store (src/lib/shop.ts splits).
  const n = useSettings((s) => s.shopTrips);
  const custom = useSettings((s) => s.shopCustom);
  const allMoves = useSettings((s) => s.shopMoves);
  const setQuiet = useSettings((s) => s.setQuiet);
  const count = tripDays(n).length;
  const moves = useMemo(() => movesFor(count, allMoves), [count, allMoves]);
  const data = useMemo(() => withCustom(custom), [custom]);
  const trips = useMemo(() => splitShopping(n, data, moves), [n, data, moves]);
  const split = trips.length > 1;
  const [picked, setPicked] = useState<number | null>(null);
  const k = Math.min(picked ?? tripFor(trips, new Date().getDay()), trips.length - 1);
  const trip = trips[k];
  const checks = new Set(storage.shopChecks(week)); // re-read when v changes
  const all = trip.groups.flatMap((g) => g.items);
  const done = all.filter((i) => checks.has(i.key)).length;
  const color = { protein: t.protein, carbs: t.carbs, veg: t.veg, fat: t.fat };

  const moveTo = (id: string, to: number) => setQuiet({ shopMoves: { ...allMoves, [`${count}:${id}`]: to } });
  const resetMoves = () => setQuiet({ shopMoves: Object.fromEntries(Object.entries(allMoves).filter(([key]) => !key.startsWith(`${count}:`))) });
  const add = () => {
    const name = form.name.trim();
    if (!name) return;
    const id = `c:${Date.now().toString(36)}`;
    setQuiet({
      shopCustom: [...custom, { id, name, buy: form.buy.trim(), group: form.group }],
      // Lands on the trip you're looking at.
      ...(split ? { shopMoves: { ...allMoves, [`${count}:${id}`]: k } } : {}),
    });
    setForm((f) => ({ ...f, name: '', buy: '' }));
  };
  const remove = (id: string) => setQuiet({ shopCustom: custom.filter((c) => c.id !== id) });

  const copy = async () => {
    const text =
      (split ? `🛒 مشتريات المرة ${k + 1} (${trip.label})\n\n` : '🛒 مشتريات الأسبوع\n\n') +
      trip.groups.map((g) => `${g.title}\n` + g.items.map((i) => `${checks.has(i.key) ? '✓' : '☐'} ${i.item.name}${i.buy ? ` - ${i.buy}` : ''}`).join('\n')).join('\n\n');
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Screen
      title="المشتريات"
      sub={split ? `أسبوع ${week} · بتشتري ${countAr(n, TIMES)} · بيتصفّر كل جمعة` : `أسبوع ${week} · بيتصفّر كل جمعة`}
      action={<HeaderBtn icon={editing ? 'checkmark' : 'create-outline'} label={editing ? 'خلصت التعديل' : 'عدّل القايمة'} onPress={() => setEditing(!editing)} />}>
      {split ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {trips.map((tr) => {
            const on = tr.index === k;
            const items = tr.groups.reduce((a, g) => a + g.items.length, 0);
            return (
              <Pressable
                key={tr.index}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`المرة ${tr.index + 1}، ${tr.label}، ${items} صنف`}
                onPress={() => setPicked(tr.index)}
                style={{ flex: 1, minWidth: 0, minHeight: 56, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? t.ink : t.soft }}>
                <T w="bold" style={{ fontSize: 14, color: on ? t.onInk : t.fg, opacity: items ? 1 : 0.5 }}>{`المرة ${tr.index + 1}`}</T>
                <T style={{ fontSize: 11, color: on ? t.onInk : t.mute, opacity: on ? 0.85 : 1 }} numberOfLines={2} adjustsFontSizeToFit>{daysLabel(tr.weekdays, true)}</T>
                <T w="num" style={{ fontSize: 11, color: on ? t.onInk : t.mute, opacity: on ? 0.85 : 1 }}>{`${items} صنف`}</T>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {editing ? (
        <>
          <Label>ضيف صنف</Label>
          <Card style={{ padding: 14, gap: 10 }}>
            <TextInput
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              placeholder="اسم الصنف"
              placeholderTextColor={t.mute}
              accessibilityLabel="اسم الصنف"
              style={[s.input, { backgroundColor: t.soft, color: t.fg }]}
            />
            <TextInput
              value={form.buy}
              onChangeText={(buy) => setForm((f) => ({ ...f, buy }))}
              placeholder="الكمية (مثلًا: 2 كيلو) · اختياري"
              placeholderTextColor={t.mute}
              accessibilityLabel="الكمية"
              style={[s.input, { backgroundColor: t.soft, color: t.fg }]}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {CUSTOM_GROUPS.map((g) => (
                <Pill key={g} label={g} on={form.group === g} onPress={() => setForm((f) => ({ ...f, group: g }))} />
              ))}
            </View>
            <Btn label={split ? `ضيفه للمرة ${k + 1}` : 'ضيفه للقايمة'} kind="solid" onPress={add} style={{ opacity: form.name.trim() ? 1 : 0.5 }} />
          </Card>
          {split ? (
            <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>
              الأصناف متقسمة بالتساوي على المرات. غيّر رقم المرة جنب أي صنف عشان تنقله.
            </T>
          ) : null}
        </>
      ) : all.length ? (
        <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Ring value={done / all.length} size={64} stroke={5}>
            <T w="numBold" style={{ fontSize: 14, color: t.okText }}>{`${Math.round((done / all.length) * 100)}%`}</T>
          </Ring>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ color: t.mute, fontSize: 13 }}>{`${done} من ${all.length} صنف`}</T>
            <T w="bold" style={{ fontSize: 18 }}>{split ? `اشتريت · المرة ${k + 1}` : 'اشتريت'}</T>
            {split ? <T style={{ color: t.mute, fontSize: 12.5 }}>{`تتشرى قبل أكل ${trip.label}`}</T> : null}
          </View>
        </Card>
      ) : null}

      {!all.length ? (
        <Card style={{ padding: 20, alignItems: 'center', gap: 4 }}>
          <T w="bold" style={{ fontSize: 16 }}>{`مفيش مشتريات في المرة ${k + 1}`}</T>
          <T style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>انقل لها أصناف أو ضيف أصناف جديدة من زرار التعديل فوق.</T>
        </Card>
      ) : null}

      {trip.groups.map((g) => (
        <View key={g.title} style={{ gap: 8 }}>
          <Label color={color[g.color]}>{g.title}</Label>
          <Card>
            {g.items.map((i, row) => {
              const on = checks.has(i.key);
              const mine = isCustom(i.item.id);
              const sub = [i.need && `محتاج ${i.need}`, i.item.note, i.days.length ? daysText(i.days) : '', mine ? 'صنف ضفته' : ''].filter(Boolean).join(' · ');
              const rowStyle = [s.row, { borderTopWidth: row ? 1 : 0, borderTopColor: t.line }];
              if (editing) {
                return (
                  <View key={i.key} style={rowStyle}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w="semi" style={{ fontSize: 15 }} numberOfLines={1}>{i.item.name}</T>
                      <T style={{ color: t.mute, fontSize: 12 }} numberOfLines={1}>{i.buy || sub}</T>
                    </View>
                    {split ? <Stepper value={k + 1} min={1} max={trips.length} onChange={(v) => moveTo(i.item.id, v - 1)} label={`رقم المرة لـ ${i.item.name}`} /> : null}
                    {mine ? (
                      <Pressable onPress={() => remove(i.item.id)} accessibilityRole="button" accessibilityLabel={`امسح ${i.item.name}`} hitSlop={4} style={[s.del, { backgroundColor: t.warnSoft }]}>
                        <Ionicons name="trash-outline" size={18} color={t.warn} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              }
              return (
                <Pressable
                  key={i.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => { storage.setShopCheck(week, i.key, !on); bump(); }}
                  style={[rowStyle, { opacity: on ? 0.55 : 1 }]}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.8, borderColor: color[g.color], backgroundColor: on ? color[g.color] : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <T w="bold" style={{ color: '#fff', fontSize: 14 }}>✓</T> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T w="semi" style={{ fontSize: 15, textDecorationLine: on ? 'line-through' : 'none' }}>{i.item.name}</T>
                    {sub ? <T style={{ color: t.mute, fontSize: 12 }}>{sub}</T> : null}
                  </View>
                  {i.buy ? <T w="bold" style={{ fontSize: 14 }}>{i.buy}</T> : null}
                </Pressable>
              );
            })}
          </Card>
        </View>
      ))}

      {editing ? (
        Object.keys(moves).length ? <Btn label="رجّع التقسيم التلقائي" onPress={resetMoves} /> : null
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {!confirm ? (
            <>
              <Btn label="ابدأ أسبوع جديد" onPress={() => setConfirm(true)} style={{ flex: 1 }} />
              <Btn label={copied ? 'اتنسخت ✓' : 'انسخ القايمة'} kind="solid" onPress={copy} style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <Btn label="لا" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
              <Btn label="أيوه امسح العلامات" kind="solid" onPress={() => { storage.clearShop(week); setConfirm(false); bump(); }} style={{ flex: 1 }} />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 54 },
  input: { fontFamily: F.body, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, minHeight: 46, textAlign: 'right' },
  del: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
