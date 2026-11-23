import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { WEEKDAYS_AR } from '../data/program';
import { Card, Pill, Row, Sep, Stepper, SwitchRow, T } from './ui';
import { useSettings } from '../lib/settings';
import { allowReminders } from '../lib/reminder';
import { timeAr, toggleDay, WEEK } from '../lib/settingsView';
import { useTheme } from '../theme';

const phone = Platform.OS !== 'web';

/** Settings' notifications card: morning brief, workout reminder, training days. */
export function NotifySettings() {
  const t = useTheme();
  const st = useSettings();
  const [denied, setDenied] = useState(false);
  return (
    <Card>
      <SwitchRow
        label="ملخص الصبح"
        sub={phone ? 'كل يوم الصبح: التمرين أو الراحة، الوجبات ومواعيدها، المية، واللي تجهّزه' : 'على الموبايل بس'}
        value={st.brief}
        disabled={!phone}
        onChange={async (v) => {
          const ok = !v || (await allowReminders());
          setDenied(!ok);
          if (ok) st.setQuiet({ brief: v });
        }}
      />
      {st.brief ? (
        <Row label="ميعاد الملخص">
          <Stepper value={st.briefTime} min={0} max={24 * 60 - 15} step={15} onChange={(v) => st.setQuiet({ briefTime: v })} label="ميعاد الملخص" format={timeAr} />
        </Row>
      ) : null}
      <Sep />
      <SwitchRow
        label="فكّرني بالتمرين"
        sub={phone ? 'إشعار في الميعاد فيه اسم التمرين اللي عليه الدور، ومش بيجي لو اتمرنت النهارده' : 'على الموبايل بس'}
        value={st.reminder}
        disabled={!phone}
        onChange={async (v) => {
          const ok = !v || (await allowReminders());
          setDenied(!ok);
          if (ok) st.setQuiet({ reminder: v });
        }}
      />
      {st.reminder ? (
        <Row label="ميعاد التمرين">
          <Stepper value={st.reminderTime} min={0} max={24 * 60 - 15} step={15} onChange={(v) => st.setQuiet({ reminderTime: v })} label="ميعاد التذكير" format={timeAr} />
        </Row>
      ) : null}
      {denied ? <T style={{ color: t.bad, fontSize: 12.5, paddingHorizontal: 14, paddingBottom: 10 }}>اسمح للتطبيق بالإشعارات من إعدادات الموبايل الأول</T> : null}
      {st.reminder || st.brief ? (
        <>
          <Sep />
          <View style={{ padding: 14, gap: 10 }}>
            <T w="medium">أيام التمرين</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {WEEK.map((wd) => (
                <Pill key={wd} label={WEEKDAYS_AR[wd]} on={st.reminderDays.includes(wd)} onPress={() => st.setQuiet({ reminderDays: toggleDay(st.reminderDays, wd) })} />
              ))}
            </View>
          </View>
        </>
      ) : null}
    </Card>
  );
}
