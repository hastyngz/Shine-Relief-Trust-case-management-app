import { AppDatabase, OfflineChangeEntry, SyncConflict, SyncConflictResolution } from '../types';
import { appendSyncConflictAudit, syncChangeEntriesToFirestore, SyncChangeResult } from './firestoreSync';
import { inspectPersistedQueueState, inspectUnownedLegacyIndexedDbState, loadQueueEntries, readConflicts, saveQueueEntries, writeConflicts } from './offlineSyncDb';
import { getActiveWorkspaceUid, getWorkspaceStorageKey } from './accountWorkspace';

const LEGACY_SNAPSHOT_KEY_BASE = 'shine_relief_trust_pending_sync_v2';
const RESET_RECOVERY_REQUIRED_KEY_BASE = 'shine_relief_trust_reset_recovery_required_v2';
const LAST_SYNCED_KEY_BASE = 'shine_relief_trust_last_synced_v2';
const scopedKey = (base: string): string => { const key = getWorkspaceStorageKey(base); if (!key) throw new Error('No authenticated SHINE workspace is active.'); return key; };
let cachedBaselineRaw: string | null = null;
let cachedBaselineDb: AppDatabase | null = null;
let cachedBaselineUid: string | null = null;
let cachedQueueUid: string | null = null;
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
  const uid = getActiveWorkspaceUid();
  if (!uid) return [];
  if (cachedQueue && cachedQueueUid === uid) return cachedQueue;
  cachedQueue = await loadQueueEntries();
  cachedQueueUid = uid;
  return cachedQueue;
}

export async function persistQueue(entries: OfflineChangeEntry[], expectedUid?: string): Promise<void> {
  const uid = expectedUid ?? getActiveWorkspaceUid();
  if (!uid || (expectedUid && getActiveWorkspaceUid() !== expectedUid)) throw new Error('Active SHINE workspace changed before offline edits could be persisted.');
  // Only update the in-memory view after durable persistence succeeds. Otherwise
  // a failed IndexedDB/localStorage write could make the UI report an empty queue
  // while the old persisted entries remain and replay later.
  if (entries.some((entry) => entry.ownerUid !== uid)) {
    throw new Error('Cannot persist offline edits with missing or mismatched workspace ownership.');
  }
  await saveQueueEntries(entries, uid);
  if (getActiveWorkspaceUid() === uid) {
    cachedQueue = entries;
    cachedQueueUid = uid;
  }
  dispatch(OFFLINE_QUEUE_UPDATED_EVENT);
}

/**
 * Called only after an administrator's database reset has succeeded in both
 * Firestore and local storage. Old queued edits must not recreate the records
 * that the reset just removed. Persist the empty queue before removing the
 * legacy snapshot so a storage failure does not silently discard pending work.
 */
/** Persist a safety lock before a destructive reset starts. If the reset only
 * partially succeeds, the old queue must not repopulate cloud records. */
export function markDatabaseResetRecoveryRequired(): void {
  if (typeof window === 'undefined') throw new Error('Cannot mark reset recovery outside the browser.');
  window.localStorage.setItem(scopedKey(RESET_RECOVERY_REQUIRED_KEY_BASE), '1');
}

/**
 * Authoritative, fail-closed inspection used before destructive restore.
 * Cached queue state alone is insufficient because another tab or a prior
 * interrupted session may have left persisted edits behind.
 */
export async function inspectPendingOfflineChanges(): Promise<'clear' | 'pending' | 'unavailable'> {
  if (typeof window === 'undefined') return 'unavailable';

  // The previous app database cache may contain edits that were never queued.
  // Its owner is unknown, so its presence blocks destructive restore until reviewed.
  try {
    const legacyDatabase = window.localStorage.getItem('shine_relief_trust_prod_v1');
    if (legacyDatabase) {
      const parsed: unknown = JSON.parse(legacyDatabase);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'unavailable';
      return 'pending';
    }
  } catch {
    return 'unavailable';
  }

  // Older versions stored queue/conflict/snapshot state without an owner UID.
  // Preserve and quarantine it: never guess an owner, replay it, or call restore safe.
  for (const legacyKey of [
    'shine_relief_trust_offline_queue_v2',
    'shine_relief_trust_sync_conflicts_v1',
    'shine_relief_trust_pending_sync_v1',
  ]) {
    try {
      const raw = window.localStorage.getItem(legacyKey);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return 'unavailable';
      if (parsed.length) return 'pending';
    } catch {
      return 'unavailable';
    }
  }

  // Older builds also used a global IndexedDB queue. It has no trustworthy owner,
  // so preserve it and block destructive restore until it is explicitly reviewed.
  const legacyIndexedDbState = await inspectUnownedLegacyIndexedDbState();
  if (legacyIndexedDbState !== 'clear') return legacyIndexedDbState;

  // A recovery lock blocks automatic queue replay, but it must not make an
  // administrator unable to retry a backup restore after an interrupted
  // restore/reset. Permit an explicit restore retry only when persisted queue
  // inspection proves there are no pending per-record or legacy snapshot edits.
  const queueState = await inspectPersistedQueueState();
  if (queueState !== 'clear') return queueState;

  try {
    const raw = window.localStorage.getItem(scopedKey(LEGACY_SNAPSHOT_KEY_BASE));
    if (!raw) return 'clear';
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 'unavailable';
    return parsed.length ? 'pending' : 'clear';
  } catch {
    return 'unavailable';
  }
}

export function isDatabaseResetRecoveryRequired(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // An older version may have interrupted a destructive reset before workspace
    // keys existed. Keep that global safety lock effective until explicit recovery.
    if (window.localStorage.getItem('shine_relief_trust_reset_recovery_required_v1') === '1') return true;
    return window.localStorage.getItem(scopedKey(RESET_RECOVERY_REQUIRED_KEY_BASE)) === '1';
  } catch {
    // Fail closed: if the recovery marker cannot be read, do not replay queued edits.
    return true;
  }
}

export async function clearOfflineChangesAfterDatabaseReset(db: AppDatabase, expectedUid?: string): Promise<void> {
  const uid = expectedUid ?? getActiveWorkspaceUid();
  if (!uid || getActiveWorkspaceUid() !== uid) throw new Error('Account changed before reset recovery; the reset lock remains in place.');
  await persistQueue([], uid);
  if (getActiveWorkspaceUid() !== uid) throw new Error('Account changed during reset recovery; the remaining recovery steps were paused.');
  clearPendingOfflineSnapshots();
  setLastSyncedSnapshotOrThrow(db);
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(scopedKey(RESET_RECOVERY_REQUIRED_KEY_BASE));
    // Clear the pre-workspace lock only after the explicit reset, empty queue,
    // and new scoped baseline have all persisted successfully.
    window.localStorage.removeItem('shine_relief_trust_reset_recovery_required_v1');
  }
}

export function getPendingOfflineSnapshotCount(): number {
  return cachedQueueUid === getActiveWorkspaceUid() ? (cachedQueue?.length ?? 0) : 0;
}

export async function refreshPendingOfflineSnapshotCount(): Promise<number> {
  await loadQueue();
  return getPendingOfflineSnapshotCount();
}

export function getLastSyncedSnapshot(): AppDatabase | null {
  if (typeof window === 'undefined' || !getActiveWorkspaceUid()) return null;
  try {
    const uid = getActiveWorkspaceUid()!;
    const raw = window.localStorage.getItem(scopedKey(LAST_SYNCED_KEY_BASE));
    if (!raw) {
      cachedBaselineRaw = null;
      cachedBaselineDb = null;
      cachedBaselineUid = uid;
      return null;
    }
    if (uid === cachedBaselineUid && raw === cachedBaselineRaw && cachedBaselineDb) return cachedBaselineDb;
    const parsed = JSON.parse(raw) as AppDatabase;
    cachedBaselineRaw = raw;
    cachedBaselineDb = parsed;
    cachedBaselineUid = uid;
    return parsed;
  } catch (error) {
    console.warn('Could not read the last synced database copy.');
    return null;
  }
}

/** Persist the sync baseline and throw when it cannot be made durable. */
export function setLastSyncedSnapshotOrThrow(db: AppDatabase): void {
  if (typeof window === 'undefined') throw new Error('Cannot persist the sync baseline outside the browser.');
  const uid = getActiveWorkspaceUid();
  if (!uid) throw new Error('Cannot persist a sync baseline without an authenticated SHINE workspace.');
  const raw = JSON.stringify(db);
  window.localStorage.setItem(scopedKey(LAST_SYNCED_KEY_BASE), raw);
  cachedBaselineRaw = raw;
  cachedBaselineDb = db;
  cachedBaselineUid = uid;
}

export function setLastSyncedSnapshot(db: AppDatabase): void {
  try {
    setLastSyncedSnapshotOrThrow(db);
  } catch (error) {
    // Ordinary snapshot updates remain best-effort, but destructive recovery
    // uses setLastSyncedSnapshotOrThrow so it cannot unlock on a missing baseline.
    console.warn('Could not record the last synced database copy.');
    try {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('shine_storage_warning', {
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
  const uid = getActiveWorkspaceUid();
  if (typeof window === 'undefined' || !uid) return 0;
  const baseline = getLastSyncedSnapshot();
  if (!baseline) {
    // Never invent a baseline from an unconfirmed local cache. Without one,
    // diffing can turn the entire database into writes or mark unsynced edits as safe.
    try {
      window.dispatchEvent(new CustomEvent('shine_storage_warning', {
        detail: { quotaExceeded: false, error: new Error('Offline editing is paused until a confirmed server baseline is available. Keep this device and reconnect before retrying.') },
      }));
    } catch { /* best effort warning; do not infer sync state */ }
    return getPendingOfflineSnapshotCount();
  }
  const previous = await loadQueue();
  if (getActiveWorkspaceUid() !== uid) return 0;
  if (previous.some((entry) => entry.ownerUid !== uid)) {
    try {
      window.dispatchEvent(new CustomEvent('shine_storage_warning', {
        detail: { quotaExceeded: false, error: new Error('Offline edits are paused because an existing queue entry has no verified owner. Preserve this device and request recovery before clearing browser data.') },
      }));
    } catch { /* best effort warning; preserve unowned queue entries */ }
    return previous.length;
  }
  const entries = computeChangeEntries(currentDb, baseline, previous).map((entry) => ({ ...entry, ownerUid: uid }));
  if (!entries.length) return previous.length;
  await persistQueue(entries, uid);
  return entries.length;
}

/** Legacy name kept so existing callers keep working. */
export function queueOfflineSnapshotIfNeeded(snapshot: AppDatabase): void {
  void recordOfflineChanges(snapshot);
}

export function readPendingOfflineSnapshots(): AppDatabase[] {
  if (typeof window === 'undefined' || !getActiveWorkspaceUid()) return [];
  try {
    const raw = window.localStorage.getItem(scopedKey(LEGACY_SNAPSHOT_KEY_BASE));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppDatabase[]) : [];
  } catch (error) {
    console.warn('Could not read legacy pending offline snapshots:', error);
    return [];
  }
}

function clearLegacySnapshots(): void {
  if (typeof window === 'undefined' || !getActiveWorkspaceUid()) return;
  window.localStorage.removeItem(scopedKey(LEGACY_SNAPSHOT_KEY_BASE));
}

/** Legacy writer: still stores a snapshot until the migration converts it. */
export function writePendingOfflineSnapshot(snapshot: AppDatabase): void {
  if (typeof window === 'undefined' || !getActiveWorkspaceUid()) return;
  try {
    window.localStorage.setItem(scopedKey(LEGACY_SNAPSHOT_KEY_BASE), JSON.stringify([snapshot]));
    dispatch(OFFLINE_QUEUE_UPDATED_EVENT);
  } catch (error) {
    console.warn('Could not queue legacy offline snapshot:', error);
  }
}

export function clearPendingOfflineSnapshots(): void {
  if (typeof window === 'undefined' || !getActiveWorkspaceUid()) return;
  clearLegacySnapshots();
  dispatch(OFFLINE_QUEUE_UPDATED_EVENT);
}

/**
 * One-time migration: convert any old whole-database snapshot queue into
 * per-record change entries. The legacy snapshot is only removed once the new
 * queue has been persisted, so an interrupted migration never drops data.
 */
export async function migrateLegacySnapshots(): Promise<boolean> {
  const uid = getActiveWorkspaceUid();
  if (typeof window === 'undefined' || !uid) return false;
  const legacy = readPendingOfflineSnapshots();
  if (!legacy.length) return false;
  const newest = legacy[legacy.length - 1];
  const baseline = getLastSyncedSnapshot();
  // Without a confirmed baseline, converting a whole-database snapshot into
  // writes could replay every record. Keep it quarantined until a safe baseline exists.
  if (!baseline) return false;
  const existing = await loadQueue();
  if (getActiveWorkspaceUid() !== uid) return false;
  if (existing.some((entry) => entry.ownerUid !== uid)) return false;
  const migrated = computeChangeEntries(newest, baseline, existing).map((entry) => ({ ...entry, ownerUid: uid }));
  await persistQueue(migrated, uid);
  if (getActiveWorkspaceUid() !== uid) return false;
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
    ownerUid: entry.ownerUid,
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
  options: { actor?: { uid: string; name: string; canReadImportSourceData?: boolean; canWriteImportAuditMetadata?: boolean } } = {},
): Promise<FlushResult> {
  if (typeof window === 'undefined') return { flushed: false, applied: 0, conflicts: [] };
  if (!getActiveWorkspaceUid() || getActiveWorkspaceUid() !== options.actor?.uid) return { flushed: false, applied: 0, conflicts: [] };
  // Never replay a device-wide queue without a verified signed-in actor. This
  // also protects the online event path during sign-out/account transitions.
  if (!options.actor?.uid || options.actor.uid === 'unknown') {
    return { flushed: false, applied: 0, conflicts: [] };
  }
  // A reset that failed after cloud deletion leaves the local queue dangerous:
  // replaying it could recreate records. An administrator must complete recovery.
  if (isDatabaseResetRecoveryRequired()) {
    return { flushed: false, applied: 0, conflicts: [] };
  }
  await migrateLegacySnapshots();
  if (getActiveWorkspaceUid() !== options.actor.uid) return { flushed: false, applied: 0, conflicts: [] };
  const entries = await loadQueue();
  if (!entries.length) return { flushed: false, applied: 0, conflicts: [] };
  if (getActiveWorkspaceUid() !== options.actor.uid) return { flushed: false, applied: 0, conflicts: [] };
  // Defence in depth: even a malformed entry found inside a scoped store cannot
  // be replayed under a different account or without an explicit owner.
  if (entries.some((entry) => entry.ownerUid !== options.actor!.uid)) {
    return { flushed: false, applied: 0, conflicts: [] };
  }
  if (!isBrowserOnline()) return { flushed: false, applied: 0, conflicts: [] };

  let result: SyncChangeResult;
  try {
    result = await syncChangeEntriesToFirestore(entries, options.actor);
  } catch (error) {
    console.warn('Could not flush the offline change queue to Firestore:', error);
    return { flushed: false, applied: 0, conflicts: [] };
  }

  // If the account changed while Firestore was processing, leave its original
  // queue intact. A retry is safer than writing old-account queue state to the new user.
  if (getActiveWorkspaceUid() !== options.actor.uid) {
    return { flushed: false, applied: result.applied, conflicts: result.conflicts };
  }

  // Keep conflicted entries queued for manual resolution; drop the rest.
  const conflictedKeys = new Set(result.conflicts.map((conflict) => `${conflict.collection}/${conflict.recordId}`));
  const remaining = entries.filter((entry) => conflictedKeys.has(`${entry.collection}/${entry.recordId}`));
  await persistQueue(remaining, options.actor.uid);

  if (result.conflicts.length) {
    if (getActiveWorkspaceUid() !== options.actor.uid) return { flushed: false, applied: result.applied, conflicts: result.conflicts };
    const existing = await readConflicts();
    if (getActiveWorkspaceUid() !== options.actor.uid) return { flushed: false, applied: result.applied, conflicts: result.conflicts };
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
  if (!getActiveWorkspaceUid() || getActiveWorkspaceUid() !== actor.uid) return false;
  const conflicts = await readConflicts();
  if (getActiveWorkspaceUid() !== actor.uid) return false;
  const conflict = conflicts.find((candidate) => candidate.id === conflictId);
  if (!conflict || conflict.ownerUid !== actor.uid) return false;

  const remaining = conflicts.filter((candidate) => candidate.id !== conflictId);
  await persistSyncConflicts(remaining);

  if (getActiveWorkspaceUid() !== actor.uid) return false;
  const queue = await loadQueue();
  if (getActiveWorkspaceUid() !== actor.uid) return false;
  const withoutConflict = queue.filter(
    (entry) => `${entry.collection}/${entry.recordId}` !== `${conflict.collection}/${conflict.recordId}`,
  );

  if (resolution === 'keep-mine') {
    const keepMine: OfflineChangeEntry = {
      ownerUid: actor.uid,
      collection: conflict.collection,
      recordId: conflict.recordId,
      operation: conflict.localOperation,
      data: conflict.localData,
      // Re-base onto the server version we just saw so the flush may apply it.
      baseUpdatedAt: conflict.serverUpdatedAt,
      queuedAt: new Date().toISOString(),
    };
    await persistQueue([...withoutConflict, keepMine], actor.uid);
  } else {
    await persistQueue(withoutConflict, actor.uid);
  }

  void actor;
  return true;
}

export async function clearAllOfflineQueue(): Promise<void> {
  const uid = getActiveWorkspaceUid();
  if (!uid) throw new Error('Cannot clear offline state without an authenticated SHINE workspace.');
  await persistQueue([], uid);
  if (getActiveWorkspaceUid() !== uid) return;
  await persistSyncConflicts([]);
}
