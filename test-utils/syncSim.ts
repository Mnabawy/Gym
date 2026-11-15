/// <reference types="jest" />
// Two-phone sync simulator for the tests. Each simulated phone (`Device`) gets its own copy of the real app modules
// (cloud.ts, track.ts, settings.ts, restore.ts...) loaded through jest.isolateModules over its own in-memory storage,
// so module state (the change log, the sync lock, the settings store) is per phone. All phones talk to one FakeSupabase.
// Only four things are replaced: storage (in memory), google.ts (a fake Google account per phone), photos.ts (counters)
// and expo-file-system (an in-memory file system per phone, test-utils/fakeFs.ts, under the real safetyIO.ts and
// autoBackup.ts). Everything else is production code.
//
// Time: Date.now() is virtual (`sim.advance`) plus a per-phone skew. The phone whose action is running (`d.act`, and
// every helper on Device) is the one whose skew applies; overlapping async actions on two phones should keep skew 0.
import type * as AutoBackupMod from '../src/lib/autoBackup';
import type * as CloudMod from '../src/lib/cloud';
import type * as RestoreMod from '../src/lib/restore';
import type * as SafetyIOMod from '../src/lib/safetyIO';
import type * as SettingsMod from '../src/lib/settings';
import type * as TrackMod from '../src/lib/track';
import type { Storage } from '../src/lib/storage.types';
import { createFakeFs } from './fakeFs';
import { FakeSupabase } from './fakeSupabase';
import { memoryStorage } from './memoryStorage';

export const SUPABASE_URL = 'https://fake-project.supabase.test';
export const SUPABASE_KEY = 'fake-anon-key';
const T0 = 1_800_000_000_000;

export class Sim {
  readonly server = new FakeSupabase();
  private clock = T0;
  current: Device | null = null;
  private now?: jest.SpyInstance;
  private realFetch = globalThis.fetch;

  /** Call in beforeEach. */
  install() {
    this.now = jest.spyOn(Date, 'now').mockImplementation(() => this.clock + (this.current?.skew ?? 0));
    globalThis.fetch = this.server.fetch as unknown as typeof fetch;
  }
  /** Call in afterEach. */
  uninstall() {
    this.now?.mockRestore();
    globalThis.fetch = this.realFetch;
  }
  /** Moves the shared clock forward (ms). Writes in the same millisecond tie, so tests advance between steps. */
  advance(ms: number) {
    this.clock += ms;
  }
  get time() {
    return this.clock;
  }
  device(id: string, opts: { configured?: boolean; skewMs?: number; fs?: { free?: number; noMove?: boolean } } = {}) {
    return new Device(this, id, opts);
  }
}

export class Device {
  skew: number;
  /** Which Google account the phone's Google sign-in would hand an id token for (null = none). */
  googleAccount: string | null = null;
  /** Make the phone's Google id token request fail. */
  googleFails = false;
  readonly photos = { deleted: 0, imported: 0 };
  readonly raw: Storage;
  readonly cloud!: typeof CloudMod;
  readonly track!: typeof TrackMod;
  readonly settings!: typeof SettingsMod;
  readonly restoreMod!: typeof RestoreMod;
  readonly safety!: typeof SafetyIOMod;
  readonly autoBackup!: typeof AutoBackupMod;
  /** The phone's file system (app folder), with failure knobs. */
  readonly fs: ReturnType<typeof createFakeFs>;
  /** The phone's storage as the app sees it (writes are noted for sync). */
  readonly storage!: Storage;

  constructor(readonly sim: Sim, readonly id: string, opts: { configured?: boolean; skewMs?: number; fs?: { free?: number; noMove?: boolean } }) {
    this.skew = opts.skewMs ?? 0;
    this.fs = createFakeFs(opts.fs);
    const base = memoryStorage();
    this.raw = base;
    const names = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;
    const saved = names.map((n) => process.env[n]);
    const configured = opts.configured ?? true;
    process.env.EXPO_PUBLIC_SUPABASE_URL = configured ? SUPABASE_URL : '';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = configured ? SUPABASE_KEY : '';
    try {
      jest.isolateModules(() => {
        jest.doMock('../src/lib/google', () => ({
          googleSupported: true,
          GOOGLE_USER: 'driveUser',
          GOOGLE_NAME: 'driveName',
          GOOGLE_PHOTO: 'drivePhoto',
          googleIdToken: async () => {
            if (!base.getMeta('driveUser')) return null;
            if (this.googleFails) throw new Error('google sign-in failed');
            return this.googleAccount ? `gid|${this.googleAccount}|${this.id}` : null;
          },
        }));
        jest.doMock('../src/lib/photos', () => ({
          photosSupported: true,
          deleteAllPhotos: () => void this.photos.deleted++,
          importPhotos: () => 0,
          exportPhotos: async () => [],
        }));
        jest.doMock('expo-file-system', () => this.fs.module);
        jest.doMock('../src/lib/storage', () => {
          const { track } = jest.requireActual<typeof TrackMod>('../src/lib/track');
          return { storage: track(base) };
        });
        const self = this as { -readonly [K in keyof Device]: Device[K] };
        self.storage = jest.requireMock<{ storage: Storage }>('../src/lib/storage').storage;
        self.track = jest.requireActual<typeof TrackMod>('../src/lib/track');
        self.cloud = jest.requireActual<typeof CloudMod>('../src/lib/cloud');
        self.settings = jest.requireActual<typeof SettingsMod>('../src/lib/settings');
        self.restoreMod = jest.requireActual<typeof RestoreMod>('../src/lib/restore');
        self.safety = jest.requireActual<typeof SafetyIOMod>('../src/lib/safetyIO');
        self.autoBackup = jest.requireActual<typeof AutoBackupMod>('../src/lib/autoBackup');
      });
    } finally {
      // A variable that did not exist is deleted: assigning undefined would leave the string "undefined".
      names.forEach((n, i) => (saved[i] === undefined ? delete process.env[n] : (process.env[n] = saved[i])));
    }
  }

  /** Runs `f` as this phone (its clock skew applies while it runs). */
  async act<T>(f: () => Promise<T> | T): Promise<T> {
    const prev = this.sim.current;
    this.sim.current = this;
    try {
      return await f();
    } finally {
      this.sim.current = prev;
    }
  }
  do<T>(f: () => T): T {
    const prev = this.sim.current;
    this.sim.current = this;
    try {
      return f();
    } finally {
      this.sim.current = prev;
    }
  }

  // --- what the screens do ---------------------------------------------------------------------------------------
  /** Google part of signing in (google.ts `linkGoogle`): the account is saved on the phone, sync is not on yet. */
  signInGoogle(email: string) {
    this.googleAccount = email;
    this.do(() => this.storage.setMeta('driveUser', email));
  }
  /** welcome.tsx / account.tsx: Google sign-in, then `linkCloud()` (turns sync on, first sync). */
  async signIn(email: string) {
    this.signInGoogle(email);
    await this.act(() => this.cloud.linkCloud());
  }
  /** account.tsx `signOut` without its guards: sync off, Google off, optional wipe, welcome again. */
  async signOut(opts: { wipe?: boolean } = {}) {
    // Same order as account.tsx: the wipe (with its safety copy) first, then sync and Google off.
    if (opts.wipe) await this.act(() => this.restoreMod.wipeLocal());
    this.do(() => {
      this.cloud.unlinkCloud();
      for (const k of ['driveUser', 'driveName', 'drivePhoto']) this.storage.setMeta(k, '');
      this.googleAccount = null;
      this.storage.setMeta('welcomeDone', '');
    });
  }
  sync() {
    return this.act(() => this.cloud.syncCloud());
  }
  keepSynced() {
    return this.act(() => this.cloud.keepSynced());
  }

  // --- files ---------------------------------------------------------------------------------------------------
  /** A progress photo file in the app's photos folder (same folder and name pattern as photos.ts). */
  addPhoto(name: string, text = 'jpeg-bytes') {
    this.fs.put(this.fs.doc('photos', name), text);
  }
  photoNames(): string[] {
    return this.fs.names(this.fs.doc('photos'));
  }
  /** File names in the safety snapshot folder, the recovery folder and the weekly backup folder. */
  snapshotFiles(): string[] {
    return this.fs.names(this.fs.doc('backups', 'safety'));
  }
  recoveryFolders(): string[] {
    return this.fs.names(this.fs.doc('recovery'));
  }
  autoBackupFiles(): string[] {
    return this.fs.names(this.fs.doc('backups')).filter((n) => n.startsWith('gym-auto-'));
  }

  // --- data helpers ----------------------------------------------------------------------------------------------
  setRow(date: string, exId: string, idx: number, kg: number | null = 60) {
    this.do(() => this.storage.saveSet({ date, weekday: 1, exId, idx, kg, reps: 8, done: 1 }));
  }
  setMeta(k: string, v: string) {
    this.do(() => this.storage.setMeta(k, v));
  }
  meta(k: string): string | null {
    return this.raw.getMeta(k);
  }
  json<T>(k: string): T {
    return JSON.parse(this.raw.getMeta(k) || 'null') as T;
  }
  /** `date|exId|idx` of every logged set. */
  setKeys(): string[] {
    return this.raw.allSets().map((r) => `${r.date}|${r.exId}|${r.idx}`);
  }
  tasks(): string[] {
    return (this.json<{ id: string }[]>('tasks') ?? []).map((t) => t.id);
  }
  dirtyKeys(): string[] {
    return Object.keys(this.do(() => this.track.dirty())).sort();
  }
  status() {
    return this.do(() => this.cloud.syncStatus());
  }
}

/** Waits until `f()` is true (async work on the simulated phones needs a few turns of the event loop). */
export async function until(f: () => boolean, what = 'condition'): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (f()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(`timed out waiting for ${what}`);
}
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
