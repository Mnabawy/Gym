/// <reference types="jest" />
/* eslint-disable import/first -- the mocks have to exist before reminder.ts loads */
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../src/lib/storage', () => ({ storage: { getMeta: () => null, setMeta: () => {}, trainedDays: () => [] } }));
const mockBrief = jest.fn();
jest.mock('../src/lib/brief', () => {
  const real = jest.requireActual('../src/lib/brief');
  return { ...real, morningBrief: (...a: unknown[]) => mockBrief(...a) ?? real.morningBrief(...a) };
});
jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

import * as Notifications from 'expo-notifications';
import { syncReminders } from '../src/lib/reminder';
import { useSettings } from '../src/lib/settings';

const scheduled = Notifications.scheduleNotificationAsync as jest.Mock;
const kinds = () => scheduled.mock.calls.map((c) => c[0].content.data.kind as string);
let warn: jest.SpyInstance;

beforeEach(() => {
  scheduled.mockClear();
  mockBrief.mockReset().mockReturnValue(undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  useSettings.setState({ reminder: true, brief: true, reminderDays: [0, 1, 2, 3, 4, 5, 6] });
});
afterEach(() => warn.mockRestore());

test('all blocks scheduled when nothing fails', async () => {
  await syncReminders();
  const k = kinds();
  expect(k).toContain('workout-reminder');
  expect(k).toContain('morning-brief');
  expect(warn).not.toHaveBeenCalled();
});

test('a brief block that throws still leaves the workout reminders', async () => {
  mockBrief.mockImplementation(() => {
    throw new Error('bad brief');
  });
  await syncReminders();
  const k = kinds();
  expect(k).toContain('workout-reminder');
  expect(k).not.toContain('morning-brief');
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('brief'), expect.any(Error));
});

test('one failed schedule call drops only its block', async () => {
  scheduled.mockImplementation(async (r: { content: { data: { kind: string } } }) => {
    if (r.content.data.kind === 'morning-brief') throw new Error('native');
    return 'id';
  });
  await syncReminders();
  expect(kinds().filter((x) => x === 'workout-reminder').length).toBeGreaterThan(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('brief'), expect.any(Error));
  scheduled.mockImplementation(async () => 'id');
});

test('cannot list the scheduled ones: schedules nothing (no doubles), and the next sync still runs', async () => {
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockRejectedValueOnce(new Error('list'));
  await syncReminders();
  expect(scheduled).not.toHaveBeenCalled();
  await syncReminders();
  expect(kinds()).toContain('workout-reminder');
});
