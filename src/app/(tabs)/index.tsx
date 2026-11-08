import React, { useState } from 'react';
import { LayoutAnimation, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { dayFor, exerciseById, MONTHS_AR, WEEKDAYS_AR } from '../../data/program';
import { ExerciseRow } from '../../components/ExerciseRow';
import { WorkoutChips } from '../../components/WorkoutChips';
import { TimerBar } from '../../components/TimerBar';
import { router } from 'expo-router';
import { Btn, Card, HeaderBtn, Ring, Screen, Sheet, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { CardioCard } from '../../components/CardioCard';
import { dateKey, formatClock, weekdayOf } from '../../lib/logic';
import { after, currentWorkout } from '../../lib/schedule';
import { storage } from '../../lib/storage';
import { confirm } from '../../lib/confirm';
import { deloadOn, useSettings } from '../../lib/settings';
import { useReport } from '../../lib/useReport';
import { useDataVersion } from '../../lib/bus';
import { BACKUP_STALE_DAYS, LAST_BACKUP_KEY } from '../../lib/backup';
import { addDays, daysBetween } from '../../lib/gaps';
import { SWAPS_KEY, swappedSet } from '../../lib/journal';
import { readStrings } from '../../lib/meta';
import { sessionSummary } from '../../lib/summary';
import { useTheme } from '../../theme';

export default function Workout() {
  return <WorkoutScreen />;
}

/** How far back you can log a day you forgot. */
const BACK_DAYS = 14;
const dayName = (k: string, today: string) => {
  const back = daysBetween(k, today);
  return back === 0 ? 'النهارده' : back === 1 ? 'امبارح' : `${WEEKDAYS_AR[weekdayOf(k)]} ${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]}`;
};

function WorkoutScreen() {
  const t = useTheme();
  const today = dateKey();
  // A past day you're logging (or fixing); null = today. Picked from the calendar button in the header.
  const [view, setView] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const date = view && view < today ? view : today;
  const live = date === today;
  const [picked, setPicked] = useState<{ date: string; id: number } | null>(null);
  const { cards, bump, bumpAll } = useDataVersion();

  // Workouts run in one sequence, not by weekday: open on the one after your last session (src/lib/schedule.ts).
  // Re-read on every render; the screen re-renders when the data version (v) changes.
  const cur = currentWorkout(storage.trainedDays(), date);
  const sel = picked?.date === date ? picked.id : cur.id; // a pick from yesterday doesn't stick
  const day = dayFor(sel)!;
  // Which exercise is open: the one you tapped, else the first one not finished (it moves on by itself as you tick).
  const [tapped, setTapped] = useState<string | null>(null);
  const pick = (id: number) => {
    setPicked({ date, id });
    setTapped(null);
  };
  const openOne = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    setTapped(id);
  };

  // Logging always goes to today's date, whichever workout is open.
  let done = 0, total = 0;
  const doneBy: Record<string, number> = {};
  for (const e of day.exercises) {
    total += e.sets;
    doneBy[e.id] = storage.setsFor(date, e.id).slice(0, e.sets).filter((x) => x.done).length;
    done += doneBy[e.id];
  }
  const openId = tapped && day.exercises.some((e) => e.id === tapped) ? tapped : day.exercises.find((e) => doneBy[e.id] < e.sets)?.id;
  // Finished exercises go to the bottom (as one-line summaries), each keeping its number.
  const order = [...day.exercises.filter((e) => doneBy[e.id] < e.sets), ...day.exercises.filter((e) => doneBy[e.id] >= e.sets)];

  // Rough session length: each set's work (~45 s) plus its rest.
  const minutes = Math.round(day.exercises.reduce((a, e) => a + e.sets * (e.restSec + 45), 0) / 60);
  const finished = cur.started && sel === cur.id && total > 0 && done >= total;

  return (
    <Screen
      title={live ? 'تمرين النهارده' : `تمرين ${dayName(date, today)}`}
      dense
      footer={<TimerBar />}
      action={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <HeaderBtn icon="calendar-outline" label="سجّل ليوم فات" onPress={() => setChoosing(true)} />
          <MenuButton />
        </View>
      }>
      <Sheet visible={choosing} onClose={() => setChoosing(false)} title="سجّل أو عدّل يوم فات" sub="لو نسيت تسجّل أو عايز تصلّح رقم. الترتيب بيمشي على حسب اللي اتسجل">
        {Array.from({ length: BACK_DAYS + 1 }, (_, i) => addDays(today, -i)).map((k) => {
          const logged = storage.trainedDays().find((d) => d.date === k);
          const on = k === date;
          return (
            <Pressable
              key={k}
              onPress={() => { setChoosing(false); setView(k === today ? null : k); setPicked(null); setTapped(null); }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: on ? t.okSoft : t.soft, opacity: pressed ? 0.7 : 1 })}>
              <T w="semi" style={{ flex: 1, fontSize: 14 }}>{dayName(k, today)}</T>
              <T style={{ fontSize: 12, color: logged ? t.okText : t.mute }}>{logged ? `${logged.weekdays.map((w) => dayFor(w)?.titleAr).filter(Boolean).join(' + ')} · ${logged.sets} مجموعة` : 'مفيش تسجيل'}</T>
            </Pressable>
          );
        })}
      </Sheet>
      {!live ? (
        <Pressable onPress={() => setView(null)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.warnSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="time-outline" size={15} color={t.warn} />
          <T w="medium" style={{ color: t.warn, fontSize: 13, flex: 1 }}>{`بتسجّل ليوم ${dayName(date, today)} · عداد الراحة مقفول`}</T>
          <T w="semi" style={{ color: t.warn, fontSize: 13 }}>ارجع للنهارده</T>
        </Pressable>
      ) : null}
      <WorkoutChips dense value={sel} current={cur.id} onChange={pick} />

      <Card style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ring value={total ? done / total : 0} size={46} stroke={4}>
          <T w="numBold" style={{ fontSize: 12, color: t.okText }}>{`${total ? Math.round((done / total) * 100) : 0}%`}</T>
        </Ring>
        <View style={{ flex: 1, gap: 1 }}>
          <T w="bold" style={{ fontSize: 17 }}>{day.titleAr}</T>
          <T w="num" style={{ color: t.mute, fontSize: 12 }}>{`\u2066${done} / ${total}\u2069 مجموعة · \u2066${minutes}\u2069 د`}</T>
        </View>
      </Card>
      {finished ? <DoneCard date={date} weekday={sel} next={live ? dayFor(after(cur.id))?.titleAr ?? '' : null} /> : null}
      <LightWeek today={today} />
      {sel !== cur.id ? (
        <View style={{ backgroundColor: t.warnSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}>
          <T style={{ color: t.warn, fontSize: 13 }}>{`الدور على: ${dayFor(cur.id)?.titleAr}`}</T>
        </View>
      ) : null}
      <Card style={{ overflow: 'hidden' }}>
        {order.map((e, pos) => (
          <ExerciseRow
            key={`${e.id}-${date}-${cards}`}
            ex={e}
            index={day.exercises.indexOf(e)}
            date={date}
            weekday={sel}
            first={pos === 0}
            live={live}
            open={e.id === openId}
            onOpen={() => openOne(e.id)}
            onChange={(fin) => {
              // Last set ticked on the line: it drops to the bottom as a summary and the next exercise opens.
              if (fin) {
                LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
                setTapped(null);
              }
              bump();
            }}
          />
        ))}
      </Card>
      <CardioCard date={date} />
      {live && weekdayOf(today) === 5 ? (
        <Pressable onPress={() => router.push('/week')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <Card style={{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="document-text-outline" size={20} color={t.okText} />
            <View style={{ flex: 1 }}>
              <T w="semi" style={{ fontSize: 14 }}>تقرير الأسبوع جاهز</T>
              <T style={{ fontSize: 12, color: t.mute }}>الحضور والعضلات والأرقام والوزن والأكل</T>
            </View>
            <Ionicons name="chevron-back" size={18} color={t.mute} />
          </Card>
        </Pressable>
      ) : null}
      <View style={{ gap: 8, marginTop: 4 }}>
        <Btn label={live ? 'امسح تسجيل النهارده' : 'امسح تسجيل اليوم ده'} onPress={async () => { if (await confirm({ title: 'تمسح تسجيل اليوم ده؟', body: 'هيتشال كل اللي سجلته في اليوم ده.', confirmLabel: 'امسح', danger: true })) { storage.clearDay(date, day.exercises.map((e) => e.id)); bumpAll(); } }} />
      </View>
    </Screen>
  );
}

/** After the last set of the day: what you did, how it compares with last time, new records, and a backup nudge. */
function DoneCard({ date, weekday, next }: { date: string; weekday: number; next: string | null }) {
  const t = useTheme();
  const sum = sessionSummary(storage.allSets(), date, weekday, swappedSet(readStrings(SWAPS_KEY)));
  const lastBackup = storage.getMeta(LAST_BACKUP_KEY);
  const since = lastBackup ? daysBetween(lastBackup, date) : null;
  const nudge = since == null || since >= BACKUP_STALE_DAYS;
  const pct = sum.change != null ? Math.round(sum.change * 100) : null;
  const tiles = [
    { v: String(sum.sets), l: 'مجموعة' },
    { v: String(sum.reps), l: 'تكرار' },
    { v: sum.volume.toLocaleString('en-US'), l: 'كجم حجم' },
  ];
  return (
    <Card style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 8, borderWidth: 1, borderColor: t.ok }}>
      <T w="bold" style={{ color: t.okText, fontSize: 15 }}>{next != null ? 'خلصت تمرين النهارده ✓' : 'التمرين ده متسجل كامل ✓'}</T>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {tiles.map((x) => (
          <View key={x.l} style={{ flex: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: t.soft }}>
            <T w="numBold" style={{ fontSize: 15 }}>{x.v}</T>
            <T style={{ fontSize: 11, color: t.mute }}>{x.l}</T>
          </View>
        ))}
      </View>
      {sum.minutes != null ? (
        <T style={{ fontSize: 12.5, color: t.mute }}>{`المدة \u2066${sum.minutes}\u2069 دقيقة · متوسط الوقت بين المجموعات \u2066${formatClock((sum.gapSec ?? 0) * 1000)}\u2069`}</T>
      ) : null}
      {pct != null ? (
        <T style={{ fontSize: 12.5, color: pct >= 0 ? t.okText : t.warn }}>
          {pct === 0 ? 'نفس حجم آخر مرة' : `الحجم ${pct > 0 ? 'زاد' : 'قلّ'} \u2066${Math.abs(pct)}%\u2069 عن آخر مرة (\u2066${sum.prev!.date.slice(5)}\u2069)`}
        </T>
      ) : (
        <T style={{ fontSize: 12.5, color: t.mute }}>أول مرة تسجّل التمرين ده، المرة الجاية هنقارن بيها.</T>
      )}
      {sum.prs.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="trophy" size={14} color="#E0A400" />
          <T w="num" style={{ fontSize: 12.5, flex: 1 }}>{`أرقام جديدة: ${sum.prs.map((id) => exerciseById(id)?.name ?? id).join('، ')}`}</T>
        </View>
      ) : null}
      {next != null ? <T style={{ fontSize: 12.5, color: t.mute }}>{`الجاي: ${next}`}</T> : null}
      {nudge ? (
        <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.warnSoft, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="cloud-upload-outline" size={15} color={t.warn} />
          <T style={{ fontSize: 12.5, color: t.warn, flex: 1 }}>{since == null ? 'لسه ما عملتش نسخة احتياطية. اعملها من الإعدادات' : `آخر نسخة احتياطية من ${since} يوم. اعمل واحدة جديدة`}</T>
        </Pressable>
      ) : null}
    </Card>
  );
}

/** Light week (deload): on → how long and a way to end it; due (the gaps report says so) → a way to start it. */
function LightWeek({ today }: { today: string }) {
  const t = useTheme();
  const st = useSettings();
  const report = useReport();
  const on = deloadOn(st, today);
  const due = !on && report.gaps.some((g) => g.kind === 'deload');
  if (!on && !due) return null;
  const left = on ? daysBetween(today, st.deloadUntil) + 1 : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: on ? t.okSoft : t.warnSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}>
      <Ionicons name="battery-half" size={18} color={on ? t.okText : t.warn} />
      <View style={{ flex: 1 }}>
        <T w="semi" style={{ fontSize: 13, color: on ? t.okText : t.warn }}>{on ? `أسبوع خفيف · فاضل ${left === 1 ? 'يوم' : left === 2 ? 'يومين' : `${left} أيام`}` : 'جه وقت أسبوع خفيف'}</T>
        <T style={{ fontSize: 11.5, color: t.mute }}>{on ? 'نص المجموعات، ونفس الأوزان أو أخف شوية. جسمك بيرتاح ويرجع أقوى' : 'بقالك أسابيع من غير راحة. أسبوع بنص المجموعات'}</T>
      </View>
      <Btn label={on ? 'وقّفه' : 'ابدأه'} kind={on ? 'ghost' : 'solid'} onPress={on ? st.stopDeload : st.startDeload} />
    </View>
  );
}
