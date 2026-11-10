import React, { useState } from 'react';
import { Item } from '../components/Motion';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, Ring, Screen, T } from '../components/ui';
import { MenuButton } from '../components/SideMenu';
import { HabitForm } from '../components/HabitForm';
import { ACTION, Swipe } from '../components/Swipe';
import { useDataVersion } from '../lib/bus';
import { addDays } from '../lib/gaps';
import { dayState, groupHabits, habitStats, isDue, logKey, partsDone, pausedNow, togglePause, type DayState, type Habit, type Log, type PartsLog } from '../lib/habits';
import { addHabits, moveHabit, readHabitLog, readHabitParts, readHabits, saveHabit, setMark, setPart } from '../lib/habitStore';
import { showUndo } from '../lib/undo';
import { ADHKAR_KEY, adhkarKey, adhkarOf, adhkarProgress, listFor, parseAdhkarLog } from '../lib/adhkar';
import { storage } from '../lib/storage';
import { canOpenApps, openApp } from '../lib/appsIO';
import { MY_HABITS } from '../data/habitTemplates';
import { allowReminders } from '../lib/reminder';
import { useSettings } from '../lib/settings';
import { dateKey } from '../lib/logic';
import { tap } from '../lib/timer';
import { usePop } from '../lib/motion';
import { font, ThemeProvider, tint, useTheme, useWarm, type Theme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** The habits tab: today's habits to tick (long-press = excused), each with its streak and last 7 days; tap one for its page. */
export default function HabitsWarm() {
  return (
    <ThemeProvider value={useWarm()}>
      <Habits />
    </ThemeProvider>
  );
}

function Habits() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = dateKey();
  const habits = readHabits();
  const log = readHabitLog();
  const parts = readHabitParts();
  const hasPlace = !!useSettings((s) => s.place);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  // The ready-made worship and knowledge habits, offered until any of them is in the list.
  const offerMine = !habits.some((h) => MY_HABITS.some((m) => m.name === h.name));
  const addMine = async () => {
    setAdded(addHabits(MY_HABITS, today));
    await allowReminders().catch(() => false);
  };
  const sections = groupHabits(habits);
  const grouped = sections.some((x) => x.group !== null);
  const rank = (h: Habit) => (pausedNow(h) ? 2 : isDue(h, today) ? 0 : 1);
  const [ordering, setOrdering] = useState(false);

  const due = habits.filter((h) => isDue(h, today));
  const doneToday = due.filter((h) => log[logKey(h.id, today)] === 'done').length;
  const risky = due.filter((h) => habitStats(h, log, today).atRisk);

  return (
    <Screen title="العادات" dense action={<MenuButton />}>
      {habits.length ? (
        <>
          <Card style={{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ring value={due.length ? doneToday / due.length : 0} size={52} stroke={5}>
              <T w="numBold" style={{ fontSize: 13, color: t.okText }}>{`${doneToday}/${due.length}`}</T>
            </Ring>
            <View style={{ flex: 1, gap: 2 }}>
              <T w="bold" style={{ fontSize: 16 }}>{!due.length ? 'مفيش عادات عليك النهارده' : doneToday === due.length ? 'كمّلت عادات النهارده ✓' : `فاضل ${due.length - doneToday} النهارده`}</T>
              <T style={{ color: t.mute, fontSize: 12 }}>دوس ✓ لما تعملها · دوسة طويلة = معذور النهارده</T>
            </View>
          </Card>

          {risky.length ? (
            <View style={[s.risk, { backgroundColor: t.warnSoft }]}>
              <Ionicons name="alert-circle" size={16} color={t.warn} />
              <T style={{ flex: 1, fontSize: 12.5, color: t.warn }}>{`امبارح فوّت ${risky.map((h) => h.name).join(' و')}. متفوّتهاش مرتين ورا بعض: النهارده مهم`}</T>
            </View>
          ) : null}

          {ordering ? (
            <>
              <T style={{ color: t.mute, fontSize: 12.5 }}>رتّب العادات بالأسهم، والترتيب ده هو اللي هيظهر</T>
              {habits.map((h, i) => (
                <Item key={h.id}><Card style={[s.row, { paddingVertical: 8 }]}>
                  <View style={[s.icon, { backgroundColor: tint(h.color, 0.15) }]}>
                    <Ionicons name={h.icon as IconName} size={20} color={h.color} />
                  </View>
                  <T w="semi" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{h.name}</T>
                  <Arrow t={t} name="arrow-up" label={`طلّع ${h.name}`} disabled={i === 0} onPress={() => moveHabit(h.id, -1)} />
                  <Arrow t={t} name="arrow-down" label={`نزّل ${h.name}`} disabled={i === habits.length - 1} onPress={() => moveHabit(h.id, 1)} />
                </Card></Item>
              ))}
            </>
          ) : (
            <>
              {/* Sections by group (الصلاة، القرآن…); inside each: today's first, then the rest, paused last. */}
              {sections.map((sec) => {
                const items = [...sec.items].sort((a, b) => rank(a) - rank(b));
                const doneHere = items.filter((h) => isDue(h, today) && log[logKey(h.id, today)] === 'done').length;
                const dueHere = items.filter((h) => isDue(h, today)).length;
                return (
                  <View key={sec.group ?? '-'} style={{ gap: 8 }}>
                    {grouped ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <T w="bold" style={{ fontSize: 14, flex: 1 }}>{sec.group ?? 'عادات تانية'}</T>
                        {dueHere ? <T w="num" style={{ fontSize: 12, color: doneHere === dueHere ? t.okText : t.mute }}>{`${doneHere}/${dueHere}`}</T> : null}
                      </View>
                    ) : null}
                    {items.map((h) => (
                      <Item key={h.id}><HabitRow h={h} log={log} parts={parts} today={today} t={t} dim={!isDue(h, today)} paused={pausedNow(h)} /></Item>
                    ))}
                  </View>
                );
              })}
              {added != null ? (
                <T style={{ color: t.okText, fontSize: 12.5, textAlign: 'center' }}>
                  {`اتضاف ${added} عادة ✓${hasPlace ? '' : ' · عشان تذكيرات الضحى والوتر والأذكار تمشي مع مواقيت الصلاة، فعّل مواقيت الصلاة من الإعدادات'}`}
                </T>
              ) : null}
              {offerMine ? <Btn label="ضيف عاداتي (الصلاة، القرآن، الأذكار، العلم)" onPress={addMine} /> : null}
            </>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {!ordering ? <Btn label="+ عادة جديدة" onPress={() => setAdding(true)} style={{ flex: 1 }} /> : null}
            {habits.length > 1 ? <Btn label={ordering ? 'خلصت' : 'رتّب'} kind={ordering ? 'solid' : 'ghost'} onPress={() => setOrdering(!ordering)} style={ordering ? { flex: 1 } : undefined} /> : null}
          </View>
        </>
      ) : (
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: t.okSoft }]}>
            <Ionicons name="checkmark-done" size={40} color={t.okText} />
          </View>
          <T w="bold" style={{ fontSize: 18, textAlign: 'center' }}>ابدأ أول عادة</T>
          <T style={{ color: t.mute, fontSize: 13.5, textAlign: 'center', lineHeight: 22 }}>
            اكتب أي حاجة عايز تواظب عليها، وعلّم عليها كل يوم. العادة بتتبني في حوالي 66 يوم، وفوات يوم واحد مش بيبوّظها.
          </T>
          <Btn label="ضيف عاداتي (الصلاة، القرآن، الأذكار، العلم)" kind="solid" onPress={addMine} style={{ alignSelf: 'stretch' }} />
          <Btn label="+ عادة جديدة" onPress={() => setAdding(true)} style={{ alignSelf: 'stretch' }} />
        </View>
      )}
      {adding ? <HabitForm visible habit={null} onClose={() => setAdding(false)} /> : null}
    </Screen>
  );
}

const DOT: Record<DayState, (t: Theme, c: string) => object> = {
  done: (_t, c) => ({ backgroundColor: c }),
  skip: (_t, c) => ({ borderWidth: 1.5, borderColor: c, borderStyle: 'dashed' }),
  missed: (t) => ({ backgroundColor: tint(t.bad, 0.35) }),
  today: (t) => ({ borderWidth: 1.5, borderColor: t.fg }),
  off: (t) => ({ backgroundColor: t.soft }),
  before: (t) => ({ backgroundColor: t.soft, opacity: 0.4 }),
  future: (t) => ({ backgroundColor: t.soft }),
  paused: (t) => ({ backgroundColor: t.soft, opacity: 0.5 }),
};

function Arrow({ t, name, label, disabled, onPress }: { t: Theme; name: IconName; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={({ pressed }) => [s.arrow, { backgroundColor: t.soft, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Ionicons name={name} size={18} color={t.fg} />
    </Pressable>
  );
}

function HabitRow({ h, log, parts, today, t, dim, paused }: { h: Habit; log: Log; parts: PartsLog; today: string; t: Theme; dim?: boolean; paused?: boolean }) {
  const done = h.parts?.length ? partsDone(h, log, parts, today) : [];
  const adhkarLog = h.parts?.some((_, i) => adhkarOf(h, i)) ? parseAdhkarLog(storage.getMeta(ADHKAR_KEY)) : {};
  const st = habitStats(h, log, today);
  const mark = log[logKey(h.id, today)];
  const on = mark === 'done';
  const pop = usePop(on, 0.8);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const toggle = () => {
    tap();
    setMark(h.id, today, on ? undefined : 'done');
  };
  const excuse = () => {
    tap();
    setMark(h.id, today, mark === 'skip' ? undefined : 'skip');
  };
  const [editing, setEditing] = useState(false);
  // Swipe shortcuts (the row's own buttons stay as they are).
  const open = () => router.push({ pathname: '/habit/[id]', params: { id: h.id } });
  const clear = () => setMark(h.id, today, undefined);
  const pause = () => {
    saveHabit(togglePause(h, today));
    showUndo(paused ? `${h.name} · رجعت` : `${h.name} · اتوقفت مؤقتاً`, () => saveHabit(h));
  };
  return (
    <>
    <Swipe
      style={s.swipe}
      start={paused ? [] : [mark ? { icon: 'arrow-undo', label: 'رجّعها', color: ACTION.grey, onPress: clear } : { icon: 'checkmark', label: 'عملتها', color: ACTION.green, onPress: () => setMark(h.id, today, 'done') }]}
      end={[
        ...(paused || mark === 'skip' ? [] : [{ icon: 'remove-circle-outline' as const, label: 'معذور', color: ACTION.orange, onPress: () => setMark(h.id, today, 'skip') }]),
        paused ? { icon: 'play' as const, label: 'كمّل', color: ACTION.teal, onPress: pause } : { icon: 'pause' as const, label: 'وقّف', color: ACTION.indigo, onPress: pause },
        { icon: 'create-outline', label: 'عدّل', color: ACTION.grey, onPress: () => setEditing(true) },
        ...(h.app && canOpenApps ? [{ icon: 'open-outline' as const, label: 'افتح', color: ACTION.blue, onPress: () => void openApp(h.app!) }] : []),
      ]}>
    {/* The screen's color under the row, so a dimmed (see-through) row never shows the actions under it. */}
    <View style={{ backgroundColor: t.bg, borderRadius: 12 }}>
    {/* The card opens the habit; on the web it isn't marked a button, since a button can't hold the buttons inside it. */}
    <Pressable onPress={open} accessibilityRole={Platform.OS === 'web' ? undefined : 'button'} accessibilityLabel={`${h.name}، افتح النتايج`} style={({ pressed }) => ({ opacity: pressed ? 0.85 : dim ? 0.75 : 1 })}>
      <Card style={[s.row, on ? { borderWidth: 1, borderColor: tint(h.color, 0.5) } : null]}>
        <View style={[s.icon, { backgroundColor: tint(h.color, 0.15) }]}>
          <Ionicons name={h.icon as IconName} size={20} color={h.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <T w="semi" style={{ fontSize: 15 }} numberOfLines={1}>{h.name}</T>
          {h.cue ? (
            <T style={{ fontSize: 11.5, color: t.mute, marginTop: -3 }} numberOfLines={1}>{h.cue}</T>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {st.streak ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Ionicons name="flame" size={13} color="#E8590C" />
                <T w="numBold" style={{ fontSize: 12 }}>{st.streak}</T>
              </View>
            ) : null}
            {/* Last 7 days, oldest first (in RTL: right → left, like the text). */}
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {week.map((d) => (
                <View key={d} style={[s.dot, DOT[dayState(h, log, d, today)](t, h.color)]} />
              ))}
            </View>
            {h.parts?.length && !on ? <T w="num" style={{ fontSize: 11.5, color: t.mute }}>{`${done.length}/${h.parts.length}`}</T> : null}
            {st.done ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessibilityLabel={`قوة العادة ${Math.round(st.strength * 100)}%`}>
                <Ionicons name="pulse" size={12} color={h.color} />
                <T w="num" style={{ fontSize: 11.5, color: t.mute }}>{`${Math.round(st.strength * 100)}%`}</T>
              </View>
            ) : null}
          </View>
          {h.parts?.length && !paused && !dim ? (
            <View style={s.parts}>
              {h.parts.map((p, i) => {
                const pOn = done.includes(i);
                // An adhkar part opens its list (counted there; finishing it ticks this part).
                const ad = adhkarOf(h, i);
                const ap = ad && !pOn ? adhkarProgress(listFor(ad), adhkarLog[adhkarKey(today, ad)]) : null;
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      tap();
                      if (ad) router.push({ pathname: '/adhkar', params: { time: ad } });
                      else setPart(h, today, i);
                    }}
                    onLongPress={ad ? () => { tap(); setPart(h, today, i); } : undefined}
                    hitSlop={{ top: 6, bottom: 6 }}
                    accessibilityRole={ad ? 'button' : 'checkbox'}
                    accessibilityState={{ checked: pOn }}
                    accessibilityLabel={`${h.name}: ${p.name}${ap?.done ? `، ${ap.done} من ${ap.total}` : ''}`}
                    accessibilityHint={ad ? 'افتح الأذكار · دوسة طويلة تعلّم عليها' : undefined}
                    style={[s.part, ad ? s.partWide : null, pOn ? { backgroundColor: h.color, borderColor: h.color } : { borderColor: tint(h.color, 0.4) }]}>
                    {pOn ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                    <T w="semi" style={{ fontSize: 11.5, color: pOn ? '#FFFFFF' : t.fg }} numberOfLines={1}>{p.name}</T>
                    {ap?.done ? <T style={{ fontSize: 11, color: t.mute, ...font('num') }} numberOfLines={1}>{`\u2066${ap.done}/${ap.total}\u2069`}</T> : null}
                    {ad && !pOn ? <Ionicons name="chevron-back" size={12} color={t.mute} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        {h.app && canOpenApps && !paused ? (
          // Opens the habit's app (e.g. the Quran app for the wird).
          <Pressable onPress={() => { tap(); void openApp(h.app!); }} hitSlop={4} accessibilityRole="button" accessibilityLabel={`افتح التطبيق بتاع ${h.name}`} style={({ pressed }) => [s.check, { backgroundColor: tint(h.color, 0.14), opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="open-outline" size={20} color={h.color} />
          </Pressable>
        ) : null}
        {paused ? (
          <View style={[s.check, { backgroundColor: t.soft }]}>
            <Ionicons name="pause" size={20} color={t.mute} />
          </View>
        ) : mark === 'skip' ? (
          <Pressable onPress={excuse} onLongPress={excuse} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${h.name}: معذور النهارده، دوس ترجعها`} style={[s.check, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: h.color }]}>
            <T w="semi" style={{ fontSize: 10.5, color: h.color }}>معذور</T>
          </Pressable>
        ) : (
          <Pressable onPress={toggle} onLongPress={excuse} delayLongPress={450} hitSlop={4} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`عملت ${h.name}`} accessibilityHint="دوسة طويلة: معذور النهارده">
            <Animated.View style={[s.check, { transform: [{ scale: pop }] }, on ? { backgroundColor: h.color } : { backgroundColor: t.soft }]}>
              <Ionicons name="checkmark" size={24} color={on ? '#FFFFFF' : t.mute} />
            </Animated.View>
          </Pressable>
        )}
      </Card>
    </Pressable>
    </View>
    </Swipe>
    {editing ? <HabitForm visible habit={h} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  swipe: { borderRadius: 12, overflow: 'hidden' },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 3 },
  arrow: { width: 40, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  check: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  parts: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  part: { borderWidth: 1.2, borderRadius: 999, paddingHorizontal: 9, height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  partWide: { height: 28, paddingHorizontal: 11, flexShrink: 0 },
  risk: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 60, paddingHorizontal: 12 },
  emptyIcon: { width: 84, height: 84, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
