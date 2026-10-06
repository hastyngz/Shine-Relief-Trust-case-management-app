import { AppDatabase } from '../types';
import { syncEntireDatabaseToFirestore } from './firestoreSync';

const OFFLINE_SNAPSHOT_KEY = 'shine_relief_trust_pending_sync_v1';

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function readPendingOfflineSnapshots(): AppDatabase[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as AppDatabase[] : [];
  } catch (error) {
    console.warn('Could not read pending offline snapshots:', error);
    return [];
  }
}

export function writePendingOfflineSnapshot(snapshot: AppDatabase): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = readPendingOfflineSnapshots();
    const next = [...existing, snapshot];
    window.localStorage.setItem(OFFLINE_SNAPSHOT_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Could not queue offline snapshot:', error);
  }
}

export function clearPendingOfflineSnapshots(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(OFFLINE_SNAPSHOT_KEY);
}

export async function flushPendingOfflineSnapshots(): Promise<boolean> {
  if (!isBrowserOnline() || typeof window === 'undefined') return false;
  const queued = readPendingOfflineSnapshots();
  if (!queued.length) return false;
  try {
    const newest = queued[queued.length - 1];
    await syncEntireDatabaseToFirestore(newest, true);
    clearPendingOfflineSnapshots();
    return true;
  } catch (error) {
    console.warn('Could not flush offline queue to Firestore:', error);
    return false;
  }
}

export function queueOfflineSnapshotIfNeeded(snapshot: AppDatabase): void {
  if (typeof window === 'undefined' || isBrowserOnline()) return;
  writePendingOfflineSnapshot(snapshot);
}
