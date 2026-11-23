/// <reference types="jest" />
// syncReminders only cancels and reschedules when the plan changed, the OS lost some of ours, or the day changed.
/* eslint-disable import/first -- the mocks have to exist before reminder.ts loads */
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
// settings.ts reads storage while the imports load, before these exist (hence `?.`).
const mockMeta = new Map<string, string>();
jest.mock('../src/lib/storage', () => ({
  storage: { getMeta: (k: string) => mockMeta?.get(k) ?? null, setMeta: (k: string, v: string) => mockMeta?.set(k, v), trainedDays: () => [] },
}));
// A tiny OS: what's scheduled, by id.
const mockOs = new Map<string, { identifier: string; content: { data: Record<string, unknown> } }>();
let mockNext = 0;
jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockOs.values()]),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => void mockOs.delete(id)),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async (r: { content: { data: Record<string, unknown> } }) => {
    const identifier = `n${mockNext++}`;
    mockOs.set(identifier, { identifier, content: { data: r.content.data } });
    return identifier;
  }),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

import * as Notifications from 'expo-notifications';
import { hashText, planReminders, REMINDERS_KEY, stableJson, syncReminders } from '../src/lib/reminder';
import { useSettings } from '../src/lib/settings';
import { isLocalMeta } from '../src/lib/metaKeys';

const scheduled = Notifications.scheduleNotificationAsync as jest.Mock;
const cancelled = Notifications.cancelScheduledNotificationAsync as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-16T10:00:00'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  mockMeta.clear();
  mockOs.clear();
  scheduled.mockClear();
  cancelled.mockClear();
  useSettings.setState({ reminder: true, brief: true, reminderTime: 19 * 60, reminderDays: [0, 1, 2, 3, 4, 5, 6] });
});
afterEach(() => jest.useRealTimers());

test('the hash key is phone-only', () => {
  expect(isLocalMeta(REMINDERS_KEY)).toBe(true);
});

test('stable JSON ignores key order; the hash follows the text', () => {
  expect(stableJson({ b: 1, a: [{ d: 2, c: 'x' }] })).toBe(stableJson({ a: [{ c: 'x', d: 2 }], b: 1 }));
  expect(hashText('abc')).toBe(hashText('abc'));
  expect(hashText('abc')).not.toBe(hashText('abd'));
});

test('the plan is plain data and the same twice', () => {
  const a = planReminders();
  expect(a.length).toBeGreaterThan(10);
  expect(stableJson(planReminders())).toBe(stableJson(a));
});

test('same inputs twice: the second sync schedules and cancels nothing', async () => {
  await syncReminders();
  const n = scheduled.mock.calls.length;
  expect(n).toBeGreaterThan(10);
  expect(mockOs.size).toBe(n);
  scheduled.mockClear();
  cancelled.mockClear();
  await syncReminders();
  expect(scheduled).not.toHaveBeenCalled();
  expect(cancelled).not.toHaveBeenCalled();
});

test('a changed setting reschedules everything once', async () => {
  await syncReminders();
  const n = mockOs.size;
  scheduled.mockClear();
  useSettings.setState({ reminderTime: 20 * 60 });
  await syncReminders();
  expect(cancelled).toHaveBeenCalledTimes(n);
  expect(scheduled).toHaveBeenCalledTimes(n);
  expect(mockOs.size).toBe(n);
});

test('the OS lost some of ours (reboot, cleared): reschedules', async () => {
  await syncReminders();
  const n = mockOs.size;
  mockOs.delete([...mockOs.keys()][0]);
  scheduled.mockClear();
  await syncReminders();
  expect(scheduled).toHaveBeenCalledTimes(n);
  expect(mockOs.size).toBe(n);
});

test('notifications not ours do not count and are left alone', async () => {
  await syncReminders();
  mockOs.set('rest', { identifier: 'rest', content: { data: { kind: 'rest-timer' } } });
  scheduled.mockClear();
  await syncReminders();
  expect(scheduled).not.toHaveBeenCalled();
  expect(mockOs.has('rest')).toBe(true);
});

test('a new day reschedules even with nothing changed', async () => {
  // The same plan both days: the workout reminders on the next two Fridays (20 and 27 Nov).
  useSettings.setState({ brief: false, reminderDays: [5] });
  await syncReminders();
  const n = scheduled.mock.calls.length;
  expect(n).toBeGreaterThan(0);
  jest.setSystemTime(new Date('2026-11-17T08:00:00'));
  await syncReminders();
  expect(scheduled).toHaveBeenCalledTimes(2 * n);
  expect(mockOs.size).toBe(n);
});

test('a failed schedule call forgets the plan, so the next sync tries again', async () => {
  scheduled.mockImplementationOnce(async () => {
    throw new Error('native');
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await syncReminders();
  expect(mockMeta.get(REMINDERS_KEY)).toBe('');
  scheduled.mockClear();
  await syncReminders();
  expect(scheduled.mock.calls.length).toBeGreaterThan(10);
  warn.mockRestore();
});
