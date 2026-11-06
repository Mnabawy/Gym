import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, T } from './ui';
import { ACCENT_PRESETS, normHex } from '../lib/color';
import { DEFAULT_SETTINGS, useSettings } from '../lib/settings';
import { F, useTheme } from '../theme';

/** Settings → لون التطبيق: type any hex color (or tap a ready one) and it becomes the app's color everywhere. */
export function AccentPicker() {
  const t = useTheme();
  const accent = useSettings((s) => s.accent);
  const set = useSettings((s) => s.setQuiet);
  const [text, setText] = useState(accent);
  const typed = normHex(text);
  const bad = text.trim() !== '' && !typed;

  const apply = (hex: string) => {
    setText(hex);
    set({ accent: hex });
  };

  return (
    <Card style={{ padding: 14, gap: 12 }}>
      <T style={{ fontSize: 12.5, color: t.mute, lineHeight: 19 }}>اكتب كود أي لون (زي #2563EB) أو اختار واحد، وهيتطبق على الزراير وعلامات ✓ والدواير في التطبيق كله</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[s.preview, { backgroundColor: typed ?? (accent || t.ok), borderColor: t.line }]}>
          {bad ? <Ionicons name="help" size={20} color="#FFFFFF" /> : null}
        </View>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            const h = normHex(v);
            if (h) set({ accent: h });
          }}
          placeholder="#RRGGBB"
          placeholderTextColor={t.mute}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          accessibilityLabel="كود اللون"
          style={[s.input, { color: t.fg, backgroundColor: t.soft, borderColor: bad ? t.bad : 'transparent', fontFamily: F.num }]}
        />
        {accent !== DEFAULT_SETTINGS.accent ? <Btn label="الأصلي" onPress={() => apply(DEFAULT_SETTINGS.accent)} /> : null}
      </View>
      {bad ? <T style={{ fontSize: 12, color: t.bad }}>الكود لازم يبقى 3 أو 6 حروف/أرقام من 0-9 و A-F</T> : null}
      <View style={s.grid}>
        {ACCENT_PRESETS.map((c) => {
          const on = accent === c;
          return (
            <Pressable key={c} onPress={() => apply(c)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`لون ${c}`} style={[s.swatch, { backgroundColor: c, borderColor: on ? t.fg : 'transparent' }]}>
              {on ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  preview: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minWidth: 0, height: 44, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, fontSize: 16, textAlign: 'left', writingDirection: 'ltr', outlineWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
