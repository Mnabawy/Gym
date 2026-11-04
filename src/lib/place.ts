// The phone's current location for prayer times (expo-location), saved in settings so times still work offline.
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { useSettings } from './settings';

/** Re-check the location when the saved one is older than this. */
export const PLACE_STALE_MS = 60 * 60 * 1000;

export type LocateResult = 'ok' | 'denied' | 'error';

/** Ask for permission if needed, read the location, name it (city, country) when possible, and save it. */
export async function refreshPlace(): Promise<LocateResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return 'denied';
    const pos =
      (Platform.OS !== 'web' ? await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }) : null) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const { latitude: lat, longitude: lng } = pos.coords;
    let name: string | undefined;
    try {
      const [g] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      name = [g?.city ?? g?.subregion ?? g?.region, g?.country].filter(Boolean).join('، ') || undefined;
    } catch {} // not available on web
    useSettings.getState().setQuiet({ place: { lat, lng, name, at: Date.now() } });
    return 'ok';
  } catch {
    return 'error';
  }
}
