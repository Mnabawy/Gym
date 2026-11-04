import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, Label, Ring, Screen, T } from '../../components/ui';
import { countAr, shopWeekKey, TIMES } from '../../lib/logic';
import { daysLabel, splitShopping, tripFor } from '../../lib/shop';
import { useSettings } from '../../lib/settings';
import { storage } from '../../lib/storage';
import { useDataVersion } from '../../lib/bus';
import { useTheme } from '../../theme';

const daysText = (days: string[]) => (days.length === 7 ? 'كل يوم' : days.join('، '));

export default function Shop() {
  const t = useTheme();
  const week = shopWeekKey();
  const { bump } = useDataVersion();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // Trips per week come from the settings page; the list is split by the days each trip covers.
  const n = useSettings((s) => s.shopTrips);
  const trips = useMemo(() => splitShopping(n), [n]);
  const split = trips.length > 1;
  const [picked, setPicked] = useState<number | null>(null);
  const k = Math.min(picked ?? tripFor(trips, new Date().getDay()), trips.length - 1);
  const trip = trips[k];
  const checks = new Set(storage.shopChecks(week)); // re-read when v changes
  const all = trip.groups.flatMap((g) => g.items);
  const done = all.filter((i) => checks.has(i.key)).length;
  const color = { protein: t.protein, carbs: t.carbs, veg: t.veg, fat: t.fat };

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
    <Screen title="المشتريات" sub={split ? `أسبوع ${week} · بتشتري ${countAr(n, TIMES)} · بيتصفّر كل جمعة` : `أسبوع ${week} · بيتصفّر كل جمعة`}>
      {split ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {trips.map((tr) => {
            const on = tr.index === k;
            return (
              <Pressable
                key={tr.index}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`المرة ${tr.index + 1}، ${tr.label}`}
                onPress={() => setPicked(tr.index)}
                style={{ flex: 1, minWidth: 0, minHeight: 56, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? t.ink : t.soft }}>
                <T w="bold" style={{ fontSize: 14, color: on ? t.onInk : t.fg }}>{`المرة ${tr.index + 1}`}</T>
                <T style={{ fontSize: 11, color: on ? t.onInk : t.mute, opacity: on ? 0.85 : 1 }} numberOfLines={2} adjustsFontSizeToFit>{daysLabel(tr.weekdays, true)}</T>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ring value={done / all.length} size={64} stroke={5}>
          <T w="numBold" style={{ fontSize: 14, color: t.okText }}>{`${Math.round((done / all.length) * 100)}%`}</T>
        </Ring>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ color: t.mute, fontSize: 13 }}>{`${done} من ${all.length} صنف`}</T>
          <T w="bold" style={{ fontSize: 18 }}>{split ? `اشتريت · المرة ${k + 1}` : 'اشتريت'}</T>
          {split ? <T style={{ color: t.mute, fontSize: 12.5 }}>{`أكل ${trip.label}`}</T> : null}
        </View>
      </Card>

      {trip.groups.map((g) => (
        <View key={g.title} style={{ gap: 8 }}>
          <Label color={color[g.color]}>{g.title}</Label>
          <Card>
            {g.items.map((i, row) => {
              const on = checks.has(i.key);
              const sub = [
                i.need && (!split || i.need !== i.buy) && `محتاج ${i.need}`,
                i.item.note,
                i.once ? 'مرة واحدة في الأسبوع' : i.days.length ? daysText(i.days) : '',
              ];
              return (
                <Pressable
                  key={i.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => { storage.setShopCheck(week, i.key, !on); bump(); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 54, borderTopWidth: row ? 1 : 0, borderTopColor: t.line, opacity: on ? 0.55 : 1 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.8, borderColor: color[g.color], backgroundColor: on ? color[g.color] : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <T w="bold" style={{ color: '#fff', fontSize: 14 }}>✓</T> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T w="semi" style={{ fontSize: 15, textDecorationLine: on ? 'line-through' : 'none' }}>{i.item.name}</T>
                    <T style={{ color: t.mute, fontSize: 12 }}>{sub.filter(Boolean).join(' · ')}</T>
                  </View>
                  <T w="bold" style={{ fontSize: 14 }}>{i.buy}</T>
                </Pressable>
              );
            })}
          </Card>
        </View>
      ))}

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
    </Screen>
  );
}
