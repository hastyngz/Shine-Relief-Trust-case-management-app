import type { AppDatabase, CaseGoal } from '../types';
import {
  getDatabase,
  saveDatabase,
  type StorageSaveResult,
} from '../utils/storage';
import { persistPhase2Record } from './firestoreSync';

export type CaseGoalSaveStatus = 'queued' | 'synced';

type CaseGoalDraftIdentity = {
  goalId?: string;
  goalCreatedAt?: string;
};

/**
 * Keep a draft's eventual document identity stable across retries and reloads.
 * The caller stores these fields alongside the local form draft.
 */
export function ensureCaseGoalDraftIdentity<T extends CaseGoalDraftIdentity>(
  draft: T,
  now: string,
  createId: () => string = createCaseGoalId,
): T & { goalId: string; goalCreatedAt: string } {
  return {
    ...draft,
    goalId: draft.goalId || createId(),
    goalCreatedAt: draft.goalCreatedAt || now,
  };
}

function createCaseGoalId(): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `goal_${uuid}`;
}

export interface CaseGoalPersistenceDependencies {
  getDatabase: () => AppDatabase;
  saveDatabase: (database: AppDatabase) => StorageSaveResult;
  isOnline: () => boolean;
  persistRemote: (collection: string, record: CaseGoal) => Promise<void>;
}

const defaultDependencies: CaseGoalPersistenceDependencies = {
  getDatabase,
  saveDatabase,
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  persistRemote: persistPhase2Record,
};

/**
 * Save locally first so App's normal offline queue observes the change. Never
 * claim success or start a cloud write if local storage rejected the update.
 */
export async function saveCaseGoal(
  goal: CaseGoal,
  dependencies: CaseGoalPersistenceDependencies = defaultDependencies,
): Promise<CaseGoalSaveStatus> {
  const current = dependencies.getDatabase();
  const database = {
    ...current,
    caseGoals: [...(current.caseGoals || []).filter((item) => item.id !== goal.id), goal],
  };
  const localResult = dependencies.saveDatabase(database);
  if (!localResult.ok) {
    const storageMessage = localResult.quotaExceeded
      ? 'Device storage is full.'
      : 'Device storage is unavailable.';
    throw new Error(`The goal was not saved on this device, so cloud sync was not started. ${storageMessage} Free storage or restore access, then retry.`);
  }

  if (!dependencies.isOnline()) return 'queued';

  try {
    await dependencies.persistRemote('caseGoals', goal);
    return 'synced';
  } catch (error) {
    throw new Error('The goal is saved on this device but cloud sync was not confirmed. Keep the form open and retry when the connection or access issue is resolved.', { cause: error });
  }
}
