import React, { useState } from 'react';
import { Item } from '../../components/Motion';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Screen, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { QuitForm } from '../../components/QuitForm';
import { ACTION, Swipe } from '../../components/Swipe';
import { NightCard, QuitCard } from '../../components/QuitHero';
import { PasswordModal, SlipSheet, UrgeScreen } from '../../components/QuitSheets';
import { useDataVersion } from '../../lib/bus';
import { deleteQuit, readQuits } from '../../lib/quitStore';
import { confirm } from '../../lib/confirm';
import { type Quit } from '../../lib/quit';
import { useNow } from '../../lib/useNow';
import { ThemeProvider, useTheme, useWarm } from '../../theme';

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

  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');

  const openQuit = (q: Quit) => {
    if (q.password) {
      setPasswordFor(q.id);
      setPasswordInput('');
    } else {
      router.push(`/quit/${q.id}`);
    }
  };

  const remove = async (q: Quit) => {
    if (await confirm({ title: 'تمسحها؟', body: 'هتتشال هي وكل اللي اتسجل فيها.', confirmLabel: 'امسح', danger: true })) deleteQuit(q.id);
  };

  const checkPassword = () => {
    const q = quits.find((x) => x.id === passwordFor);
    if (q && q.password === passwordInput) {
      const quitId = passwordFor;
      setPasswordFor(null);
      router.push(`/quit/${quitId}`);
    }
  };

  return (
    <Screen title="بطّل" action={<MenuButton />}>
      {adding ? <QuitForm onClose={() => setAdding(false)} onSaved={(q) => router.push(`/quit/${q.id}`)} /> : null}
      {urge ? <UrgeScreen q={urge} onClose={() => setUrge(null)} onSlip={() => { setSlip(urge); setUrge(null); }} /> : null}
      {slip ? <SlipSheet q={slip} onClose={() => setSlip(null)} /> : null}
      {passwordFor ? <PasswordModal quitId={passwordFor} password={passwordInput} onPasswordChange={setPasswordInput} onConfirm={checkPassword} onClose={() => setPasswordFor(null)} /> : null}

      {!quits.length ? (
        <NightCard color={t.sec.quit} style={{ alignItems: 'center', gap: 8, paddingVertical: 21 }}>
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
          {quits.map((q) => (
            <Item key={q.id}>
              {/* A protected one only gets the urge button (already on its card): slipping or deleting waits for the password. */}
              <Swipe
                style={s.swipe}
                start={[{ icon: 'pulse', label: 'إلحاح', color: ACTION.purple, onPress: () => setUrge(q) }]}
                end={q.password ? [] : [
                  { icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => void remove(q) },
                  { icon: 'arrow-down-circle-outline', label: 'وقعت', color: ACTION.orange, onPress: () => setSlip(q) },
                ]}>
                <QuitCard q={q} now={now} onOpen={() => openQuit(q)} onUrge={() => setUrge(q)} />
              </Swipe>
            </Item>
          ))}
          <Btn label="+ عادة تانية" onPress={() => setAdding(true)} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  swipe: { borderRadius: 12, overflow: 'hidden' },
  big: { width: 76, height: 76, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cta: { alignSelf: 'stretch', height: 52, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
