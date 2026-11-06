/// <reference types="jest" />
import { accentTokens, contrast, isDark, mix, normHex, readable } from '../src/lib/color';

test('hex input', () => {
  expect(normHex('#1ba6a8')).toBe('#1BA6A8');
  expect(normHex('f80')).toBe('#FF8800');
  expect(normHex(' #ABC ')).toBe('#AABBCC');
  expect(normHex('١٢٣٤٥٦')).toBe('#123456');
  expect(normHex('#12345')).toBeNull();
  expect(normHex('red')).toBeNull();
});

test('contrast and mixing', () => {
  expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21);
  expect(mix('#FFFFFF', '#000000', 0.5)).toBe('#808080');
  expect(isDark('#14120F')).toBe(true);
  expect(isDark('#F6F3EE')).toBe(false);
});

test('text in your color always reads', () => {
  for (const c of ['#FFFF00', '#1BA6A8', '#000080', '#FF00FF']) {
    expect(contrast(readable(c, '#F6F3EE'), '#F6F3EE')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(readable(c, '#14120F'), '#14120F')).toBeGreaterThanOrEqual(4.5);
  }
  expect(readable('#1F1D1A', '#FFFFFF')).toBe('#1F1D1A'); // already fine
});

test('accent tokens', () => {
  expect(accentTokens('#FFE600', '#FFFFFF').onOk).toBe('#111111'); // dark text on yellow
  expect(accentTokens('#2563EB', '#FFFFFF').onOk).toBe('#FFFFFF');
  expect(accentTokens('#2563EB', '#FFFFFF').ok).toBe('#2563EB');
});
