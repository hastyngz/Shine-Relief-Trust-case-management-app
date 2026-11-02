import assert from 'node:assert/strict';
import {
  fingerprintPettyCashEntries,
  migratePettyCashLedgerState,
  parsePettyCashLedgerMigrationOptions,
  type PettyCashLedgerMigrationStore,
} from './pettyCashLedgerStateMigration';
import type { PettyCashLedgerState } from '../src/services/pettyCashLedger';

const projectId = 'synthetic-shine-project';
const opening = {
  id: 'PETTY_CASH_OPENING_BALANCE',
  date: '2026-11-01',
  type: 'opening_balance' as const,
  amountMWK: 50000,
  description: 'Synthetic opening float',
  reference: 'OPEN-SYNTHETIC-001',
  recordedAt: '2026-11-01T08:00:00.000Z',
  recordedBy: 'Synthetic Manager',
  recordedByUid: 'synthetic-manager',
  createdAt: '2026-11-01T08:00:00.000Z',
};
const expense = {
  ...opening,
  id: 'PCASH_SYNTHETIC_EXPENSE_001',
  date: '2026-11-02',
  type: 'expense' as const,
  amountMWK: 12000,
  reference: 'VOUCHER-SYNTHETIC-001',
  recordedAt: '2026-11-02T09:00:00.000Z',
  createdAt: '2026-11-02T09:00:00.000Z',
};
const entries = [
  { id: opening.id, data: opening },
  { id: expense.id, data: expense },
];

class MemoryMigrationStore implements PettyCashLedgerMigrationStore {
  state: unknown | null = null;
  writes = 0;
  changeBeforeApply = false;

  constructor(public records = structuredClone(entries)) {}

  async listEntries() {
    return structuredClone(this.records);
  }

  async readState() {
    return structuredClone(this.state);
  }

  async initializeStateIfUnchanged(state: PettyCashLedgerState, fingerprint: string) {
    if (this.changeBeforeApply) {
      this.records.push({ id: 'PCASH_CONCURRENT_SYNTHETIC', data: { ...expense, id: 'PCASH_CONCURRENT_SYNTHETIC' } });
      this.changeBeforeApply = false;
    }
    if (this.state !== null) return 'changed' as const;
    if (fingerprintPettyCashEntries(this.records) !== fingerprint) return 'changed' as const;
    this.state = structuredClone(state);
    this.writes += 1;
    return 'created' as const;
  }
}

const dryRunStore = new MemoryMigrationStore();
const dryRun = await migratePettyCashLedgerState(dryRunStore, { apply: false, projectId });
assert.deepEqual(dryRun, {
  entriesExamined: 2,
  conflicts: 0,
  malformed: 0,
  stateStatus: 'missing',
  applied: false,
});
assert.equal(dryRunStore.writes, 0, 'dry run never writes the checkpoint');

const applyStore = new MemoryMigrationStore();
const applied = await migratePettyCashLedgerState(applyStore, { apply: true, projectId });
assert.equal(applied.applied, true);
assert.equal(applied.stateStatus, 'current');
assert.equal(applyStore.writes, 1);
assert.deepEqual(applyStore.state, {
  balanceMWK: 38000,
  latestDate: expense.date,
  lastTransactionId: expense.id,
  updatedAt: expense.recordedAt,
});

const matchingStateStore = new MemoryMigrationStore();
matchingStateStore.state = structuredClone(applyStore.state);
const alreadyCurrent = await migratePettyCashLedgerState(matchingStateStore, { apply: true, projectId });
assert.equal(alreadyCurrent.stateStatus, 'current');
assert.equal(alreadyCurrent.applied, false, 'a matching checkpoint is not rewritten');

const orphanStateStore = new MemoryMigrationStore([]);
orphanStateStore.state = structuredClone(applyStore.state);
const orphanState = await migratePettyCashLedgerState(orphanStateStore, { apply: false, projectId });
assert.equal(orphanState.stateStatus, 'inconsistent', 'a checkpoint without ledger entries is not treated as an empty ledger');
assert.equal(orphanState.conflicts, 1);

const inconsistentStateStore = new MemoryMigrationStore();
inconsistentStateStore.state = {
  balanceMWK: 1,
  latestDate: expense.date,
  lastTransactionId: expense.id,
  updatedAt: expense.recordedAt,
};
const inconsistent = await migratePettyCashLedgerState(inconsistentStateStore, { apply: false, projectId });
assert.equal(inconsistent.conflicts, 1);
assert.equal(inconsistent.stateStatus, 'inconsistent');

const changedStore = new MemoryMigrationStore();
changedStore.changeBeforeApply = true;
const changedDuringMigration = await migratePettyCashLedgerState(changedStore, { apply: true, projectId });
assert.equal(changedDuringMigration.conflicts, 1);
assert.equal(changedStore.writes, 0, 'concurrent ledger changes prevent checkpoint creation');

const overdrawnStore = new MemoryMigrationStore([
  { id: opening.id, data: opening },
  { id: 'PCASH_SYNTHETIC_OVERDRAW', data: { ...expense, id: 'PCASH_SYNTHETIC_OVERDRAW', amountMWK: 50001 } },
]);
assert.equal((await migratePettyCashLedgerState(overdrawnStore, { apply: true, projectId })).malformed, 1);
assert.equal(overdrawnStore.writes, 0, 'invalid historical balances are never checkpointed');

assert.deepEqual(parsePettyCashLedgerMigrationOptions(['--project', projectId], projectId), {
  apply: false,
  projectId,
});
assert.deepEqual(parsePettyCashLedgerMigrationOptions([
  `--project=${projectId}`, '--apply', `--confirm-project=${projectId}`,
], projectId), { apply: true, projectId });
assert.throws(() => parsePettyCashLedgerMigrationOptions(['--project', projectId, '--apply'], projectId), /requires --confirm-project/);
assert.throws(() => parsePettyCashLedgerMigrationOptions(['--project', 'other-project'], projectId), /matching the configured/);

console.log('Petty-cash ledger-state migration tests passed.');
