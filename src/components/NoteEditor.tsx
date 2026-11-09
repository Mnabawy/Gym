// A small notes editor (stage details): plain text, bullet points, or both. «• نقاط» turns the line under the cursor
// into a bullet (or back); Enter after a bullet starts the next one, Enter on an empty bullet ends the list.
// NoteView draws a note: paragraphs as text, bullets with a dot. Logic in src/lib/notes.ts.
import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { INPUT, T } from './ui';
import { BULLET_MARK, continueBullets, parseNote, toggleBullet } from '../lib/notes';
import { font, tint, type Theme } from '../theme';

export function NoteEditor({ t, value, onChange, placeholder }: { t: Theme; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [sel, setSel] = useState({ start: value.length, end: value.length });
  const [force, setForce] = useState<{ start: number; end: number } | undefined>(undefined);
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);

  const bullet = () => {
    const r = toggleBullet(value, sel.start);
    onChange(r.text);
    setForce({ start: r.pos, end: r.pos });
    ref.current?.focus();
  };
  const newLine = () => {
    // A new bullet on its own line at the end (handy when the keyboard is closed).
    const sep = value && !value.endsWith('\n') ? '\n' : '';
    const v = `${value}${sep}${BULLET_MARK}`;
    onChange(v);
    setForce({ start: v.length, end: v.length });
    ref.current?.focus();
  };

  return (
    <View style={[s.box, { backgroundColor: t.soft }]}>
      <View style={[s.bar, { borderColor: t.line }]}>
        <Pressable onPress={bullet} accessibilityRole="button" accessibilityLabel="خلّي السطر نقطة أو رجّعه نص" style={({ pressed }) => [s.tool, { backgroundColor: pressed ? tint(t.ok, 0.18) : tint(t.ok, 0.1) }]}>
          <Ionicons name="list" size={16} color={t.okText} />
          <T w="semi" style={{ fontSize: 13, color: t.okText }}>نقاط</T>
        </Pressable>
        <Pressable onPress={newLine} accessibilityRole="button" accessibilityLabel="نقطة جديدة" style={({ pressed }) => [s.tool, { backgroundColor: pressed ? tint(t.ok, 0.18) : tint(t.ok, 0.1) }]}>
          <Ionicons name="add" size={16} color={t.okText} />
          <T w="semi" style={{ fontSize: 13, color: t.okText }}>نقطة جديدة</T>
        </Pressable>
        <T style={{ flex: 1, fontSize: 11.5, color: t.mute, textAlign: 'left' }} numberOfLines={1}>نص عادي أو نقاط أو الاتنين</T>
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => {
          setForce(undefined);
          const next = continueBullets(value, v);
          onChange(next);
          if (next !== v) {
            const p = sel.start + 1 + (next.length - v.length);
            setForce({ start: p, end: p });
          }
        }}
        selection={force}
        onSelectionChange={(e) => {
          setSel(e.nativeEvent.selection);
          if (force) setForce(undefined);
        }}
        multiline
        maxLength={3000}
        placeholder={placeholder}
        placeholderTextColor={t.mute}
        accessibilityLabel="التفاصيل"
        style={[INPUT, s.input, { color: t.fg, ...font('body') }]}
      />
    </View>
  );
}

/** The phones already put a Latin line at the start (right) in the RTL layout; the web page needs telling. */
const START = Platform.OS === 'web' ? { textAlign: 'right' as const } : {};

/** A note drawn as paragraphs and bullet points. */
export function NoteView({ t, text, size = 13.5, color }: { t: Theme; text: string; size?: number; color?: string }) {
  const blocks = parseNote(text);
  if (!blocks.length) return null;
  const c = color ?? t.fg;
  return (
    <View style={{ gap: 3 }}>
      {blocks.map((b, i) =>
        b.kind === 'bullet' ? (
          <View key={i} style={s.bulletRow}>
            <View style={[s.dot, { backgroundColor: tint(c, 0.6), marginTop: size * 0.62 }]} />
            <T style={{ flex: 1, fontSize: size, lineHeight: size * 1.5, color: c, ...START }}>{b.text}</T>
          </View>
        ) : (
          <T key={i} style={{ fontSize: size, lineHeight: size * 1.5, color: c, ...START }}>{b.text}</T>
        ),
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: 12, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, borderRadius: 8, paddingHorizontal: 10 },
  input: { minHeight: 120, maxHeight: 260, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 15, lineHeight: 23, textAlign: 'right', textAlignVertical: 'top', outlineWidth: 0 },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
