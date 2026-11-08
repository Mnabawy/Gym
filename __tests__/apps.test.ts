/// <reference types="jest" />
import { isPackage, packageFrom } from '../src/lib/apps';
import { parseHabits } from '../src/lib/habits';

describe('apps', () => {
  it('takes the package from a Play link or as is', () => {
    expect(packageFrom('https://play.google.com/store/apps/details?id=org.goldenquran.freesoft')).toBe('org.goldenquran.freesoft');
    expect(packageFrom('https://play.google.com/store/apps/details?id=com.quran.labs.androidquran&hl=ar')).toBe('com.quran.labs.androidquran');
    expect(packageFrom(' market://details?id=com.whatsapp ')).toBe('com.whatsapp');
    expect(packageFrom('com.whatsapp')).toBe('com.whatsapp');
    expect(packageFrom('المصحف')).toBeNull();
    expect(packageFrom('https://example.com')).toBeNull();
    expect(isPackage('a')).toBe(false);
  });
  it('keeps a habit\'s app when it is a package', () => {
    const h = (app: unknown) => parseHabits(JSON.stringify([{ id: 'h', name: 'ورد', icon: 'book', color: '#000000', days: [0], remind: null, start: '2026-11-01', app }]))[0];
    expect(h('org.goldenquran.freesoft').app).toBe('org.goldenquran.freesoft');
    expect(h('not a package').app).toBeUndefined();
  });
});
