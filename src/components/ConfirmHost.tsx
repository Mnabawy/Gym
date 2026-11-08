import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Btn, T } from './ui';
import { useConfirm } from '../lib/confirm';
import { tap } from '../lib/timer';
import { useTheme } from '../theme';

/** Renders the global confirm dialog. Mounted once in the root layout; driven by `confirm(...)` / `useConfirm`. */
export function ConfirmHost() {
  const t = useTheme();
  const opts = useConfirm((s) => s.opts);
  const answer = useConfirm((s) => s.answer);
  const close = (ok: boolean) => {
    tap();
    answer(ok);
  };
  return (
    <Modal visible={!!opts} transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(false)}>
      <Pressable style={s.back} onPress={() => close(false)} accessibilityLabel="قفل">
        <Pressable accessibilityViewIsModal onPress={() => {}} style={[s.pop, { backgroundColor: t.card, boxShadow: '0px 12px 36px rgba(0, 0, 0, 0.25)' }]}>
          <T w="bold" style={{ fontSize: 16 }}>{opts?.title}</T>
          {opts?.body ? <T style={{ fontSize: 14, lineHeight: 23, color: t.mute }}>{opts.body}</T> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="لا" onPress={() => close(false)} style={{ flex: 1 }} />
            <Btn label={opts?.confirmLabel ?? 'تمام'} kind={opts?.danger ? 'dangerSolid' : 'solid'} onPress={() => close(true)} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  pop: { width: '100%', maxWidth: 420, borderRadius: 12, padding: 14, gap: 8 },
});
