// The food tab's sheets: food outside the plan, and swapping a meal for another option.
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { INPUT, Btn, Sheet, T } from '../ui';
import type { MealKey } from '../../data/nutrition';
import type { SwapOption } from '../../lib/foodView';
import { font, useTheme } from '../../theme';
import { fs } from './styles';

export type ExtraForm = { name: string; kcal: string; p: string };

export function ExtraSheet({ form, onChange, onClose, onAdd }: { form: ExtraForm | null; onChange: (f: ExtraForm) => void; onClose: () => void; onAdd: () => void }) {
  const t = useTheme();
  return (
    <Sheet visible={form != null} onClose={onClose} title="أكل برة الخطة" sub="السعرات والبروتين من على العلبة أو بالتقريب">
      {form ? (
        <>
          <TextInput value={form.name} onChangeText={(v) => onChange({ ...form, name: v })} placeholder="إيه اللي كلته؟" placeholderTextColor={t.mute} maxLength={40} accessibilityLabel="اسم الأكل" style={[INPUT, fs.input, { color: t.fg, backgroundColor: t.soft, ...font('body'), textAlign: 'right' }]} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['kcal', 'p'] as const).map((k) => (
              <View key={k} style={{ flex: 1, gap: 4 }}>
                <T w="medium" style={{ fontSize: 13 }}>{k === 'kcal' ? 'السعرات' : 'البروتين (جم)'}</T>
                <TextInput value={form[k]} onChangeText={(v) => onChange({ ...form, [k]: v.replace(/[^0-9.,٠-٩۰-۹٫]/g, '') })} keyboardType="number-pad" placeholder="–" placeholderTextColor={t.mute} maxLength={5} accessibilityLabel={k === 'kcal' ? 'السعرات' : 'البروتين'} style={[INPUT, fs.input, { color: t.fg, backgroundColor: t.soft, ...font('numBold'), textAlign: 'center' }]} />
              </View>
            ))}
          </View>
          <Btn label="ضيفه" kind="solid" onPress={onAdd} />
        </>
      ) : null}
    </Sheet>
  );
}

/** Pick another option of the same meal for this date; `options` from `swapOptions` (closest calories first). */
export function SwapSheet({ meal, dayName, options, onClose, onPick }: {
  meal: MealKey | null;
  dayName: string;
  options: readonly SwapOption[];
  onClose: () => void;
  onPick: (meal: MealKey, i: number) => void;
}) {
  const t = useTheme();
  return (
    <Sheet
      visible={meal != null}
      onClose={onClose}
      title={meal ? `بدّل ${meal} · ${dayName}` : ''}
      sub="أي اختيار من نفس الوجبة بماكروز قريبة. التبديل لليوم ده بس، وقايمة المشتريات زي ما هي">
      {meal
        ? options.map(({ i, name, items, mac, dk, on, original }) => (
            <Pressable key={i} onPress={() => onPick(meal, i)} accessibilityRole="button" accessibilityState={{ selected: on }} style={({ pressed }) => [fs.opt, { backgroundColor: on ? t.okSoft : t.soft, opacity: pressed ? 0.7 : 1 }]}>
              <View style={{ flex: 1, gap: 1 }}>
                <T w="semi" style={{ fontSize: 14 }}>{`${name}${original ? ' · الأصلي' : ''}`}</T>
                <T style={{ fontSize: 11.5, color: t.mute }} numberOfLines={2}>{items.join('، ')}</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T w="num" style={{ fontSize: 12 }}>{`${Math.round(mac.kcal)} سعر`}</T>
                <T w="num" style={{ fontSize: 11, color: t.protein }}>{`${Math.round(mac.p)} بروتين`}</T>
                {dk ? <T w="num" style={{ fontSize: 10.5, color: t.mute }}>{`\u2066${dk > 0 ? '+' : ''}${dk}\u2069`}</T> : null}
              </View>
            </Pressable>
          ))
        : null}
    </Sheet>
  );
}
