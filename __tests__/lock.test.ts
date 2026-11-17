jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
const mockAuth = { getEnrolledLevelAsync: jest.fn(), authenticateAsync: jest.fn() };
jest.mock('expo-local-authentication', () => ({ getEnrolledLevelAsync: (...a: unknown[]) => mockAuth.getEnrolledLevelAsync(...a), authenticateAsync: (...a: unknown[]) => mockAuth.authenticateAsync(...a), SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_STRONG: 3 } }));
import { unlock } from '../src/lib/lock';

beforeEach(() => jest.clearAllMocks());

test('a phone with no fingerprint and no screen lock is let in, not locked out', async () => {
  mockAuth.getEnrolledLevelAsync.mockResolvedValue(0);
  await expect(unlock()).resolves.toBe(true);
  expect(mockAuth.authenticateAsync).not.toHaveBeenCalled();
});

test('a phone that can lock asks the system and follows its answer', async () => {
  mockAuth.getEnrolledLevelAsync.mockResolvedValue(1);
  mockAuth.authenticateAsync.mockResolvedValue({ success: false });
  await expect(unlock()).resolves.toBe(false);
  mockAuth.authenticateAsync.mockResolvedValue({ success: true });
  await expect(unlock()).resolves.toBe(true);
});
