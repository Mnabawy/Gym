import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Pill, Sheet, T } from './ui';
import { longest, runLabel, TRIGGERS, URGE_MINUTES, type Quit, type Trigger } from '../lib/quit';
import { addSlip, addUrge } from '../lib/quitStore';
import { useNow } from '../lib/useNow';
import { useReducedMotion } from '../lib/motion';
import { tap } from '../lib/timer';
import { F, tint, useTheme } from '../theme';

const stamp = () => Date.now();
const INHALE = 4000;
const EXHALE = 6000;

function TriggerPicks({ value, onChange, light }: { value: Trigger | undefined; onChange: (v: Trigger | undefined) => void; light?: boolean }) {
  return (
    <View style={s.grid}>
      {(Object.keys(TRIGGERS) as Trigger[]).map((k) =>
        light ? (
          <Pressable key={k} onPress={() => onChange(value === k ? undefined : k)} accessibilityRole="button" accessibilityState={{ selected: value === k }} style={[s.chip, { backgroundColor: value === k ? '#FFFFFF' : 'rgba(255,255,255,0.1)' }]}>
            <T w="semi" style={{ fontSize: 13, color: value === k ? '#1B1530' : '#FFFFFF' }}>{TRIGGERS[k]}</T>
          </Pressable>
        ) : (
          <Pill key={k} label={TRIGGERS[k]} on={value === k} onPress={() => onChange(value === k ? undefined : k)} />
        ),
      )}
    </View>
  );
}

/**
 * "جالي إلحاح": a calm full screen for riding out an urge — a circle that breathes with you (in 4 s, out 6 s),
 * 15 minutes counting down, your reason and what you do instead. Ends with "عدّت" (you resisted) or "وقعت".
 */
export function UrgeScreen({ q, onClose, onSlip }: { q: Quit; onClose: () => void; onSlip: () => void }) {
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [startedAt] = useState(stamp);
  const now = useNow(1000);
  const [trigger, setTrigger] = useState<Trigger | undefined>();
  const [breath] = useState(() => new Animated.Value(0));
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const left = Math.max(0, URGE_MINUTES * 60 - Math.floor((now - startedAt) / 1000));

  useEffect(() => {
    if (reduce) return;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      setPhase('in');
      Animated.timing(breath, { toValue: 1, duration: INHALE, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start(() => {
        if (!alive) return;
        setPhase('out');
        Animated.timing(breath, { toValue: 0, duration: EXHALE, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start(loop);
      });
    };
    loop();
    return () => {
      alive = false;
      breath.stopAnimation();
    };
  }, [breath, reduce]);

  const done = (resisted: boolean) => {
    tap();
    addUrge(q, { at: stamp(), resisted, ...(trigger ? { trigger } : {}) });
    if (resisted) onClose();
    else onSlip();
  };
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] });
  const glowOp = breath.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[s.urge, { paddingTop: inset.top + 12, paddingBottom: inset.bottom + 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T w="semi" style={{ flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>الرغبة بتعلى وتهدى لوحدها. خليك معايا شوية</T>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="اقفل" style={s.x}>
            <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', justifyContent: 'center', height: 290 }}>
          <Animated.View style={[s.halo, { backgroundColor: q.color, opacity: glowOp, transform: [{ scale }] }]} />
          <Animated.View style={[s.ball, { backgroundColor: tint(q.color, 0.9), transform: [{ scale }] }]}>
            <T w="bold" style={{ color: '#FFFFFF', fontSize: 22 }}>{reduce ? 'اتنفّس ببطء' : phase === 'in' ? 'شهيق' : 'زفير'}</T>
          </Animated.View>
        </View>

        <T w="numBold" style={{ color: '#FFFFFF', fontSize: 46, textAlign: 'center', letterSpacing: 2 }}>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</T>
        <T style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' }}>{left ? 'استنى لحد ما العداد يخلص' : 'العداد خلص. الرغبة هديت؟'}</T>

        {q.why ? (
          <View style={s.card}>
            <T style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>ليه بطّلت</T>
            <T w="semi" style={{ color: '#FFFFFF', fontSize: 16, lineHeight: 25 }}>{q.why}</T>
          </View>
        ) : null}
        {q.replace ? (
          <View style={s.card}>
            <T style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>اعمل دي بدالها</T>
            <T w="semi" style={{ color: '#FFFFFF', fontSize: 16, lineHeight: 25 }}>{q.replace}</T>
          </View>
        ) : null}

        <T style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5 }}>إيه اللي جابها؟ (اختياري)</T>
        <TriggerPicks value={trigger} onChange={setTrigger} light />

        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => done(false)} accessibilityRole="button" style={({ pressed }) => [s.btn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', opacity: pressed ? 0.7 : 1 }]}>
            <T w="semi" style={{ color: '#FFFFFF', fontSize: 15 }}>وقعت</T>
          </Pressable>
          <Pressable onPress={() => done(true)} accessibilityRole="button" style={({ pressed }) => [s.btn, { flex: 2, backgroundColor: '#FFFFFF', opacity: pressed ? 0.8 : 1 }]}>
            <T w="bold" style={{ color: '#1B1530', fontSize: 16 }}>عدّت ✓ قاومت</T>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const WHEN = [
  { label: 'دلوقتي', h: 0 },
  { label: 'من ساعة', h: 1 },
  { label: 'من 3 ساعات', h: 3 },
  { label: 'امبارح', h: 24 },
];

/** Log a slip: when, what set it off, a note. No judging: your longest run stays, and the count starts again now. */
export function SlipSheet({ q, onClose }: { q: Quit; onClose: () => void }) {
  const t = useTheme();
  const [trigger, setTrigger] = useState<Trigger | undefined>();
  const [note, setNote] = useState('');
  const [h, setH] = useState(0);
  const now = useNow(60000);
  const save = () => {
    tap();
    const at = Math.max(q.start + 1, stamp() - h * 3600000);
    addSlip(q, { at, ...(trigger ? { trigger } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title="وقعت؟ عادي، كمّل" sub={`وقعة واحدة مش نهاية الطريق. أطول مدة ليك (${runLabel(longest(q, now))}) محفوظة، والعداد هيبدأ من جديد`}>
      <T w="medium" style={{ fontSize: 13.5 }}>امتى؟</T>
      <View style={s.grid}>{WHEN.map((w) => <Pill key={w.h} label={w.label} on={h === w.h} onPress={() => setH(w.h)} />)}</View>
      <T w="medium" style={{ fontSize: 13.5 }}>إيه اللي جابها؟</T>
      <TriggerPicks value={trigger} onChange={setTrigger} />
      <TextInput value={note} onChangeText={setNote} placeholder="حاجة تتعلم منها المرة الجاية (اختياري)" placeholderTextColor={t.mute} maxLength={120} accessibilityLabel="ملاحظة" style={[s.input, { color: t.fg, backgroundColor: t.soft, fontFamily: F.body }]} />
      <Btn label="سجّل وابدأ من جديد" kind="solid" onPress={save} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  urge: { flex: 1, backgroundColor: '#14101F', paddingHorizontal: 20, gap: 12 },
  x: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 270, height: 270, borderRadius: 135 },
  ball: { width: 200, height: 200, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 12, gap: 2 },
  btn: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 14.5, textAlign: 'right', outlineWidth: 0 },
});
