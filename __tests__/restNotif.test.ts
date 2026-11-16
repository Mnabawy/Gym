/// <reference types="jest" />
/* eslint-disable import/first -- the mocks have to exist before timer.ts loads */
jest.mock('react-native', () => {
  const listeners: ((s: string) => void)[] = [];
  return { Platform: { OS: 'android' }, AppState: { listeners, addEventListener: (_: string, f: (s: string) => void) => listeners.push(f) } };
});
jest.mock('../src/lib/storage', () => ({ storage: { getMeta: () => null, setMeta: () => {} } }));
jest.mock('expo-haptics', () => ({}));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: () => {} }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => {},
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: async () => ({ granted: true }),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

import * as Notifications from 'expo-notifications';
import { useTimer } from '../src/lib/timer';

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const listeners: ((s: string) => void)[] = jest.requireMock('react-native').AppState.listeners;
const app = (s: string) => listeners.forEach((f) => f(s));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  schedule.mockReset();
  cancel.mockClear();
  useTimer.getState().start(90, 'Bench');
});
afterEach(() => useTimer.getState().stop());

test('back in the app while the rest notification is still being scheduled: it is cancelled', async () => {
  let resolve!: (id: string) => void;
  schedule.mockImplementation(() => new Promise<string>((r) => (resolve = r)));
  app('background');
  await flush();
  expect(schedule).toHaveBeenCalledTimes(1);
  app('active'); // before the native call answers
  resolve('n1');
  await flush();
  expect(cancel).toHaveBeenCalledWith('n1');
});

test('back in the app before permission is checked: nothing is scheduled', async () => {
  let grant!: (v: { granted: boolean }) => void;
  (Notifications.getPermissionsAsync as jest.Mock).mockImplementationOnce(() => new Promise((r) => (grant = r)));
  app('background');
  await flush();
  app('active');
  grant({ granted: true });
  await flush();
  expect(schedule).not.toHaveBeenCalled();
});

test('a scheduled one is cancelled on coming back', async () => {
  schedule.mockResolvedValue('n2');
  app('background');
  await flush();
  app('active');
  await flush();
  expect(cancel).toHaveBeenCalledWith('n2');
});
