// The phone's current location for prayer times (expo-location), saved in settings so times still work offline.
// Every step has a time limit: a lookup that never answers (no GPS fix indoors, services off) must not leave the
// prayer tab waiting forever. If it fails you can pick a city instead (CITIES in src/lib/prayer.ts).
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { useSettings } from './settings';

/** Re-check the location when the saved one is older than this (not for a city you picked yourself). */
export const PLACE_STALE_MS = 60 * 60 * 1000;
const FIX_MS = 20_000;
const NAME_MS = 8_000;

export type LocateResult = 'ok' | 'denied' | 'off' | 'timeout' | 'error';

class Timeout extends Error {}
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Timeout()), ms);
    p.then(
      (v) => (clearTimeout(id), resolve(v)),
      (e) => (clearTimeout(id), reject(e)),
    );
  });
}

/** Ask for permission if needed, read the location (city-level is plenty), save it, then name it in the background. */
export async function refreshPlace(): Promise<LocateResult> {
  try {
    if (!(await within(Location.hasServicesEnabledAsync(), 5_000))) return 'off';
    const { status } = await Location.requestForegroundPermissionsAsync(); // waits for your answer, no time limit
    if (status !== 'granted') return 'denied';
    const last = Platform.OS !== 'web' ? await within(Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 }), 5_000).catch(() => null) : null;
    const pos = last ?? (await within(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), FIX_MS));
    const { latitude: lat, longitude: lng } = pos.coords;
    useSettings.getState().setQuiet({ place: { lat, lng, at: Date.now() } });
    nameIt(lat, lng);
    return 'ok';
  } catch (e) {
    return e instanceof Timeout ? 'timeout' : 'error';
  }
}

/** Use a city you picked instead of the phone's location (kept until you ask the phone again). */
export function pickCity(c: { name: string; lat: number; lng: number }) {
  useSettings.getState().setQuiet({ place: { lat: c.lat, lng: c.lng, name: c.name, at: Date.now(), manual: true } });
}

/** City, country for the saved spot, when the phone can tell (not on web). Never blocks the times. */
function nameIt(lat: number, lng: number) {
  within(Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }), NAME_MS)
    .then(([g]) => {
      const name = [g?.city ?? g?.subregion ?? g?.region, g?.country].filter(Boolean).join('، ');
      const p = useSettings.getState().place;
      if (name && p && p.lat === lat && p.lng === lng) useSettings.getState().setQuiet({ place: { ...p, name } });
    })
    .catch(() => {});
}
