import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { INPUT, Btn, Pill, Sheet, Stepper, T } from './ui';
import { GOAL_TEMPLATES, fromTemplate, type GoalTemplate } from '../data/goalTemplates';
import { activeKids, current, FOCUS_MAX, GOAL_COLORS, GOAL_ICONS, goalId, kidsOf, WEIGHTS, type Goal } from '../lib/goals';
import { readGoals, saveGoal } from '../lib/goalStore';
import { daysBetween } from '../lib/gaps';
import { dateKey, parseNum } from '../lib/logic';
import { tint, useTheme, font } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const UNITS = ['$', 'ج.م', 'ساعة', 'كتاب', 'كجم', '%'];

const plusMonths = (from: string, n: number) => {
  const d = new Date(`${from}T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return dateKey(d);
};

/**
 * New goal (pick a ready road first: money, a skill, or your own) or edit one: name, icon, color, what you count,
 * where you start and where you want to be, and an optional time frame. Mounted only while open.
 */
const stamp = () => Date.now();

export function GoalForm({ goal, onClose, onSaved, parent }: { goal?: Goal; onClose: () => void; onSaved?: (g: Goal) => void; parent?: string }) {
  const t = useTheme();
  const today = dateKey();
  const [tp, setTp] = useState<GoalTemplate | null>(null);
  const all = readGoals();
  const bigs = all.filter((u) => u.umbrella && u.id !== goal?.id);
  const parentGoal = parent ? bigs.find((u) => u.id === parent) : undefined;
  const isBig = goal ? !!goal.umbrella : tp?.key === 'big';
  const [f, setF] = useState(() =>
    goal
      ? { name: goal.name, icon: goal.icon, color: goal.color, unit: goal.unit, start: String(goal.start), now: String(current(goal)), target: String(goal.target), months: goal.due ? Math.max(1, Math.round(daysBetween(goal.startDate, goal.due) / 30.44)) : 0, why: goal.why, parent: goal.parent ?? '', weight: goal.weight ?? 1 }
      : null,
  );

  const pick = (x: GoalTemplate) => {
    setTp(x);
    setF({ name: x.name, icon: x.icon, color: x.color, unit: x.key !== 'big' && parentGoal ? parentGoal.unit : x.unit, start: '0', now: '', target: String(x.target), months: x.key === 'money' || x.key === 'big' ? 60 : x.key === 'skill' ? 12 : 0, why: '', parent: x.key === 'big' ? '' : parent ?? '', weight: 1 });
  };

  if (!f) {
    return (
      <Sheet visible onClose={onClose} title="هدف جديد" sub="اختار نوعه، وهقترحلك طريق تمشي فيه تقدر تعدّل فيه براحتك">
        {GOAL_TEMPLATES.filter((x) => !(parent && x.key === 'big')).map((x) => (
          <Pressable key={x.key} onPress={() => pick(x)} accessibilityRole="button" accessibilityLabel={x.label} style={({ pressed }) => [s.tp, { backgroundColor: tint(x.color, pressed ? 0.2 : 0.1) }]}>
            <View style={[s.icon, { backgroundColor: x.color }]}>
              <Ionicons name={x.icon as IconName} size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <T w="bold" style={{ fontSize: 15.5 }}>{x.label}</T>
              <T style={{ fontSize: 12.5, color: t.mute }}>{x.stages.length > 1 ? `${x.sub} · ${x.stages.length} مراحل جاهزة` : x.sub}</T>
            </View>
            <Ionicons name="chevron-back" size={18} color={t.mute} />
          </Pressable>
        ))}
      </Sheet>
    );
  }

  const start = parseNum(f.start) ?? NaN;
  const target = parseNum(f.target) ?? NaN;
  // Where you are now: empty = at the start. Anything else is logged as progress today.
  const now = f.now.trim() ? parseNum(f.now) ?? NaN : start;
  const ok = !!f.name.trim() && Number.isFinite(start) && Number.isFinite(target) && Number.isFinite(now) && start !== target;
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  const save = () => {
    if (!ok) return;
    const base = goal ?? fromTemplate(tp ?? GOAL_TEMPLATES[GOAL_TEMPLATES.length - 1], today);
    const { parent: _p, weight: _w, ...plain } = base;
    const g: Goal = { ...plain, name: f.name.trim(), icon: f.icon, color: f.color, unit: f.unit.trim(), start, target, due: f.months ? plusMonths(base.startDate, f.months) : null, why: f.why.trim(), ...(!isBig && f.parent ? { parent: f.parent, ...(f.weight > 1 ? { weight: f.weight } : {}) } : {}) };
    const gap = now - current(g);
    if (gap) g.entries = [...g.entries, { id: goalId(stamp()), date: today < g.startDate ? g.startDate : today, amount: gap, note: 'من «انت فين»' }];
    saveGoal(g);
    onSaved?.(g);
    onClose();
  };

  return (
    <Sheet visible onClose={onClose} title={goal ? 'عدّل الهدف' : tp?.label ?? 'هدف جديد'}>
      <View style={[s.preview, { backgroundColor: tint(f.color, 0.12), borderColor: tint(f.color, 0.35) }]}>
        <View style={[s.icon, { backgroundColor: f.color }]}>
          <Ionicons name={f.icon as IconName} size={22} color="#FFFFFF" />
        </View>
        <TextInput value={f.name} onChangeText={(v) => set({ name: v })} placeholder="هدفك إيه؟" placeholderTextColor={t.mute} maxLength={50} accessibilityLabel="اسم الهدف" style={[INPUT, s.name, { color: t.fg, ...font('semi') }]} />
      </View>

      <T w="medium">بتعدّ إيه؟</T>
      <View style={s.grid}>
        {UNITS.map((u) => <Pill key={u} label={u} on={f.unit === u} onPress={() => set({ unit: u })} />)}
        <TextInput value={UNITS.includes(f.unit) ? '' : f.unit} onChangeText={(v) => set({ unit: v })} placeholder="حاجة تانية" placeholderTextColor={t.mute} maxLength={12} accessibilityLabel="وحدة تانية" style={[INPUT, s.field, { width: 110, color: t.fg, backgroundColor: t.soft, ...font('body') }]} />
      </View>

      {/* Three numbers, in the order you walk them: where it starts, where you are, where you want to be. */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            ['start', 'نقطة البداية', f.start, '0'],
            ['now', 'انت فين دلوقتي', f.now, f.start || '0'],
            ['target', 'الهدف النهائي', f.target, ''],
          ] as const
        ).map(([k, label, v, ph]) => (
          <View key={k} style={{ flex: 1, gap: 4 }}>
            <T w="medium" style={{ fontSize: 13 }} numberOfLines={1} adjustsFontSizeToFit>{label}</T>
            <TextInput value={v} onChangeText={(x) => set({ [k]: x })} keyboardType="numeric" placeholder={ph} placeholderTextColor={t.mute} accessibilityLabel={label} style={[s.field, INPUT, { color: t.fg, backgroundColor: t.soft, ...font('num') }]} />
          </View>
        ))}
      </View>
      {isBig ? <T style={{ fontSize: 12, color: t.mute, lineHeight: 18 }}>الأهداف اللي تحته لو بتعدّ نفس الحاجة (نفس الوحدة) بتتجمع في رقمه، ولو مختلفة بيتحسب متوسط نسبتهم</T> : null}
      {f.start.trim() && f.target.trim() && !ok && f.name.trim() ? <T style={{ fontSize: 12, color: t.warn }}>{Number.isFinite(now) ? 'البداية والهدف لازم يبقوا رقمين مختلفين' : 'اكتب رقم في «انت فين» أو سيبها فاضية'}</T> : null}

      <T w="medium">في قد إيه؟</T>
      <Stepper value={f.months} min={0} max={120} step={f.months >= 12 ? 6 : 1} onChange={(v) => set({ months: v })} label="المدة" format={(v) => (!v ? 'من غير ميعاد' : v % 12 === 0 ? `${v / 12} سنة` : `${v} شهر`)} />

      <T w="medium">ليه عايز توصل؟ · اختياري</T>
      <TextInput value={f.why} onChangeText={(v) => set({ why: v })} placeholder="السبب اللي هيخليك تكمّل لما تزهق" placeholderTextColor={t.mute} multiline maxLength={200} accessibilityLabel="ليه" style={[INPUT, s.field, { height: 70, paddingTop: 10, textAlignVertical: 'top', color: t.fg, backgroundColor: t.soft, ...font('body') }]} />

      {!isBig && bigs.length ? (
        <>
          <T w="medium">تحت هدف كبير؟</T>
          <View style={s.grid}>
            <Pill label="لوحده" on={!f.parent} onPress={() => set({ parent: '' })} />
            {bigs.map((u) => <Pill key={u.id} label={u.name} on={f.parent === u.id} onPress={() => set({ parent: u.id })} />)}
          </View>
          {f.parent ? (
            <>
              <View style={s.grid}>
                {[1, 2, 3].map((w) => <Pill key={w} label={WEIGHTS[w]} on={f.weight === w} onPress={() => set({ weight: w })} />)}
              </View>
              {(() => {
                const u = bigs.find((x) => x.id === f.parent);
                const running = u ? activeKids(kidsOf(all, u.id).filter((k) => k.id !== goal?.id)).length : 0;
                return (
                  <>
                    {u && f.unit.trim() !== u.unit ? <T style={{ fontSize: 12, color: t.mute }}>{`وحدته غير «${u.name}» (${u.unit || 'من غير وحدة'})، فهيتحسب بنسبته مش برقمه`}</T> : null}
                    {running >= FOCUS_MAX ? <T style={{ fontSize: 12, color: t.warn }}>{`تحت «${u?.name}» ${running} أهداف شغالة. الأحسن تخلّص واحد الأول، التركيز على ${FOCUS_MAX} بيوصّل أسرع`}</T> : null}
                  </>
                );
              })()}
            </>
          ) : null}
        </>
      ) : null}

      <T w="medium">الأيقونة</T>
      <View style={s.grid}>
        {GOAL_ICONS.map((ic) => {
          const on = f.icon === ic;
          return (
            <Pressable key={ic} onPress={() => set({ icon: ic })} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={ic} style={[s.choice, { backgroundColor: on ? tint(f.color, 0.18) : t.soft, borderColor: on ? f.color : 'transparent' }]}>
              <Ionicons name={(on ? ic : `${ic}-outline`) as IconName} size={20} color={on ? f.color : t.mute} />
            </Pressable>
          );
        })}
      </View>
      <View style={s.grid}>
        {GOAL_COLORS.map((c) => (
          <Pressable key={c} onPress={() => set({ color: c })} accessibilityRole="button" accessibilityState={{ selected: f.color === c }} accessibilityLabel={`لون ${c}`} style={[s.swatch, { backgroundColor: c, borderColor: f.color === c ? t.fg : 'transparent' }]}>
            {f.color === c ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {!goal ? <Btn label="رجوع" onPress={() => setF(null)} style={{ flex: 1 }} /> : null}
        <Btn label={goal ? 'احفظ' : 'ابدأ'} kind="solid" onPress={save} style={{ flex: 2, opacity: ok ? 1 : 0.5 }} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  tp: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, minHeight: 64 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 16, minHeight: 42, textAlign: 'right', outlineWidth: 0, padding: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  field: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, textAlign: 'right', outlineWidth: 0 },
  choice: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
