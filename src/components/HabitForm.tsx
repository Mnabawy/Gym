import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WEEKDAYS_AR } from '../data/program';
import { ALL_DAYS, HABIT_COLORS, HABIT_ICONS, habitId, refAr, type Habit, type Part, type PrayerRef } from '../lib/habits';
import { readHabits, saveHabit } from '../lib/habitStore';
import { PRAYER_AR, PRAYERS } from '../lib/prayer';
import { useSettings } from '../lib/settings';
import { dateKey } from '../lib/logic';
import { allowReminders } from '../lib/reminder';
import { tint, useTheme, font } from '../theme';
import { INPUT, Btn, Pill, Sheet, Stepper, SwitchRow, T } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const WEEK = [6, 0, 1, 2, 3, 4, 5]; // Sat → Fri
const timeAr = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'ص' : 'م'}`;

/** Add a habit (`habit` null) or edit one: name, icon, color, weekdays and an optional reminder. Mount it only while open. */
export function HabitForm({ visible, habit, onClose }: { visible: boolean; habit: Habit | null; onClose: () => void }) {
  const t = useTheme();
  const blank = { group: '', parts: [] as Part[], at: undefined as PrayerRef | undefined, name: '', cue: '', icon: HABIT_ICONS[0] as string, color: HABIT_COLORS[0] as string, days: [...ALL_DAYS], remind: null as number | null };
  // The parent mounts this only while open (keyed by habit), so the fields start fresh each time.
  const [f, setF] = useState(() => (habit ? { ...habit, cue: habit.cue ?? '', group: habit.group ?? '', parts: habit.parts ?? [] } : blank));
  const [denied, setDenied] = useState(false);
  const [newPart, setNewPart] = useState('');
  const hasPlace = !!useSettings((s) => s.place);
  const groups = [...new Set(readHabits().map((h) => h.group).filter((g): g is string => !!g))];

  const every = f.days.length === 7;
  const save = () => {
    if (!f.name.trim() || !f.days.length) return;
    const cue = (f.cue ?? '').trim();
    const group = (f.group ?? '').trim();
    const parts = (f.parts ?? []).filter((p) => p.name.trim());
    saveHabit({
      id: habit?.id ?? habitId(),
      start: habit?.start ?? dateKey(),
      name: f.name.trim(),
      icon: f.icon,
      color: f.color,
      days: [...f.days].sort(),
      remind: f.at ? null : f.remind,
      ...(f.at ? { at: f.at } : null),
      ...(cue ? { cue } : null),
      ...(group ? { group } : null),
      ...(parts.length ? { parts } : null),
      ...(habit?.pauses ? { pauses: habit.pauses } : null),
    });
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
          style={[INPUT, s.input, { color: t.fg, ...font('semi') }]}
        />
      </View>

      <View style={{ gap: 4 }}>
        <T w="medium">امتى وفين؟</T>
        <TextInput
          value={f.cue ?? ''}
          onChangeText={(v) => setF({ ...f, cue: v })}
          placeholder="مثلًا: بعد صلاة الفجر، في أوضتي"
          placeholderTextColor={t.mute}
          maxLength={60}
          accessibilityLabel="امتى وفين هتعمل العادة"
          style={[INPUT, s.cue, { color: t.fg, backgroundColor: t.soft, ...font('body') }]}
        />
        <T style={{ fontSize: 11.5, color: t.mute, lineHeight: 17 }}>اختياري، بس بيفرق: لما تحدد امتى وفين، الموقف نفسه بيفكّرك بالعادة. واربطها بحاجة بتعملها كل يوم.</T>
      </View>

      <View style={{ gap: 6 }}>
        <T w="medium">المجموعة · اختياري</T>
        <TextInput
          value={f.group ?? ''}
          onChangeText={(v) => setF({ ...f, group: v })}
          placeholder="مثلًا: الصلاة، العلم"
          placeholderTextColor={t.mute}
          maxLength={30}
          accessibilityLabel="المجموعة"
          style={[INPUT, s.cue, { color: t.fg, backgroundColor: t.soft, ...font('body') }]}
        />
        {groups.length ? (
          <View style={s.grid}>
            {groups.map((g) => (
              <Pill key={g} label={g} on={(f.group ?? '').trim() === g} onPress={() => setF({ ...f, group: g })} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <T w="medium">أجزاء · اختياري</T>
        <T style={{ fontSize: 11.5, color: t.mute, lineHeight: 17 }}>لو العادة فيها كذا حاجة (زي الصلوات الخمس)، اكتب كل واحدة، وتعلّم عليهم لوحدهم. اليوم بيكمل لما كلهم يكملوا.</T>
        {(f.parts ?? []).map((p, i) => (
          <View key={i} style={[s.partRow, { backgroundColor: t.soft }]}>
            <T style={{ flex: 1, fontSize: 14 }}>{p.name}</T>
            {p.at ? <T style={{ fontSize: 11, color: t.mute }}>{refAr(p.at, PRAYER_AR)}</T> : null}
            <Pressable onPress={() => setF({ ...f, parts: (f.parts ?? []).filter((_, j) => j !== i) })} hitSlop={10} accessibilityRole="button" accessibilityLabel={`امسح ${p.name}`}>
              <Ionicons name="close" size={18} color={t.bad} />
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={newPart}
            onChangeText={setNewPart}
            placeholder="جزء جديد، مثلًا: الفجر"
            placeholderTextColor={t.mute}
            maxLength={30}
            accessibilityLabel="جزء جديد"
            onSubmitEditing={() => {
              if (!newPart.trim()) return;
              setF({ ...f, parts: [...(f.parts ?? []), { name: newPart.trim() }] });
              setNewPart('');
            }}
            style={[INPUT, s.cue, { flex: 1, color: t.fg, backgroundColor: t.soft, ...font('body') }]}
          />
          <Btn
            label="ضيف"
            onPress={() => {
              if (!newPart.trim()) return;
              setF({ ...f, parts: [...(f.parts ?? []), { name: newPart.trim() }] });
              setNewPart('');
            }}
          />
        </View>
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
        sub={f.at ? `${refAr(f.at, PRAYER_AR)}، ومش بيجي لو عملتها` : f.remind != null ? `الساعة ${timeAr(f.remind)}، ومش بيجي لو عملتها` : 'ساعة معينة أو مع صلاة'}
        value={f.remind != null || !!f.at}
        onChange={async (v) => {
          if (!v) return setF({ ...f, remind: null, at: undefined });
          const ok = await allowReminders();
          setDenied(!ok);
          if (ok) setF({ ...f, remind: 20 * 60, at: undefined });
        }}
      />
      {f.remind != null || f.at ? (
        <>
          <View style={s.grid}>
            <Pill label="ساعة معينة" on={!f.at} onPress={() => setF({ ...f, at: undefined, remind: f.remind ?? 20 * 60 })} />
            <Pill label="مع صلاة" on={!!f.at} onPress={() => setF({ ...f, remind: null, at: f.at ?? { prayer: 'fajr', offset: 15 } })} />
          </View>
          {f.at ? (
            <>
              <View style={s.grid}>
                {PRAYERS.map((p) => (
                  <Pill key={p} label={PRAYER_AR[p]} on={f.at!.prayer === p} onPress={() => setF({ ...f, at: { ...f.at!, prayer: p } })} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T w="medium" style={{ flex: 1 }}>{f.at.offset >= 0 ? 'بعدها بـ' : 'قبلها بـ'}</T>
                <Stepper compact value={f.at.offset} min={-60} max={180} step={5} onChange={(v) => setF({ ...f, at: { ...f.at!, offset: v } })} label="الدقايق" format={(v) => (v ? `${Math.abs(v)} د` : 'مع الأذان')} />
              </View>
              {!hasPlace ? <T style={{ color: t.warn, fontSize: 12 }}>فعّل مواقيت الصلاة من الإعدادات عشان التذكير يعرف المواعيد</T> : null}
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T w="medium" style={{ flex: 1 }}>الميعاد</T>
              <Stepper compact value={f.remind ?? 1200} min={0} max={24 * 60 - 15} step={15} onChange={(v) => setF({ ...f, remind: v })} label="ميعاد التذكير" format={timeAr} />
            </View>
          )}
        </>
      ) : null}
      {denied ? <T style={{ color: t.bad, fontSize: 12.5 }}>اسمح بالإشعارات من إعدادات الموبايل الأول (أو مش متاحة هنا)</T> : null}

      <Btn label={habit ? 'احفظ' : 'ضيف العادة'} kind="solid" onPress={save} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: 16, minHeight: 42, textAlign: 'right', outlineWidth: 0, padding: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 10, paddingHorizontal: 12 },
  cue: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 14.5, textAlign: 'right', outlineWidth: 0 },
  choice: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
