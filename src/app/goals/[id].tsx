import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, HeaderBtn, Label, Pill, Screen, Sheet, T } from '../../components/ui';
import { GoalForm } from '../../components/GoalForm';
import { GoalRoad } from '../../components/GoalRoad';
import { MONTHS_AR } from '../../data/program';
import { useDataVersion } from '../../lib/bus';
import { deleteGoal, readGoals, saveGoal } from '../../lib/goalStore';
import { addNextStep, addReview, allWins, current, currentStage, fmtAmount, goalId, IDLE_DAYS, idleDays, nextTask, pace, progress, reviewDue, type Goal, type Review } from '../../lib/goals';
import { addDays, daysBetween } from '../../lib/gaps';
import { dateKey, parseNum } from '../../lib/logic';
import { confirm } from '../../lib/confirm';
import { showUndo } from '../../lib/undo';
import { tap } from '../../lib/timer';
import { F, ThemeProvider, tint, useTheme, useWarm, type Theme } from '../../theme';

const dayLabel = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]}`;
/** 25000 → "$25K", 300 → "300". */
const short = (n: number, unit: string) => {
  const v = Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}K` : String(Math.round(n));
  return /^[$€£]$/.test(unit) ? `${unit}${v}` : v;
};
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
    <Screen title="الأهداف" onBack={() => router.back()} action={<HeaderBtn icon="ellipsis-horizontal" label="عدّل الهدف" onPress={() => setEditing(true)} />}>
      {editing ? <GoalForm goal={g} onClose={() => setEditing(false)} /> : null}
      {logging ? <LogSheet g={g} onClose={() => setLogging(false)} /> : null}
      {winning ? <WinSheet g={g} onClose={() => setWinning(false)} /> : null}
      {reviewing ? (
        <Sheet visible onClose={() => setReviewing(false)} title="مراجعة الأسبوع">
          <ReviewForm g={g} t={t} onDone={() => setReviewing(false)} />
        </Sheet>
      ) : null}

      <View style={{ gap: 2, marginTop: 4 }}>
        <T style={{ fontSize: 14, color: t.mute }}>{g.name}</T>
        <T w="numBold" style={{ fontSize: 62, lineHeight: 74, letterSpacing: -1.5, alignSelf: 'flex-start', maxWidth: '100%' }} numberOfLines={1} adjustsFontSizeToFit>{fmt(now)}</T>
        <T style={{ fontSize: 13.5, color: t.mute }}>{there ? 'وصلت للهدف 🎉' : `فاضل ${fmt(Math.abs(pc.remaining))}${pc.eta ? ` · هتوصل ${monthLabel(pc.eta)}` : ''}`}</T>
      </View>

      {/* The whole way as one bar: the part you've done in ink, the rest striped, with the quarter marks under it. */}
      <View>
        <View style={s.bar}>
          {p > 0 ? <View style={{ flex: Math.max(p, 0.04), backgroundColor: t.fg, borderRadius: 12 }} /> : null}
          {p < 1 ? (
            <View style={{ flex: 1 - p, flexDirection: 'row', borderRadius: 12, overflow: 'hidden', backgroundColor: tint(t.fg, 0.07) }}>
              {Array.from({ length: 24 }, (_, i) => <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? 'transparent' : tint(t.fg, 0.05) }} />)}
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          {[0, 0.25, 0.5, 0.75, 1].map((m) => (
            <T key={m} w={p >= m ? 'numBold' : 'numRegular'} style={{ fontSize: 11.5, color: p >= m ? t.fg : t.mute }}>{short(g.start + (g.target - g.start) * m, g.unit)}</T>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={() => setLogging(true)} accessibilityRole="button" style={({ pressed }) => [s.big, { flex: 1, backgroundColor: t.fg, opacity: pressed ? 0.85 : 1 }]}>
          <T w="bold" style={{ fontSize: 16.5, color: t.bg }}>+ سجّل تقدّم</T>
        </Pressable>
        <Pressable onPress={() => setWinning(true)} accessibilityRole="button" accessibilityLabel="إنجاز جديد" style={({ pressed }) => [s.big, { width: 58, backgroundColor: t.card, opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="trophy" size={24} color="#E0A030" />
        </Pressable>
      </View>

      {g.why ? (
        <View style={[s.why, { borderColor: t.fg, backgroundColor: t.card }]}>
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

      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
        <T w="bold" style={{ fontSize: 19, flex: 1 }}>الطريق</T>
        <T style={{ fontSize: 13, color: t.mute }}>{cur >= 0 ? `مرحلة ${cur + 1} من ${g.stages.length}` : g.stages.length ? 'كل المراحل خلصت ✓' : ''}</T>
      </View>
      <T style={{ fontSize: 12, color: t.mute, marginTop: -6 }}>دوس على النقطة لما تخلّص · + تضيف · دوسة طويلة تعدّل أو تمسح</T>
      <Card style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
        <GoalRoad g={g} t={t} today={today} />
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat t={t} label="في الشهر" value={g.entries.length ? `${pc.perMonth >= 0 ? '+' : ''}${fmt(pc.perMonth)}` : '—'} />
        <Stat t={t} label="هتوصل" value={there ? 'وصلت ✓' : pc.eta ? monthLabel(pc.eta) : '—'} sub={!pc.eta && !there ? 'سجّل تقدّمك وأحسبهالك' : undefined} />
        {g.due ? (
          <Stat t={t} label={pc.daysLeft != null && pc.daysLeft >= 0 ? 'محتاج في الشهر' : 'الميعاد عدّى'} sub={pc.daysLeft != null && pc.daysLeft >= 0 ? `فاضل ${Math.ceil(pc.daysLeft / 30.44)} شهر` : undefined} value={pc.needPerMonth != null ? fmt(pc.needPerMonth) : '—'} warn={pc.eta != null && g.due != null && pc.eta > g.due} />
        ) : null}
      </View>

      {reviewDue(g, today) ? (
        <Card style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="chatbubbles-outline" size={20} color={t.fg} />
            <T w="bold" style={{ fontSize: 15.5, flex: 1 }}>مراجعة الأسبوع</T>
            <T style={{ fontSize: 11.5, color: t.mute }}>دقيقتين</T>
          </View>
          <ReviewForm g={g} t={t} />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Label>{`إنجازاتك · ${wins.length}`}</Label>
        </View>
        <HeaderBtn icon="add" label="إنجاز جديد" onPress={() => setWinning(true)} />
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
                <Pressable onPress={() => { save({ ...g, wins: g.wins.filter((x) => x.id !== w.id) }); showUndo('اتمسح إنجاز', () => save(g)); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`امسح ${w.title}`}>
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
              <Pressable onPress={() => { save({ ...g, entries: g.entries.filter((x) => x.id !== e.id) }); showUndo('اتمسح تسجيل', () => save(g)); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="امسح">
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
          <HeaderBtn icon="add" label="مراجعة جديدة" onPress={() => setReviewing(true)} />
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
      <Btn label="امسح الهدف" onPress={async () => { if (await confirm({ title: 'تمسح الهدف ده؟', body: 'هيتشال هو وكل اللي اتسجل فيه.', confirmLabel: 'امسح', danger: true })) { deleteGoal(g.id); router.back(); } }} />
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

/** Log progress: how much (minus for a step back), a note, and the day. */
function LogSheet({ g, onClose }: { g: Goal; onClose: () => void }) {
  const t = useTheme();
  const today = dateKey();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [minus, setMinus] = useState(false);
  const [back, setBack] = useState(0);
  const n = parseNum(amount);
  const ok = n != null && n > 0;
  const add = () => {
    if (!ok) return;
    tap();
    saveGoal({ ...g, entries: [...g.entries, { id: goalId(Date.now()), date: addDays(today, -back) < g.startDate ? g.startDate : addDays(today, -back), amount: minus ? -n! : n!, ...(note.trim() ? { note: note.trim() } : {}) }] });
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title="سجّل تقدّم" sub={`اللي اتضاف${g.unit ? ` (${g.unit})` : ''}`}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {['النهارده', 'امبارح', 'قبل امبارح'].map((l, i) => <Pill key={l} label={l} on={back === i} onPress={() => setBack(i)} />)}
      </View>
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
    // The next step goes on the road (first on the stage you're on), so it shows up as your next task.
    if (r.next.trim()) x = addNextStep(x, r.next.trim(), goalId(Date.now()));
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
  bar: { flexDirection: 'row', gap: 4, height: 50, marginTop: 6 },
  big: { height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stage: { borderRadius: 22, padding: 14, borderWidth: 2, minHeight: 92, gap: 2 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54 },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  why: { borderStartWidth: 4, borderRadius: 12, padding: 12, gap: 2 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  winIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 14.5, textAlign: 'right', outlineWidth: 0 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
