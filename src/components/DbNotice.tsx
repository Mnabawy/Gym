import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { MONTHS_AR } from '../data/program';
import { useDataVersion } from '../lib/bus';
import { DB_RECOVERED_KEY, parseDbRecovery, type DbRecovery } from '../lib/dbOpen';
import { dateKey } from '../lib/logic';
import { storage } from '../lib/storage';
import { useTheme } from '../theme';
import { Btn, T } from './ui';

const dayAr = (ms: number) => {
  const k = dateKey(new Date(ms));
  return `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
};

/** The note dbOpen.ts / storage.ts left about the phone's database, or null. */
export const dbNote = (): DbRecovery | null => parseDbRecovery(storage.getMeta(DB_RECOVERED_KEY));

/** Title and text for the note (pure, so settings and the welcome screen say the same thing). */
export function dbNoticeText(n: DbRecovery): { title: string; body: string } {
  const day = dayAr(n.at);
  if (n.unsaved) {
    return {
      title: `يوم ${day} التطبيق ما قدرش يفتح ملف بياناتك`,
      body: 'فاللي سجلته في المرة دي ما اتحفظش. اللي قبل كده موجود. لو فيه حاجة ناقصة رجّع آخر نسخة احتياطية أو ادخل بحسابك.',
    };
  }
  if (n.cause === 'error') {
    return {
      title: 'مش قادر أفتح ملف بياناتك دلوقتي',
      body: 'بياناتك نفسها سليمة ومتلمستش، بس اللي هتسجله دلوقتي مش هيتحفظ. غالبًا مساحة الموبايل مليانة: فضّي شوية مساحة، واقفل التطبيق وافتحه تاني. ماتمسحش التطبيق.',
    };
  }
  if (n.memory) {
    return {
      title: `ملف بياناتك على الموبايل باظ يوم ${day}`,
      body: n.file
        ? 'ومش قادر يحفظ حاجة دلوقتي. الملف القديم اتنقل على جنب ومتشالش. اقفل التطبيق وافتحه تاني، وبعدين رجّع آخر نسخة احتياطية.'
        : 'ومش قادر يبدأ ملف جديد، فمش هيتحفظ حاجة دلوقتي. الملف القديم زي ما هو. فضّي شوية مساحة واقفل التطبيق وافتحه تاني، وبعدين رجّع آخر نسخة احتياطية.',
    };
  }
  return {
    title: `ملف بياناتك على الموبايل باظ يوم ${day}، فالتطبيق بدأ من جديد`,
    body: 'رجّع آخر نسخة احتياطية من ملف، أو ادخل بحسابك لو الحفظ على حسابك كان شغال. الملف القديم متشالش، اتنقل على جنب.',
  };
}

/** The notice card, with «تمام» to hide it. Nothing when there's no note. */
export function DbNotice({ style }: { style?: ViewStyle }) {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const n = dbNote();
  if (!n) return null;
  const { title, body } = dbNoticeText(n);
  return (
    <View style={[{ padding: 12, borderRadius: 12, backgroundColor: t.warnSoft, gap: 8 }, style]}>
      <T w="semi" style={{ color: t.bad }}>{title}</T>
      <T style={{ fontSize: 12.5, lineHeight: 19 }}>{body}</T>
      <Btn label="تمام" onPress={() => { storage.setMeta(DB_RECOVERED_KEY, ''); useDataVersion.getState().bump(); }} />
    </View>
  );
}
