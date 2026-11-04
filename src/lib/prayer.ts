// Prayer times, computed on the phone (no internet) with the adhan library from the saved location.
// Default method: Egyptian General Authority of Survey (Fajr 19.5°, Isha 17.5°), Asr by the Shafi rule as used in Egypt.
// Pure — unit tested in __tests__/prayer.test.ts. Getting the location lives in src/lib/place.ts.
import { CalculationMethod, Coordinates, Madhab, PrayerTimes, type CalculationParameters } from 'adhan';
import { countAr } from './logic';

export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYERS: PrayerKey[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const PRAYER_AR: Record<PrayerKey, string> = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الضهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشا' };

export type Method = 'egyptian' | 'mwl' | 'ummAlQura' | 'dubai' | 'karachi';
export const METHODS: Record<Method, { label: string; make: () => CalculationParameters }> = {
  egyptian: { label: 'الهيئة المصرية', make: CalculationMethod.Egyptian },
  mwl: { label: 'رابطة العالم الإسلامي', make: CalculationMethod.MuslimWorldLeague },
  ummAlQura: { label: 'أم القرى', make: CalculationMethod.UmmAlQura },
  dubai: { label: 'دبي', make: CalculationMethod.Dubai },
  karachi: { label: 'كراتشي', make: CalculationMethod.Karachi },
};

export type Place = {
  lat: number;
  lng: number;
  name?: string;
  /** ms since epoch */
  at: number;
  /** You picked this city yourself: don't replace it with the phone's location on its own. */
  manual?: boolean;
};

/** Cities you can pick when the phone can't tell where you are. City-level is enough for prayer times. */
export const CITIES: { name: string; lat: number; lng: number }[] = [
  { name: 'القاهرة', lat: 30.0444, lng: 31.2357 },
  { name: 'الجيزة', lat: 30.0131, lng: 31.2089 },
  { name: 'الإسكندرية', lat: 31.2001, lng: 29.9187 },
  { name: 'المنصورة', lat: 31.0409, lng: 31.3785 },
  { name: 'طنطا', lat: 30.7865, lng: 31.0004 },
  { name: 'الزقازيق', lat: 30.5877, lng: 31.502 },
  { name: 'بورسعيد', lat: 31.2653, lng: 32.3019 },
  { name: 'الإسماعيلية', lat: 30.5965, lng: 32.2715 },
  { name: 'السويس', lat: 29.9668, lng: 32.5498 },
  { name: 'المنيا', lat: 28.0871, lng: 30.7618 },
  { name: 'أسيوط', lat: 27.1783, lng: 31.1859 },
  { name: 'سوهاج', lat: 26.5591, lng: 31.6957 },
  { name: 'الأقصر', lat: 25.6872, lng: 32.6396 },
  { name: 'أسوان', lat: 24.0889, lng: 32.8998 },
  { name: 'الغردقة', lat: 27.2579, lng: 33.8116 },
  { name: 'شرم الشيخ', lat: 27.9158, lng: 34.33 },
  { name: 'مكة', lat: 21.4225, lng: 39.8262 },
  { name: 'المدينة', lat: 24.4672, lng: 39.6111 },
  { name: 'الرياض', lat: 24.7136, lng: 46.6753 },
  { name: 'دبي', lat: 25.2048, lng: 55.2708 },
];

export function parsePlace(v: unknown): Place | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const ok = (x: unknown, lim: number) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= lim;
  if (!ok(o.lat, 90) || !ok(o.lng, 180)) return null;
  return {
    lat: o.lat as number,
    lng: o.lng as number,
    name: typeof o.name === 'string' ? o.name : undefined,
    at: typeof o.at === 'number' ? o.at : 0,
    ...(o.manual === true ? { manual: true } : {}),
  };
}

/** The six times for the calendar day of `date` (device time zone). */
export function timesFor(p: Pick<Place, 'lat' | 'lng'>, date: Date, method: Method = 'egyptian'): Record<PrayerKey, Date> {
  const params = METHODS[method].make();
  params.madhab = Madhab.Shafi;
  const t = new PrayerTimes(new Coordinates(p.lat, p.lng), date, params);
  return { fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha };
}

/** Next of the five prayers after `now` (sunrise isn't one); after Isha it's tomorrow's Fajr. */
export function nextPrayer(p: Pick<Place, 'lat' | 'lng'>, now: Date, method: Method = 'egyptian'): { key: PrayerKey; at: Date } {
  const today = timesFor(p, now, method);
  for (const k of PRAYERS) if (k !== 'sunrise' && today[k] > now) return { key: k, at: today[k] };
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  return { key: 'fajr', at: timesFor(p, tomorrow, method).fajr };
}

/** "5:07 م" — 12-hour clock, the way it's said in Egypt. */
export function clock12(d: Date): string {
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
}

const HOURS: [string, string, string, string] = ['ساعة', 'ساعتين', 'ساعات', 'ساعة'];
const MINUTES: [string, string, string, string] = ['دقيقة', 'دقيقتين', 'دقايق', 'دقيقة'];

/** "ساعة و25 دقيقة", "3 دقايق", "أقل من دقيقة". Rounds minutes up so it never says 0 too early. */
export function untilAr(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 60000);
  if (total < 1) return 'أقل من دقيقة';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return countAr(m, MINUTES);
  return m ? `${countAr(h, HOURS)} و${countAr(m, MINUTES)}` : countAr(h, HOURS);
}
