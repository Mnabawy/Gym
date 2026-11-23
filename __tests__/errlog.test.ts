// Error log (src/lib/errlog.ts): capped at 50, never throws, phone-only (not synced, not counted as data).
const mockMeta: Record<string, string> = {};
let mockBroken = false;
jest.mock('../src/lib/storage', () => ({
  storage: {
    getMeta: (k: string) => {
      if (mockBroken) throw new Error('disk gone');
      return mockMeta[k] ?? null;
    },
    setMeta: (k: string, v: string) => {
      if (mockBroken) throw new Error('disk gone');
      mockMeta[k] = v;
    },
  },
}));

import { addErr, clearErrLog, ERR_LOG_KEY, ERR_MAX, errText, parseErrLog, readErrLog, report, toEntry } from '../src/lib/errlog';
import { isLocalMeta } from '../src/lib/metaKeys';
import { DATA_KEYS } from '../src/lib/backup';

let warn: jest.SpyInstance;
beforeEach(() => {
  for (const k of Object.keys(mockMeta)) delete mockMeta[k];
  mockBroken = false;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

test('keeps the newest 50, newest first', () => {
  for (let i = 0; i < 60; i++) report(new Error(`e${i}`), 'sync');
  const log = readErrLog();
  expect(log).toHaveLength(ERR_MAX);
  expect(log[0].msg).toBe('e59');
  expect(log[49].msg).toBe('e10');
  expect(log[0].stack).toBeTruthy();
});

test('the same error right after itself is counted, not repeated', () => {
  report(new Error('offline'), 'sync');
  report(new Error('offline'), 'sync');
  report(new Error('offline'), 'sync');
  expect(readErrLog()).toEqual([expect.objectContaining({ msg: 'offline', n: 3 })]);
  const list = addErr([], toEntry('x', 'a', 1));
  expect(addErr(list, toEntry('x', 'b', 2))).toHaveLength(2);
});

test('never throws when storage fails or the error is odd', () => {
  mockBroken = true;
  expect(() => report(new Error('x'), 'sync')).not.toThrow();
  expect(readErrLog()).toEqual([]);
  expect(() => clearErrLog()).not.toThrow();
  mockBroken = false;
  const evil = { get message(): string { throw new Error('no'); }, toString() { throw new Error('no'); } };
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const e of [evil, circular, undefined, null, 42, 'text', Symbol('s')]) expect(() => report(e, 'x')).not.toThrow();
  expect(readErrLog().length).toBeGreaterThan(0);
});

test('a mockBroken stored log is read as empty and replaced', () => {
  mockMeta[ERR_LOG_KEY] = '{not json';
  expect(parseErrLog(mockMeta[ERR_LOG_KEY])).toEqual([]);
  report(new Error('a'), 'w');
  expect(readErrLog()).toHaveLength(1);
});

test('clear and text', () => {
  report(new Error('boom'), 'crash:tasks');
  expect(errText(readErrLog(), 'Brainy 1.0')).toContain('[crash:tasks]');
  clearErrLog();
  expect(readErrLog()).toEqual([]);
});

test('phone-only: not data', () => {
  expect(isLocalMeta(ERR_LOG_KEY)).toBe(true);
  expect(DATA_KEYS).not.toContain(ERR_LOG_KEY);
});
