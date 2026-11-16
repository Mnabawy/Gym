// «سجل الأخطاء» in settings: how many errors the app caught (src/lib/errlog.ts), and a sheet to read, copy or clear them.
import { useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Btn, Card, Row, Sheet, T } from './ui';
import { clearErrLog, errText, readErrLog, type ErrEntry } from '../lib/errlog';
import { useTheme } from '../theme';

const when = (at: number) => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function version(): string {
  try {
    return Constants.expoConfig?.version ?? '?';
  } catch {
    return '?';
  }
}

export function ErrLogRow() {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ErrEntry[]>(() => readErrLog());
  const [copied, setCopied] = useState(false);
  const show = () => {
    setList(readErrLog());
    setCopied(false);
    setOpen(true);
  };
  return (
    <Card>
      <Row label="سجل الأخطاء" sub={list.length ? `${list.length} غلطة اتسجلت على الموبايل ده` : 'مفيش أخطاء'}>
        <Btn label="افتح" onPress={show} />
      </Row>
      {open ? (
        <Sheet visible onClose={() => setOpen(false)} title="سجل الأخطاء" sub="آخر 50 غلطة، على الموبايل ده بس">
          {list.length ? (
            list.map((x, i) => (
              <View key={`${x.at}-${i}`} style={{ gap: 2, paddingVertical: 4 }}>
                <T style={{ color: t.mute, fontSize: 12, writingDirection: 'ltr' }}>{`${when(x.at)} · ${x.where}${x.n && x.n > 1 ? ` ×${x.n}` : ''}`}</T>
                <T style={{ fontSize: 13, writingDirection: 'ltr' }} numberOfLines={4}>{x.msg}</T>
              </View>
            ))
          ) : (
            <T style={{ color: t.mute }}>مفيش أخطاء</T>
          )}
          {list.length ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn
                label={copied ? 'اتنسخ ✓' : 'انسخ الكل'}
                style={{ flex: 1 }}
                onPress={() => {
                  Clipboard.setStringAsync(errText(list, `Brainy ${version()}`)).then(() => setCopied(true), () => {});
                }}
              />
              <Btn
                label="امسح السجل"
                kind="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  clearErrLog();
                  setList([]);
                }}
              />
            </View>
          ) : null}
        </Sheet>
      ) : null}
    </Card>
  );
}
