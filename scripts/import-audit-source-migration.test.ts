import assert from 'node:assert/strict';
import {
  formatMigrationSummary,
  migrateImportAuditSourceData,
  parseMigrationOptions,
  type ImportAuditMigrationStore,
  type MigrationDocument,
} from './importAuditSourceMigration';
import { planImportAuditWrites } from '../src/services/importAuditPersistence';

type Audit = Record<string, unknown>;

class MemoryMigrationStore implements ImportAuditMigrationStore {
  audits = new Map<string, Audit>();
  sources = new Map<string, Audit>();
  auditVersions = new Map<string, number>();
  sourceVersions = new Map<string, number>();
  writes = 0;
  failCreate = false;
  failAuditUpdate = false;
  failList = false;
  failCompletionMarker = false;
  migrationComplete = false;
  beforeCommit?: (auditId: string, transactionNumber: number) => void;
  transactionCount = new Map<string, number>();

  async listImportAuditIds(): Promise<string[]> {
    if (this.failList) throw new Error('Synthetic list failure');
    return [...this.audits.keys()];
  }

  async markMigrationComplete(): Promise<void> {
    if (this.failCompletionMarker) throw new Error('Synthetic completion marker failure');
    if (!this.migrationComplete) {
      this.migrationComplete = true;
      this.writes += 1;
    }
  }

  async runAuditTransaction<T>(
    auditId: string,
    action: Parameters<ImportAuditMigrationStore['runAuditTransaction']>[1],
  ): Promise<T> {
    const transactionNumber = (this.transactionCount.get(auditId) || 0) + 1;
    this.transactionCount.set(auditId, transactionNumber);
    const auditVersion = this.auditVersions.get(auditId) || 0;
    const sourceVersion = this.sourceVersions.get(auditId) || 0;
    let auditExists = this.audits.has(auditId);
    let auditData = auditExists ? structuredClone(this.audits.get(auditId)!) : undefined;
    let sourceExists = this.sources.has(auditId);
    let sourceData = sourceExists ? structuredClone(this.sources.get(auditId)!) : undefined;
    let createSource = false;
    let removeEmbeddedSourceData = false;

    const result = await action({
      async getAudit(): Promise<MigrationDocument> {
        return { exists: auditExists, data: auditData };
      },
      async getRestrictedSource(): Promise<MigrationDocument> {
        return { exists: sourceExists, data: sourceData };
      },
      createRestrictedSource: (data) => {
        if (this.failCreate || sourceExists) throw new Error('Synthetic source create failure');
        createSource = true;
        sourceExists = true;
        sourceData = structuredClone(data);
      },
      removeEmbeddedSourceData: () => {
        if (this.failAuditUpdate) throw new Error('Synthetic audit update failure');
        if (!auditData) throw new Error('Missing synthetic audit');
        const { sourceData: _removed, ...metadata } = auditData;
        auditData = { ...metadata, sourceDataStoredInRestrictedCollection: true };
        removeEmbeddedSourceData = true;
      },
    });

    this.beforeCommit?.(auditId, transactionNumber);
    if ((this.auditVersions.get(auditId) || 0) !== auditVersion || (this.sourceVersions.get(auditId) || 0) !== sourceVersion) {
      throw new Error('Synthetic transaction contention');
    }
    if (createSource) {
      this.sources.set(auditId, sourceData!);
      this.sourceVersions.set(auditId, sourceVersion + 1);
      this.writes += 1;
    }
    if (removeEmbeddedSourceData) {
      this.audits.set(auditId, auditData!);
      this.auditVersions.set(auditId, auditVersion + 1);
      this.writes += 1;
    }
    return result as T;
  }

  addAudit(id: string, data: Audit) {
    this.audits.set(id, structuredClone(data));
    this.auditVersions.set(id, 1);
  }

  mutateAudit(id: string, mutate: (audit: Audit) => Audit) {
    this.audits.set(id, mutate(structuredClone(this.audits.get(id)!)));
    this.auditVersions.set(id, (this.auditVersions.get(id) || 0) + 1);
  }
}

const projectId = 'shine-test-project';
const sourceRows = { detectedKind: 'payroll-grid', sheets: [{ name: 'Synthetic', rowsRead: 1, cells: [] }] };
const legacyAudit = (sourceData: unknown = sourceRows): Audit => ({
  id: 'audit-synthetic',
  fileName: 'synthetic.xlsx',
  importedAt: '2026-10-18T00:00:00.000Z',
  status: 'completed',
  unrelatedMetadata: 'preserve-me',
  sourceData,
});

async function testDryRunAndAlreadyMigratedCounts() {
  const store = new MemoryMigrationStore();
  store.addAudit('audit-synthetic', legacyAudit());
  store.addAudit('already-clean', { id: 'already-clean', fileName: 'clean.xlsx', importedAt: '2026-10-18', status: 'completed' });
  const summary = await migrateImportAuditSourceData(store, { apply: false, projectId });
  assert.equal(summary.examined, 2);
  assert.equal(summary.requiringRepair, 1);
  assert.equal(summary.alreadyCorrect, 1);
  assert.equal(summary.matchingDestinations, 0);
  assert.equal(summary.conflicts, 0);
  assert.equal(summary.malformed, 0);
  assert.equal(summary.failures, 0);
  assert.equal(store.writes, 0, 'dry run must perform zero writes');
  assert.equal(store.migrationComplete, false, 'dry run must not enable staff collection queries');
  assert.equal(store.sources.size, 0);
  assert.ok(store.audits.get('audit-synthetic')?.sourceData);
}

async function testMissingSourceDataAndNoUnnecessaryWrites() {
  const store = new MemoryMigrationStore();
  store.addAudit('clean-audit', { id: 'clean-audit', status: 'completed' });
  const summary = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(summary.alreadyCorrect, 1);
  assert.equal(summary.migrated, 0);
  assert.equal(store.writes, 1, 'only the migration-complete gate should be written when no legacy source remains');
  assert.equal(store.migrationComplete, true);
}

async function testIdenticalDestinationAndMetadataPreservation() {
  const store = new MemoryMigrationStore();
  store.addAudit('audit-synthetic', legacyAudit());
  store.sources.set('audit-synthetic', {
    id: 'audit-synthetic',
    auditId: 'audit-synthetic',
    fileName: 'synthetic.xlsx',
    importedAt: '2026-10-18T00:00:00.000Z',
    sourceData: structuredClone(sourceRows),
    preservedDestinationMetadata: 'keep-me',
  });
  store.sourceVersions.set('audit-synthetic', 1);

  const summary = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(summary.migrated, 1);
  assert.equal(summary.matchingDestinations, 1);
  assert.equal(summary.alreadyCorrect, 1, 'post-apply verification must see the cleaned audit');
  assert.deepEqual(store.sources.get('audit-synthetic')?.sourceData, sourceRows);
  assert.equal(store.sources.get('audit-synthetic')?.preservedDestinationMetadata, 'keep-me');
  assert.equal(store.audits.get('audit-synthetic')?.unrelatedMetadata, 'preserve-me');
  assert.equal(store.audits.get('audit-synthetic')?.sourceDataStoredInRestrictedCollection, true);
  assert.equal(Object.hasOwn(store.audits.get('audit-synthetic')!, 'sourceData'), false);
  assert.equal(store.writes, 2, 'only the audit cleanup and completion marker should be written');
  assert.equal(store.migrationComplete, true);
}

async function testConflictsBlockAllWrites() {
  const store = new MemoryMigrationStore();
  store.addAudit('audit-synthetic', legacyAudit());
  store.addAudit('conflicting-audit', { ...legacyAudit({ newer: true }), id: 'conflicting-audit' });
  store.sources.set('conflicting-audit', { id: 'conflicting-audit', auditId: 'conflicting-audit', fileName: 'other.xlsx' });
  store.sourceVersions.set('conflicting-audit', 1);
  const summary = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(summary.applyBlocked, true);
  assert.equal(summary.conflicts, 1);
  assert.equal(store.writes, 0, 'preflight conflicts must prevent writes to all records');
  assert.ok(store.audits.get('audit-synthetic')?.sourceData);
}

async function testDestinationWriteFailureAndNoSensitiveDiagnostics() {
  const store = new MemoryMigrationStore();
  store.addAudit('private-audit-id', {
    ...legacyAudit({ privateSyntheticValue: 'SENSITIVE-SYNTHETIC-VALUE' }),
    id: 'private-audit-id',
  });
  store.failCreate = true;
  const summary = await migrateImportAuditSourceData(store, { apply: true, projectId });
  const output = formatMigrationSummary(summary, true).join('\n');
  assert.equal(summary.failures, 1);
  assert.equal(summary.requiringRepair, 1, 'failed write leaves the embedded source available for retry');
  assert.equal(store.writes, 0);
  assert.ok(store.audits.get('private-audit-id')?.sourceData);
  assert.equal(output.includes('SENSITIVE-SYNTHETIC-VALUE'), false);
  assert.equal(output.includes('private-audit-id'), false);
}

async function testAuditUpdateFailureLeavesNoPartialDestinationAndRetries() {
  const store = new MemoryMigrationStore();
  store.addAudit('audit-synthetic', legacyAudit());
  store.failAuditUpdate = true;
  const failed = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(failed.failures, 1);
  assert.equal(failed.requiringRepair, 1);
  assert.equal(store.sources.has('audit-synthetic'), false, 'failed transaction must not leave a partial source write');
  assert.ok(store.audits.get('audit-synthetic')?.sourceData);

  store.failAuditUpdate = false;
  const retried = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(retried.migrated, 1);
  assert.equal(store.sources.has('audit-synthetic'), true);
  assert.equal(Object.hasOwn(store.audits.get('audit-synthetic')!, 'sourceData'), false);
}

async function testInterruptionAfterDestinationExistsCanResume() {
  const store = new MemoryMigrationStore();
  store.addAudit('audit-synthetic', legacyAudit());
  store.sources.set('audit-synthetic', {
    id: 'audit-synthetic', auditId: 'audit-synthetic', fileName: 'synthetic.xlsx',
    importedAt: '2026-10-18T00:00:00.000Z', sourceData: structuredClone(sourceRows),
  });
  store.sourceVersions.set('audit-synthetic', 1);
  store.failAuditUpdate = true;
  const firstAttempt = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(firstAttempt.failures, 1);
  assert.equal(firstAttempt.matchingDestinations, 1);
  assert.ok(store.audits.get('audit-synthetic')?.sourceData);

  store.failAuditUpdate = false;
  const retry = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(retry.migrated, 1);
  assert.equal(store.writes, 2, 'retry removes only the legacy field and writes the completion marker');
}

async function testConcurrentModificationIsNotOverwritten() {
  const store = new MemoryMigrationStore();
  store.addAudit('audit-synthetic', legacyAudit());
  store.beforeCommit = (auditId, transactionNumber) => {
    if (auditId === 'audit-synthetic' && transactionNumber === 2) {
      store.mutateAudit(auditId, (audit) => ({ ...audit, sourceData: { concurrentlyUpdated: true } }));
    }
  };
  const summary = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(summary.failures, 1, 'contention during apply is reported');
  assert.equal(summary.requiringRepair, 1, 'the concurrently updated source remains available for a safe retry');
  assert.match(formatMigrationSummary(summary, true).join('\n'), /INCOMPLETE/);
  assert.equal(store.sources.has('audit-synthetic'), false);
  assert.deepEqual(store.audits.get('audit-synthetic')?.sourceData, { concurrentlyUpdated: true });
}

async function testMalformedShapes() {
  const store = new MemoryMigrationStore();
  store.addAudit('array-source', legacyAudit([]));
  store.addAudit('empty-source', legacyAudit({}));
  store.addAudit('missing-metadata', { id: 'missing-metadata', sourceData: sourceRows });
  store.addAudit('bad-nested-value', legacyAudit({ value: undefined }));
  const summary = await migrateImportAuditSourceData(store, { apply: false, projectId });
  assert.equal(summary.examined, 4);
  assert.equal(summary.malformed, 4);
  assert.equal(summary.requiringRepair, 0);
  assert.equal(store.writes, 0);
  const blockedApply = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(blockedApply.applyBlocked, true);
  assert.equal(store.writes, 0, 'malformed data must block all apply writes');
}

async function testCollectionReadFailureFailsClosed() {
  const store = new MemoryMigrationStore();
  store.failList = true;
  const summary = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(summary.failures, 1);
  assert.equal(summary.applyBlocked, true);
  assert.equal(store.writes, 0);
}

async function testCompletionMarkerFailureIsNotReportedAsReady() {
  const store = new MemoryMigrationStore();
  store.addAudit('clean-audit', { id: 'clean-audit', status: 'completed' });
  store.failCompletionMarker = true;
  const summary = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(summary.failures, 1);
  assert.equal(summary.migrationGateEnabled, false);
  assert.equal(store.migrationComplete, false);
}

function testProjectConfirmationIsMandatoryForApply() {
  assert.deepEqual(parseMigrationOptions(['--project', projectId], projectId), { apply: false, projectId });
  assert.deepEqual(parseMigrationOptions(['--project=' + projectId, '--apply', '--confirm-project=' + projectId], projectId), {
    apply: true,
    projectId,
  });
  assert.throws(() => parseMigrationOptions([], projectId), /explicit valid Firebase project/);
  assert.throws(() => parseMigrationOptions(['--project', projectId], undefined), /does not match/);
  assert.throws(() => parseMigrationOptions(['--project', 'other-test-project'], projectId), /does not match/);
  assert.throws(() => parseMigrationOptions(['--project', projectId, '--apply'], projectId), /requires --confirm-project/);
  assert.throws(() => parseMigrationOptions(['--project', projectId, '--apply', '--confirm-project', 'other-test-project'], projectId), /requires --confirm-project/);
  assert.throws(() => parseMigrationOptions(['--project', projectId, '--confirm-project', projectId], projectId), /only valid together/);
  assert.throws(() => parseMigrationOptions(['--project', projectId, '--unknown'], projectId), /Unknown migration argument/);
}

function testImportCreationRetriesAndConflicts() {
  const metadata = {
    id: 'audit-synthetic',
    fileName: 'synthetic.xlsx',
    importedAt: '2026-10-18T00:00:00.000Z',
    status: 'completed',
    sourceDataStoredInRestrictedCollection: true,
  };
  const source = {
    id: 'audit-synthetic',
    auditId: 'audit-synthetic',
    fileName: 'synthetic.xlsx',
    importedAt: '2026-10-18T00:00:00.000Z',
    sourceData: sourceRows,
  };
  assert.deepEqual(planImportAuditWrites(metadata, source, undefined, undefined), {
    writeAudit: true,
    writeRestrictedSource: true,
  });
  assert.deepEqual(planImportAuditWrites(metadata, source, metadata, { ...source, kept: true }), {
    writeAudit: false,
    writeRestrictedSource: false,
  }, 'an identical retry must not update either existing document');
  assert.deepEqual(planImportAuditWrites(metadata, source, metadata, undefined), {
    writeAudit: false,
    writeRestrictedSource: false,
  }, 'an exact audit retry is read-only for ordinary staff and relies on the atomic original transaction');
  assert.deepEqual(planImportAuditWrites(metadata, source, metadata, undefined, true), {
    writeAudit: false,
    writeRestrictedSource: true,
  }, 'a privileged role that can verify a missing source may complete it');
  assert.throws(() => planImportAuditWrites({ ...metadata, status: 'failed' }, source, metadata, source), /different import audit/);
  assert.throws(() => planImportAuditWrites(metadata, { ...source, sourceData: { changed: true } }, metadata, source), /different restricted import source/);
  assert.throws(() => planImportAuditWrites(metadata, source, { ...metadata, sourceData: { legacy: true } }, source), /embedded source data/);
}

async function testIdempotencyAfterSuccess() {
  const store = new MemoryMigrationStore();
  store.addAudit('audit-synthetic', legacyAudit());
  const firstRun = await migrateImportAuditSourceData(store, { apply: true, projectId });
  const writesAfterFirstRun = store.writes;
  const secondRun = await migrateImportAuditSourceData(store, { apply: true, projectId });
  assert.equal(firstRun.migrated, 1);
  assert.equal(secondRun.migrated, 0);
  assert.equal(secondRun.alreadyCorrect, 1);
  assert.equal(store.writes, writesAfterFirstRun);
}

async function run() {
  await testDryRunAndAlreadyMigratedCounts();
  await testMissingSourceDataAndNoUnnecessaryWrites();
  await testIdenticalDestinationAndMetadataPreservation();
  await testConflictsBlockAllWrites();
  await testDestinationWriteFailureAndNoSensitiveDiagnostics();
  await testAuditUpdateFailureLeavesNoPartialDestinationAndRetries();
  await testInterruptionAfterDestinationExistsCanResume();
  await testConcurrentModificationIsNotOverwritten();
  await testMalformedShapes();
  await testCollectionReadFailureFailsClosed();
  await testCompletionMarkerFailureIsNotReportedAsReady();
  testProjectConfirmationIsMandatoryForApply();
  testImportCreationRetriesAndConflicts();
  await testIdempotencyAfterSuccess();
  console.log('Import-audit source migration tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});