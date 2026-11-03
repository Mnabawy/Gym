import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SHOPPING } from '../../data/shopping';
import { Btn, Card, Progress, Screen, T } from '../../components/ui';
import { shopWeekKey } from '../../lib/logic';
import { storage } from '../../lib/storage';
import { useDataVersion } from '../../lib/bus';
import { useTheme } from '../../theme';

export default function Shop() {
  const t = useTheme();
  const week = shopWeekKey();
  const { bump } = useDataVersion();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const checks = new Set(storage.shopChecks(week)); // re-read when v changes
  const all = SHOPPING.flatMap((g) => g.items);
  const done = all.filter((i) => checks.has(i.id)).length;
  const color = { protein: t.protein, carbs: t.carbs, veg: t.veg, fat: t.fat };

  const copy = async () => {
    const text =
      '🛒 مشتريات الأسبوع\n\n' +
      SHOPPING.map((g) => `${g.title}\n` + g.items.map((i) => `${checks.has(i.id) ? '✓' : '☐'} ${i.name} - ${i.buy}`).join('\n')).join('\n\n');
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Screen title="المشتريات" sub={`أسبوع ${week} · بيتصفّر كل جمعة`}>
      <Card style={{ padding: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T w="bold">اشتريت</T>
          <T w="numRegular" style={{ color: t.mute }}>{`${done} / ${all.length}`}</T>
        </View>
        <Progress value={done / all.length} />
      </Card>

      {SHOPPING.map((g) => (
        <Card key={g.title}>
          <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: color[g.color] + '22', borderStartWidth: 5, borderStartColor: color[g.color] }}>
            <T w="bold" style={{ fontSize: 16 }}>{g.title}</T>
          </View>
          {g.items.map((i, k) => {
            const on = checks.has(i.id);
            return (
              <Pressable
                key={i.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => { storage.setShopCheck(week, i.id, !on); bump(); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 52, borderTopWidth: k ? 1 : 0, borderTopColor: t.line, opacity: on ? 0.55 : 1 }}>
                <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 1.8, borderColor: color[g.color], backgroundColor: on ? color[g.color] : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <T w="bold" style={{ color: '#fff', fontSize: 14 }}>✓</T> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w="semi" style={{ fontSize: 15, textDecorationLine: on ? 'line-through' : 'none' }}>{i.name}</T>
                  <T style={{ color: t.mute, fontSize: 12 }}>
                    {[i.exact && `محتاج ${i.exact}`, i.note, i.days.length ? (i.days.length === 7 ? 'كل يوم' : i.days.join('، ')) : ''].filter(Boolean).join(' · ')}
                  </T>
                </View>
                <T w="bold" style={{ fontSize: 14 }}>{i.buy}</T>
              </Pressable>
            );
          })}
        </Card>
      ))}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn label={copied ? 'اتنسخت ✓' : 'انسخ القايمة'} kind="solid" onPress={copy} />
        {!confirm ? (
          <Btn label="ابدأ أسبوع جديد" onPress={() => setConfirm(true)} />
        ) : (
          <>
            <Btn label="أيوه امسح العلامات" onPress={() => { storage.clearShop(week); setConfirm(false); bump(); }} />
            <Btn label="لا" onPress={() => setConfirm(false)} />
          </>
        )}
      </View>
    </Screen>
  );
}
