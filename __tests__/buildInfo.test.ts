/// <reference types="jest" />
import { BUILD, buildDateText, buildInfoFrom } from '../src/lib/buildInfo';

test('reads version, sha and date from the expo config', () => {
  expect(buildInfoFrom({ version: '1.0.0', extra: { build: { sha: 'abc1234', date: '2026-11-16' } } })).toEqual({ version: '1.0.0', sha: 'abc1234', date: '2026-11-16' });
});

test('falls back safely', () => {
  expect(buildInfoFrom(null)).toEqual({ version: '0.0.0', sha: 'dev', date: null });
  expect(buildInfoFrom({ version: '2.0.0' })).toEqual({ version: '2.0.0', sha: 'dev', date: null });
  expect(buildInfoFrom({ version: 3, extra: { build: { sha: '', date: 'yesterday' } } })).toEqual({ version: '0.0.0', sha: 'dev', date: null });
  expect(typeof BUILD.version).toBe('string');
  expect(typeof BUILD.sha).toBe('string');
});

test('build date in Arabic', () => {
  expect(buildDateText('2026-11-16')).toBe('16 نوفمبر 2026');
  expect(buildDateText(null)).toBeNull();
  expect(buildDateText('2026-13-01')).toBeNull();
});
