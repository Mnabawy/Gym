// فضّي دماغك (/dump): write everything on your mind, one line each, then sort each line — a task (to مهامي with a
// day), a worry (let it go, or think about it Friday), an idea (kept), or done in two minutes. Why, and sources:
// src/lib/dump.ts. A nightly reminder (settings dumpRemind / dumpTime) opens this page.
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Item } from '../components/Motion';
import { ACTION, Swipe } from '../components/Swipe';
import { ClockPicker } from '../components/ClockPicker';
import { INPUT, Screen, SwitchRow, T } from '../components/ui';
import { useDataVersion } from '../lib/bus';
import { addLines, DUMP_KEY, dumpView, nextFriday, parseDump, removeItem, setKind, type DumpItem } from '../lib/dump';
import { addDays } from '../lib/gaps';
import { dateKey } from '../lib/logic';
import { allowReminders } from '../lib/reminder';
import { useSettings } from '../lib/settings';
import { storage } from '../lib/storage';
import { saveTask } from '../lib/taskStore';
import { taskId, timeAr, type Space } from '../lib/tasks';
import { tap } from '../lib/timer';
import { showUndo } from '../lib/undo';
import { font, ThemeProvider, tint, useTheme, useWarm, type Theme } from '../theme';

const stamp = () => Date.now();
const read = () => parseDump(storage.getMeta(DUMP_KEY));
const write = (list: readonly DumpItem[]) => {
  storage.setMeta(DUMP_KEY, JSON.stringify(list));
  useDataVersion.getState().bump();
};

export default function DumpScreen() {
  return (
    <ThemeProvider value={useWarm()}>
      <Dump />
    </ThemeProvider>
  );
}

function Dump() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = dateKey();
  const items = read();
  const v = dumpView(items, today);
  const [text, setText] = useState('');
  const [taskFor, setTaskFor] = useState<string | null>(null);
  const [clock, setClock] = useState(false);
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const st = useSettings();
  const space: Space = storage.getMeta('taskSpace') === 'work' ? 'work' : 'personal';

  const add = () => {
    if (!text.trim()) return;
    tap();
    write(addLines(read(), text, today, stamp()));
    setText('');
    ref.current?.focus();
  };
  const undoable = (label: string, fn: (list: DumpItem[]) => DumpItem[]) => {
    const before = read();
    write(fn(before));
    showUndo(label, () => write(before));
  };
  const toTask = (x: DumpItem, due: string | null) => {
    tap();
    const before = read();
    saveTask({ id: taskId(stamp()), title: x.text, due, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: today, ...(space === 'work' ? { space } : {}) });
    write(removeItem(before, x.id));
    setTaskFor(null);
    showUndo(`راحت مهامي · ${due === today ? 'النهارده' : due ? 'بكرة' : 'من غير ميعاد'}`, () => write(before));
  };

  const sortRow = (x: DumpItem) => (
    <Item key={x.id}>
      <View style={[s.item, { backgroundColor: t.card }]}>
        <T style={{ fontSize: 15, lineHeight: 22 }}>{x.text}</T>
        {taskFor === x.id ? (
          <View style={s.chips}>
            <T style={{ fontSize: 12.5, color: t.mute }}>إمتى؟</T>
            <Chip t={t} label="النهارده" onPress={() => toTask(x, today)} />
            <Chip t={t} label="بكرة" onPress={() => toTask(x, addDays(today, 1))} />
            <Chip t={t} label="بعدين" onPress={() => toTask(x, null)} />
            <Chip t={t} label="رجوع" muted onPress={() => setTaskFor(null)} />
          </View>
        ) : (
          <View style={s.chips}>
            <Chip t={t} icon="checkbox-outline" label="مهمة" onPress={() => setTaskFor(x.id)} />
            <Chip t={t} icon="cloud-outline" label="قلق" onPress={() => { tap(); undoable('اتحط في القلق', (l) => setKind(l, x.id, 'worry')); }} />
            <Chip t={t} icon="bulb-outline" label="فكرة" onPress={() => { tap(); undoable('اتحفظت في أفكارك', (l) => setKind(l, x.id, 'idea')); }} />
            <Chip t={t} icon="flash-outline" label="عملتها (دقيقتين)" onPress={() => { tap(); undoable('برافو، خلصت ✓', (l) => removeItem(l, x.id)); }} />
          </View>
        )}
      </View>
    </Item>
  );

  const worryRow = (x: DumpItem, later: boolean) => (
    <Item key={x.id}>
      <Swipe end={[{ icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => undoable('اتمسحت', (l) => removeItem(l, x.id)) }]} style={s.swipe}>
        <View style={[s.item, { backgroundColor: t.card }]}>
          <T style={{ fontSize: 15, lineHeight: 22, color: later ? t.mute : t.fg }}>{x.text}</T>
          {later ? (
            <T style={{ fontSize: 12, color: t.mute }}>{`هتفكر فيه ${x.day === nextFriday(today) ? 'الجمعة' : x.day}`}</T>
          ) : (
            <View style={s.chips}>
              <Chip t={t} icon="leaf-outline" label="مش في إيدي، سيبه" onPress={() => { tap(); undoable('سيبته 🍃', (l) => removeItem(l, x.id)); }} />
              <Chip t={t} icon="calendar-outline" label="أفكر فيه الجمعة" onPress={() => { tap(); undoable('هيرجعلك الجمعة', (l) => setKind(l, x.id, 'worry', nextFriday(today))); }} />
              <Chip t={t} icon="checkbox-outline" label="ليه حل؟ مهمة" onPress={() => toTask(x, addDays(today, 1))} />
            </View>
          )}
        </View>
      </Swipe>
    </Item>
  );

  const ideaRow = (x: DumpItem) => (
    <Item key={x.id}>
      <Swipe
        style={s.swipe}
        start={[{ icon: 'checkbox-outline', label: 'مهمة', color: ACTION.blue, onPress: () => toTask(x, null) }]}
        end={[{ icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => undoable('اتمسحت', (l) => removeItem(l, x.id)) }]}>
        <View style={[s.idea, { backgroundColor: t.card }]}>
          <Ionicons name="bulb-outline" size={16} color="#E0A030" />
          <T style={{ flex: 1, fontSize: 14.5 }}>{x.text}</T>
        </View>
      </Swipe>
    </Item>
  );

  return (
    <Screen title="فضّي دماغك" sub="اكتب كل اللي في دماغك سطر سطر، من غير ترتيب. بعدين رتّبه" onBack={() => router.back()}>
      {/* Capture: one line each; several lines at once become several items. */}
      <View style={[s.write, { backgroundColor: t.card }]}>
        <TextInput
          ref={ref}
          value={text}
          onChangeText={setText}
          placeholder={'إيه اللي شاغلك؟\nمهمة، قلق، فكرة… أي حاجة'}
          placeholderTextColor={t.mute}
          multiline
          blurOnSubmit={false}
          onSubmitEditing={add}
          accessibilityLabel="اكتب اللي في دماغك"
          style={[INPUT, s.input, { color: t.fg, ...font('body') }]}
        />
        <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="ضيف" style={({ pressed }) => [s.addBtn, { backgroundColor: text.trim() ? t.ok : tint(t.fg, 0.08), opacity: pressed ? 0.8 : 1 }]}>
          <Ionicons name="arrow-down" size={20} color={text.trim() ? t.onOk : t.mute} />
        </Pressable>
      </View>

      {v.unsorted.length ? (
        <>
          <T w="semi" style={{ fontSize: 13, color: t.mute, marginTop: 6 }}>{`رتّبهم · ${v.unsorted.length}`}</T>
          {v.unsorted.map(sortRow)}
        </>
      ) : items.length ? (
        <View style={[s.calm, { backgroundColor: tint(t.green, 0.1) }]}>
          <Ionicons name="checkmark-circle" size={20} color={t.green} />
          <T style={{ flex: 1, fontSize: 14 }}>دماغك فاضي. كل حاجة ليها مكان دلوقتي</T>
        </View>
      ) : null}

      {v.worriesNow.length ? (
        <>
          <T w="semi" style={{ fontSize: 13, color: t.mute, marginTop: 6 }}>قلق محتاج قرار</T>
          {v.worriesNow.map((x) => worryRow(x, false))}
        </>
      ) : null}
      {v.worriesLater.length ? (
        <>
          <T w="semi" style={{ fontSize: 13, color: t.mute, marginTop: 6 }}>{`مستني يومه · ${v.worriesLater.length}`}</T>
          {v.worriesLater.map((x) => worryRow(x, true))}
        </>
      ) : null}
      {v.ideas.length ? (
        <>
          <T w="semi" style={{ fontSize: 13, color: t.mute, marginTop: 6 }}>{`أفكارك · ${v.ideas.length}`}</T>
          {v.ideas.map(ideaRow)}
        </>
      ) : null}

      {/* A nightly nudge: a specific to-do list at bedtime helps you fall asleep faster (sources in src/lib/dump.ts). */}
      <View style={[s.card, { backgroundColor: t.card, marginTop: 10 }]}>
        <SwitchRow
          label="فكّرني قبل النوم"
          sub="خمس دقايق تكتب فيها بكرة بالتفصيل بتساعدك تنام أسرع"
          value={st.dumpRemind}
          onChange={async (on) => {
            const ok = !on || (await allowReminders());
            st.setQuiet({ dumpRemind: on && ok });
          }}
        />
        {st.dumpRemind ? (
          <Pressable onPress={() => setClock(!clock)} accessibilityRole="button" accessibilityState={{ expanded: clock }} style={s.timeRow}>
            <Ionicons name="time-outline" size={18} color={t.okText} />
            <T style={{ flex: 1, fontSize: 15 }}>الساعة</T>
            <T w="semi" style={{ fontSize: 15, color: t.okText }}>{timeAr(st.dumpTime)}</T>
          </Pressable>
        ) : null}
        {st.dumpRemind && clock ? <ClockPicker value={st.dumpTime} onChange={(m) => st.setQuiet({ dumpTime: m })} /> : null}
      </View>
      <View style={{ height: 8 }} />
    </Screen>
  );
}

function Chip({ t, label, icon, onPress, muted }: { t: Theme; label: string; icon?: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [s.chip, { backgroundColor: muted ? t.soft : tint(t.ok, pressed ? 0.2 : 0.1) }]}>
      {icon ? <Ionicons name={icon} size={14} color={muted ? t.mute : t.okText} /> : null}
      <T w="semi" style={{ fontSize: 13, color: muted ? t.mute : t.okText }} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  write: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 12, padding: 8 },
  input: { flex: 1, minHeight: 88, maxHeight: 200, fontSize: 16, lineHeight: 24, textAlign: 'right', textAlignVertical: 'top', paddingHorizontal: 6, paddingTop: 6, outlineWidth: 0 },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  item: { borderRadius: 12, padding: 12, gap: 8 },
  swipe: { borderRadius: 12, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, borderRadius: 17, paddingHorizontal: 11 },
  idea: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  calm: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginTop: 6 },
  card: { borderRadius: 12, overflow: 'hidden' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 16 },
});
