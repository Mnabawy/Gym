// Web preview: no app folder to keep snapshots in, and sync, the Google account and the wipe are phone-only here. The same
// functions as safetyIO.ts, doing nothing, so the web build never blocks on a safety copy it cannot make.
import { type RecoveryState, type SnapshotInfo, type SnapshotReason, type SnapshotResult } from './safety';
import type { Dump } from './storage.types';

export const safetySupported = false;
export type RecoveryInfo = { id: string; createdAt: number; state: RecoveryState; count: number };

export const listSnapshots = (): SnapshotInfo[] => [];
export const readSnapshot = async (_name: string): Promise<string> => {
  throw new Error('no snapshots on the web');
};
export const createSnapshot = async (_reason: SnapshotReason, _dump: Dump, _now?: number): Promise<SnapshotResult> => ({ name: '', reused: false });
export const pruneSnapshots = async (_now?: number): Promise<void> => {};
export const movePhotosToRecovery = async (_now?: number): Promise<{ id: string; count: number }> => ({ id: '', count: 0 });
export const finishRecovery = async (_id: string, _now?: number): Promise<void> => {};
export const abortRecovery = async (_id: string): Promise<number> => 0;
export const restoreRecoveryPhotos = abortRecovery;
export const listRecoveries = async (): Promise<RecoveryInfo[]> => [];
export const deleteRecovery = async (_id: string): Promise<void> => {};
export const repairRecoveries = async (_hasLocalData: boolean, _now?: number): Promise<{ restored: number; finished: number; purged: number; failed: number }> => ({ restored: 0, finished: 0, purged: 0, failed: 0 });
