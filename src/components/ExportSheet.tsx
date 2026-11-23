import React, { useState } from 'react';
import { View } from 'react-native';
import { ALL_EXERCISES, dayTitle } from '../data/program';
import { shareText } from '../lib/backupIO';
import { bodyCsv, setsCsv } from '../lib/csv';
import { dateKey } from '../lib/dates';
import { exerciseInfo, PAST_KEY, parsePast } from '../lib/programEdit';
import { storage } from '../lib/storage';
import { MEASURES_KEY, parseMeasures, parseWeights, WEIGHTS_KEY } from '../lib/weight';
import { useTheme } from '../theme';
import { Btn, Sheet, T } from './ui';

/** Export to spreadsheets: pick what, get a CSV file (Excel / Google Sheets) through the share sheet. */
export function ExportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const [msg, setMsg] = useState<string | null>(null);
  const today = dateKey();

  const go = async (name: string, make: () => string) => {
    setMsg(null);
    try {
      const r = await shareText(`gym-${name}-${today}.csv`, make(), 'text/csv');
      setMsg(r === 'copied' ? 'اتنسخ في الحافظة' : null);
    } catch {
      setMsg('حصلت مشكلة، جرّب تاني');
    }
  };
  const past = () => parsePast(storage.getMeta(PAST_KEY));

  return (
    <Sheet visible={visible} onClose={onClose} title="صدّر لـ Excel" sub="ملف CSV يتفتح في Excel أو Google Sheets، تحلّله أو تبعته لمدربك">
      <View style={{ gap: 8 }}>
        <Btn label="التمارين (كل مجموعة)" kind="solid" onPress={() => go('sets', () => { const p = past(); return setsCsv(storage.allSets(), (id) => exerciseInfo(id, ALL_EXERCISES, p)?.name ?? id, (wd) => dayTitle(wd)); })} />
        <Btn label="الوزن والقياسات" onPress={() => go('body', () => bodyCsv(parseWeights(storage.getMeta(WEIGHTS_KEY)), parseMeasures(storage.getMeta(MEASURES_KEY))))} />
      </View>
      {msg ? <T style={{ color: t.mute, fontSize: 12.5, textAlign: 'center' }}>{msg}</T> : null}
    </Sheet>
  );
}
