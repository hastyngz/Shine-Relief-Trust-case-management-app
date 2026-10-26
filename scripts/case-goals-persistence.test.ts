import assert from 'node:assert/strict';
import type { AppDatabase, CaseGoal } from '../src/types';
import {
  ensureCaseGoalDraftIdentity,
  saveCaseGoal,
  type CaseGoalPersistenceDependencies,
} from '../src/services/caseGoalPersistence';

const goal: CaseGoal = {
  id: 'goal_retry_1',
  girlId: 'girl-synthetic',
  title: 'Synthetic school attendance goal',
  baseline: 'Synthetic baseline',
  targetOutcome: 'Synthetic target',
  measureOfSuccess: 'Synthetic measure',
  status: 'Not started',
  progressNotes: [],
  createdByUid: 'staff-synthetic',
  createdBy: 'Synthetic Staff',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedByUid: 'staff-synthetic',
  updatedBy: 'Synthetic Staff',
  updatedAt: '2026-10-26T00:00:00.000Z',
};

function makeDependencies(overrides: Partial<CaseGoalPersistenceDependencies> = {}) {
  const saved: AppDatabase[] = [];
  const remoteCalls: Array<{ collection: string; record: CaseGoal }> = [];
  const dependencies: CaseGoalPersistenceDependencies = {
    getDatabase: () => ({ caseGoals: [] } as unknown as AppDatabase),
    saveDatabase: (database) => {
      saved.push(database);
      return { ok: true, quotaExceeded: false };
    },
    isOnline: () => true,
    persistRemote: async (collection, record) => {
      remoteCalls.push({ collection, record });
    },
    ...overrides,
  };
  return { dependencies, saved, remoteCalls };
}

async function run() {
  {
    let remoteAttempted = false;
    const { dependencies, saved } = makeDependencies({
      saveDatabase: () => ({ ok: false, quotaExceeded: true, error: new Error('synthetic quota failure') }),
      persistRemote: async () => { remoteAttempted = true; },
    });
    await assert.rejects(
      saveCaseGoal(goal, dependencies),
      /not saved on this device.*storage is full/i,
    );
    assert.equal(saved.length, 0);
    assert.equal(remoteAttempted, false, 'cloud write must not start after local persistence fails');
  }

  {
    const { dependencies, saved, remoteCalls } = makeDependencies({ isOnline: () => false });
    const status = await saveCaseGoal(goal, dependencies);
    assert.equal(status, 'queued');
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].caseGoals, [goal]);
    assert.equal(remoteCalls.length, 0, 'offline save should rely on the normal sync queue');
  }

  {
    const { dependencies, saved } = makeDependencies({
      persistRemote: async () => { throw new Error('synthetic permission denied'); },
    });
    await assert.rejects(
      saveCaseGoal(goal, dependencies),
      /saved on this device but cloud sync was not confirmed/i,
    );
    assert.equal(saved.length, 1, 'successful local copy remains available after cloud failure');
    assert.equal(saved[0].caseGoals?.[0].id, goal.id, 'retry uses the same goal document ID');
  }

  {
    const { dependencies, remoteCalls } = makeDependencies();
    assert.equal(await saveCaseGoal(goal, dependencies), 'synced');
    assert.deepEqual(remoteCalls.map(({ collection }) => collection), ['caseGoals']);
    assert.equal(remoteCalls[0].record.id, goal.id);
  }

  {
    let generated = 0;
    const createId = () => `goal_stable_${++generated}`;
    const firstAttempt = ensureCaseGoalDraftIdentity(
      { title: 'Synthetic goal', goalId: '', goalCreatedAt: '' },
      '2026-10-26T00:00:00.000Z',
      createId,
    );
    const retry = ensureCaseGoalDraftIdentity(firstAttempt, '2026-10-27T00:00:00.000Z', createId);
    assert.equal(firstAttempt.goalId, 'goal_stable_1');
    assert.equal(retry.goalId, firstAttempt.goalId);
    assert.equal(retry.goalCreatedAt, firstAttempt.goalCreatedAt);
    assert.equal(generated, 1, 'retry must not allocate a second goal ID');
  }

  console.log('Case-goal persistence tests passed: local failures, offline queueing, sync retry, and stable identity.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
