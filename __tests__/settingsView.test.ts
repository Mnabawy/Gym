/// <reference types="jest" />
import {
  accountSub,
  autoErrorText,
  backupAgeText,
  backupStale,
  clock,
  dayAr,
  deloadSub,
  folderName,
  infoAr,
  itemsAr,
  placeText,
  programSub,
  STEPS,
  timeAr,
  toggleDay,
  tripLines,
  WEEK,
} from '../src/lib/settingsView';
import { BACKUP_STALE_DAYS, infoText, type BackupInfo } from '../src/lib/backup';

describe('timeAr', () => {
  it('midnight is 12 in the morning', () => expect(timeAr(0)).toBe('12:00 ص'));
  it('noon is 12 in the evening', () => expect(timeAr(12 * 60)).toBe('12:00 م'));
  it('12:30 م', () => expect(timeAr(12 * 60 + 30)).toBe('12:30 م'));
  it('pads minutes', () => expect(timeAr(7 * 60 + 5)).toBe('7:05 ص'));
  it('evening hours', () => expect(timeAr(19 * 60 + 30)).toBe('7:30 م'));
  it('last step of the day', () => expect(timeAr(24 * 60 - 15)).toBe('11:45 م'));
});

describe('clock', () => {
  it('seconds to m:ss', () => {
    expect(clock(150)).toBe('2:30');
    expect(clock(90)).toBe('1:30');
  });
});

describe('dayAr', () => {
  it('drops the leading zero and names the month', () => expect(dayAr('2026-11-05')).toBe('5 نوفمبر 2026'));
  it('january', () => expect(dayAr('2025-01-31')).toBe('31 يناير 2025'));
});

describe('itemsAr', () => {
  it('none', () => expect(itemsAr(0)).toBe('مفيش حاجة'));
  it('one, two, few, many', () => {
    expect(itemsAr(1)).toBe('صنف واحد');
    expect(itemsAr(2)).toBe('صنفين');
    expect(itemsAr(5)).toBe('5 أصناف');
    expect(itemsAr(12)).toBe('12 صنف');
  });
});

const info = (o: Partial<BackupInfo>): BackupInfo =>
  ({ sets: 0, days: 0, meals: 0, photos: 0, from: null, to: null, habits: 0, goals: 0, quits: 0, weights: 0, total: 0, ...o }) as BackupInfo;

describe('infoAr', () => {
  it('empty', () => expect(infoAr(info({}))).toBe('مفيش تسجيل لسه'));
  it('with a workout range', () => {
    const i = info({ sets: 10, days: 2, total: 10, from: '2026-10-01', to: '2026-11-05' });
    expect(infoAr(i)).toBe(`${infoText(i)} (تمارين من 1 أكتوبر 2026 لـ 5 نوفمبر 2026)`);
  });
  it('without a range', () => {
    const i = info({ meals: 3, total: 3 });
    expect(infoAr(i)).toBe(infoText(i));
  });
});

describe('backup age', () => {
  it('never', () => {
    expect(backupAgeText(null)).toBe('لسه ما عملتش نسخة احتياطية');
    expect(backupStale(null)).toBe(true);
  });
  it('today', () => {
    expect(backupAgeText(0)).toBe('آخر نسخة النهارده ✓');
    expect(backupStale(0)).toBe(false);
  });
  it('n days', () => {
    expect(backupAgeText(1)).toBe('آخر نسخة من يوم');
    expect(backupAgeText(2)).toBe('آخر نسخة من يومين');
    expect(backupAgeText(3)).toBe('آخر نسخة من 3 أيام');
  });
  it('stale from BACKUP_STALE_DAYS', () => {
    expect(backupStale(BACKUP_STALE_DAYS - 1)).toBe(false);
    expect(backupStale(BACKUP_STALE_DAYS)).toBe(true);
  });
});

describe('folderName', () => {
  it('SAF tree uri with primary:', () =>
    expect(folderName('content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FBrainy')).toBe('Documents/Brainy'));
  it('a folder that decodes to nothing', () => expect(folderName('content://x/tree/primary%3A')).toBe('متحدد'));
  it('trailing slash', () => expect(folderName('file:///data/backups/')).toBe('متحدد'));
  it('plain path', () => expect(folderName('file:///data/backups')).toBe('backups'));
  it('no folder', () => expect(folderName('')).toBe('جوه التطبيق بس'));
});

describe('accountSub', () => {
  it('web', () => expect(accountSub(false, 'Mo', 'saved')).toBe('على الموبايل بس'));
  it('signed out', () => expect(accountSub(true, null, 'off')).toBe('ادخل بجوجل عشان بياناتك تتحفظ وترجع على أي موبايل'));
  it('each save state', () => {
    expect(accountSub(true, 'Mo', 'saved')).toBe('Mo · بياناتك محفوظة ✓');
    expect(accountSub(true, 'Mo', 'waiting')).toBe('Mo · بيحفظ…');
    expect(accountSub(true, 'Mo', 'failed')).toBe('Mo · الحفظ واقف، افتح وشوف');
    expect(accountSub(true, 'Mo', 'off')).toBe('Mo · الحفظ على حسابك مقفول');
  });
});

describe('autoErrorText', () => {
  it('nothing failed', () => {
    expect(autoErrorText(null, '2026-11-01')).toBeNull();
    expect(autoErrorText('', null)).toBeNull();
  });
  it('the folder failed on the backup day', () => expect(autoErrorText('2026-11-01', '2026-11-01')).toBe('معرفتش أكتب في الفولدر آخر مرة. اختاره تاني.'));
  it('the in-app copy failed', () => expect(autoErrorText('2026-11-08', '2026-11-01')).toMatch(/^النسخة التلقائية ما اتحفظتش/));
  it('no backup day yet', () => expect(autoErrorText('2026-11-08', null)).toMatch(/^النسخة التلقائية ما اتحفظتش/));
});

describe('programSub', () => {
  const program = [{ exercises: [1, 2, 3] }, { exercises: [1, 2] }];
  it('counts days and exercises', () => expect(programSub(program, false)).toBe('التمارين والمجموعات والتكرارات · 2 أيام · 5 تمرين'));
  it('marks an edited program', () => expect(programSub(program, true)).toBe('التمارين والمجموعات والتكرارات · 2 أيام · 5 تمرين · متعدّل'));
});

describe('tripLines', () => {
  const g = (n: number) => ({ title: 'x', color: 'protein' as const, items: Array.from({ length: n }, () => ({}) as never) });
  it('one trip', () => expect(tripLines([{ label: 'الجمعة', groups: [g(3)] }])).toEqual(['مرة واحدة كل جمعة للأسبوع كله']));
  it('several trips count items over groups', () =>
    expect(tripLines([{ label: 'الجمعة', groups: [g(2), g(1)] }, { label: 'التلات', groups: [] }])).toEqual(['المرة 1: الجمعة · 3 أصناف', 'المرة 2: التلات · مفيش حاجة']));
});

describe('toggleDay', () => {
  it('adds and sorts', () => expect(toggleDay([4, 0], 2)).toEqual([0, 2, 4]));
  it('removes', () => expect(toggleDay([0, 2, 4], 2)).toEqual([0, 4]));
  it('does not change the input', () => {
    const days = [3, 1];
    toggleDay(days, 2);
    expect(days).toEqual([3, 1]);
  });
});

describe('placeText', () => {
  it('none', () => expect(placeText(null)).toBe('لسه ما اتحددش'));
  it('name', () => expect(placeText({ lat: 30, lng: 31, name: 'القاهرة' })).toBe('القاهرة'));
  it('coordinates', () => expect(placeText({ lat: 30.0444, lng: 31.2357 })).toBe('30.04, 31.24'));
});

describe('deloadSub', () => {
  it('on', () => expect(deloadSub(true, '2026-11-20')).toBe('شغال لحد 20 نوفمبر 2026: نص المجموعات في كل تمرين'));
  it('off', () => expect(deloadSub(false, '')).toBe('7 أيام بنص المجموعات عشان جسمك يرتاح. التطبيق بيقترحه لوحده لما يحين وقته'));
});

describe('constants', () => {
  it('week runs Saturday to Friday', () => expect(WEEK).toEqual([6, 0, 1, 2, 3, 4, 5]));
  it('weight steps', () => expect(STEPS).toEqual([1, 1.25, 2.5, 5]));
});
