// App lock (settings → قفل التطبيق): fingerprint / face, or the phone's own PIN as a fallback, when the app opens and
// when it comes back after LOCK_AFTER_MS in the background. Phone only.
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export const lockSupported = Platform.OS !== 'web';
export const LOCK_AFTER_MS = 60_000;

/** Can this phone do it (has a fingerprint/face sensor and something enrolled, or at least a screen lock)? */
export async function canLock(): Promise<boolean> {
  if (!lockSupported) return false;
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export async function unlock(): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'افتح التطبيق', cancelLabel: 'إلغاء', disableDeviceFallback: false });
    return r.success;
  } catch {
    return false;
  }
}
