// Top of the weekly report (/week): the week's score (hero ring + what it's made of), a ring per day, and each metric
// against the same days of the week before (trend arrow + seven small bars with last week's daily average as a line).
// Logic: src/lib/weekDash.ts.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, Progress, Ring, T } from './ui';
import { minAr } from '../lib/focus';
import { scoreLabel, type DayRing, type Metric, type MetricKey, type WeekDash } from '../lib/weekDash';
import { useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Keeps numbers, signs and % in their order inside Arabic text. */
const iso = (s: string) => `⁦${s}⁩`;
const DAY_LETTERS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']; // Saturday → Friday

const PILLAR_AR: Record<string, string> = { workouts: 'التمرين', meals: 'الأكل', water: 'المية', steps: 'الخطوات' };

const METRIC: Record<MetricKey, { name: string; icon: IconName; value: (v: number, target: number) => string }> = {
  workouts: { name: 'التمارين', icon: 'barbell-outline', value: (v, target) => `${v} من ${target}` },
  volume: { name: 'الحجم', icon: 'stats-chart-outline', value: (v) => (v >= 1000 ? `${iso((v / 1000).toFixed(1))} طن` : `${iso(String(v))} كجم`) },
  meals: { name: 'الوجبات', icon: 'restaurant-outline', value: (v) => iso(`${Math.round(v * 100)}%`) },
  water: { name: 'المية في اليوم', icon: 'water-outline', value: (v) => `${iso((v / 1000).toFixed(1))} لتر` },
  steps: { name: 'خطوات في اليوم', icon: 'footsteps-outline', value: (v) => iso(v.toLocaleString('en-US')) },
  tasks: { name: 'مهام خلصت', icon: 'checkbox-outline', value: (v) => String(v) },
  focus: { name: 'ركّزت', icon: 'timer-outline', value: (v) => minAr(v) },
};

/** The week's score: a big ring, a word for it, the change from last week and the parts it's made of. */
export function WeekHero({ dash, live }: { dash: WeekDash; live: boolean }) {
  const t = useTheme();
  if (dash.score == null)
    return (
      <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="hourglass-outline" size={22} color={t.mute} />
        <T style={{ flex: 1, color: t.mute, fontSize: 14 }}>{live ? 'سجّل تمرينك وأكلك والمية وهتلاقي تقييم أسبوعك هنا.' : 'مفيش تسجيل في الأسبوع ده.'}</T>
      </Card>
    );
  const diff = dash.prevScore == null ? null : dash.score - dash.prevScore;
  return (
    <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Ring value={dash.score / 100} size={108} stroke={10}>
        <T w="numBold" style={{ fontSize: 32, lineHeight: 38 }}>{dash.score}</T>
        <T style={{ fontSize: 11, color: t.mute }}>من 100</T>
      </Ring>
      <View style={{ flex: 1, gap: 6 }}>
        <T w="bold" style={{ fontSize: 18 }}>{scoreLabel(dash.score)}</T>
        {diff != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name={diff > 0 ? 'arrow-up' : diff < 0 ? 'arrow-down' : 'remove'} size={13} color={diff > 0 ? t.green : diff < 0 ? t.warn : t.mute} />
            <T style={{ fontSize: 12.5, color: t.mute, flexShrink: 1 }}>
              {diff === 0 ? 'زي الأسبوع اللي فات' : `${Math.abs(diff)} ${diff > 0 ? 'أحسن' : 'أقل'} من ${live ? 'نفس الأيام من الأسبوع اللي فات' : 'الأسبوع اللي قبله'}`}
            </T>
          </View>
        ) : null}
        <View style={{ gap: 5, marginTop: 2 }}>
          {dash.pillars.map((p) => (
            <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T style={{ width: 52, fontSize: 12, color: t.mute }}>{PILLAR_AR[p.key]}</T>
              <View style={{ flex: 1 }}>
                <Progress value={p.share} height={5} />
              </View>
              <T w="num" style={{ width: 36, fontSize: 12, textAlign: 'center' }}>{iso(`${Math.round(p.share * 100)}%`)}</T>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

/** One ring per day, Saturday → Friday; a barbell inside on a workout day, today's letter highlighted. */
export function DayRings({ rings, today }: { rings: DayRing[]; today: string }) {
  const t = useTheme();
  return (
    <Card style={{ paddingVertical: 14, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
      {rings.map((d, i) => {
        const isToday = d.date === today;
        const label = `${DAY_LETTERS[i]}${d.share == null ? '، لسه' : `، ${Math.round(d.share * 100)}%${d.trained ? '، اتمرنت' : ''}`}`;
        return (
          <View key={d.date} accessible accessibilityLabel={label} style={{ alignItems: 'center', gap: 6, width: 40 }}>
            <View style={{ opacity: d.share == null ? 0.45 : 1 }}>
              <Ring value={d.share ?? 0} size={36} stroke={4}>
                {d.trained ? <Ionicons name="barbell" size={13} color={t.okText} /> : null}
              </Ring>
            </View>
            <View style={[s.letter, isToday ? { backgroundColor: t.ok } : null]}>
              <T w={isToday ? 'bold' : 'medium'} style={{ fontSize: 12, color: isToday ? t.onOk : t.mute }}>{DAY_LETTERS[i]}</T>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const BAR_W = 7;
const BAR_GAP = 3;
const BAR_H = 30;

/** Seven small bars (Saturday on the start side) and last week's daily average as a thin line across them. */
function Bars({ m, today }: { m: Metric; today: number }) {
  const t = useTheme();
  const vals = m.days.filter((v): v is number => v != null);
  const top = Math.max(1, ...vals, m.prevAvg ?? 0, ...(m.dayGoal ?? []));
  return (
    <View style={{ width: 7 * BAR_W + 6 * BAR_GAP, height: BAR_H, flexDirection: 'row', alignItems: 'flex-end', gap: BAR_GAP }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {m.days.map((v, i) => {
        if (v == null) return <View key={i} style={{ width: BAR_W, height: 3, borderRadius: 1.5, backgroundColor: t.line, opacity: 0.6 }} />;
        const full = !m.dayGoal || v >= m.dayGoal[i];
        return (
          <View
            key={i}
            style={{
              width: BAR_W,
              height: v > 0 ? Math.max(3, (v / top) * BAR_H) : 3,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
              borderBottomLeftRadius: 1,
              borderBottomRightRadius: 1,
              backgroundColor: v > 0 ? t.ok : t.soft,
              opacity: v > 0 && !full && i !== today ? 0.45 : 1,
            }}
          />
        );
      })}
      {m.prevAvg ? <View pointerEvents="none" style={[s.avg, { bottom: Math.min(BAR_H, (m.prevAvg / top) * BAR_H), backgroundColor: t.fg }]} /> : null}
    </View>
  );
}

/** Each metric: icon, name and this week's number, its seven days, and the change from last week. */
export function MetricList({ dash, target, live }: { dash: WeekDash; target: number; live: boolean }) {
  const t = useTheme();
  const todayIdx = live ? dash.rings.findIndex((d) => d.date === dash.end) : -1;
  return (
    <Card style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
      {dash.metrics.map((m, i) => {
        const def = METRIC[m.key];
        const up = m.trend === 'up';
        const down = m.trend === 'down';
        const tone = up ? t.green : down ? t.warn : t.mute;
        const delta = m.delta == null ? null : iso(`${m.delta > 0 ? '+' : ''}${m.delta}%`);
        return (
          <View
            key={m.key}
            accessible
            accessibilityLabel={`${def.name}: ${def.value(m.value, target)}${delta ? `، ${delta} عن الأسبوع اللي فات` : ''}`}
            style={[s.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : null]}>
            <View style={[s.icon, { backgroundColor: t.soft }]}>
              <Ionicons name={def.icon} size={17} color={t.fg} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <T style={{ fontSize: 12.5, color: t.mute }} numberOfLines={1}>{def.name}</T>
              <T w="numBold" style={{ fontSize: 17 }} numberOfLines={1}>{def.value(m.value, target)}</T>
            </View>
            <Bars m={m} today={todayIdx} />
            <View style={s.trend}>
              {m.trend ? <Ionicons name={up ? 'arrow-up' : down ? 'arrow-down' : 'remove'} size={13} color={tone} /> : null}
              <T w="num" style={{ fontSize: 12.5, color: m.trend ? tone : t.mute }}>{delta ?? '—'}</T>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const s = StyleSheet.create({
  letter: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
  icon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  trend: { width: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  avg: { position: 'absolute', start: -2, end: -2, height: 1.5, opacity: 0.35, borderRadius: 1 },
});
