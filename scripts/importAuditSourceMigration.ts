import { isDeepStrictEqual } from 'node:util';
import { Timestamp } from 'firebase-admin/firestore';

const MAX_SOURCE_DOCUMENT_BYTES = 1_000_000;

export interface MigrationDocument {
  exists: boolean;
  data?: Record<string, unknown>;
}

export interface ImportAuditMigrationTransaction {
  getAudit(): Promise<MigrationDocument>;
  getRestrictedSource(): Promise<MigrationDocument>;
  createRestrictedSource(data: Record<string, unknown>): void;
  removeEmbeddedSourceData(): void;
}

export interface ImportAuditMigrationStore {
  listImportAuditIds(): Promise<string[]>;
  markMigrationComplete(): Promise<void>;
  runAuditTransaction<T>(
    auditId: string,
    action: (transaction: ImportAuditMigrationTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface ImportAuditMigrationSummary {
  examined: number;
  requiringRepair: number;
  alreadyCorrect: number;
  matchingDestinations: number;
  migrated: number;
  conflicts: number;
  malformed: number;
  failures: number;
  applyBlocked: boolean;
  migrationGateEnabled: boolean;
}

type RecordOutcome = 'requiring-repair' | 'already-correct' | 'matching-destination' | 'conflict' | 'malformed';

export interface MigrationOptions {
  apply: boolean;
  projectId: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (value instanceof Timestamp) return true;
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
  if (!isPlainRecord(value)) return false;
  return Object.values(value).every((item) => isJsonValue(item, depth + 1));
}

function buildRestrictedSource(auditId: string, audit: Record<string, unknown>): Record<string, unknown> | undefined {
  if (audit.id !== undefined && audit.id !== auditId) return undefined;
  if (typeof audit.fileName !== 'string' || !audit.fileName.trim()) return undefined;
  if (typeof audit.importedAt !== 'string' || !audit.importedAt.trim()) return undefined;
  if (!isPlainRecord(audit.sourceData) || Object.keys(audit.sourceData).length === 0 || !isJsonValue(audit.sourceData)) {
    return undefined;
  }

  const source = {
    id: auditId,
    auditId,
    fileName: audit.fileName,
    importedAt: audit.importedAt,
    sourceData: audit.sourceData,
  };
  if (Buffer.byteLength(JSON.stringify(source), 'utf8') > MAX_SOURCE_DOCUMENT_BYTES) return undefined;
  return source;
}

function matchesRestrictedSource(current: Record<string, unknown> | undefined, expected: Record<string, unknown>, auditId: string): boolean {
  return Boolean(
    current &&
    isPlainRecord(current) &&
    current.id === auditId &&
    current.auditId === expected.auditId &&
    current.fileName === expected.fileName &&
    current.importedAt === expected.importedAt &&
    isDeepStrictEqual(current.sourceData, expected.sourceData),
  );
}

async function inspectAudit(
  transaction: ImportAuditMigrationTransaction,
  auditId: string,
  apply: boolean,
): Promise<RecordOutcome> {
  const auditSnapshot = await transaction.getAudit();
  if (!auditSnapshot.exists || !auditSnapshot.data) return 'conflict';

  const audit = auditSnapshot.data;
  if (!Object.prototype.hasOwnProperty.call(audit, 'sourceData')) return 'already-correct';

  const sourceRecord = buildRestrictedSource(auditId, audit);
  if (!sourceRecord) return 'malformed';

  const sourceSnapshot = await transaction.getRestrictedSource();
  if (sourceSnapshot.exists) {
    if (!matchesRestrictedSource(sourceSnapshot.data, sourceRecord, auditId)) return 'conflict';
  } else if (apply) {
    transaction.createRestrictedSource(sourceRecord);
  }

  if (apply) transaction.removeEmbeddedSourceData();
  return sourceSnapshot.exists ? 'matching-destination' : 'requiring-repair';
}

function emptySummary(): ImportAuditMigrationSummary {
  return {
    examined: 0,
    requiringRepair: 0,
    alreadyCorrect: 0,
    matchingDestinations: 0,
    migrated: 0,
    conflicts: 0,
    malformed: 0,
    failures: 0,
    applyBlocked: false,
    migrationGateEnabled: false,
  };
}

function isSafeToApply(summary: ImportAuditMigrationSummary): boolean {
  return summary.conflicts === 0 && summary.malformed === 0 && summary.failures === 0;
}

async function inspectRecords(
  store: ImportAuditMigrationStore,
  auditIds: string[] | undefined,
  apply: boolean,
): Promise<{ auditIds: string[]; summary: ImportAuditMigrationSummary }> {
  const summary = emptySummary();
  let ids = auditIds;
  if (!ids) {
    try {
      ids = await store.listImportAuditIds();
    } catch {
      summary.failures = 1;
      return { auditIds: [], summary };
    }
  }

  for (const auditId of ids) {
    summary.examined += 1;
    try {
      const outcome = await store.runAuditTransaction(auditId, (transaction) => inspectAudit(transaction, auditId, apply));
      if (outcome === 'requiring-repair') summary.requiringRepair += 1;
      else if (outcome === 'already-correct') summary.alreadyCorrect += 1;
      else if (outcome === 'matching-destination') summary.matchingDestinations += 1;
      else if (outcome === 'conflict') summary.conflicts += 1;
      else summary.malformed += 1;
    } catch {
      summary.failures += 1;
    }
  }

  return { auditIds: ids, summary };
}

export async function migrateImportAuditSourceData(
  store: ImportAuditMigrationStore,
  options: MigrationOptions,
): Promise<ImportAuditMigrationSummary> {
  const preflight = await inspectRecords(store, undefined, false);
  if (!options.apply) return preflight.summary;
  if (!isSafeToApply(preflight.summary)) return { ...preflight.summary, applyBlocked: true };

  let migrated = 0;
  let applyFailures = 0;
  for (const auditId of preflight.auditIds) {
    try {
      const outcome = await store.runAuditTransaction(auditId, (transaction) => inspectAudit(transaction, auditId, true));
      if (outcome === 'requiring-repair' || outcome === 'matching-destination') migrated += 1;
      else if (outcome === 'conflict' || outcome === 'malformed') applyFailures += 1;
    } catch {
      applyFailures += 1;
    }
  }

  const verification = await inspectRecords(store, undefined, false);
  let failures = verification.summary.failures + applyFailures;
  let migrationGateEnabled = false;
  if (
    verification.summary.requiringRepair === 0 &&
    verification.summary.conflicts === 0 &&
    verification.summary.malformed === 0 &&
    failures === 0
  ) {
    try {
      await store.markMigrationComplete();
      migrationGateEnabled = true;
    } catch {
      failures += 1;
    }
  }
  return {
    ...verification.summary,
    migrated,
    matchingDestinations: preflight.summary.matchingDestinations,
    failures,
    migrationGateEnabled,
  };
}

function readFlagValue(args: string[], index: number, flag: string): { value: string; nextIndex: number } {
  const argument = args[index];
  const equalsPrefix = `${flag}=`;
  if (argument.startsWith(equalsPrefix)) return { value: argument.slice(equalsPrefix.length), nextIndex: index };
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  return { value, nextIndex: index + 1 };
}

export function parseMigrationOptions(args: string[], configuredProjectId?: string): MigrationOptions {
  let apply = false;
  let sawApply = false;
  let projectId: string | undefined;
  let confirmedProjectId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--apply') {
      if (sawApply) throw new Error('Duplicate --apply flag.');
      sawApply = true;
      apply = true;
    } else if (argument === '--project' || argument.startsWith('--project=')) {
      if (projectId !== undefined) throw new Error('Duplicate --project flag.');
      const parsed = readFlagValue(args, index, '--project');
      projectId = parsed.value;
      index = parsed.nextIndex;
    } else if (argument === '--confirm-project' || argument.startsWith('--confirm-project=')) {
      if (confirmedProjectId !== undefined) throw new Error('Duplicate --confirm-project flag.');
      const parsed = readFlagValue(args, index, '--confirm-project');
      confirmedProjectId = parsed.value;
      index = parsed.nextIndex;
    } else {
      throw new Error('Unknown migration argument.');
    }
  }

  if (!projectId || !/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error('Supply an explicit valid Firebase project with --project.');
  }
  if (!configuredProjectId || configuredProjectId !== projectId) {
    throw new Error('The explicit project does not match the configured Firebase Admin project.');
  }
  if (apply && confirmedProjectId !== projectId) {
    throw new Error('Apply requires --confirm-project with the same explicitly selected project.');
  }
  if (!apply && confirmedProjectId !== undefined) {
    throw new Error('--confirm-project is only valid together with --apply.');
  }

  return { apply, projectId };
}

export function formatMigrationSummary(summary: ImportAuditMigrationSummary, apply: boolean): string[] {
  const safeToApply = isSafeToApply(summary);
  const applyStatus = summary.applyBlocked
    ? 'BLOCKED; no writes were attempted'
    : apply && summary.requiringRepair > 0
      ? 'INCOMPLETE; legacy records remain and require a reviewed retry'
    : !safeToApply
      ? 'REVIEW REQUIRED'
      : apply
        ? 'APPLY completed; verify the reported migrated and remaining counts'
        : 'DRY RUN only; safe to apply after independent review and approval';
  return [
    `Records examined: ${summary.examined}`,
    `Records requiring repair: ${summary.requiringRepair}`,
    `Already-correct records: ${summary.alreadyCorrect}`,
    `Matching restricted destinations: ${summary.matchingDestinations}`,
    `Records migrated in this run: ${summary.migrated}`,
    `Ordinary staff audit queries enabled: ${summary.migrationGateEnabled ? 'yes' : 'no'}`,
    `Conflicts: ${summary.conflicts}`,
    `Malformed records: ${summary.malformed}`,
    `Failures: ${summary.failures}`,
    `Apply status: ${applyStatus}`,
  ];
}