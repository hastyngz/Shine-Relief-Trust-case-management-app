import type { AppDatabase } from '../types';

export type BackupRestoreResult =
  | { status: 'restored' }
  | { status: 'local_save_failed' }
  | { status: 'cloud_sync_failed'; localRollbackSucceeded: boolean; error: string }
  | { status: 'restored_queue_cleanup_failed'; error: string };

interface RestoreDependencies {
  saveLocal: (db: AppDatabase) => { ok: boolean };
  syncCloud: (db: AppDatabase) => Promise<void>;
  clearOfflineState: (db: AppDatabase) => Promise<void>;
}

/**
 * Coordinates a backup restore while making partial outcomes explicit.
 * Firestore writes may span multiple batches and cannot be rolled back here;
 * on cloud failure, restore the prior local database and report that cloud
 * state may be partial rather than claiming the restore simply failed.
 */
export async function restoreDatabaseWithRecovery(
  previousDb: AppDatabase,
  restoredDb: AppDatabase,
  dependencies: RestoreDependencies,
): Promise<BackupRestoreResult> {
  const localSave = dependencies.saveLocal(restoredDb);
  if (!localSave.ok) return { status: 'local_save_failed' };

  try {
    await dependencies.syncCloud(restoredDb);
  } catch (error) {
    let localRollbackSucceeded = false;
    try {
      localRollbackSucceeded = dependencies.saveLocal(previousDb).ok;
    } catch {
      localRollbackSucceeded = false;
    }
    return {
      status: 'cloud_sync_failed',
      localRollbackSucceeded,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    await dependencies.clearOfflineState(restoredDb);
  } catch (error) {
    return {
      status: 'restored_queue_cleanup_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return { status: 'restored' };
}
