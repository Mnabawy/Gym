import React from 'react';
import { Platform } from 'react-native';
import { Card, SwitchRow } from './ui';
import { useSettings } from '../lib/settings';

const phone = Platform.OS !== 'web';

/** Settings' «عام» card: haptics. */
export function GeneralSettings() {
  const st = useSettings();
  return (
    <Card>
      <SwitchRow label="اهتزاز خفيف" sub={phone ? 'مع ✓ ولما الراحة تخلص' : 'على الموبايل بس'} value={st.haptics} onChange={(v) => st.update({ haptics: v })} />
    </Card>
  );
}
