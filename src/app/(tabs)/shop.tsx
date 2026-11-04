import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SHOPPING } from '../../data/shopping';
import { Btn, Card, Label, Ring, Screen, T } from '../../components/ui';
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
      <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ring value={done / all.length} size={64} stroke={5}>
          <T w="numBold" style={{ fontSize: 14, color: t.okText }}>{`${Math.round((done / all.length) * 100)}%`}</T>
        </Ring>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ color: t.mute, fontSize: 13 }}>{`${done} من ${all.length} صنف`}</T>
          <T w="bold" style={{ fontSize: 18 }}>اشتريت</T>
        </View>
      </Card>

      {SHOPPING.map((g) => (
        <View key={g.title} style={{ gap: 8 }}>
          <Label color={color[g.color]}>{g.title}</Label>
          <Card>
            {g.items.map((i, k) => {
              const on = checks.has(i.id);
              return (
                <Pressable
                  key={i.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => { storage.setShopCheck(week, i.id, !on); bump(); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 54, borderTopWidth: k ? 1 : 0, borderTopColor: t.line, opacity: on ? 0.55 : 1 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.8, borderColor: color[g.color], backgroundColor: on ? color[g.color] : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
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
