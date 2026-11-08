import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LOCK_AFTER_MS, lockSupported, unlock } from '../lib/lock';
import { useSettings } from '../lib/settings';
import { warmDark as neon } from '../theme';
import { T } from './ui';

/**
 * Covers the whole app until you unlock it (settings → قفل التطبيق): on open, and when you come back after a minute away.
 * The fingerprint prompt opens by itself; the button asks again if you cancelled.
 */
export function AppLock() {
  const on = useSettings((s) => s.appLock) && lockSupported;
  const [locked, setLocked] = useState(on);
  const away = useRef<number | null>(null);
  const asking = useRef(false);

  const ask = async () => {
    if (asking.current) return;
    asking.current = true;
    const ok = await unlock();
    asking.current = false;
    if (ok) setLocked(false);
  };

  useEffect(() => {
    if (!on) return;
    const sub = AppState.addEventListener('change', (st) => {
      // The fingerprint prompt itself sends the app "inactive"/"background" on some phones: ignore while it's up.
      if (asking.current) return;
      if (st === 'background') away.current = Date.now();
      if (st === 'active' && away.current != null && Date.now() - away.current >= LOCK_AFTER_MS) setLocked(true);
      if (st === 'active') away.current = null;
    });
    return () => sub.remove();
  }, [on]);

  // Locked: the fingerprint prompt opens by itself.
  useEffect(() => {
    if (!on || !locked || asking.current) return;
    asking.current = true;
    unlock().then((ok) => {
      asking.current = false;
      if (ok) setLocked(false);
    });
  }, [on, locked]);

  if (!on || !locked) return null;
  // A modal, so it covers any sheet or menu that was open when the app went away.
  return (
    <Modal visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <View style={[StyleSheet.absoluteFill, s.cover]} accessibilityViewIsModal>
        <View style={[s.icon, { boxShadow: '0px 0px 36px rgba(34, 243, 228, 0.4)' }]}>
          <Ionicons name="finger-print" size={48} color={neon.ok} />
        </View>
        <T w="bold" style={{ fontSize: 20, color: neon.fg }}>التطبيق مقفول</T>
        <Pressable onPress={ask} accessibilityRole="button" style={({ pressed }) => [s.btn, { opacity: pressed ? 0.8 : 1 }]}>
          <T w="semi" style={{ fontSize: 14, color: neon.onOk }}>افتح</T>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  cover: { backgroundColor: neon.bg, alignItems: 'center', justifyContent: 'center', gap: 18, zIndex: 1000 },
  icon: { width: 96, height: 96, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(34, 243, 228, 0.45)', backgroundColor: 'rgba(34, 243, 228, 0.08)', alignItems: 'center', justifyContent: 'center' },
  btn: { height: 40, minWidth: 160, borderRadius: 10, backgroundColor: neon.ok, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
});
