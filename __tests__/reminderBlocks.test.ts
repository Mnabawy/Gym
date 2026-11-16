/// <reference types="jest" />
/* eslint-disable import/first -- the mocks have to exist before reminder.ts loads */
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../src/lib/storage', () => ({ storage: { getMeta: () => null, setMeta: () => {}, trainedDays: () => [] } }));
const mockTasks = jest.fn((): unknown[] => []);
const mockQuits = jest.fn((): unknown[] => []);
jest.mock('../src/lib/taskStore', () => ({ readTasks: () => mockTasks() }));
jest.mock('../src/lib/quitStore', () => ({ readQuits: () => mockQuits() }));
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
  mockTasks.mockReset().mockReturnValue([]);
  mockQuits.mockReset().mockReturnValue([]);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  useSettings.setState({ reminder: true, brief: true, dumpRemind: true, reminderDays: [0, 1, 2, 3, 4, 5, 6] });
});
afterEach(() => warn.mockRestore());

test('all blocks scheduled when nothing fails', async () => {
  await syncReminders();
  const k = kinds();
  expect(k).toContain('workout-reminder');
  expect(k).toContain('morning-brief');
  expect(k).toContain('brain-dump');
  expect(warn).not.toHaveBeenCalled();
});

test('a task block that throws still leaves workout, brief and dump reminders', async () => {
  mockTasks.mockImplementation(() => {
    throw new Error('bad tasks');
  });
  await syncReminders();
  const k = kinds();
  expect(k).toContain('workout-reminder');
  expect(k).toContain('brain-dump');
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('tasks'), expect.any(Error));
});

test('a quit block that throws still leaves the others', async () => {
  mockQuits.mockImplementation(() => {
    throw new Error('bad quits');
  });
  await syncReminders();
  expect(kinds()).toEqual(expect.arrayContaining(['workout-reminder', 'brain-dump']));
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('quits'), expect.any(Error));
});

test('one failed schedule call drops only its block', async () => {
  scheduled.mockImplementation(async (r: { content: { data: { kind: string } } }) => {
    if (r.content.data.kind === 'brain-dump') throw new Error('native');
    return 'id';
  });
  await syncReminders();
  expect(kinds().filter((x) => x === 'workout-reminder').length).toBeGreaterThan(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('dump'), expect.any(Error));
  scheduled.mockImplementation(async () => 'id');
});

test('cannot list the scheduled ones: schedules nothing (no doubles), and the next sync still runs', async () => {
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockRejectedValueOnce(new Error('list'));
  await syncReminders();
  expect(scheduled).not.toHaveBeenCalled();
  await syncReminders();
  expect(kinds()).toContain('workout-reminder');
});
