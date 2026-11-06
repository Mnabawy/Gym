import React, { useState } from 'react';
import { View } from 'react-native';
import { ALL_EXERCISES, dayFor } from '../data/program';
import { shareText } from '../lib/backupIO';
import { CARDIO_KEY, parseCardio } from '../lib/cardio';
import { bodyCsv, cardioCsv, habitsCsv, setsCsv } from '../lib/csv';
import { readHabitLog, readHabits } from '../lib/habitStore';
import { dateKey } from '../lib/logic';
import { exerciseInfo, PAST_KEY, parsePast } from '../lib/programEdit';
import { useSettings } from '../lib/settings';
import { storage } from '../lib/storage';
import { MEASURES_KEY, parseMeasures, parseWeights, WEIGHTS_KEY } from '../lib/weight';
import { useTheme } from '../theme';
import { Btn, Sheet, T } from './ui';

/** Export to spreadsheets: pick what, get a CSV file (Excel / Google Sheets) through the share sheet. */
export function ExportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const weight = useSettings((s) => s.body.weight);
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
        <Btn label="التمارين (كل مجموعة)" kind="solid" onPress={() => go('sets', () => { const p = past(); return setsCsv(storage.allSets(), (id) => exerciseInfo(id, ALL_EXERCISES, p)?.name ?? id, (wd) => dayFor(wd)?.titleAr ?? ''); })} />
        <Btn label="الوزن والقياسات" onPress={() => go('body', () => bodyCsv(parseWeights(storage.getMeta(WEIGHTS_KEY)), parseMeasures(storage.getMeta(MEASURES_KEY))))} />
        <Btn label="الكارديو والمشي" onPress={() => go('cardio', () => cardioCsv(parseCardio(storage.getMeta(CARDIO_KEY)), weight))} />
        <Btn label="العادات" onPress={() => go('habits', () => habitsCsv(readHabits(), readHabitLog(), today))} />
      </View>
      {msg ? <T style={{ color: t.mute, fontSize: 12.5, textAlign: 'center' }}>{msg}</T> : null}
    </Sheet>
  );
}
