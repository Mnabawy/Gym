import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Btn, Card, Label, Row, Screen, Sep, T } from '../components/ui';
import { CloudField } from '../components/CloudField';
import { cloudOn, getSession, signIn, signOut, signUp } from '../lib/cloud';
import { confirm } from '../lib/confirm';
import { planLine } from '../lib/generator';
import { storage } from '../lib/storage';
import { becomeCoach, joinCoach, myProfile, pendingPlan, restoreFromCloud, setName, syncUp, SYNC_AT_KEY, SYNC_ERROR_KEY, takePlan, type PlanRow, type Profile } from '../lib/sync';
import type { Template } from '../data/program';
import { useTheme } from '../theme';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : 'لسه');
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * الحساب: sign in to keep a copy of your data online (src/lib/sync.ts), move it to a new phone, join a coach with
 * their code and take the plans they send, or become a coach. Hidden from settings when the build has no cloud.
 */
export default function AccountScreen() {
  const t = useTheme();
  const [session, setSession] = useState(getSession);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<{ row: PlanRow; template: Template } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setNameText] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [syncAt, setSyncAt] = useState(() => storage.getMeta(SYNC_AT_KEY));

  const refresh = useCallback(async () => {
    if (!getSession()) return;
    try {
      const p = await myProfile();
      setProfile(p);
      setNameText(p.name);
      setPlan(p.coach_id ? await pendingPlan() : null);
    } catch (e) {
      setMsg({ text: errText(e), bad: true });
      if (!getSession()) setSession(null);
    }
  }, []);
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    // Once per signed-in account: its profile and any plan waiting.
    const id = session?.user.id ?? null;
    if (!id || loaded === id) return;
    const t = setTimeout(() => {
      setLoaded(id);
      void refresh();
    }, 0);
    return () => clearTimeout(t);
  }, [session, loaded, refresh]);

  /** Runs `f` with the buttons off; its text (or error) shows under them. */
  const run = async (f: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const text = await f();
      if (text) setMsg({ text });
    } catch (e) {
      setMsg({ text: errText(e), bad: true });
    } finally {
      setBusy(false);
    }
  };

  if (!cloudOn()) {
    return (
      <Screen title="الحساب" onBack={() => router.back()}>
        <T style={{ color: t.mute }}>الحساب مش متفعّل في النسخة دي. كل بياناتك محفوظة على الموبايل.</T>
      </Screen>
    );
  }

  if (!session) {
    const go = (create: boolean) =>
      run(async () => {
        if (!email.trim() || password.length < 8) throw new Error('اكتب الإيميل وباسورد 8 حروف أو أكتر');
        const s = create ? await signUp(email, password) : await signIn(email, password);
        if (!s) return 'بعتنالك إيميل تأكيد. أكّده وبعدين سجّل دخول.';
        setSession(s);
        if (create && name.trim()) await myProfile(name.trim());
        await syncUp();
        setSyncAt(storage.getMeta(SYNC_AT_KEY));
      });
    return (
      <Screen title="الحساب" sub="نسخة من بياناتك أونلاين، وتقدر تشتغل مع كوتش" onBack={() => router.back()}>
        <Card style={{ padding: 12, gap: 8 }}>
          <CloudField value={email} onChangeText={setEmail} placeholder="الإيميل" autoCapitalize="none" autoComplete="email" keyboardType="email-address" ltr accessibilityLabel="الإيميل" />
          <CloudField value={password} onChangeText={setPassword} placeholder="الباسورد (8 حروف أو أكتر)" secureTextEntry autoComplete="password" ltr accessibilityLabel="الباسورد" />
          <CloudField value={name} onChangeText={setNameText} placeholder="اسمك (للحساب الجديد، الكوتش بيشوفه)" maxLength={60} accessibilityLabel="اسمك" />
          <Btn label={busy ? '...' : 'سجّل دخول'} kind="solid" onPress={() => void go(false)} />
          <Btn label="حساب جديد" onPress={() => void go(true)} />
          {msg ? <T style={{ fontSize: 13, color: msg.bad ? t.bad : t.okText }}>{msg.text}</T> : null}
        </Card>
        <T style={{ color: t.mute, fontSize: 12 }}>من غير حساب التطبيق شغال عادي وكل حاجة على الموبايل.</T>
      </Screen>
    );
  }

  const err = storage.getMeta(SYNC_ERROR_KEY);
  return (
    <Screen title="الحساب" sub={session.user.email} onBack={() => router.back()}>
      {plan ? (
        <Card style={{ padding: 12, gap: 6 }}>
          <T w="bold" style={{ fontSize: 15 }}>الكوتش بعتلك برنامج</T>
          <T style={{ fontSize: 13 }}>{planLine(plan.template)}</T>
          {plan.row.note ? <T style={{ fontSize: 13, color: t.mute }}>{plan.row.note}</T> : null}
          <Btn
            label="خده"
            kind="solid"
            onPress={() =>
              void run(async () => {
                if (!(await confirm({ title: 'تبدأ برنامج الكوتش؟', body: 'برنامجك الحالي هيتشال. كل اللي سجلته بيفضل.', confirmLabel: 'ابدأ' }))) return;
                await takePlan(plan);
                setPlan(null);
                return 'البرنامج الجديد شغال من التمرين الجاي.';
              })
            }
          />
        </Card>
      ) : null}

      <Label>بياناتك</Label>
      <Card>
        <Row label="آخر مزامنة" sub={err ? `ما اتبعتتش: ${err}` : 'بتتبعت لوحدها لما تفتح التطبيق'}>
          <T style={{ fontSize: 12.5, color: t.mute }}>{when(syncAt)}</T>
        </Row>
        <Sep />
        <View style={{ padding: 12, gap: 8 }}>
          <Btn label="زامن دلوقتي" kind="solid" onPress={() => void run(async () => { const ok = await syncUp(); setSyncAt(storage.getMeta(SYNC_AT_KEY)); return ok ? 'اتبعتت ✓' : storage.getMeta(SYNC_ERROR_KEY) ?? ''; })} />
          <Btn
            label="رجّع بياناتك من الحساب"
            onPress={() =>
              void run(async () => {
                if (!(await confirm({ title: 'ترجّع البيانات من الحساب؟', body: 'اللي على الموبايل هيتبدّل بالنسخة اللي على الحساب (بيتعمل نسخة أمان الأول). مفيد لو موبايل جديد.', confirmLabel: 'رجّع' }))) return;
                return (await restoreFromCloud()) ? 'رجعت ✓' : 'مفيش نسخة على الحساب لسه';
              })
            }
          />
        </View>
      </Card>

      <Label>اسمك</Label>
      <Card style={{ padding: 12, gap: 8 }}>
        <CloudField value={name} onChangeText={setNameText} placeholder="اسمك" maxLength={60} accessibilityLabel="اسمك" />
        <Btn label="احفظ الاسم" onPress={() => void run(async () => { await setName(name); return 'اتحفظ ✓'; })} />
      </Card>

      {profile?.role === 'coach' ? (
        <>
          <Label>أنت كوتش</Label>
          <Card>
            <Row label="كود العملاء" sub="ابعته لعملائك يكتبوه في صفحة الحساب">
              <T w="numBold" style={{ fontSize: 18, letterSpacing: 2 }}>{profile.invite_code ?? ''}</T>
            </Row>
            <Sep />
            <View style={{ padding: 12 }}>
              <Btn label="افتح لوحة الكوتش" kind="solid" onPress={() => router.push('/coach')} />
            </View>
          </Card>
        </>
      ) : (
        <>
          <Label>الكوتش</Label>
          <Card style={{ padding: 12, gap: 8 }}>
            {profile?.coach_id ? (
              <>
                <T style={{ fontSize: 13 }}>انت مربوط بكوتش: بيشوف ملخص تمرينك وأكلك (مش كل التفاصيل) ويقدر يبعتلك برنامج.</T>
                <Btn label="سيب الكوتش" kind="danger" onPress={() => void run(async () => { if (!(await confirm({ title: 'تسيب الكوتش؟', confirmLabel: 'سيبه', danger: true }))) return; await joinCoach(null); await refresh(); return 'اتشال ✓'; })} />
              </>
            ) : (
              <>
                <CloudField value={code} onChangeText={setCode} placeholder="كود الكوتش" autoCapitalize="characters" maxLength={6} ltr accessibilityLabel="كود الكوتش" />
                <Btn
                  label="اربطني بالكوتش"
                  kind="solid"
                  onPress={() =>
                    void run(async () => {
                      const coach = await joinCoach(code);
                      if (coach == null) throw new Error('الكود ده مش صح');
                      await syncUp();
                      await refresh();
                      return coach ? `اتربطت بـ ${coach} ✓` : 'اتربطت ✓';
                    })
                  }
                />
              </>
            )}
            <Btn label="أنا كوتش" onPress={() => void run(async () => { if (!(await confirm({ title: 'تبقى كوتش؟', body: 'هتاخد كود تبعته لعملائك، وتشوف ملخصهم وتبعتلهم برامج.', confirmLabel: 'أيوه' }))) return; await becomeCoach(); await refresh(); })} />
          </Card>
        </>
      )}

      {msg ? <T style={{ fontSize: 13, color: msg.bad ? t.bad : t.okText }}>{msg.text}</T> : null}
      <Btn label="اخرج من الحساب" kind="danger" onPress={() => void run(async () => { if (!(await confirm({ title: 'تخرج من الحساب؟', body: 'بياناتك على الموبايل بتفضل زي ما هي.', confirmLabel: 'اخرج' }))) return; await signOut(); setSession(null); setProfile(null); setLoaded(null); })} />
    </Screen>
  );
}
