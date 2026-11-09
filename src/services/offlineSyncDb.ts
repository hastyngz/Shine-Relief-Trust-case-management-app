import type { OfflineChangeEntry, SyncConflict } from '../types';
import { getActiveWorkspaceUid, getWorkspaceIndexedDbNameForUid, getWorkspaceStorageKeyForUid } from './accountWorkspace';

/**
 * Persistence for the offline change queue and the sync conflict list.
 *
 * IndexedDB is used first so the queue is not limited by the roughly 5 MB
 * localStorage quota that also holds the whole database. A small localStorage
 * fallback keeps the queue working on browsers without IndexedDB (or when the
 * database cannot be opened).
 */
const QUEUE_KEY_BASE = 'shine_relief_trust_offline_queue_v3';
const CONFLICTS_KEY_BASE = 'shine_relief_trust_sync_conflicts_v2';
const DB_NAME_BASE = 'shine_relief_trust_offline_v3';
const queueStorageKey = (uid: string | null = getActiveWorkspaceUid()) => getWorkspaceStorageKeyForUid(QUEUE_KEY_BASE, uid);
const conflictsStorageKey = (uid: string | null = getActiveWorkspaceUid()) => getWorkspaceStorageKeyForUid(CONFLICTS_KEY_BASE, uid);
const databaseName = (uid: string | null = getActiveWorkspaceUid()) => getWorkspaceIndexedDbNameForUid(DB_NAME_BASE, uid);
const DB_VERSION = 2;
const STORE_NAME = 'queue';

class UnsafeQueueMigrationError extends Error {
  constructor() {
    super('Offline queue schema upgrade was blocked to preserve existing edits. The old queue remains intact and needs recovery.');
    this.name = 'UnsafeQueueMigrationError';
  }
}

/**
 * Composite storage key for a change entry. A queue keyed by `collection` alone
 * would make every changed record in the same collection overwrite the previous
 * one, silently dropping edits — so both parts are used.
 */
function queueKeyOf(entry: Pick<OfflineChangeEntry, 'collection' | 'recordId'>): string {
  return `${entry.collection}/${entry.recordId}`;
}

function notifyStorageFailure(error: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('shine_storage_warning', {
      detail: { quotaExceeded: !!error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'QuotaExceededError' },
    }));
  } catch { /* storage warning is best-effort if browser event APIs are unavailable */ }
}

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDb(uid: string | null = getActiveWorkspaceUid()): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const name = databaseName(uid);
    if (!name) { reject(new Error('No authenticated SHINE workspace is active.')); return; }
    const request = indexedDB.open(name, DB_VERSION);
    let unsafeMigrationDetected = false;
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!transaction) return;

      // The old v1 store was keyed by collection, so opening v2 must migrate
      // its surviving rows before replacing the key path. Deleting the store
      // first silently discarded the only durable copy of those queued edits.
      if (!db.objectStoreNames.contains(STORE_NAME) || event.oldVersion === 0) {
        db.createObjectStore(STORE_NAME, { keyPath: 'queueKey' });
        return;
      }

      const read = transaction.objectStore(STORE_NAME).getAll();
      read.onerror = () => { unsafeMigrationDetected = true; transaction.abort(); };
      read.onsuccess = () => {
        const oldEntries = (read.result as OfflineChangeEntry[]) || [];
        const migrated = oldEntries.map((entry) => ({
          ...entry,
          // This DB name is already UID-scoped; never infer ownership from an
          // unscoped legacy DB or overwrite an explicit different owner.
          ownerUid: entry.ownerUid || uid,
          queueKey: queueKeyOf(entry),
        }));
        if (
          migrated.some((entry) =>
            entry.ownerUid !== uid ||
            typeof entry.collection !== 'string' || !entry.collection ||
            typeof entry.recordId !== 'string' || !entry.recordId
          ) ||
          new Set(migrated.map((entry) => entry.queueKey)).size !== migrated.length
        ) {
          // Abort leaves the original v1 database intact for recovery.
          unsafeMigrationDetected = true;
          transaction.abort();
          return;
        }
        db.deleteObjectStore(STORE_NAME);
        const newStore = db.createObjectStore(STORE_NAME, { keyPath: 'queueKey' });
        for (const entry of migrated) newStore.put(entry);
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(unsafeMigrationDetected ? new UnsafeQueueMigrationError() : request.error);
  });
}

/** Ensures every entry carries its composite key before it is stored. */
function withQueueKey(entry: OfflineChangeEntry): OfflineChangeEntry {
  return { ...entry, queueKey: queueKeyOf(entry) };
}

async function readIdbEntries(uid: string): Promise<OfflineChangeEntry[]> {
  const db = await openDb(uid);
  try {
    const entries = await new Promise<OfflineChangeEntry[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as OfflineChangeEntry[]) || []);
      request.onerror = () => reject(request.error);
    });
    return entries.map(withQueueKey);
  } finally {
    db.close();
  }
}

async function writeIdbEntries(entries: OfflineChangeEntry[], uid: string): Promise<void> {
  const db = await openDb(uid);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      entries.forEach((entry) => store.put(withQueueKey(entry)));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function readLocalEntries(uid: string | null = getActiveWorkspaceUid()): OfflineChangeEntry[] {
  if (!hasLocalStorage()) return [];
  try {
    const key = queueStorageKey(uid);
    if (!key) return [];
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineChangeEntry[]) : [];
  } catch (error) {
    console.warn('Could not read the offline change queue from localStorage:', error);
    return [];
  }
}

function writeLocalEntries(entries: OfflineChangeEntry[], uid: string | null = getActiveWorkspaceUid()): void {
  if (!hasLocalStorage()) return;
  try {
    const key = queueStorageKey(uid);
    if (!key) throw new Error('Cannot persist offline edits without an authenticated SHINE workspace.');
    window.localStorage.setItem(key, JSON.stringify(entries));
  } catch (error) {
    notifyStorageFailure(error);
    throw error;
  }
}

/**
 * Inspect the previous device-wide IndexedDB queue without opening it when it
 * does not exist. Its entries have no reliable owner and must never be replayed
 * or silently treated as empty before a destructive restore.
 */
export async function inspectUnownedLegacyIndexedDbState(): Promise<'clear' | 'pending' | 'unavailable'> {
  if (!hasIndexedDb()) return 'clear';
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (typeof factory.databases !== 'function') return 'unavailable';
  let knownDatabases: Array<{ name?: string }>;
  try { knownDatabases = await factory.databases(); } catch { return 'unavailable'; }
  if (!knownDatabases.some((database) => database.name === 'shine_relief_trust_offline')) return 'clear';

  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('shine_relief_trust_offline');
      request.onupgradeneeded = (event) => { if (event.oldVersion === 0) request.transaction?.abort(); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Legacy offline database is blocked.'));
    });
  } catch { return 'unavailable'; }

  try {
    if (!db.objectStoreNames.contains(STORE_NAME)) return 'unavailable';
    const entries = await new Promise<OfflineChangeEntry[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as OfflineChangeEntry[]) || []);
      request.onerror = () => reject(request.error);
    });
    return entries.length ? 'pending' : 'clear';
  } catch { return 'unavailable'; }
  finally { db.close(); }
}

/**
 * Loads the persisted queue. IndexedDB is authoritative when it is available
 * and already holds entries; otherwise the localStorage fallback is migrated
 * into IndexedDB so older queues are never dropped.
 */
export async function loadQueueEntries(): Promise<OfflineChangeEntry[]> {
  const uid = getActiveWorkspaceUid();
  if (!uid) return [];
  if (!hasIndexedDb()) return readLocalEntries(uid);
  try {
    const entries = await readIdbEntries(uid);
    if (entries.length) return entries;
    const legacy = readLocalEntries(uid);
    if (legacy.length) {
      await writeIdbEntries(legacy, uid);
      try {
        const key = queueStorageKey(uid);
        if (key) window.localStorage.removeItem(key);
      } catch {
        /* ignore removal failures; the migrated copy is already in IndexedDB */
      }
      return legacy;
    }
    return entries;
  } catch (error) {
    if (error instanceof UnsafeQueueMigrationError) {
      // An empty localStorage fallback cannot prove that the preserved v1
      // IndexedDB queue is empty. Do not hide it as a zero-count queue.
      notifyStorageFailure(error);
      throw error;
    }
    console.warn('IndexedDB queue unavailable; falling back to localStorage:', error);
    return readLocalEntries(uid);
  }
}

/**
 * Inspect persisted queue state without converting read/parse failures into an
 * empty queue. Destructive restore operations must fail closed when they cannot
 * prove that no offline edits remain.
 */
export async function inspectPersistedQueueState(): Promise<'clear' | 'pending' | 'unavailable'> {
  const uid = getActiveWorkspaceUid();
  if (!uid) return 'unavailable';
  let localRaw: string | null;
  try {
    if (!hasLocalStorage()) return 'unavailable';
    const key = queueStorageKey(uid);
    if (!key) return 'unavailable';
    localRaw = window.localStorage.getItem(key);
  } catch {
    return 'unavailable';
  }

  let localEntries: OfflineChangeEntry[] = [];
  if (localRaw) {
    try {
      const parsed: unknown = JSON.parse(localRaw);
      if (!Array.isArray(parsed)) return 'unavailable';
      localEntries = parsed as OfflineChangeEntry[];
    } catch {
      return 'unavailable';
    }
  }

  if (!hasIndexedDb()) return localEntries.length ? 'pending' : 'clear';

  try {
    const indexedEntries = await readIdbEntries(uid);
    if (indexedEntries.length || localEntries.length) return 'pending';
    return 'clear';
  } catch {
    // A valid localStorage copy can prove there are pending edits, but an empty
    // fallback cannot prove IndexedDB has no entries when IndexedDB is unreadable.
    return localEntries.length ? 'pending' : 'unavailable';
  }
}

export async function saveQueueEntries(entries: OfflineChangeEntry[], expectedUid?: string): Promise<void> {
  const uid = getActiveWorkspaceUid();
  if (!uid || (expectedUid && expectedUid !== uid)) throw new Error('Active SHINE workspace changed before offline edits could be persisted.');
  if (entries.some((entry) => entry.ownerUid !== uid)) throw new Error('Cannot persist queue entries with missing or mismatched workspace ownership.');
  if (!hasIndexedDb()) {
    writeLocalEntries(entries, uid);
    return;
  }
  try {
    await writeIdbEntries(entries, uid);
  } catch (error) {
    console.warn('Could not save the offline queue to IndexedDB; using localStorage:', error);
    try { writeLocalEntries(entries, uid); } catch (fallbackError) { notifyStorageFailure(fallbackError); throw fallbackError; }
  }
}

export async function readConflicts(): Promise<SyncConflict[]> {
  if (!hasLocalStorage()) throw new Error('Cannot read saved sync conflicts because local storage is unavailable.');
  const key = conflictsStorageKey();
  if (!key) throw new Error('Cannot read saved sync conflicts without an authenticated SHINE workspace.');
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Saved sync conflict data is not a valid list.');
    return parsed as SyncConflict[];
  } catch (error) {
    console.warn('Could not read saved sync conflicts; preserving the stored recovery state.');
    notifyStorageFailure(error);
    throw error;
  }
}

export async function writeConflicts(conflicts: SyncConflict[]): Promise<void> {
  if (!hasLocalStorage()) throw new Error('Cannot persist sync conflicts because local storage is unavailable.');
  try {
    const key = conflictsStorageKey();
    if (!key) throw new Error('Cannot persist sync conflicts without an authenticated SHINE workspace.');
    window.localStorage.setItem(key, JSON.stringify(conflicts));
  } catch (error) {
    console.warn('Could not persist sync conflicts:', error);
    notifyStorageFailure(error);
    throw error;
  }
}

/** Approximate storage usage for the settings/sync panel, when available. */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage || typeof storage.estimate !== 'function') return null;
    const result = await storage.estimate();
    if (!result || typeof result.usage !== 'number' || typeof result.quota !== 'number') return null;
    return { usage: result.usage, quota: result.quota };
  } catch {
    return null;
  }
}
