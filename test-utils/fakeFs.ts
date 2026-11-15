/// <reference types="jest" />
// An in-memory stand-in for `expo-file-system` (the object API: File, Directory, Paths), enough for the safety net
// (src/lib/safetyIO.ts) and the weekly automatic backup (src/lib/autoBackup.ts). One per simulated phone. The real
// safetyIO runs on top of it, so its protocols are tested, not a copy of them.
//
// Knobs: `free` (bytes of free space; writes that do not fit throw ENOSPC), `hook(op, path)` (called before every
// operation; throw from it to fail that operation), `transformWrite(path, text)` (change what a write stores, to make a
// torn file), `noMove` (File has no `move`, like an older platform).
import { utf8Length } from '../src/lib/safety';
import type * as SafetyIOMod from '../src/lib/safetyIO';

export type FsOp = 'create' | 'write' | 'read' | 'delete' | 'rename' | 'move' | 'copy' | 'list';
type Part = string | { uri: string };

const DOC = 'file:///document';
const CACHE = 'file:///cache';

const norm = (u: string) => {
  const m = /^file:\/\/(.*)$/.exec(u); // the scheme's own slashes stay
  const rest = (m ? m[1] : u).replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return m ? `file://${rest}` : rest;
};
function join(parts: readonly Part[]): string {
  let cur = '';
  for (const p of parts) {
    const s = typeof p === 'string' ? p : p.uri;
    cur = cur === '' || s.startsWith('file://') ? s : `${cur}/${s}`;
  }
  return norm(cur);
}
const parentOf = (uri: string) => uri.slice(0, uri.lastIndexOf('/'));
const nameOf = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);

export function createFakeFs(opts: { free?: number; noMove?: boolean } = {}) {
  /** uri → file text, or null for a directory. */
  const store = new Map<string, string | null>([
    [DOC, null],
    [CACHE, null],
  ]);
  const fs = {
    free: opts.free ?? 200_000_000,
    noMove: !!opts.noMove,
    hook: undefined as undefined | ((op: FsOp, path: string) => void),
    transformWrite: undefined as undefined | ((path: string, text: string) => string),
    /** Every operation in order, `op path`. */
    ops: [] as string[],
    store,
  };
  const touch = (op: FsOp, path: string) => {
    fs.ops.push(`${op} ${path}`);
    fs.hook?.(op, path);
  };
  const isFile = (u: string) => typeof store.get(u) === 'string';
  const isDir = (u: string) => store.get(u) === null;
  const mkdirp = (uri: string) => {
    if (store.has(uri)) return;
    mkdirp(parentOf(uri));
    store.set(uri, null);
  };
  const children = (uri: string) => [...store.keys()].filter((k) => k !== uri && parentOf(k) === uri);

  class Entry {
    uri: string;
    constructor(...parts: Part[]) {
      this.uri = join(parts);
    }
    get name() {
      return nameOf(this.uri);
    }
  }

  class File extends Entry {
    constructor(...parts: Part[]) {
      super(...parts);
      if (fs.noMove) Object.defineProperty(this, 'move', { value: undefined });
    }
    get exists() {
      return isFile(this.uri);
    }
    get size(): number | null {
      const v = store.get(this.uri);
      return typeof v === 'string' ? utf8Length(v) : null;
    }
    create(o?: { overwrite?: boolean }) {
      touch('create', this.uri);
      if (!isDir(parentOf(this.uri))) throw new Error(`ENOENT: parent folder missing for ${this.uri}`);
      if (store.has(this.uri) && !o?.overwrite) throw new Error(`EEXIST: ${this.uri}`);
      store.set(this.uri, '');
    }
    delete() {
      touch('delete', this.uri);
      if (!this.exists) throw new Error(`ENOENT: ${this.uri}`);
      fs.free += this.size ?? 0;
      store.delete(this.uri);
    }
    writeSync(text: string) {
      touch('write', this.uri);
      if (!this.exists) throw new Error(`ENOENT: ${this.uri}`);
      const stored = fs.transformWrite?.(this.uri, text) ?? text;
      const delta = utf8Length(stored) - (this.size ?? 0);
      if (delta > fs.free) throw new Error('ENOSPC: no space left on device');
      fs.free -= delta;
      store.set(this.uri, stored);
    }
    async text(): Promise<string> {
      touch('read', this.uri);
      await Promise.resolve();
      if (!this.exists) throw new Error(`ENOENT: ${this.uri}`);
      return store.get(this.uri) as string;
    }
    rename(newName: string) {
      touch('rename', this.uri);
      const to = join([parentOf(this.uri), newName]);
      if (!this.exists) throw new Error(`ENOENT: ${this.uri}`);
      if (store.has(to)) throw new Error(`EEXIST: ${to}`);
      store.set(to, store.get(this.uri) as string);
      store.delete(this.uri);
      this.uri = to;
    }
    private target(dest: Part): string {
      const u = join([dest]);
      return isDir(u) ? join([u, this.name]) : u;
    }
    async copy(dest: Part) {
      touch('copy', this.uri);
      await Promise.resolve();
      const to = this.target(dest);
      if (!this.exists) throw new Error(`ENOENT: ${this.uri}`);
      if (store.has(to)) throw new Error(`EEXIST: ${to}`);
      if (!isDir(parentOf(to))) throw new Error(`ENOENT: parent folder missing for ${to}`);
      const text = store.get(this.uri) as string;
      if (utf8Length(text) > fs.free) throw new Error('ENOSPC: no space left on device');
      fs.free -= utf8Length(text);
      store.set(to, fs.transformWrite?.(to, text) ?? text);
    }
    async move(dest: Part) {
      touch('move', this.uri);
      await Promise.resolve();
      const to = this.target(dest);
      if (!this.exists) throw new Error(`ENOENT: ${this.uri}`);
      if (store.has(to)) throw new Error(`EEXIST: ${to}`);
      if (!isDir(parentOf(to))) throw new Error(`ENOENT: parent folder missing for ${to}`);
      store.set(to, store.get(this.uri) as string);
      store.delete(this.uri);
      this.uri = to; // like the real File: its uri follows the move
    }
  }

  class Directory extends Entry {
    get exists() {
      return isDir(this.uri);
    }
    create(o?: { intermediates?: boolean }) {
      touch('create', this.uri);
      if (store.has(this.uri)) throw new Error(`EEXIST: ${this.uri}`);
      if (!o?.intermediates && !isDir(parentOf(this.uri))) throw new Error(`ENOENT: parent folder missing for ${this.uri}`);
      mkdirp(this.uri);
    }
    delete() {
      touch('delete', this.uri);
      if (!this.exists) throw new Error(`ENOENT: ${this.uri}`);
      for (const k of [...store.keys()]) {
        if (k === this.uri || k.startsWith(`${this.uri}/`)) {
          fs.free += utf8Length(store.get(k) ?? '');
          store.delete(k);
        }
      }
    }
    list(): (File | Directory)[] {
      touch('list', this.uri);
      if (!this.exists) throw new Error(`ENOENT: ${this.uri}`);
      return children(this.uri).map((k) => (isDir(k) ? new Directory(k) : new File(k)));
    }
  }

  const Paths = {
    document: new Directory(DOC),
    cache: new Directory(CACHE),
    get availableDiskSpace() {
      return fs.free;
    },
    get totalDiskSpace() {
      return 1_000_000_000;
    },
  };

  return Object.assign(fs, {
    /** What `jest.doMock('expo-file-system', () => fs.module)` hands the app code. */
    module: { File, Directory, Paths },
    /** The uri of a place under the app's document folder. */
    doc: (...segments: string[]) => join([DOC, ...segments]),
    /** Puts a file in place without going through the hooks (setting up a test). */
    put(uri: string, text = 'x') {
      mkdirp(parentOf(uri));
      store.set(uri, text);
    },
    read: (uri: string) => (isFile(uri) ? (store.get(uri) as string) : null),
    has: (uri: string) => store.has(uri),
    /** Sorted names directly inside a folder (empty when it does not exist). */
    names: (uri: string) => children(uri).map(nameOf).sort(),
  });
}
export type FakeFs = ReturnType<typeof createFakeFs>;

/** The real safetyIO.ts on top of a fake file system, in its own module registry (its own lock). */
export function loadSafetyIO(fs: FakeFs): typeof SafetyIOMod {
  let mod!: typeof SafetyIOMod;
  jest.isolateModules(() => {
    jest.doMock('expo-file-system', () => fs.module);
    mod = jest.requireActual<typeof SafetyIOMod>('../src/lib/safetyIO');
  });
  return mod;
}
