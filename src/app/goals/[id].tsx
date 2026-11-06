import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, HeaderBtn, Label, Ring, Screen, Sheet, T } from '../../components/ui';
import { GoalForm } from '../../components/GoalForm';
import { MONTHS_AR } from '../../data/program';
import { useDataVersion } from '../../lib/bus';
import { deleteGoal, readGoals, saveGoal } from '../../lib/goalStore';
import { addReview, allWins, current, currentStage, fmtAmount, goalId, IDLE_DAYS, idleDays, moveStage, nextTask, pace, progress, reviewDue, stageDone, toggleTask, type Goal, type Review, type Stage } from '../../lib/goals';
import { daysBetween } from '../../lib/gaps';
import { dateKey, parseNum } from '../../lib/logic';
import { tap } from '../../lib/timer';
import { F, glow, ThemeProvider, tint, useTheme, useWarm, type Theme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const dayLabel = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]}`;
const monthLabel = (k: string) => `${MONTHS_AR[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;

export default function GoalScreen() {
  return (
    <ThemeProvider value={useWarm()}>
      <GoalPage />
    </ThemeProvider>
  );
}

/** One goal: how far you are, the pace, the road in stages (tick the tasks), wins, the weekly review and your log. */
function GoalPage() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const { id } = useLocalSearchParams<{ id: string }>();
  const g = readGoals().find((x) => x.id === id);
  const today = dateKey();
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [winning, setWinning] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [roadEdit, setRoadEdit] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [allLog, setAllLog] = useState(false);

  if (!g) {
    return (
      <Screen title="الهدف" onBack={() => router.back()}>
        <T style={{ color: t.mute }}>الهدف ده مش موجود</T>
      </Screen>
    );
  }

  const fmt = (n: number) => fmtAmount(n, g.unit);
  const p = progress(g);
  const now = current(g);
  const pc = pace(g, today);
  const cur = currentStage(g);
  const next = nextTask(g);
  const idle = idleDays(g, today);
  const wins = allWins(g, fmt);
  const save = (x: Goal) => saveGoal(x);
  const there = pc.remaining === 0;

  return (
    <Screen title={g.name} onBack={() => router.back()} action={<HeaderBtn icon="create-outline" label="عدّل الهدف" onPress={() => setEditing(true)} />}>
      {editing ? <GoalForm goal={g} onClose={() => setEditing(false)} /> : null}
      {logging ? <LogSheet g={g} onClose={() => setLogging(false)} /> : null}
      {winning ? <WinSheet g={g} onClose={() => setWinning(false)} /> : null}
      {reviewing ? (
        <Sheet visible onClose={() => setReviewing(false)} title="مراجعة الأسبوع">
          <ReviewForm g={g} t={t} onDone={() => setReviewing(false)} />
        </Sheet>
      ) : null}

      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <View style={{ borderRadius: 110, boxShadow: `0px 0px 34px ${tint(g.color, 0.35)}` }}>
          <Ring value={p} size={220} stroke={14} color={g.color} track={tint(g.color, 0.13)}>
            <View style={[s.inner, { backgroundColor: t.card }]}>
              <T style={{ fontSize: 12.5, color: t.mute }}>انت عند</T>
              <T w="numBold" style={{ fontSize: 34, maxWidth: 170, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>{fmt(now)}</T>
              <T w="semi" style={{ fontSize: 13, color: g.color }}>{there ? 'وصلت 🎉' : `${Math.floor(p * 100)}% · فاضل ${fmt(Math.abs(pc.remaining))}`}</T>
              <T style={{ fontSize: 11.5, color: t.mute }}>{`الهدف ${fmt(g.target)}`}</T>
            </View>
          </Ring>
        </View>
      </View>

      {g.why ? (
        <View style={[s.why, { borderColor: g.color, backgroundColor: tint(g.color, 0.07) }]}>
          <T style={{ fontSize: 12, color: t.mute }}>ليه بدأت</T>
          <T w="semi" style={{ fontSize: 14.5, lineHeight: 23 }}>{g.why}</T>
        </View>
      ) : null}

      {idle >= IDLE_DAYS && !there ? (
        <View style={[s.nudge, { backgroundColor: t.warnSoft }]}>
          <Ionicons name="alert-circle" size={18} color={t.warn} />
          <T style={{ flex: 1, fontSize: 13, color: t.warn, lineHeight: 20 }}>
            {`بقالك ${idle} يوم من غير حركة. مش لازم حاجة كبيرة: ${next ? `ابدأ بـ «${next.task.title}»` : 'سجّل أي خطوة'} النهارده.`}
          </T>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat t={t} label="في الشهر" value={g.entries.length ? `${pc.perMonth >= 0 ? '+' : ''}${fmt(pc.perMonth)}` : '—'} />
        <Stat t={t} label="هتوصل" value={there ? 'وصلت ✓' : pc.eta ? monthLabel(pc.eta) : '—'} sub={!pc.eta && !there ? 'سجّل تقدّمك وأحسبهالك' : undefined} />
        {g.due ? (
          <Stat t={t} label={pc.daysLeft != null && pc.daysLeft >= 0 ? `محتاج في الشهر · فاضل ${Math.ceil(pc.daysLeft / 30.44)} شهر` : 'الميعاد عدّى'} value={pc.needPerMonth != null ? fmt(pc.needPerMonth) : '—'} warn={pc.eta != null && g.due != null && pc.eta > g.due} />
        ) : null}
      </View>

      <Pressable onPress={() => setLogging(true)} accessibilityRole="button" style={({ pressed }) => [s.logBtn, { backgroundColor: g.color, boxShadow: `0px 0px 20px ${tint(g.color, 0.45)}`, opacity: pressed ? 0.85 : 1 }]}>
        <T w="bold" style={{ fontSize: 15.5, color: '#FFFFFF' }}>+ سجّل تقدّم</T>
      </Pressable>

      {reviewDue(g, today) ? (
        <Card style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="chatbubbles-outline" size={20} color={g.color} />
            <T w="bold" style={{ fontSize: 15.5, flex: 1 }}>مراجعة الأسبوع</T>
            <T style={{ fontSize: 11.5, color: t.mute }}>دقيقتين</T>
          </View>
          <ReviewForm g={g} t={t} />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Label>{`الطريق · ${g.stages.filter(stageDone).length} من ${g.stages.length} مراحل`}</Label>
        </View>
        <Pressable onPress={() => setRoadEdit(!roadEdit)} hitSlop={8} accessibilityRole="button" style={s.link}>
          <T w="semi" style={{ fontSize: 13, color: t.okText }}>{roadEdit ? 'خلصت' : 'عدّل الطريق'}</T>
        </Pressable>
      </View>
      <Card style={{ paddingVertical: 14, paddingHorizontal: 12 }}>
        {g.stages.map((st, i) => (
          <StageRow
            key={st.id}
            g={g}
            st={st}
            i={i}
            last={i === g.stages.length - 1}
            state={stageDone(st) ? 'done' : i === cur ? 'now' : 'later'}
            open={roadEdit || (open === null ? i === cur : open === st.id)}
            edit={roadEdit}
            t={t}
            onToggle={() => setOpen(open === st.id || (open === null && i === cur) ? '' : st.id)}
            onTask={(taskId) => {
              tap();
              save(toggleTask(g, taskId, today));
            }}
            onSave={save}
          />
        ))}
        {roadEdit ? (
          <Btn
            label="+ مرحلة"
            onPress={() => save({ ...g, stages: [...g.stages, { id: goalId(Date.now()), title: `مرحلة ${g.stages.length + 1}`, tasks: [] }] })}
            style={{ marginTop: 8 }}
          />
        ) : null}
        {!g.stages.length && !roadEdit ? <T style={{ color: t.mute, fontSize: 13 }}>مفيش مراحل لسه. دوس «عدّل الطريق» وضيف أول مرحلة</T> : null}
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Label>{`إنجازاتك · ${wins.length}`}</Label>
        </View>
        <Pressable onPress={() => setWinning(true)} hitSlop={8} accessibilityRole="button" style={s.link}>
          <T w="semi" style={{ fontSize: 13, color: t.okText }}>+ إنجاز</T>
        </Pressable>
      </View>
      <Card style={{ padding: 12, gap: 8 }}>
        {wins.length ? (
          wins.slice(0, 12).map((w) => (
            <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.winIcon, { backgroundColor: tint(w.auto ? g.color : '#E69F00', 0.15) }]}>
                <Ionicons name={w.auto ? 'ribbon' : 'trophy'} size={16} color={w.auto ? g.color : '#E69F00'} />
              </View>
              <T w="semi" style={{ flex: 1, fontSize: 14 }}>{w.title}</T>
              <T style={{ fontSize: 11.5, color: t.mute }}>{dayLabel(w.date)}</T>
              {!w.auto ? (
                <Pressable onPress={() => save({ ...g, wins: g.wins.filter((x) => x.id !== w.id) })} hitSlop={10} accessibilityRole="button" accessibilityLabel={`امسح ${w.title}`}>
                  <Ionicons name="close" size={16} color={t.mute} />
                </Pressable>
              ) : null}
            </View>
          ))
        ) : (
          <T style={{ color: t.mute, fontSize: 13, lineHeight: 20 }}>كل خطوة تفرق: أول عميل، أول كورس خلّصته، أول مبلغ حوّشته… سجّلها هنا. والتطبيق بيسجّل لوحده كل مرحلة تخلص و10% و25% و50%.</T>
        )}
      </Card>

      <Label>سجل التقدّم</Label>
      <Card style={{ padding: 12, gap: 8 }}>
        {g.entries.length ? (
          [...g.entries].reverse().slice(0, allLog ? undefined : 6).map((e) => (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T w="num" style={{ fontSize: 14.5, color: e.amount >= 0 ? t.okText : t.warn, minWidth: 84 }}>{`${e.amount >= 0 ? '+' : ''}${fmt(e.amount)}`}</T>
              <T style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>{e.note ?? ''}</T>
              <T style={{ fontSize: 11.5, color: t.mute }}>{dayLabel(e.date)}</T>
              <Pressable onPress={() => save({ ...g, entries: g.entries.filter((x) => x.id !== e.id) })} hitSlop={10} accessibilityRole="button" accessibilityLabel="امسح">
                <Ionicons name="close" size={16} color={t.mute} />
              </Pressable>
            </View>
          ))
        ) : (
          <T style={{ color: t.mute, fontSize: 13 }}>لسه مسجلتش تقدّم. دوس «سجّل تقدّم» كل ما يدخلك مبلغ أو تخلّص حاجة.</T>
        )}
        {g.entries.length > 6 ? <Btn label={allLog ? 'أقل' : `الكل (${g.entries.length})`} onPress={() => setAllLog(!allLog)} /> : null}
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Label>{`مراجعاتك · ${g.reviews.length}`}</Label>
        </View>
        {!reviewDue(g, today) ? (
          <Pressable onPress={() => setReviewing(true)} hitSlop={8} accessibilityRole="button" style={s.link}>
            <T w="semi" style={{ fontSize: 13, color: t.okText }}>+ مراجعة</T>
          </Pressable>
        ) : null}
      </View>
      {g.reviews.length ? (
        [...g.reviews].reverse().slice(0, 4).map((r) => (
          <Card key={r.date} style={{ padding: 12, gap: 4 }}>
            <T w="semi" style={{ fontSize: 12.5, color: t.mute }}>{dayLabel(r.date)}</T>
            {r.did ? <T style={{ fontSize: 13.5 }}>{`✅ ${r.did}`}</T> : null}
            {r.blocked ? <T style={{ fontSize: 13.5 }}>{`🧱 ${r.blocked}`}</T> : null}
            {r.next ? <T style={{ fontSize: 13.5 }}>{`➡️ ${r.next}`}</T> : null}
          </Card>
        ))
      ) : (
        <T style={{ color: t.mute, fontSize: 12.5 }}>{`كل ${7} أيام هسألك 3 أسئلة: عملت إيه، إيه اللي وقّفك، والخطوة الجاية`}</T>
      )}

      <T style={{ fontSize: 12, color: t.mute, textAlign: 'center' }}>{`بدأت ${dayLabel(g.startDate)} · من ${daysBetween(g.startDate, today) + 1} يوم${g.due ? ` · الميعاد ${monthLabel(g.due)}` : ''}`}</T>
      {!confirm ? <Btn label="امسح الهدف" onPress={() => setConfirm(true)} /> : (
        <Card style={{ padding: 12, gap: 8 }}>
          <T w="semi">تمسح الهدف ده وكل اللي اتسجل فيه؟</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="لا" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
            <Btn label="امسح" kind="solid" onPress={() => { deleteGoal(g.id); router.back(); }} style={{ flex: 1 }} />
          </View>
        </Card>
      )}
    </Screen>
  );
}

function Stat({ t, label, value, sub, warn }: { t: Theme; label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Card style={{ flex: 1, padding: 10, gap: 2 }}>
      <T style={{ fontSize: 11.5, color: t.mute }} numberOfLines={2}>{label}</T>
      <T w="num" style={{ fontSize: 15.5, color: warn ? t.warn : t.fg }} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
      {sub ? <T style={{ fontSize: 10.5, color: t.mute }}>{sub}</T> : null}
    </Card>
  );
}

/** One stage of the road: a dot on a line (✓ done, the number lit up while you're on it, grey after), and its tasks. */
function StageRow({ g, st, i, last, state, open, edit, t, onToggle, onTask, onSave }: {
  g: Goal; st: Stage; i: number; last: boolean; state: 'done' | 'now' | 'later'; open: boolean; edit: boolean; t: Theme;
  onToggle: () => void; onTask: (id: string) => void; onSave: (g: Goal) => void;
}) {
  const [task, setTask] = useState('');
  const c = g.color;
  const doneN = st.tasks.filter((x) => x.done).length;
  const setStage = (p: Partial<Stage>) => onSave({ ...g, stages: g.stages.map((x) => (x.id === st.id ? { ...x, ...p } : x)) });
  const addTask = () => {
    if (!task.trim()) return;
    setStage({ tasks: [...st.tasks, { id: goalId(Date.now()), title: task.trim(), done: null }] });
    setTask('');
  };
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ alignItems: 'center', width: 32 }}>
        <View
          style={[
            s.dot,
            state === 'done'
              ? { backgroundColor: c, boxShadow: glow(t, c, 10) }
              : state === 'now'
                ? { backgroundColor: t.card, borderWidth: 2, borderColor: c, boxShadow: glow(t, c, 12) }
                : { backgroundColor: t.soft, borderWidth: 1, borderColor: t.border },
          ]}>
          {state === 'done' ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : <T w="numBold" style={{ fontSize: 13.5, color: state === 'now' ? c : t.mute }}>{String(i + 1)}</T>}
        </View>
        {!last ? <View style={{ flex: 1, width: 2, minHeight: 18, marginVertical: 4, borderRadius: 1, backgroundColor: state === 'done' ? c : t.line, boxShadow: state === 'done' ? glow(t, c, 6) : undefined }} /> : null}
      </View>
      <View style={[{ flex: 1, marginBottom: last ? 0 : 12, borderRadius: 14 }, state === 'now' && !edit ? { backgroundColor: tint(c, 0.07), borderWidth: 1, borderColor: tint(c, 0.5), boxShadow: `0px 0px 16px ${tint(c, 0.2)}`, padding: 10, marginTop: -6 } : { paddingTop: 4 }]}>
        {edit ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TextInput value={st.title} onChangeText={(v) => setStage({ title: v })} accessibilityLabel="اسم المرحلة" maxLength={40} style={[s.input, { flex: 1, minWidth: 0, color: t.fg, backgroundColor: t.soft, fontFamily: F.semi }]} />
            <Icon t={t} name="arrow-up" label="طلّع" disabled={i === 0} onPress={() => onSave(moveStage(g, st.id, -1))} />
            <Icon t={t} name="arrow-down" label="نزّل" disabled={last} onPress={() => onSave(moveStage(g, st.id, 1))} />
            <Icon t={t} name="trash-outline" label={`امسح ${st.title}`} onPress={() => onSave({ ...g, stages: g.stages.filter((x) => x.id !== st.id) })} />
          </View>
        ) : (
          <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 }}>
            <View style={{ flex: 1 }}>
              <T w="bold" style={{ fontSize: 15.5, color: state === 'later' ? t.mute : state === 'now' ? c : t.fg }}>{st.title}</T>
              {!open && st.tasks.length ? <T style={{ fontSize: 12, color: t.mute }}>{state === 'done' ? `خلصت · ${st.tasks.length} خطوات` : `${doneN} من ${st.tasks.length} خطوات`}</T> : null}
            </View>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={t.mute} />
          </Pressable>
        )}
        {open && st.note && !edit ? <T style={{ fontSize: 12, color: t.mute, marginBottom: 4 }}>{st.note}</T> : null}
        {open
          ? st.tasks.map((x) => (
              <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  onPress={() => onTask(x.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!x.done }}
                  accessibilityLabel={x.title}
                  style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, opacity: pressed ? 0.6 : 1 }]}>
                  <Ionicons
                    name={x.done ? 'checkmark-circle' : state === 'now' ? 'alert-circle' : 'ellipse-outline'}
                    size={21}
                    color={x.done ? c : state === 'now' ? '#E69F00' : t.mute}
                  />
                  <T style={{ flex: 1, fontSize: 14, color: x.done ? t.mute : t.fg, textDecorationLine: x.done ? 'line-through' : 'none' }}>{x.title}</T>
                </Pressable>
                {edit ? <Icon t={t} name="close" label={`امسح ${x.title}`} onPress={() => setStage({ tasks: st.tasks.filter((y) => y.id !== x.id) })} /> : null}
              </View>
            ))
          : null}
        {edit ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            <TextInput value={task} onChangeText={setTask} onSubmitEditing={addTask} placeholder="خطوة جديدة" placeholderTextColor={t.mute} maxLength={80} accessibilityLabel="خطوة جديدة" style={[s.input, { flex: 1, minWidth: 0, color: t.fg, backgroundColor: t.soft, fontFamily: F.body }]} />
            <Btn label="ضيف" onPress={addTask} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Icon({ t, name, label, onPress, disabled }: { t: Theme; name: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.iconBtn, { backgroundColor: t.soft, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Ionicons name={name} size={17} color={t.fg} />
    </Pressable>
  );
}

/** Log progress: how much (minus for a step back), a note, and the day. */
function LogSheet({ g, onClose }: { g: Goal; onClose: () => void }) {
  const t = useTheme();
  const today = dateKey();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [minus, setMinus] = useState(false);
  const n = parseNum(amount);
  const ok = n != null && n > 0;
  const add = () => {
    if (!ok) return;
    tap();
    saveGoal({ ...g, entries: [...g.entries, { id: goalId(Date.now()), date: today, amount: minus ? -n! : n!, ...(note.trim() ? { note: note.trim() } : {}) }] });
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title="سجّل تقدّم" sub={`كل اللي اتضاف النهارده${g.unit ? ` (${g.unit})` : ''}`}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="+ زاد" kind={minus ? 'ghost' : 'solid'} onPress={() => setMinus(false)} style={{ flex: 1 }} />
        <Btn label="− نقص" kind={minus ? 'solid' : 'ghost'} onPress={() => setMinus(true)} style={{ flex: 1 }} />
      </View>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" autoFocus placeholder="المبلغ أو العدد" placeholderTextColor={t.mute} accessibilityLabel="الكمية" onSubmitEditing={add} style={[s.input, { height: 52, fontSize: 20, color: t.fg, backgroundColor: t.soft, fontFamily: F.numBold }]} />
      <TextInput value={note} onChangeText={setNote} placeholder="منين؟ (اختياري) مثلًا: مشروع فلان" placeholderTextColor={t.mute} maxLength={60} accessibilityLabel="ملاحظة" style={[s.input, { color: t.fg, backgroundColor: t.soft, fontFamily: F.body }]} />
      <Btn label="سجّل" kind="solid" onPress={add} style={{ opacity: ok ? 1 : 0.5 }} />
    </Sheet>
  );
}

function WinSheet({ g, onClose }: { g: Goal; onClose: () => void }) {
  const t = useTheme();
  const [title, setTitle] = useState('');
  const add = () => {
    if (!title.trim()) return;
    tap();
    saveGoal({ ...g, wins: [...g.wins, { id: goalId(Date.now()), date: dateKey(), title: title.trim() }] });
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title="إنجاز جديد 🏆" sub="أي حاجة قرّبتك من الهدف تستاهل تتسجل">
      <TextInput value={title} onChangeText={setTitle} autoFocus placeholder="مثلًا: أول عميل دفع" placeholderTextColor={t.mute} maxLength={80} accessibilityLabel="الإنجاز" onSubmitEditing={add} style={[s.input, { color: t.fg, backgroundColor: t.soft, fontFamily: F.body }]} />
      <Btn label="سجّل" kind="solid" onPress={add} style={{ opacity: title.trim() ? 1 : 0.5 }} />
    </Sheet>
  );
}

/** The weekly review: what you did, what stopped you, the next step (which becomes a task on the stage you're on). */
function ReviewForm({ g, t, onDone }: { g: Goal; t: Theme; onDone?: () => void }) {
  const [r, setR] = useState<Omit<Review, 'date'>>({ did: '', blocked: '', next: '' });
  const ok = !!(r.did.trim() || r.blocked.trim() || r.next.trim());
  const save = () => {
    if (!ok) return;
    const today = dateKey();
    let x = addReview(g, { date: today, did: r.did.trim(), blocked: r.blocked.trim(), next: r.next.trim() });
    // The next step goes on the road, on the stage you're on, so it shows up as your next task.
    const i = currentStage(x);
    if (r.next.trim() && i >= 0) x = { ...x, stages: x.stages.map((st, j) => (j === i ? { ...st, tasks: [{ id: goalId(Date.now()), title: r.next.trim(), done: null }, ...st.tasks.filter((k) => k.done), ...st.tasks.filter((k) => !k.done)] } : st)) };
    saveGoal(x);
    onDone?.();
  };
  const field = (k: keyof typeof r, q: string, ph: string) => (
    <View style={{ gap: 4 }}>
      <T w="medium" style={{ fontSize: 13.5 }}>{q}</T>
      <TextInput value={r[k]} onChangeText={(v) => setR({ ...r, [k]: v })} placeholder={ph} placeholderTextColor={t.mute} multiline maxLength={200} accessibilityLabel={q} style={[s.input, { minHeight: 44, height: undefined, paddingVertical: 10, color: t.fg, backgroundColor: t.soft, fontFamily: F.body }]} />
    </View>
  );
  return (
    <View style={{ gap: 10 }}>
      {field('did', 'عملت إيه الأسبوع ده؟', 'حتى لو حاجة صغيرة')}
      {field('blocked', 'إيه اللي وقّفك أو أخّرك؟', 'وقت أو فلوس أو خوف أو كسل')}
      {field('next', 'إيه الخطوة الجاية؟', 'حاجة واحدة تقدر تعملها الأسبوع ده')}
      <Btn label="احفظ المراجعة" kind="solid" onPress={save} style={{ opacity: ok ? 1 : 0.5 }} />
    </View>
  );
}

const s = StyleSheet.create({
  inner: { width: 180, height: 180, borderRadius: 90, alignItems: 'center', justifyContent: 'center', gap: 2 },
  logBtn: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  why: { borderStartWidth: 4, borderRadius: 12, padding: 12, gap: 2 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  winIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 14.5, textAlign: 'right', outlineWidth: 0 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
