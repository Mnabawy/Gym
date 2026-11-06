import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WEEKDAYS_AR } from '../data/program';
import { ALL_DAYS, HABIT_COLORS, HABIT_ICONS, habitId, type Habit } from '../lib/habits';
import { saveHabit } from '../lib/habitStore';
import { dateKey } from '../lib/logic';
import { allowReminders } from '../lib/reminder';
import { F, tint, useTheme } from '../theme';
import { Btn, Pill, Sheet, Stepper, SwitchRow, T } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const WEEK = [6, 0, 1, 2, 3, 4, 5]; // Sat → Fri
const timeAr = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'ص' : 'م'}`;

/** Add a habit (`habit` null) or edit one: name, icon, color, weekdays and an optional reminder. Mount it only while open. */
export function HabitForm({ visible, habit, onClose }: { visible: boolean; habit: Habit | null; onClose: () => void }) {
  const t = useTheme();
  const blank = { name: '', icon: HABIT_ICONS[0] as string, color: HABIT_COLORS[0] as string, days: [...ALL_DAYS], remind: null as number | null };
  // The parent mounts this only while open (keyed by habit), so the fields start fresh each time.
  const [f, setF] = useState(() => (habit ? { ...habit } : blank));
  const [denied, setDenied] = useState(false);

  const every = f.days.length === 7;
  const save = () => {
    if (!f.name.trim() || !f.days.length) return;
    saveHabit({ id: habit?.id ?? habitId(), start: habit?.start ?? dateKey(), name: f.name.trim(), icon: f.icon, color: f.color, days: [...f.days].sort(), remind: f.remind });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={habit ? 'عدّل العادة' : 'عادة جديدة'}>
      <View style={[s.preview, { backgroundColor: tint(f.color, 0.12), borderColor: tint(f.color, 0.35) }]}>
        <View style={[s.icon, { backgroundColor: f.color }]}>
          <Ionicons name={f.icon as IconName} size={22} color="#FFFFFF" />
        </View>
        <TextInput
          value={f.name}
          onChangeText={(v) => setF({ ...f, name: v })}
          placeholder="اسم العادة، مثلًا: ورد قرآن"
          placeholderTextColor={t.mute}
          maxLength={40}
          autoFocus={!habit}
          accessibilityLabel="اسم العادة"
          style={[s.input, { color: t.fg, fontFamily: F.semi }]}
        />
      </View>

      <T w="medium">الأيقونة</T>
      <View style={s.grid}>
        {HABIT_ICONS.map((ic) => {
          const on = f.icon === ic;
          return (
            <Pressable key={ic} onPress={() => setF({ ...f, icon: ic })} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={ic} style={[s.choice, { backgroundColor: on ? tint(f.color, 0.18) : t.soft, borderColor: on ? f.color : 'transparent' }]}>
              <Ionicons name={(on ? ic : `${ic}-outline`) as IconName} size={20} color={on ? f.color : t.mute} />
            </Pressable>
          );
        })}
      </View>

      <T w="medium">اللون</T>
      <View style={s.grid}>
        {HABIT_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setF({ ...f, color: c })} accessibilityRole="button" accessibilityState={{ selected: f.color === c }} accessibilityLabel={`لون ${c}`} style={[s.swatch, { backgroundColor: c, borderColor: f.color === c ? t.fg : 'transparent' }]}>
            {f.color === c ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
          </Pressable>
        ))}
      </View>

      <T w="medium">الأيام</T>
      <View style={s.grid}>
        <Pill label="كل يوم" on={every} onPress={() => setF({ ...f, days: [...ALL_DAYS] })} />
        {WEEK.map((wd) => {
          const on = !every && f.days.includes(wd);
          return (
            <Pill
              key={wd}
              label={WEEKDAYS_AR[wd]}
              on={on}
              onPress={() => {
                const base = every ? [] : f.days;
                const next = base.includes(wd) ? base.filter((d) => d !== wd) : [...base, wd];
                setF({ ...f, days: next.length ? next : [...ALL_DAYS] });
              }}
            />
          );
        })}
      </View>

      <SwitchRow
        label="فكّرني"
        sub={f.remind != null ? `كل يوم عليه العادة الساعة ${timeAr(f.remind)}، ومش بيجي لو عملتها` : undefined}
        value={f.remind != null}
        onChange={async (v) => {
          if (!v) return setF({ ...f, remind: null });
          const ok = await allowReminders();
          setDenied(!ok);
          if (ok) setF({ ...f, remind: 20 * 60 });
        }}
      />
      {f.remind != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T w="medium" style={{ flex: 1 }}>الميعاد</T>
          <Stepper compact value={f.remind} min={0} max={24 * 60 - 15} step={15} onChange={(v) => setF({ ...f, remind: v })} label="ميعاد التذكير" format={timeAr} />
        </View>
      ) : null}
      {denied ? <T style={{ color: t.bad, fontSize: 12.5 }}>اسمح بالإشعارات من إعدادات الموبايل الأول (أو مش متاحة هنا)</T> : null}

      <Btn label={habit ? 'احفظ' : 'ضيف العادة'} kind="solid" onPress={save} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 10 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: 16, minHeight: 42, textAlign: 'right', outlineWidth: 0, padding: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
