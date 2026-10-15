import { AppDatabase, OfflineChangeEntry, SyncConflict, SyncConflictResolution } from '../types';
import { appendSyncConflictAudit, syncChangeEntriesToFirestore, SyncChangeResult } from './firestoreSync';
import { loadQueueEntries, readConflicts, saveQueueEntries, writeConflicts } from './offlineSyncDb';

const LEGACY_SNAPSHOT_KEY = 'shine_relief_trust_pending_sync_v1';
const LAST_SYNCED_KEY = 'shine_relief_trust_last_synced_v1';
let cachedBaselineRaw: string | null = null;
let cachedBaselineDb: AppDatabase | null = null;
export const OFFLINE_QUEUE_UPDATED_EVENT = 'shine_offline_queue_updated';
export const SYNC_CONFLICTS_UPDATED_EVENT = 'shine_sync_conflicts_updated';

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

function dispatch(name: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(name));
}

/**
 * Every persisted collection, keyed by the Firestore collection name used by
 * firestoreSync. The keys are also the AppDatabase field names, so a database
 * field maps 1:1 to its collection.
 */
export const SYNC_COLLECTION_FIELDS: ReadonlyArray<[keyof AppDatabase, string]> = [
  ['girls', 'girls'],
  ['households', 'households'],
  ['educationalFollowUps', 'educationalFollowUps'],
  ['healthFollowUps', 'healthFollowUps'],
  ['familyFollowUps', 'familyFollowUps'],
  ['rentPayments', 'rentPayments'],
  ['expenses', 'expenses'],
  ['householdActivities', 'householdActivities'],
  ['contacts', 'contacts'],
  ['attachments', 'attachments'],
  ['budgets', 'budgets'],
  ['annualBudgets', 'annualBudgets'],
  ['payrollRecords', 'payrollRecords'],
  ['employees', 'employees'],
  ['workplans', 'workplans'],
  ['schedules', 'schedules'],
  ['meetings', 'meetings'],
  ['feedingProgramLogs', 'feedingProgramLogs'],
  ['marketPrices', 'marketPrices'],
  ['forecastSettings', 'forecastSettings'],
  ['whatIfScenarios', 'whatIfScenarios'],
  ['intelligenceSuggestions', 'intelligenceSuggestions'],
  ['aiSettings', 'aiSettings'],
  ['historicalRecords', 'historicalCaseRecords'],
  ['importAudits', 'importAudits'],
  ['restrictedImportSources', 'restrictedImportSources'],
  ['earlyYearsRecords', 'earlyYearsRecords'],
  ['people', 'people'],
  ['caseActions', 'caseActions'],
  ['educationHistory', 'educationHistory'],
  ['academicSupports', 'academicSupports'],
  ['examinationRecords', 'examinationRecords'],
  ['attendanceRecords', 'attendanceRecords'],
  ['girlLeaves', 'girlLeaves'],
  ['programmeLogs', 'programmeLogs'],
  ['caseReviews', 'caseReviews'],
  ['caseGoals', 'caseGoals'],
  ['procurementLists', 'procurementLists'],
  ['projectProjections', 'projectProjections'],
  ['inventoryItems', 'inventoryItems'],
  ['assets', 'assets'],
];

const FIELD_BY_COLLECTION = new Map<string, keyof AppDatabase>(
  SYNC_COLLECTION_FIELDS.map(([field, collection]) => [collection, field]),
);

export function getDatabaseFieldForCollection(collectionName: string): keyof AppDatabase | undefined {
  return FIELD_BY_COLLECTION.get(collectionName);
}

function recordsById(db: AppDatabase, field: keyof AppDatabase): Map<string, Record<string, any>> {
  const records = (db[field] as Array<Record<string, any>> | undefined) || [];
  const map = new Map<string, Record<string, any>>();
  for (const record of records) {
    if (record && typeof record.id === 'string') map.set(record.id, record);
  }
  return map;
}

function updatedAtOf(record: Record<string, any> | undefined): string | null {
  const value = record?.updatedAt;
  return typeof value === 'string' ? value : null;
}

/** Compact deterministic fingerprint used when updatedAt is absent/unreliable. */
export function contentHash(record: unknown): string {
  const input = stableStringify(record);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const stableStringCache = new WeakMap<object, string>();

function stableStringify(value: unknown): string {
  if (value && typeof value === 'object') {
    const cached = stableStringCache.get(value as object);
    if (cached !== undefined) return cached;
  }
  if (Array.isArray(value)) {
    const result = `[${value.map(stableStringify).join(',')}]`;
    stableStringCache.set(value, result);
    return result;
  }
  if (value && typeof value === 'object') {
    const result = `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
    stableStringCache.set(value as object, result);
    return result;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Diffs the current database against the last copy confirmed by Firestore and
 * returns only the records that actually changed (or were deleted) on this
 * device. Untouched records are never queued, so they can never overwrite a
 * newer edit made by someone else.
 */
export function computeChangeEntries(
  currentDb: AppDatabase,
  baselineDb: AppDatabase | null,
  previousEntries: OfflineChangeEntry[] = [],
): OfflineChangeEntry[] {
  const queuedAt = new Date().toISOString();
  const previousByKey = new Map(previousEntries.map((entry) => [`${entry.collection}/${entry.recordId}`, entry]));
  const entries: OfflineChangeEntry[] = [];

  for (const [field, collection] of SYNC_COLLECTION_FIELDS) {
    const currentArray = (currentDb[field] as Array<Record<string, any>> | undefined) || [];
    const baselineArray = baselineDb ? ((baselineDb[field] as Array<Record<string, any>> | undefined) || []) : [];
    // Avoid allocating ID maps for untouched collections. This is common when
    // a single form edits one record in an otherwise unchanged database.
    if (baselineDb && currentArray === baselineArray && currentArray.length === baselineArray.length) continue;
    const current = recordsById(currentDb, field);
    const baseline = baselineDb ? recordsById(baselineDb, field) : new Map<string, Record<string, any>>();

    for (const [id, record] of current) {
      const baseRecord = baseline.get(id);
      const previous = previousByKey.get(`${collection}/${id}`);
      const baseUpdatedAt = updatedAtOf(baseRecord);
      const recordUpdatedAt = updatedAtOf(record);
      const changed = !baseRecord ||
        (baseRecord !== record && baseUpdatedAt !== null && recordUpdatedAt !== null && baseUpdatedAt !== recordUpdatedAt) ||
        (baseRecord !== record && stableStringify(baseRecord) !== stableStringify(record));
      if (!changed) continue;
      // A record already queued and left unchanged since keeps its original base.
      if (previous && previous.operation === 'set' && stableStringify(previous.data) === stableStringify(record)) {
        entries.push(previous);
        continue;
      }
      entries.push({
        collection,
        recordId: id,
        operation: 'set',
        data: record,
        baseUpdatedAt: updatedAtOf(baseRecord),
        baseHash: baseRecord && !updatedAtOf(baseRecord) ? contentHash(baseRecord) : null,
        queuedAt,
      });
    }

    if (!baselineDb) continue;
    for (const id of baseline.keys()) {
      if (current.has(id)) continue;
      const previous = previousByKey.get(`${collection}/${id}`);
      if (previous && previous.operation === 'delete') {
        entries.push(previous);
        continue;
      }
      entries.push({
        collection,
        recordId: id,
        operation: 'delete',
        data: null,
        baseUpdatedAt: updatedAtOf(baseline.get(id)),
        baseHash: baseline.get(id) && !updatedAtOf(baseline.get(id)) ? contentHash(baseline.get(id)) : null,
        queuedAt,
      });
    }
  }

  return entries;
}

let cachedQueue: OfflineChangeEntry[] | null = null;

export async function loadQueue(): Promise<OfflineChangeEntry[]> {
  if (cachedQueue) return cachedQueue;
  cachedQueue = await loadQueueEntries();
  return cachedQueue;
}

export async function persistQueue(entries: OfflineChangeEntry[]): Promise<void> {
  cachedQueue = entries;
  await saveQueueEntries(entries);
  dispatch(OFFLINE_QUEUE_UPDATED_EVENT);
}

export function getPendingOfflineSnapshotCount(): number {
  return cachedQueue?.length ?? 0;
}

export async function refreshPendingOfflineSnapshotCount(): Promise<number> {
  await loadQueue();
  return getPendingOfflineSnapshotCount();
}

export function getLastSyncedSnapshot(): AppDatabase | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_SYNCED_KEY);
    if (!raw) {
      cachedBaselineRaw = null;
      cachedBaselineDb = null;
      return null;
    }
    if (raw === cachedBaselineRaw && cachedBaselineDb) return cachedBaselineDb;
    const parsed = JSON.parse(raw) as AppDatabase;
    cachedBaselineRaw = raw;
    cachedBaselineDb = parsed;
    return parsed;
  } catch (error) {
    console.warn('Could not read the last synced database copy.');
    return null;
  }
}

export function setLastSyncedSnapshot(db: AppDatabase): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(db);
    window.localStorage.setItem(LAST_SYNCED_KEY, raw);
    cachedBaselineRaw = raw;
    cachedBaselineDb = db;
  } catch (error) {
    // A missing baseline can make later diffs unsafe, so surface the failure.
    console.warn('Could not record the last synced database copy.');
    try {
      window.dispatchEvent(new CustomEvent('shine_storage_warning', {
        detail: { quotaExceeded: !!error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'QuotaExceededError' },
      }));
    } catch { /* best effort only; do not log record contents */ }
  }
}

/**
 * A Firestore snapshot may only become the sync baseline when it reflects
 * server-confirmed state. Snapshots served from the cache, or carrying this
 * device's own pending writes, are optimistic echoes of an unsynced local edit;
 * adopting them as the baseline makes the next diff see "no change" and the edit
 * is silently lost.
 */
export function isConfirmedServerSnapshot(
  meta: { fromCache?: boolean; hasPendingWrites?: boolean } | undefined,
): boolean {
  return !meta?.fromCache && !meta?.hasPendingWrites;
}

/**
 * Records the diff between the last synced copy and the current database.
 * Called whenever a local edit is made, so nothing is lost if the app closes
 * before the next online flush.
 */
export async function recordOfflineChanges(currentDb: AppDatabase): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const baseline = getLastSyncedSnapshot();
  if (!baseline) {
    // No confirmed server copy yet. Keep any persisted queue untouched and
    // adopt the current database as the baseline so untouched records are not
    // queued wholesale on first load.
    setLastSyncedSnapshot(currentDb);
    return getPendingOfflineSnapshotCount();
  }
  const previous = await loadQueue();
  const entries = computeChangeEntries(currentDb, baseline, previous);
  if (!entries.length) return previous.length;
  await persistQueue(entries);
  return entries.length;
}

/** Legacy name kept so existing callers keep working. */
export function queueOfflineSnapshotIfNeeded(snapshot: AppDatabase): void {
  void recordOfflineChanges(snapshot);
}

export function readPendingOfflineSnapshots(): AppDatabase[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppDatabase[]) : [];
  } catch (error) {
    console.warn('Could not read legacy pending offline snapshots:', error);
    return [];
  }
}

function clearLegacySnapshots(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LEGACY_SNAPSHOT_KEY);
}

/** Legacy writer: still stores a snapshot until the migration converts it. */
export function writePendingOfflineSnapshot(snapshot: AppDatabase): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LEGACY_SNAPSHOT_KEY, JSON.stringify([snapshot]));
    dispatch(OFFLINE_QUEUE_UPDATED_EVENT);
  } catch (error) {
    console.warn('Could not queue legacy offline snapshot:', error);
  }
}

export function clearPendingOfflineSnapshots(): void {
  if (typeof window === 'undefined') return;
  clearLegacySnapshots();
  dispatch(OFFLINE_QUEUE_UPDATED_EVENT);
}

/**
 * One-time migration: convert any old whole-database snapshot queue into
 * per-record change entries. The legacy snapshot is only removed once the new
 * queue has been persisted, so an interrupted migration never drops data.
 */
export async function migrateLegacySnapshots(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const legacy = readPendingOfflineSnapshots();
  if (!legacy.length) return false;
  const newest = legacy[legacy.length - 1];
  const existing = await loadQueue();
  const migrated = computeChangeEntries(newest, null, existing);
  await persistQueue(migrated);
  clearLegacySnapshots();
  dispatch(OFFLINE_QUEUE_UPDATED_EVENT);
  return true;
}

export async function readSyncConflicts(): Promise<SyncConflict[]> {
  return readConflicts();
}

export async function persistSyncConflicts(conflicts: SyncConflict[]): Promise<void> {
  await writeConflicts(conflicts);
  dispatch(SYNC_CONFLICTS_UPDATED_EVENT);
}

export async function getSyncConflictCount(): Promise<number> {
  return (await readConflicts()).length;
}

function mergeConflicts(existing: SyncConflict[], incoming: SyncConflict[]): SyncConflict[] {
  const byId = new Map(existing.map((conflict) => [conflict.id, conflict]));
  for (const conflict of incoming) byId.set(conflict.id, conflict);
  return [...byId.values()];
}

function conflictFromEntry(
  entry: OfflineChangeEntry,
  server: { data: Record<string, any> | null; updatedAt: string | null; updatedBy: string | null },
  detectedBy: string | null,
): SyncConflict {
  return {
    id: `${entry.collection}::${entry.recordId}`,
    collection: entry.collection,
    recordId: entry.recordId,
    localData: entry.data,
    localOperation: entry.operation,
    baseUpdatedAt: entry.baseUpdatedAt,
    serverData: server.data,
    serverUpdatedAt: server.updatedAt,
    serverUpdatedBy: server.updatedBy,
    detectedAt: new Date().toISOString(),
    detectedBy,
  };
}

export interface FlushResult {
  flushed: boolean;
  applied: number;
  conflicts: SyncChangeResult['conflicts'];
}

/**
 * Flushes queued changes to Firestore one record at a time in a transaction.
 * A conflict is recorded (instead of overwriting) whenever the server copy is
 * newer than the version this device based its edit on.
 */
export async function flushPendingOfflineSnapshots(
  options: { actor?: { uid: string; name: string } } = {},
): Promise<FlushResult> {
  if (typeof window === 'undefined') return { flushed: false, applied: 0, conflicts: [] };
  await migrateLegacySnapshots();
  const entries = await loadQueue();
  if (!entries.length) return { flushed: false, applied: 0, conflicts: [] };
  if (!isBrowserOnline()) return { flushed: false, applied: 0, conflicts: [] };

  let result: SyncChangeResult;
  try {
    result = await syncChangeEntriesToFirestore(entries, options.actor);
  } catch (error) {
    console.warn('Could not flush the offline change queue to Firestore:', error);
    return { flushed: false, applied: 0, conflicts: [] };
  }

  // Keep conflicted entries queued for manual resolution; drop the rest.
  const conflictedKeys = new Set(result.conflicts.map((conflict) => `${conflict.collection}/${conflict.recordId}`));
  const remaining = entries.filter((entry) => conflictedKeys.has(`${entry.collection}/${entry.recordId}`));
  await persistQueue(remaining);

  if (result.conflicts.length) {
    const existing = await readConflicts();
    const newConflicts = result.conflicts.map((conflict) => {
      const entry = entries.find(
        (candidate) => candidate.collection === conflict.collection && candidate.recordId === conflict.recordId,
      )!;
      return conflictFromEntry(entry, conflict, options.actor?.uid ?? null);
    });
    await persistSyncConflicts(mergeConflicts(existing, newConflicts));
    if (options.actor) {
      await Promise.all(newConflicts.map((conflict) => appendSyncConflictAudit({
        action: 'conflict_detected',
        collection: conflict.collection,
        recordId: conflict.recordId,
        userId: options.actor!.uid,
        userName: options.actor!.name,
        timestamp: conflict.detectedAt,
        localUpdatedAt: conflict.localData?.updatedAt ?? conflict.baseUpdatedAt,
        serverUpdatedAt: conflict.serverUpdatedAt,
        serverUpdatedBy: conflict.serverUpdatedBy,
      })));
    }
  }

  return { flushed: true, applied: result.applied, conflicts: result.conflicts };
}

/**
 * Resolves a stored conflict. "Keep mine" re-queues the local edit against the
 * current server version; "Keep theirs" drops the local edit.
 */
export async function resolveSyncConflict(
  conflictId: string,
  resolution: SyncConflictResolution,
  actor: { uid: string; name: string },
): Promise<boolean> {
  const conflicts = await readConflicts();
  const conflict = conflicts.find((candidate) => candidate.id === conflictId);
  if (!conflict) return false;

  const remaining = conflicts.filter((candidate) => candidate.id !== conflictId);
  await persistSyncConflicts(remaining);

  const queue = await loadQueue();
  const withoutConflict = queue.filter(
    (entry) => `${entry.collection}/${entry.recordId}` !== `${conflict.collection}/${conflict.recordId}`,
  );

  if (resolution === 'keep-mine') {
    const keepMine: OfflineChangeEntry = {
      collection: conflict.collection,
      recordId: conflict.recordId,
      operation: conflict.localOperation,
      data: conflict.localData,
      // Re-base onto the server version we just saw so the flush may apply it.
      baseUpdatedAt: conflict.serverUpdatedAt,
      queuedAt: new Date().toISOString(),
    };
    await persistQueue([...withoutConflict, keepMine]);
  } else {
    await persistQueue(withoutConflict);
  }

  void actor;
  return true;
}

export async function clearAllOfflineQueue(): Promise<void> {
  await persistQueue([]);
  await persistSyncConflicts([]);
}
