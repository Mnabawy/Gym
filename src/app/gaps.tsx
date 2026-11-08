import React, { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ALL_EXERCISES, MUSCLE_AR, type Muscle } from '../data/program';
import { Card, Label, Ring, Screen, T } from '../components/ui';
import { E1rmChart } from '../components/E1rmChart';
import { GapCard, gapExercise, gapKey, periodAr } from '../components/GapCard';
import { MUSCLES, type Gap, type Report, type Trend, type TrendInfo } from '../lib/gaps';
import { countAr, TIMES } from '../lib/logic';
import { useReport } from '../lib/useReport';
import { tint, useTheme, type Theme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TREND_ORDER: Trend[] = ['down', 'stalled', 'steady', 'up', 'new', 'none'];
const TREND: Record<Trend, { label: string; icon: IconName }> = {
  down: { label: 'نازل', icon: 'trending-down' },
  stalled: { label: 'واقف', icon: 'pause' },
  steady: { label: 'ثابت', icon: 'remove' },
  up: { label: 'بيتحسن', icon: 'trending-up' },
  new: { label: 'لسه بدري', icon: 'ellipsis-horizontal' },
  none: { label: 'مش متسجل', icon: 'remove-circle-outline' },
};
const trendColor = (t: Theme, tr: Trend) =>
  tr === 'down' ? t.warn : tr === 'stalled' ? tint(t.warn, 0.5) : tr === 'up' ? t.ok : tr === 'steady' ? tint(t.ink, 0.55) : t.line;
const trendText = (t: Theme, tr: Trend) => (tr === 'down' || tr === 'stalled' ? t.warn : tr === 'up' ? t.okText : t.mute);

const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
const isoPct = (x: number) => `⁦${Math.round(x * 100)}%⁩`;
const shortDate = (k: string) => `${+k.slice(8)}/${+k.slice(5, 7)}`;

function trendSub(i: TrendInfo): string {
  switch (i.trend) {
    case 'up':
      return 'رقم جديد آخر مرة';
    case 'steady':
      return `آخر رقم جديد من ${countAr(i.sinceBest, TIMES)}`;
    case 'stalled':
      return `مفيش رقم جديد من ${countAr(i.sinceBest, TIMES)}`;
    case 'down':
      return `أقل ${isoPct(i.drop)} من أحسن رقم ليك`;
    case 'new':
      return `اتسجل ${countAr(i.points.length, TIMES)} بس`;
    case 'none':
      return 'لسه ما اتسجلش';
  }
}

export default function Gaps() {
  const t = useTheme();
  const r = useReport();
  const [open, setOpen] = useState<string | null>(null);
  const [allGaps, setAllGaps] = useState(false);
  const [allEx, setAllEx] = useState(false);
  const toggle = (k: string) => {
    animate();
    setOpen(open === k ? null : k);
  };

  if (!r.since) {
    return (
      <Screen title="النواقص" sub="إيه اللي ناقصك في البرنامج" onBack={() => router.back()}>
        <Card style={{ padding: 16, alignItems: 'center', gap: 8 }}>
          <Ionicons name="analytics-outline" size={36} color={t.mute} />
          <T w="bold" style={{ fontSize: 16 }}>لسه مفيش تسجيل</T>
          <T style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>سجّل أول تمرين وعلّم ✓ على المجموعات، وهنا هيبان إيه اللي ناقصك.</T>
        </Card>
      </Screen>
    );
  }

  const period = periodAr(r);
  const daysDue = r.attendance.due;
  const daysDone = Math.min(r.attendance.done, r.attendance.due);
  const setsPlanned = MUSCLES.reduce((a, m) => a + r.volume[m].planned, 0);
  const setsDone = MUSCLES.reduce((a, m) => a + r.volume[m].done, 0);
  const counts = Object.fromEntries(TREND_ORDER.map((k) => [k, 0])) as Record<Trend, number>;
  for (const e of ALL_EXERCISES) counts[r.trends[e.id].trend]++;
  const exercises = ALL_EXERCISES.slice().sort((a, b) => TREND_ORDER.indexOf(r.trends[a.id].trend) - TREND_ORDER.indexOf(r.trends[b.id].trend));
  const gaps = allGaps ? r.gaps : r.gaps.slice(0, 4);

  const chartFor = (exId: string) => {
    const e = ALL_EXERCISES.find((x) => x.id === exId)!;
    return <E1rmChart points={r.trends[exId].points} color={t.muscle[e.muscle]} />;
  };
  const onGap = (g: Gap) => {
    if (g.kind === 'volume') return () => router.push(`/attendance?muscle=${g.muscle}`);
    if (g.kind === 'day') return () => router.push('/attendance');
    if (gapExercise(g)) return () => toggle(gapKey(g));
    return undefined;
  };

  return (
    <Screen title="النواقص" sub={period} onBack={() => router.back()}>
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ring value={r.score ?? 0} size={72} stroke={6}>
            <T w="numBold" style={{ fontSize: 16, color: t.okText }}>{r.score == null ? '–' : `${Math.round(r.score * 100)}%`}</T>
          </Ring>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="bold" style={{ fontSize: 18 }}>التزامك بالبرنامج</T>
            <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>نسبة المجموعات اللي لعبتها من اللي عليك، كل عضلة لوحدها</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat value={`${daysDone}/${daysDue}`} label="أيام التمرين" />
          <Stat value={`${setsDone}/${setsPlanned}`} label="المجموعات" />
          <Stat value={`${counts.up}/${ALL_EXERCISES.length}`} label="تمارين بتتحسن" />
        </View>
      </Card>

      <Label>{r.gaps.length ? `أهم النواقص (${r.gaps.length})` : 'النواقص'}</Label>
      {r.gaps.length === 0 ? (
        <Card style={{ padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.okSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={22} color={t.okText} />
          </View>
          <T style={{ flex: 1, fontSize: 14 }}>{`مفيش حاجة ناقصة ${period}. كمّل كده.`}</T>
        </Card>
      ) : (
        gaps.map((g) => {
          const k = gapKey(g);
          const ex = gapExercise(g);
          return (
            <GapCard key={k} gap={g} report={r} onPress={onGap(g)} open={ex ? open === k : undefined}>
              {ex ? chartFor(ex) : null}
            </GapCard>
          );
        })
      )}
      {r.gaps.length > 4 ? (
        <More
          label={allGaps ? 'أقل' : `شوف الكل (${r.gaps.length})`}
          onPress={() => {
            animate();
            setAllGaps(!allGaps);
          }}
        />
      ) : null}

      <Label>العضلات أسبوع بأسبوع</Label>
      <Heatmap r={r} />

      <Label>التمارين</Label>
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', height: 10, gap: 2, borderRadius: 5, overflow: 'hidden' }}>
          {TREND_ORDER.filter((k) => counts[k]).map((k) => (
            <View key={k} style={{ flex: counts[k], backgroundColor: trendColor(t, k) }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
          {TREND_ORDER.filter((k) => counts[k]).map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: trendColor(t, k) }} />
              <T style={{ fontSize: 12, color: t.mute }}>{`${TREND[k].label} ${counts[k]}`}</T>
            </View>
          ))}
        </View>
        <T style={{ color: t.mute, fontSize: 12 }}>حسب أقصى وزن متوقع لتكرار واحد (Epley) · دوس على تمرين تشوف الرسم</T>
        {(allEx ? exercises : exercises.slice(0, 8)).map((e) => {
          const info = r.trends[e.id];
          const k = `ex:${e.id}`;
          return (
            <View key={e.id} style={{ borderTopWidth: 1, borderTopColor: t.line }}>
              <Pressable onPress={() => toggle(k)} accessibilityRole="button" accessibilityState={{ expanded: open === k }} style={s.exRow}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.muscle[e.muscle] }} />
                <View style={{ flex: 1, gap: 1 }}>
                  <T w="num" style={{ fontSize: 14.5 }}>{e.name}</T>
                  <T style={{ fontSize: 12, color: t.mute }}>{trendSub(info)}</T>
                </View>
                <View style={[s.chip, { backgroundColor: info.trend === 'down' || info.trend === 'stalled' ? t.warnSoft : info.trend === 'up' ? t.okSoft : t.soft }]}>
                  <Ionicons name={TREND[info.trend].icon} size={13} color={trendText(t, info.trend)} />
                  <T w="semi" style={{ fontSize: 12, color: trendText(t, info.trend) }}>{TREND[info.trend].label}</T>
                </View>
              </Pressable>
              {open === k ? <View style={{ paddingBottom: 10 }}>{chartFor(e.id)}</View> : null}
            </View>
          );
        })}
        <More
          label={allEx ? 'أقل' : `كل التمارين (${exercises.length})`}
          onPress={() => {
            animate();
            setAllEx(!allEx);
          }}
        />
      </Card>

      <Pressable onPress={() => router.push('/attendance')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.okSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="calendar" size={21} color={t.okText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="bold" style={{ fontSize: 15 }}>الكالندر</T>
            <T style={{ color: t.mute, fontSize: 12.5 }}>كل يوم: حضرت ولا فوّت، وإيه اللي اتلعب وإيه اللي اتساب</T>
          </View>
          <Ionicons name="chevron-back" size={20} color={t.mute} />
        </Card>
      </Pressable>

      <T style={{ color: t.mute, fontSize: 12, lineHeight: 19, paddingHorizontal: 4 }}>
        {`الهدف هو مجموعات البرنامج نفسه. أقل من 4 مجموعات للعضلة في الأسبوع غالبًا مش كفاية تكبّرها، و5–10 أكفأ رينج (تحليل Pelland وزملاؤه 2025). التمرين «واقف» لو مفيش رقم جديد من 3 مرات، و«نازل» لو آخر مرتين أقل ${isoPct(0.05)} أو أكتر من أحسن رقم.`}
      </T>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.soft, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 2 }}>
      <T w="numBold" style={{ fontSize: 16 }}>{value}</T>
      <T style={{ fontSize: 11.5, color: t.mute, textAlign: 'center' }}>{label}</T>
    </View>
  );
}

function More({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <T w="semi" style={{ color: t.okText, fontSize: 13.5 }}>{label}</T>
    </Pressable>
  );
}

/** Muscles × last 6 weeks. Fill = share of the planned sets done (one hue, darker = more); under half turns amber. */
function Heatmap({ r }: { r: Report }) {
  const t = useTheme();
  const cur = r.grid.length - 1;
  const cell = (done: number, planned: number) => {
    if (!planned && !done) return { bg: t.soft, fg: t.mute, label: '–' };
    const x = planned ? done / planned : 1;
    if (x < 0.5) return { bg: t.warnSoft, fg: t.warn, label: String(done) };
    return { bg: tint(t.ok, 0.25 + 0.75 * Math.min(1, x)), fg: x >= 0.75 ? t.onOk : t.fg, label: String(done) };
  };
  return (
    <Card style={{ padding: 14, gap: 6 }}>
      <View style={s.hRow}>
        <View style={s.hName} />
        {r.grid.map((w, i) => (
          <T key={w.start} w={i === cur ? 'numBold' : 'numRegular'} style={[s.hCell, { fontSize: 11, color: i === cur ? t.fg : t.mute, textAlign: 'center' }]}>
            {i === cur ? 'ده' : shortDate(w.start)}
          </T>
        ))}
      </View>
      {MUSCLES.map((m: Muscle) => (
        <Pressable
          key={m}
          onPress={() => router.push(`/attendance?muscle=${m}`)}
          accessibilityRole="button"
          accessibilityLabel={`${MUSCLE_AR[m]}: ${r.grid.map((w) => `${w.vol[m].done} من ${w.vol[m].planned}`).join('، ')}`}
          style={({ pressed }) => [s.hRow, { minHeight: 40, opacity: pressed ? 0.7 : 1 }]}>
          <View style={[s.hName, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.muscle[m] }} />
            <T style={{ fontSize: 12.5, flexShrink: 1 }} numberOfLines={1}>{MUSCLE_AR[m]}</T>
          </View>
          {r.grid.map((w, i) => {
            const c = cell(w.vol[m].done, w.vol[m].planned);
            return (
              <View key={w.start} style={[s.hCell, { height: 34, borderRadius: 8, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }, i === cur ? { borderWidth: 1.5, borderColor: t.ink } : null]}>
                <T w="num" style={{ fontSize: 12.5, color: c.fg }}>{c.label}</T>
              </View>
            );
          })}
        </Pressable>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 12, rowGap: 6, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <T style={{ fontSize: 12, color: t.mute }}>ناقص</T>
          {[0.5, 0.75, 1].map((x) => (
            <View key={x} style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: tint(t.ok, 0.25 + 0.75 * x) }} />
          ))}
          <T style={{ fontSize: 12, color: t.mute }}>كامل</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: t.warnSoft, borderWidth: 1, borderColor: t.warn }} />
          <T style={{ fontSize: 12, color: t.mute }}>أقل من النص</T>
        </View>
      </View>
      <T style={{ color: t.mute, fontSize: 12, textAlign: 'center' }}>الرقم = مجموعات خلصتها · دوس على عضلة تشوفها في الكالندر</T>
    </Card>
  );
}

const s = StyleSheet.create({
  hRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hName: { width: 96 },
  hCell: { flex: 1 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
});
