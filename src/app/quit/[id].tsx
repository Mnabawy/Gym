import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, HeaderBtn, Label, Screen, T } from '../../components/ui';
import { QuitForm } from '../../components/QuitForm';
import { ACTION, Swipe } from '../../components/Swipe';
import { CleanRing, Clock, nextLine, NightCard } from '../../components/QuitHero';
import { SlipSheet, UrgeScreen } from '../../components/QuitSheets';
import { MONTHS_AR } from '../../data/program';
import { useDataVersion } from '../../lib/bus';
import { deleteQuit, readQuits, saveQuit } from '../../lib/quitStore';
import { clean, cleanDays, DAY_MS, longest, MILESTONES, riskyTime, runLabel, saved, target, TRIGGERS, triggerCounts, urgeScore, HABIT_TYPES } from '../../lib/quit';
import { dateKey } from '../../lib/logic';
import { confirm } from '../../lib/confirm';
import { showUndo } from '../../lib/undo';
import { useNow } from '../../lib/useNow';
import { ThemeProvider, tint, useTheme, useWarm, type Theme } from '../../theme';

const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} · ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const mLabel = (m: number) => (m === 1 ? 'يوم' : m === 7 ? 'أسبوع' : m === 14 ? 'أسبوعين' : m === 30 ? 'شهر' : m === 60 ? 'شهرين' : m === 90 ? '3 شهور' : m === 180 ? '6 شهور' : m === 365 ? 'سنة' : `${m} أيام`);

export default function QuitScreen() {
  return (
    <ThemeProvider value={useWarm()}>
      <QuitPage />
    </ThemeProvider>
  );
}

/** One habit you're quitting: the live clean counter, the urge button, milestones, what you saved, your triggers. */
function QuitPage() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = readQuits().find((x) => x.id === id);
  const now = useNow(1000);
  const [urge, setUrge] = useState(false);
  const [slip, setSlip] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!q) {
    return (
      <Screen title="بطّل" onBack={() => router.back()}>
        <T style={{ color: t.mute }}>مش موجودة</T>
      </Screen>
    );
  }

  const c = clean(q, now);
  const tg = target(q, now);
  const days = cleanDays(q, now);
  const best = longest(q, now);
  const sv = saved(q, now);
  const urges = urgeScore(q);
  const triggers = triggerCounts(q);
  const risky = riskyTime(q);
  const top = Math.max(1, ...triggers.map((x) => x.slips + x.urges));

  return (
    <Screen title="بطّل" onBack={() => router.back()} action={<HeaderBtn icon="ellipsis-horizontal" label="عدّل" onPress={() => setEditing(true)} />}>
      {editing ? <QuitForm quit={q} onClose={() => setEditing(false)} /> : null}
      {urge ? <UrgeScreen q={q} onClose={() => setUrge(false)} onSlip={() => { setUrge(false); setSlip(true); }} /> : null}
      {slip ? <SlipSheet q={q} onClose={() => setSlip(false)} /> : null}

      <NightCard color={q.color} style={{ alignItems: 'center', gap: 11, paddingVertical: 18 }}>
        <CleanRing q={q} now={now} size={220} />
        <T w="semi" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>{nextLine(q, now)}</T>
        <View style={[s.goal, { backgroundColor: tg.done ? '#FFD70022' : 'rgba(255,255,255,0.08)' }]}>
          <Ionicons name="flag" size={15} color={tg.done ? '#FFD700' : q.color} />
          <T w="semi" style={{ color: '#FFFFFF', fontSize: 13.5 }}>{tg.done ? `وصلت هدفك · ${q.targetDays} يوم نضيف 🎉` : `هدفك ${q.targetDays} يوم · فاضل ${tg.left}`}</T>
        </View>
        <View style={{ alignSelf: 'stretch' }}>
          <Clock q={q} now={now} />
        </View>
        <Pressable onPress={() => setUrge(true)} accessibilityRole="button" style={({ pressed }) => [s.urge, { backgroundColor: q.color, boxShadow: `0px 0px 26px ${q.color}aa`, opacity: pressed ? 0.85 : 1 }]}>
          <Ionicons name="pulse" size={22} color="#FFFFFF" />
          <T w="bold" style={{ color: '#FFFFFF', fontSize: 17 }}>جالي إلحاح</T>
        </Pressable>
        <Pressable onPress={() => setSlip(true)} hitSlop={8} accessibilityRole="button" style={s.slipLink}>
          <T style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13.5, textDecorationLine: 'underline' }}>وقعت</T>
        </Pressable>
      </NightCard>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {MILESTONES.map((m) => {
          const got = c.ms >= m * DAY_MS;
          const next = !got && MILESTONES.find((x) => c.ms < x * DAY_MS) === m;
          return (
            <View key={m} style={[s.medal, got ? { backgroundColor: q.color, boxShadow: `0px 0px 12px ${tint(q.color, 0.5)}` } : { backgroundColor: t.card, borderWidth: next ? 2 : 1, borderColor: next ? q.color : t.border }]}>
              <Ionicons name={got ? 'medal' : next ? 'flag' : 'lock-closed'} size={18} color={got ? '#FFFFFF' : next ? q.color : t.mute} />
              <T w="semi" style={{ fontSize: 12, color: got ? '#FFFFFF' : next ? t.fg : t.mute }}>{mLabel(m)}</T>
            </View>
          );
        })}
      </ScrollView>

      <View style={s.grid}>
        <Tile t={t} icon="trophy" color="#E0A030" label="أطول مدة" value={runLabel(best)} />
        <Tile t={t} icon="calendar" color={q.color} label="أيام نضيفة" value={`${Math.round(days.rate * 100)}%`} sub={`${days.clean} من ${days.total}`} />
        <Tile t={t} icon="shield-checkmark" color="#3E9A68" label="قاومت" value={urges.total ? `${urges.resisted} من ${urges.total}` : '—'} sub="مرة جاتلك الرغبة" />
        <Tile t={t} icon="flag" color={tg.done ? '#FFD700' : q.color} label="الهدف" value={`${Math.round(tg.share * 100)}%`} sub={`${q.targetDays} يوم نضيف`} />
        {q.costPerDay ? <Tile t={t} icon="cash" color="#3E9A68" label="وفّرت" value={`${sv.money.toLocaleString('en-US')} ${q.currency}`} /> : null}
        {q.minutesPerDay ? <Tile t={t} icon="time" color="#2563EB" label="رجعلك من وقتك" value={sv.minutes >= 120 ? `${Math.round(sv.minutes / 60)} ساعة` : `${sv.minutes} دقيقة`} /> : null}
      </View>

      <Card style={{ padding: 14, gap: 10, backgroundColor: t.soft }}>
        <View>
          <T style={{ fontSize: 12, color: t.mute }}>النوع</T>
          <T w="semi" style={{ fontSize: 15, lineHeight: 24 }}>{HABIT_TYPES[q.type].name}</T>
        </View>
        <View>
          <T style={{ fontSize: 11.5, color: t.mute }}>{HABIT_TYPES[q.type].ref}</T>
        </View>
      </Card>

      {q.why || q.replace ? (
        <Card style={{ padding: 14, gap: 10 }}>
          {q.why ? (
            <View>
              <T style={{ fontSize: 12, color: t.mute }}>ليه بطّلت</T>
              <T w="semi" style={{ fontSize: 15, lineHeight: 24 }}>{q.why}</T>
            </View>
          ) : null}
          {q.replace ? (
            <View>
              <T style={{ fontSize: 12, color: t.mute }}>بدالها</T>
              <T w="semi" style={{ fontSize: 15, lineHeight: 24 }}>{q.replace}</T>
            </View>
          ) : null}
        </Card>
      ) : null}

      <Label>إيه اللي بيضعّفك</Label>
      <Card style={{ padding: 14, gap: 10 }}>
        {triggers.length ? (
          <>
            {triggers.slice(0, 5).map((x) => (
              <View key={x.trigger} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T style={{ width: 86, fontSize: 13.5 }}>{TRIGGERS[x.trigger]}</T>
                <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: t.soft, overflow: 'hidden', flexDirection: 'row' }}>
                  <View style={{ width: `${(x.slips / top) * 100}%`, backgroundColor: t.fg }} />
                  <View style={{ width: `${(x.urges / top) * 100}%`, backgroundColor: tint(q.color, 0.6) }} />
                </View>
                <T w="num" style={{ fontSize: 12.5, width: 24, textAlign: 'center' }}>{String(x.slips + x.urges)}</T>
              </View>
            ))}
            <T style={{ fontSize: 11.5, color: t.mute }}>غامق = وقعات · ملوّن = رغبات</T>
          </>
        ) : (
          <T style={{ fontSize: 13, color: t.mute, lineHeight: 20 }}>لما تسجّل رغبة أو وقعة وتختار سببها، هتعرف هنا إيه اللي بيضعّفك أكتر، وتستعد له.</T>
        )}
        {risky ? (
          <View style={[s.risky, { backgroundColor: t.warnSoft }]}>
            <Ionicons name="moon" size={15} color={t.warn} />
            <T style={{ flex: 1, fontSize: 13, color: t.warn }}>{`بتضعف أكتر ${risky.label}. جهّز البديل قبلها`}</T>
          </View>
        ) : null}
      </Card>

      {q.slips.length ? (
        <>
          <Label>{`الوقعات · ${q.slips.length}`}</Label>
          <Card style={{ padding: 12, gap: 8, overflow: 'hidden' }}>
            {[...q.slips].reverse().slice(0, 8).map((sl) => {
              const remove = () => { const prev = q.slips; saveQuit({ ...q, slips: q.slips.filter((x) => x.at !== sl.at) }); showUndo('اتمسحت وقعة', () => saveQuit({ ...q, slips: prev })); };
              return (
              <Swipe key={sl.at} end={[{ icon: 'trash', label: 'امسح', color: ACTION.red, onPress: remove }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card }}>
                <View style={[s.dot, { backgroundColor: t.fg }]} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontSize: 13.5 }}>{sl.trigger ? TRIGGERS[sl.trigger] : 'من غير سبب'}{sl.note ? ` · ${sl.note}` : ''}</T>
                  <T style={{ fontSize: 11.5, color: t.mute }}>{when(sl.at)}</T>
                </View>
                <Pressable onPress={remove} hitSlop={10} accessibilityRole="button" accessibilityLabel="امسح الوقعة دي">
                  <Ionicons name="close" size={16} color={t.mute} />
                </Pressable>
              </View>
              </Swipe>
              );
            })}
          </Card>
        </>
      ) : null}

      <T style={{ fontSize: 12, color: t.mute, textAlign: 'center' }}>{`بدأت ${when(q.start)} · ${dateKey(new Date(q.start)) === dateKey(new Date(now)) ? 'النهارده' : `من ${days.total} يوم`}`}</T>
      <Btn label="امسحها" onPress={async () => { if (await confirm({ title: 'تمسحها؟', body: 'هتتشال هي وكل اللي اتسجل فيها.', confirmLabel: 'امسح', danger: true })) { deleteQuit(q.id); router.back(); } }} />
    </Screen>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Tile({ t, icon, color, label, value, sub }: { t: Theme; icon: IconName; color: string; label: string; value: string; sub?: string }) {
  return (
    <Card style={{ width: '48%', flexGrow: 1, padding: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={16} color={color} />
        <T style={{ fontSize: 12.5, color: t.mute }}>{label}</T>
      </View>
      <T w="numBold" style={{ fontSize: 20 }} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
      {sub ? <T style={{ fontSize: 11.5, color: t.mute }}>{sub}</T> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  urge: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  slipLink: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  medal: { width: 74, height: 74, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  risky: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
