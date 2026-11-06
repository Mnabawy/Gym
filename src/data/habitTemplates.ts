// The owner's own habits (worship and knowledge), added in one tap from the habits tab ("ضيف عاداتي").
// Reminders follow the day's prayer times (src/lib/prayer.ts); they only go off once prayer times have a location.
// The 12 sunnah prayers (السنن الرواتب) are the ones in the hadith of Umm Habibah (Muslim 728; listed in detail by
// al-Tirmidhi 415): 2 before Fajr, 4 before Dhuhr and 2 after it, 2 after Maghrib, 2 after Isha.
import type { Habit } from '../lib/habits';

type Template = Omit<Habit, 'id' | 'start'>;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export const MY_HABITS: Template[] = [
  {
    group: 'الصلاة',
    name: 'الصلوات الخمس',
    icon: 'moon',
    color: '#009E73',
    days: EVERY_DAY,
    remind: null,
    cue: 'في وقتها، ويا ريت في المسجد',
    parts: [{ name: 'الفجر' }, { name: 'الضهر' }, { name: 'العصر' }, { name: 'المغرب' }, { name: 'العشا' }],
  },
  {
    group: 'الصلاة',
    name: 'الضحى',
    icon: 'sunny',
    color: '#E69F00',
    days: EVERY_DAY,
    remind: null,
    cue: 'بعد الشروق بربع ساعة لحد قبل الضهر',
    at: { prayer: 'sunrise', offset: 20 },
  },
  {
    group: 'الصلاة',
    name: 'السنن الرواتب (12)',
    icon: 'star',
    color: '#0072B2',
    days: EVERY_DAY,
    remind: null,
    cue: 'مع كل صلاة',
    parts: [{ name: '2 قبل الفجر' }, { name: '4 قبل الضهر' }, { name: '2 بعد الضهر' }, { name: '2 بعد المغرب' }, { name: '2 بعد العشا' }],
  },
  {
    group: 'الصلاة',
    name: 'الشفع والوتر',
    icon: 'cloudy-night',
    color: '#7A5CFA',
    days: EVERY_DAY,
    remind: null,
    cue: 'بعد العشا، أو قبل ما تنام',
    at: { prayer: 'isha', offset: 90 },
  },
  {
    group: 'القرآن',
    name: 'وردك من القرآن',
    icon: 'book',
    color: '#1BA6A8',
    days: EVERY_DAY,
    remind: null,
    cue: 'بعد الفجر، في مكانك',
    at: { prayer: 'fajr', offset: 30 },
  },
  {
    group: 'الأذكار',
    name: 'أذكار الصباح والمساء',
    icon: 'sparkles',
    color: '#CC79A7',
    days: EVERY_DAY,
    remind: null,
    cue: 'الصباح بعد الفجر، والمساء بعد العصر',
    parts: [
      { name: 'الصباح', at: { prayer: 'fajr', offset: 15 } },
      { name: 'المساء', at: { prayer: 'asr', offset: 15 } },
    ],
  },
  { group: 'العلم', name: 'العلم الشرعي', icon: 'school', color: '#D55E00', days: EVERY_DAY, remind: null },
  { group: 'العلم', name: 'علم الخلافة', icon: 'bulb', color: '#C62828', days: EVERY_DAY, remind: null },
];
