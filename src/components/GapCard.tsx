import React from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MUSCLE_AR, dayOfExercise, exerciseById } from '../data/program';
import { MEV, type Gap, type Report } from '../lib/gaps';
import { countAr, DAYS, TIMES, WEEKS } from '../lib/logic';
import { useTheme } from '../theme';
import { Card, T } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const iso = (s: string) => `⁦${s}⁩`; // keep Latin names and numbers in their own direction
const pct = (x: number) => iso(`${Math.round(x * 100)}%`);

/** "في آخر 4 أسابيع", or since you started when that's shorter. */
export const periodAr = (r: Report) => (r.tracked >= 28 ? 'في آخر 4 أسابيع' : `من ساعة ما بدأت تسجّل (${countAr(r.tracked, DAYS)})`);

export function gapText(g: Gap, r: Report): { icon: IconName; title: string; body: string } {
  const period = periodAr(r);
  const exName = (id: string) => iso(exerciseById(id)?.name ?? id);
  switch (g.kind) {
    case 'day':
      return {
        icon: 'calendar-clear',
        title: `فوّت ${countAr(g.missed, DAYS)} تمرين`,
        // Workouts run in sequence: a missed day doesn't lose a workout, it pushes the whole cycle back a day.
        body: `اتمرنت ${g.due - g.missed} من ${countAr(g.due, DAYS)} ${period}. ترتيب التمارين ما بيتلخبطش، بس كل يوم بتفوّته بيأخّر الدورة كلها يوم.`,
      };
    case 'volume': {
      const perWeek = g.done / (r.tracked / 7);
      const mev = r.tracked >= 14 && perWeek < MEV ? ` يعني أقل من ${MEV} في الأسبوع، وده غالبًا مش كفاية العضلة تكبر.` : '';
      return {
        icon: 'body',
        title: `${MUSCLE_AR[g.muscle]}: ${pct(g.done / g.planned)} بس من المجموعات`,
        body: `لعبت ${g.done} من ${g.planned} مجموعة ${period}.${mev}`,
      };
    }
    case 'down':
      return {
        icon: 'trending-down',
        title: `${exName(g.exId)} نازل`,
        body: `أحسن رقم في آخر مرتين أقل ${pct(g.drop)} من أحسن رقم ليك. ده غالبًا إرهاق: نام كويس وكُل كفاية، ولو فضل نازل خد أسبوع خفيف.`,
      };
    case 'skipped':
      return {
        icon: 'close-circle',
        title: `${exName(g.exId)} مش بيتلعب`,
        body: `${g.times === r.exAdh[g.exId].times ? 'ما لعبتوش ولا مرة في' : `سبته ${countAr(g.times, TIMES)} من`} آخر ${countAr(r.exAdh[g.exId].times, TIMES)} عملت فيهم يوم ${dayOfExercise(g.exId)?.titleAr}.`,
      };
    case 'stalled': {
      const n = g.exIds.length;
      const advice = 'زوّد تكرار واحد بنفس الوزن قبل ما تزوّد الوزن، ولو فضل واقف غيّر مدى التكرارات.';
      if (n === 1) {
        return {
          icon: 'pause',
          title: `${exName(g.exIds[0])} واقف`,
          body: `مفيش رقم جديد من آخر ${countAr(r.trends[g.exIds[0]].sinceBest, TIMES)}. ${advice}`,
        };
      }
      const names = g.exIds.slice(0, 3).map(exName).join('، ') + (n > 3 ? ` و${countAr(n - 3, ['تمرين تاني', 'تمرينين كمان', 'تمارين تانية', 'تمرين تاني'])}` : '');
      const many = n >= 5 ? ' ولما تمارين كتير تقف مع بعض، غالبًا جسمك محتاج أسبوع خفيف.' : '';
      return {
        icon: 'pause',
        title: `${countAr(n, ['تمرين', 'تمرينين', 'تمارين', 'تمرين'])} واقفين`,
        body: `مفيش رقم جديد من 3 مرات أو أكتر: ${names}. ${advice}${many}`,
      };
    }
    case 'short':
      return {
        icon: 'remove-circle',
        title: `${exName(g.exId)}: مجموعات ناقصة`,
        body: `بتلعب ${iso(String(Math.round(g.avg * 10) / 10))} من ${g.sets} مجموعات في المتوسط آخر كام مرة. كمّل المجموعات قبل ما تزوّد وزن.`,
      };
    case 'deload':
      return {
        icon: 'battery-half',
        title: 'جه وقت أسبوع خفيف',
        body: `بقالك ${countAr(g.weeks, WEEKS)} بتتمرن من غير أسبوع خفيف. العب أسبوع بنص عدد المجموعات عشان جسمك يرتاح ويرجع أقوى.`,
      };
  }
}

export const gapKey = (g: Gap) => `${g.kind}:${'exId' in g ? g.exId : 'muscle' in g ? g.muscle : ''}`;
/** The one exercise a gap is about, if any (its chart opens under the card). */
export const gapExercise = (g: Gap): string | undefined => ('exId' in g ? g.exId : g.kind === 'stalled' && g.exIds.length === 1 ? g.exIds[0] : undefined);

/** One gap: icon (warning for big ones), title, advice. Tapping runs `onPress`; `children` show under it when expanded. */
export function GapCard({ gap, report, onPress, open, children }: { gap: Gap; report: Report; onPress?: () => void; open?: boolean; children?: React.ReactNode }) {
  const t = useTheme();
  const { icon, title, body } = gapText(gap, report);
  const big = gap.level === 2;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: big ? t.warnSoft : t.soft }}>
            <Ionicons name={icon} size={20} color={big ? t.warn : t.ink} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T w="bold" style={{ fontSize: 15, flex: 1 }}>{title}</T>
              {big ? <T w="semi" style={{ fontSize: 11.5, color: t.warn }}>مهم</T> : null}
            </View>
            <T style={{ color: t.mute, fontSize: 13, lineHeight: 20 }}>{body}</T>
          </View>
          {onPress ? <Ionicons name={open === undefined ? 'chevron-back' : open ? 'chevron-up' : 'chevron-down'} size={18} color={t.mute} style={{ alignSelf: 'center' }} /> : null}
        </View>
        {open ? children : null}
      </Card>
    </Pressable>
  );
}
