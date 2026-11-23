import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { useTheme, font } from '../theme';
import { INPUT } from './ui';

/** A full-width text field for the account and coach pages (email, password, name, code, note). */
export function CloudField({ ltr, style, ...p }: TextInputProps & { ltr?: boolean }) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.mute}
      {...p}
      style={[
        INPUT,
        { ...font('body'), minHeight: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, backgroundColor: t.soft, color: t.fg, textAlign: ltr ? 'left' : 'right', writingDirection: ltr ? 'ltr' : 'rtl' },
        style,
      ]}
    />
  );
}
