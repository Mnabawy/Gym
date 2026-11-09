/// <reference types="jest" />
import { continueBullets, parseNote, toggleBullet } from '../src/lib/notes';

test('notes: bullets and paragraphs', () => {
  expect(parseNote('اشتري أدوات\nبسرعة\n\n• واحد\n- اتنين\n* تلاتة\n•   \nآخر')).toEqual([
    { kind: 'text', text: 'اشتري أدوات\nبسرعة' },
    { kind: 'bullet', text: 'واحد' },
    { kind: 'bullet', text: 'اتنين' },
    { kind: 'bullet', text: 'تلاتة' },
    { kind: 'text', text: 'آخر' },
  ]);
  expect(parseNote('')).toEqual([]);
});

test('notes: toggle a bullet on the line under the cursor', () => {
  expect(toggleBullet('أ\nب', 3)).toEqual({ text: 'أ\n• ب', pos: 5 });
  expect(toggleBullet('أ\n• ب', 5)).toEqual({ text: 'أ\nب', pos: 3 });
  expect(toggleBullet('', 0)).toEqual({ text: '• ', pos: 2 });
});

test('notes: Enter continues a list, Enter on an empty bullet ends it', () => {
  expect(continueBullets('• أ', '• أ\n')).toBe('• أ\n• ');
  expect(continueBullets('• أ\n• ', '• أ\n• \n')).toBe('• أ\n');
  expect(continueBullets('نص', 'نص\n')).toBe('نص\n');
  expect(continueBullets('• أ', '• أب')).toBe('• أب');
});
