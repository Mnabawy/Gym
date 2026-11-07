import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Pill, Sheet, T } from './ui';
import { DAY_MS, QUIT_COLORS, QUIT_ICONS, quitId, HABIT_TYPES, type Quit, type HabitType } from '../lib/quit';
import { saveQuit } from '../lib/quitStore';
import { parseNum } from '../lib/logic';
import { F, tint, useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const SINCE = [
  { label: 'من دلوقتي', days: 0 },
  { label: 'من امبارح', days: 1 },
  { label: 'من أسبوع', days: 7 },
  { label: 'من شهر', days: 30 },
];
const CURRENCIES = ['ج.م', '$', 'ر.س', 'د.إ'];
const stamp = () => Date.now();

/** New quit or edit one: what, since when, why, what instead, and what it cost you a day. Mounted only while open. */
export function QuitForm({ quit, onClose, onSaved }: { quit?: Quit; onClose: () => void; onSaved?: (q: Quit) => void }) {
  const t = useTheme();
  const [f, setF] = useState(() => {
    const type = (quit?.type ?? 'habit') as HabitType;
    const targetDays = quit?.targetDays ?? HABIT_TYPES[type].targetDays;
    return {
      name: quit?.name ?? '',
      icon: quit?.icon ?? QUIT_ICONS[0],
      color: quit?.color ?? QUIT_COLORS[0],
      since: 0,
      why: quit?.why ?? '',
      replace: quit?.replace ?? '',
      cost: quit?.costPerDay ? String(quit.costPerDay) : '',
      currency: quit?.currency ?? 'ج.م',
      minutes: quit?.minutesPerDay ? String(quit.minutesPerDay) : '',
      password: quit?.password ?? '',
      type,
      targetDaysStr: String(targetDays),
    };
  });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const ok = !!f.name.trim();

  const save = () => {
    if (!ok) return;
    const now = stamp();
    const q: Quit = {
      ...(quit ?? { id: quitId(now), start: now - f.since * DAY_MS, slips: [], urges: [] }),
      name: f.name.trim(),
      icon: f.icon,
      color: f.color,
      why: f.why.trim(),
      replace: f.replace.trim(),
      costPerDay: Math.max(0, parseNum(f.cost) ?? 0),
      currency: f.currency,
      minutesPerDay: Math.max(0, parseNum(f.minutes) ?? 0),
      password: f.password.trim() || undefined,
      type: f.type,
      targetDays: Math.max(1, parseNum(f.targetDaysStr) ?? 30),
    };
    saveQuit(q);
    onSaved?.(q);
    onClose();
  };

  const field = (label: string, value: string, onChange: (v: string) => void, ph: string, numeric?: boolean, multiline?: boolean) => (
    <View style={{ gap: 4, flex: numeric ? 1 : undefined }}>
      <T w="medium" style={{ fontSize: 13.5 }}>{label}</T>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={ph}
        placeholderTextColor={t.mute}
        keyboardType={numeric ? 'numeric' : 'default'}
        multiline={multiline}
        maxLength={multiline ? 160 : 40}
        accessibilityLabel={label}
        textAlign="right"
        style={[s.input, multiline ? { height: 66, paddingTop: 10, textAlignVertical: 'top' } : null, { color: t.fg, backgroundColor: t.soft, fontFamily: numeric ? F.num : F.body }]}
      />
    </View>
  );

  return (
    <Sheet visible onClose={onClose} title={quit ? 'عدّل' : 'هتبطّل إيه؟'} sub={quit ? undefined : 'اسمها مش هيظهر في الإشعارات'}>
      <View style={[s.preview, { backgroundColor: tint(f.color, 0.12), borderColor: tint(f.color, 0.35) }]}>
        <View style={[s.icon, { backgroundColor: f.color }]}>
          <Ionicons name={f.icon as IconName} size={22} color="#FFFFFF" />
        </View>
        <TextInput value={f.name} onChangeText={(v) => set({ name: v })} placeholder="مثلًا: السجاير، السوشيال بالليل" placeholderTextColor={t.mute} maxLength={40} accessibilityLabel="العادة" textAlign="right" style={[s.name, { color: t.fg, fontFamily: F.semi }]} />
      </View>

      {!quit ? (
        <>
          <T w="medium" style={{ fontSize: 13.5 }}>إيه نوع العادة دي؟</T>
          <View style={s.grid}>
            {(Object.keys(HABIT_TYPES) as HabitType[]).map((type) => (
              <Pill
                key={type}
                label={HABIT_TYPES[type].name}
                on={f.type === type}
                onPress={() => set({ type, targetDaysStr: String(HABIT_TYPES[type].targetDays) })}
              />
            ))}
          </View>

          <T w="medium" style={{ fontSize: 13.5 }}>بطّلتها امتى</T>
          <View style={s.grid}>{SINCE.map((x) => <Pill key={x.days} label={x.label} on={f.since === x.days} onPress={() => set({ since: x.days })} />)}</View>
        </>
      ) : null}

      {field('ليه عايز تبطّلها؟', f.why, (v) => set({ why: v }), 'هتشوفها لما الرغبة تيجي', false, true)}
      {field('هتعمل إيه بدالها لما الرغبة تيجي؟', f.replace, (v) => set({ replace: v }), 'مثلًا: كوباية مية وتمشي 5 دقايق')}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {field('كانت بتكلّفك في اليوم', f.cost, (v) => set({ cost: v }), '0', true)}
        {field('وبتاخد من وقتك (دقيقة/يوم)', f.minutes, (v) => set({ minutes: v }), '0', true)}
      </View>
      <View style={s.grid}>{CURRENCIES.map((c) => <Pill key={c} label={c} on={f.currency === c} onPress={() => set({ currency: c })} />)}</View>

      {field('الهدف: كام يوم نظيف؟', f.targetDaysStr, (v) => set({ targetDaysStr: v }), String(HABIT_TYPES[f.type].targetDays), true)}
      <T style={{ fontSize: 11.5, color: t.mute }}>{HABIT_TYPES[f.type].ref}</T>

      {field('كلمة السر (اختياري)', f.password, (v) => set({ password: v }), 'اتركها فارغة لما تبقى بدون حماية', false, false)}

      <View style={s.grid}>
        {QUIT_ICONS.map((ic) => {
          const on = f.icon === ic;
          return (
            <Pressable key={ic} onPress={() => set({ icon: ic })} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={ic} style={[s.choice, { backgroundColor: on ? tint(f.color, 0.18) : t.soft, borderColor: on ? f.color : 'transparent' }]}>
              <Ionicons name={ic as IconName} size={20} color={on ? f.color : t.mute} />
            </Pressable>
          );
        })}
      </View>
      <View style={s.grid}>
        {QUIT_COLORS.map((c) => (
          <Pressable key={c} onPress={() => set({ color: c })} accessibilityRole="button" accessibilityState={{ selected: f.color === c }} accessibilityLabel={`لون ${c}`} style={[s.swatch, { backgroundColor: c, borderColor: f.color === c ? t.fg : 'transparent' }]}>
            {f.color === c ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
          </Pressable>
        ))}
      </View>
      <Btn label={quit ? 'احفظ' : 'يلا نبدأ'} kind="solid" onPress={save} style={{ opacity: ok ? 1 : 0.5 }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 10 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 16, minHeight: 42, textAlign: 'right', outlineWidth: 0, padding: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 14.5, textAlign: 'right', outlineWidth: 0 },
  choice: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
