import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Screen, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { QuitForm } from '../../components/QuitForm';
import { CleanRing, nextLine, NightCard } from '../../components/QuitHero';
import { UrgeScreen, SlipSheet } from '../../components/QuitSheets';
import { useDataVersion } from '../../lib/bus';
import { readQuits } from '../../lib/quitStore';
import { cleanDays, type Quit } from '../../lib/quit';
import { useNow } from '../../lib/useNow';
import { ThemeProvider, useTheme, useWarm } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function QuitSection() {
  return (
    <ThemeProvider value={useWarm()}>
      <QuitList />
    </ThemeProvider>
  );
}

/** بطّل: each bad habit you're quitting as a night card with its clean-time ring; the urge button right on it. */
function QuitList() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const now = useNow(30000);
  const quits = readQuits();
  const [adding, setAdding] = useState(false);
  const [urge, setUrge] = useState<Quit | null>(null);
  const [slip, setSlip] = useState<Quit | null>(null);

  return (
    <Screen title="بطّل" action={<MenuButton />}>
      {adding ? <QuitForm onClose={() => setAdding(false)} onSaved={(q) => router.push(`/quit/${q.id}`)} /> : null}
      {urge ? <UrgeScreen q={urge} onClose={() => setUrge(null)} onSlip={() => { setSlip(urge); setUrge(null); }} /> : null}
      {slip ? <SlipSheet q={slip} onClose={() => setSlip(null)} /> : null}

      {!quits.length ? (
        <NightCard color={t.sec.quit} style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
          <View style={[s.big, { backgroundColor: `${t.sec.quit}33`, borderColor: t.sec.quit }]}>
            <Ionicons name="hand-left" size={36} color="#FFFFFF" />
          </View>
          <T w="bold" style={{ color: '#FFFFFF', fontSize: 21, textAlign: 'center' }}>عايز تبطّل إيه؟</T>
          <T style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 22 }}>
            {'عداد بيعدّ كل ثانية نضيفة، ومحطات تفرح بيها،\nوزرار لما الرغبة تيجي يقعد معاك 15 دقيقة لحد ما تعدّي،\nوبيعرّفك إيه اللي بيضعّفك وامتى.'}
          </T>
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={({ pressed }) => [s.cta, { opacity: pressed ? 0.85 : 1 }]}>
            <T w="bold" style={{ color: '#17122A', fontSize: 16 }}>ابدأ</T>
          </Pressable>
        </NightCard>
      ) : (
        <>
          {quits.map((q) => {
            const d = cleanDays(q, now);
            return (
              <NightCard key={q.id} color={q.color} style={{ gap: 14 }}>
                  <Pressable onPress={() => router.push(`/quit/${q.id}`)} accessibilityRole="button" accessibilityLabel={q.name} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, opacity: pressed ? 0.8 : 1 })}>
                    <CleanRing q={q} now={now} size={96} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name={q.icon as IconName} size={16} color={q.color} />
                        <T w="bold" style={{ color: '#FFFFFF', fontSize: 17, flex: 1 }} numberOfLines={1}>{q.name}</T>
                      </View>
                      <T style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>{nextLine(q, now)}</T>
                      <T style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{`${Math.round(d.rate * 100)}% أيام نضيفة`}</T>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => setUrge(q)} accessibilityRole="button" accessibilityLabel={`جالي إلحاح: ${q.name}`} style={({ pressed }) => [s.urge, { backgroundColor: q.color, boxShadow: `0px 0px 18px ${q.color}88`, opacity: pressed ? 0.85 : 1 }]}>
                    <Ionicons name="pulse" size={18} color="#FFFFFF" />
                    <T w="bold" style={{ color: '#FFFFFF', fontSize: 15 }}>جالي إلحاح</T>
                  </Pressable>
              </NightCard>
            );
          })}
          <Btn label="+ عادة تانية" onPress={() => setAdding(true)} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  big: { width: 76, height: 76, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cta: { alignSelf: 'stretch', height: 52, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  urge: { flexDirection: 'row', gap: 8, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
