import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FIRST_TEMPLATE_DAY, WEEKDAYS_AR } from '../data/program';
import { Btn, Card, Label, Pill, Screen, Sep, Sheet, T } from '../components/ui';
import { Segmented } from '../components/GymSwitch';
import { CloudField } from '../components/CloudField';
import { clientStatus, sortClients, type Flag } from '../lib/coach';
import { dateKey } from '../lib/dates';
import { cleanDays, DAYS_MAX, DAYS_MIN, DEFAULT_WEEKDAYS, generate, GOAL_AR, LEVEL_AR, planLine, type Goal, type Level } from '../lib/generator';
import { myClients, plansFor, sendPlan, type Client, type PlanRow } from '../lib/sync';
import { useTheme } from '../theme';

const GOALS = (Object.keys(GOAL_AR) as Goal[]).map((k) => [k, GOAL_AR[k]] as const);
const LEVELS = (Object.keys(LEVEL_AR) as Level[]).map((k) => [k, LEVEL_AR[k]] as const);
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
const FLAG_ICON: Record<Flag, 'alert-circle' | 'eye-outline' | 'checkmark-circle'> = { alert: 'alert-circle', watch: 'eye-outline', ok: 'checkmark-circle' };

/**
 * لوحة الكوتش: your clients (they joined with your code, src/app/account.tsx), the ones who need a message first, each
 * one's summary (src/lib/coach.ts), and a plan to send them (the same generator as the setup).
 */
export default function CoachScreen() {
  const t = useTheme();
  const today = dateKey();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Client | null>(null);

  const load = useCallback(async () => {
    try {
      setClients(await myClients());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const rows = sortClients((clients ?? []).map((c) => ({ ...c, status: clientStatus(c.stats, today) })));
  const color = (f: Flag) => (f === 'alert' ? t.bad : f === 'watch' ? t.warn : t.okText);

  return (
    <Screen title="لوحة الكوتش" sub={clients ? `${clients.length} عميل` : 'بيحمّل…'} onBack={() => router.back()} action={<Btn label="حدّث" onPress={() => void load()} />}>
      {err ? <T style={{ color: t.bad, fontSize: 13 }}>{err}</T> : null}
      {clients && !clients.length ? <T style={{ color: t.mute }}>لسه مفيش عملاء. ابعت كودك من صفحة الحساب لعملائك.</T> : null}
      {rows.length ? (
        <Card>
          {rows.map((c, i) => (
            <View key={c.id}>
              {i ? <Sep /> : null}
              <Pressable onPress={() => setOpen(c)} accessibilityRole="button" style={({ pressed }) => ({ padding: 12, gap: 3, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={FLAG_ICON[c.status.flag]} size={16} color={color(c.status.flag)} />
                  <T w="semi" style={{ flex: 1, fontSize: 15 }}>{c.name || 'من غير اسم'}</T>
                  <Ionicons name="chevron-back" size={18} color={t.mute} />
                </View>
                <T style={{ fontSize: 12.5, color: t.mute }}>{c.status.lines.join(' · ')}</T>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
      {open ? <ClientSheet c={open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

/** One client: their plan now, the last plans you sent, and a new one to send. */
function ClientSheet({ c, onClose }: { c: Client; onClose: () => void }) {
  const t = useTheme();
  const [goal, setGoal] = useState<Goal>((c.stats?.plan.goal as Goal) || 'muscle');
  const [level, setLevel] = useState<Level>((c.stats?.plan.level as Level) || 'beginner');
  const [days, setDays] = useState<number[]>(c.stats?.plan.weekdays.length ? c.stats.plan.weekdays : DEFAULT_WEEKDAYS[3]);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<PlanRow[]>([]);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const picked = cleanDays(days);
  const ok = picked.length >= DAYS_MIN && picked.length <= DAYS_MAX;
  const plan = generate({ goal, level, weekdays: picked }, FIRST_TEMPLATE_DAY); // the phone renumbers its days when it takes it

  useEffect(() => {
    plansFor(c.id).then(setSent, () => {});
  }, [c.id]);

  return (
    <Sheet visible onClose={onClose} title={c.name || 'عميل'} sub={c.stats?.plan.days.length ? `برنامجه: ${c.stats.plan.days.join(' · ')}` : undefined}>
      <View style={{ gap: 8 }}>
        {sent.length ? (
          <T style={{ fontSize: 12.5, color: t.mute }}>{`آخر برنامج بعته: ${new Date(sent[0].created_at).toLocaleDateString('ar-EG')} · ${sent[0].applied_at ? 'خده ✓' : 'لسه ما خدهوش'}`}</T>
        ) : null}
        <Label>ابعتله برنامج جديد</Label>
        <Segmented small options={GOALS} value={goal} onChange={setGoal} />
        <Segmented small options={LEVELS} value={level} onChange={setLevel} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {WEEK_ORDER.map((d) => (
            <Pill key={d} label={WEEKDAYS_AR[d]} on={days.includes(d)} onPress={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))} />
          ))}
        </View>
        <T style={{ fontSize: 12.5, color: ok ? t.mute : t.bad }}>{ok ? planLine(plan) : `اختار من ${DAYS_MIN} لـ ${DAYS_MAX} أيام`}</T>
        <CloudField value={note} onChangeText={setNote} placeholder="رسالة معاه (مش لازم)" maxLength={500} multiline accessibilityLabel="رسالة" />
        <Btn
          label="ابعت البرنامج"
          kind="solid"
          onPress={() => {
            if (!ok) return;
            sendPlan(c.id, plan, note).then(
              () => {
                setMsg({ text: 'اتبعت ✓ هيظهرله في صفحة الحساب' });
                plansFor(c.id).then(setSent, () => {});
              },
              (e) => setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }),
            );
          }}
        />
        {msg ? <T style={{ fontSize: 13, color: msg.bad ? t.bad : t.okText }}>{msg.text}</T> : null}
      </View>
    </Sheet>
  );
}
