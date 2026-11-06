// Steps from the phone (Android Health Connect; settings → الخطوات من الموبايل). Daily totals for the last two weeks are
// read when the app opens and saved in meta `steps` (date → count), so the workout tab and the weekly report can show
// them offline. Web / iPhone: steps.web.ts (not available). Needs a native build (react-native-health-connect).
import { Platform } from 'react-native';
import { aggregateRecord, getGrantedPermissions, getSdkStatus, initialize, openHealthConnectSettings, requestPermission, SdkAvailabilityStatus } from 'react-native-health-connect';
import { useDataVersion } from './bus';
import { addDays } from './gaps';
import { dateKey } from './logic';
import { STEPS_KEY, parseSteps } from './cardio';
import { storage } from './storage';

export const stepsSupported = Platform.OS === 'android';
const READ_STEPS = { accessType: 'read', recordType: 'Steps' } as const;

/** 'ok', or why not: Health Connect missing / needs an update, or permission not given. */
export async function connectSteps(): Promise<'ok' | 'unavailable' | 'update' | 'denied'> {
  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'unavailable';
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update';
  if (!(await initialize())) return 'unavailable';
  const granted = await requestPermission([READ_STEPS]);
  return granted.some((p) => p.recordType === 'Steps' && p.accessType === 'read') ? 'ok' : 'denied';
}

export const openStepsSettings = () => openHealthConnectSettings();

/** Reads the last `days` days' step totals into meta `steps`. Quietly does nothing without permission. */
export async function syncSteps(days = 14): Promise<void> {
  try {
    if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE || !(await initialize())) return;
    const granted = await getGrantedPermissions();
    if (!granted.some((p) => p.recordType === 'Steps')) return;
    const map = parseSteps(storage.getMeta(STEPS_KEY));
    const today = dateKey();
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      const start = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const r = await aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() } });
      if (r.COUNT_TOTAL > 0) map[d] = r.COUNT_TOTAL;
    }
    storage.setMeta(STEPS_KEY, JSON.stringify(map));
    useDataVersion.getState().bump();
  } catch {}
}
