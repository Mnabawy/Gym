import React, { useMemo, useState } from 'react';
import { Item } from '../../components/Motion';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SHOPPING } from '../../data/shopping';
import { Btn, Card, HeaderBtn, Label, Ring, Screen, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { countAr, shopWeekKey, TIMES } from '../../lib/logic';
import { assignTrips, daysLabel, movesFor, splitShopping, tripDays, tripFor } from '../../lib/shop';
import { useSettings } from '../../lib/settings';
import { storage } from '../../lib/storage';
import { confirm } from '../../lib/confirm';
import { useDataVersion } from '../../lib/bus';
import { tint, useTheme } from '../../theme';

const daysText = (days: string[]) => (days.length === 7 ? 'كل يوم' : days.join('، '));

export default function Shop() {
  const t = useTheme();
  const week = shopWeekKey();
  const { bump } = useDataVersion();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  // Trips per week and the trip you chose for any item come from the settings store; src/lib/shop.ts does the split.
  const n = useSettings((s) => s.shopTrips);
  const allMoves = useSettings((s) => s.shopMoves);
  const setQuiet = useSettings((s) => s.setQuiet);
  const count = tripDays(n).length;
  const moves = useMemo(() => movesFor(count, allMoves), [count, allMoves]);
  const trips = useMemo(() => splitShopping(n, SHOPPING, moves), [n, moves]);
  const tripOf = useMemo(() => assignTrips(count, SHOPPING, moves), [count, moves]);
  const split = trips.length > 1;
  const [picked, setPicked] = useState<number | null>(null);
  const k = Math.min(picked ?? tripFor(trips, new Date().getDay()), trips.length - 1);
  const trip = trips[k];
  const checks = new Set(storage.shopChecks(week)); // re-read when v changes
  const all = trip.groups.flatMap((g) => g.items);
  const done = all.filter((i) => checks.has(i.key)).length;
  const color = { protein: t.protein, carbs: t.carbs, veg: t.veg, fat: t.fat };
  const editMode = split && editing;

  const moveTo = (id: string, to: number) => setQuiet({ shopMoves: { ...allMoves, [`${count}:${id}`]: to } });
  const resetMoves = () => setQuiet({ shopMoves: Object.fromEntries(Object.entries(allMoves).filter(([key]) => !key.startsWith(`${count}:`))) });

  const copy = async () => {
    const text =
      (split ? `🛒 مشتريات المرة ${k + 1} (${trip.label})\n\n` : '🛒 مشتريات الأسبوع\n\n') +
      trip.groups.map((g) => `${g.title}\n` + g.items.map((i) => `${checks.has(i.key) ? '✓' : '☐'} ${i.item.name} - ${i.buy}`).join('\n')).join('\n\n');
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Screen
      title="المشتريات"
      dense
      sub={split ? `أسبوع ${week} · بتشتري ${countAr(n, TIMES)} · بيتصفّر كل جمعة` : `أسبوع ${week} · بيتصفّر كل جمعة`}
      action={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {split ? <HeaderBtn icon={editing ? 'checkmark' : 'create-outline'} label={editing ? 'خلصت التعديل' : 'عدّل أصناف كل مرة'} onPress={() => setEditing(!editing)} /> : null}
          <MenuButton />
        </View>
      }>
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
                style={{ flex: 1, minWidth: 0, minHeight: 44, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 5, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: on ? t.ink : t.soft }}>
                <T w="bold" style={{ fontSize: 14, color: on ? t.onInk : t.fg, opacity: items ? 1 : 0.5 }}>{`المرة ${tr.index + 1}`}</T>
                <T style={{ fontSize: 11, color: on ? t.onInk : t.mute, opacity: on ? 0.85 : 1 }} numberOfLines={2} adjustsFontSizeToFit>{daysLabel(tr.weekdays, true)}</T>
                <T w="num" style={{ fontSize: 11, color: on ? t.onInk : t.mute, opacity: on ? 0.85 : 1 }}>{`${items} صنف`}</T>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {editMode ? (
        <>
          <View style={[s.tip, { backgroundColor: t.okSoft }]}>
            <T w="semi" style={{ color: t.okText, fontSize: 14 }}>{`أصناف المرة ${k + 1} (${trip.label})`}</T>
            <T style={{ color: t.okText, fontSize: 12.5, lineHeight: 19 }}>
              {`كل صنف بيتشرى مرة واحدة بس. اختار رقم المرة جنب أي صنف: اللي على ${k + 1} هيتشرى المرة دي، ولو غيّرته بيتنقل للمرة التانية.`}
            </T>
          </View>
          {SHOPPING.map((g) => (
            <View key={g.title} style={{ gap: 4 }}>
              <Label color={color[g.color]}>{g.title}</Label>
              <Card>
                {g.items.map((item, row) => {
                  const at = tripOf.get(item.id) ?? 0;
                  const here = at === k;
                  return (
                    <View key={item.id} style={[s.row, { borderTopWidth: row ? 1 : 0, borderTopColor: t.line }, here ? { backgroundColor: tint(t.ok, 0.1) } : null]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T w={here ? 'bold' : 'semi'} style={{ fontSize: 14 }} numberOfLines={2}>{item.name}</T>
                        <T style={{ color: t.mute, fontSize: 11.5 }} numberOfLines={1}>{item.buy}</T>
                      </View>
                      <View style={s.picker} accessibilityRole="radiogroup" accessibilityLabel={`${item.name} هيتشرى في أنهي مرة`}>
                        {trips.map((tr) => {
                          const on = tr.index === at;
                          return (
                            <Pressable
                              key={tr.index}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: on }}
                              accessibilityLabel={`المرة ${tr.index + 1}`}
                              hitSlop={4}
                              onPress={() => !on && moveTo(item.id, tr.index)}
                              style={[s.opt, { backgroundColor: on ? (tr.index === k ? t.ok : t.ink) : t.soft }]}>
                              <T w="numBold" style={{ fontSize: 13, color: on ? '#FFFFFF' : t.mute }}>{String(tr.index + 1)}</T>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}
          {Object.keys(moves).length ? <Btn label="رجّع التقسيم التلقائي" onPress={resetMoves} /> : null}
        </>
      ) : (
        <>
          {all.length ? (
            <Card style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ring value={done / all.length} size={46} stroke={4}>
                <T w="numBold" style={{ fontSize: 12, color: t.okText }}>{`${Math.round((done / all.length) * 100)}%`}</T>
              </Ring>
              <View style={{ flex: 1, gap: 1 }}>
                <T style={{ color: t.mute, fontSize: 12.5 }}>{`${done} من ${all.length} صنف`}</T>
                <T w="bold" style={{ fontSize: 16 }}>{split ? `اشتريت · المرة ${k + 1}` : 'اشتريت'}</T>
                {split ? <T style={{ color: t.mute, fontSize: 12.5 }}>{`تتشرى قبل أكل ${trip.label}`}</T> : null}
              </View>
            </Card>
          ) : (
            <Card style={{ padding: 16, alignItems: 'center', gap: 4 }}>
              <T w="bold" style={{ fontSize: 16 }}>{`مفيش مشتريات في المرة ${k + 1}`}</T>
              <T style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>اختار لها أصناف من زرار التعديل فوق.</T>
            </Card>
          )}

          {trip.groups.map((g) => (
            <View key={g.title} style={{ gap: 4 }}>
              <Label color={color[g.color]}>{g.title}</Label>
              <Card>
                {g.items.map((i, row) => {
                  const on = checks.has(i.key);
                  const sub = [i.need && `محتاج ${i.need}`, i.item.note, i.days.length ? daysText(i.days) : ''].filter(Boolean).join(' · ');
                  return (
                    <Item key={i.key}><Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => { storage.setShopCheck(week, i.key, !on); bump(); }}
                      style={[s.row, { borderTopWidth: row ? 1 : 0, borderTopColor: t.line, opacity: on ? 0.55 : 1 }]}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.6, borderColor: color[g.color], backgroundColor: on ? color[g.color] : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {on ? <T w="bold" style={{ color: '#fff', fontSize: 12 }}>✓</T> : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T w="semi" style={{ fontSize: 13.5, lineHeight: 20, textDecorationLine: on ? 'line-through' : 'none' }}>{i.item.name}</T>
                        {sub ? <T style={{ color: t.mute, fontSize: 11, lineHeight: 16 }}>{sub}</T> : null}
                      </View>
                      <T w="bold" style={{ fontSize: 12.5 }}>{i.buy}</T>
                    </Pressable></Item>
                  );
                })}
              </Card>
            </View>
          ))}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Btn label="ابدأ أسبوع جديد" onPress={async () => { if (await confirm({ title: 'تبدأ أسبوع جديد؟', body: 'هتتشال كل علامات المشتريات للأسبوع ده.', confirmLabel: 'امسح العلامات', danger: true })) { storage.clearShop(week); bump(); } }} style={{ flex: 1 }} />
            <Btn label={copied ? 'اتنسخت ✓' : 'انسخ القايمة'} kind="solid" onPress={copy} style={{ flex: 1 }} />
          </View>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  // 44pt rows: the whole row is the checkbox, so that's its touch target.
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 3, minHeight: 44 },
  tip: { borderRadius: 12, padding: 10, gap: 3 },
  picker: { flexDirection: 'row', gap: 4 },
  opt: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
