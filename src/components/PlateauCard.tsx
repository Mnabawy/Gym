import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { Plateau } from '../lib/plateau';
import { useSettings } from '../lib/settings';
import { useTheme } from '../theme';
import { Btn, Card, T } from './ui';

/** The plateau detector's finding (src/lib/plateau.ts): which lifts are stuck, why, and the one thing to do. */
export function PlateauCard({ p }: { p: Plateau }) {
  const t = useTheme();
  const startDeload = useSettings((s) => s.startDeload);
  return (
    <Card style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="pause-circle-outline" size={18} color={t.warn} />
        <T w="bold" style={{ flex: 1, fontSize: 15 }}>{p.title}</T>
      </View>
      <T style={{ fontSize: 13 }}>{p.body}</T>
      {p.cause === 'fatigue' ? <Btn label="ابدأ أسبوع خفيف" kind="solid" onPress={startDeload} /> : null}
      {p.cause === 'attendance' ? <Btn label="اعمل برنامج بأيام أقل" onPress={() => router.push('/setup')} /> : null}
      {p.cause === 'cut' ? <Btn label="احسب سعراتك" onPress={() => router.push('/calories')} /> : null}
    </Card>
  );
}
