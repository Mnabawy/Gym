import React, { useState } from 'react';
import { Platform } from 'react-native';
import { Card, Sep, SwitchRow, T } from './ui';
import { useSettings } from '../lib/settings';
import { canLock, lockSupported, unlock } from '../lib/lock';
import { useTheme } from '../theme';

const phone = Platform.OS !== 'web';

/** Settings' «عام» card: app lock and haptics. */
export function GeneralSettings() {
  const t = useTheme();
  const st = useSettings();
  const [lockMsg, setLockMsg] = useState<string | null>(null);
  return (
    <Card>
      <SwitchRow
        label="قفل التطبيق"
        sub={lockSupported ? 'بالبصمة أو الوش (أو رقم الموبايل السري) لما تفتحه، أو ترجعله بعد دقيقة' : 'على الموبايل بس'}
        value={st.appLock}
        disabled={!lockSupported}
        onChange={async (v) => {
          setLockMsg(null);
          if (!v) return st.setQuiet({ appLock: false });
          if (!(await canLock())) return setLockMsg('فعّل البصمة أو قفل الشاشة في إعدادات الموبايل الأول');
          if (await unlock()) st.setQuiet({ appLock: true });
        }}
      />
      {lockMsg ? <T style={{ color: t.bad, fontSize: 12.5, paddingHorizontal: 14, paddingBottom: 10 }}>{lockMsg}</T> : null}
      <Sep />
      <SwitchRow label="اهتزاز خفيف" sub={phone ? 'مع ✓ ولما الراحة تخلص' : 'على الموبايل بس'} value={st.haptics} onChange={(v) => st.update({ haptics: v })} />
    </Card>
  );
}
