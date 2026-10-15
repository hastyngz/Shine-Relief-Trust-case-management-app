import type { OfflineChangeEntry, SyncConflict } from '../types';

/**
 * Persistence for the offline change queue and the sync conflict list.
 *
 * IndexedDB is used first so the queue is not limited by the roughly 5 MB
 * localStorage quota that also holds the whole database. A small localStorage
 * fallback keeps the queue working on browsers without IndexedDB (or when the
 * database cannot be opened).
 */
const QUEUE_KEY = 'shine_relief_trust_offline_queue_v2';
const CONFLICTS_KEY = 'shine_relief_trust_sync_conflicts_v1';
const DB_NAME = 'shine_relief_trust_offline';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'collection' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIdbEntries(): Promise<OfflineChangeEntry[]> {
  const db = await openDb();
  try {
    return await new Promise<OfflineChangeEntry[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as OfflineChangeEntry[]) || []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function writeIdbEntries(entries: OfflineChangeEntry[]): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      entries.forEach((entry) => store.put(entry));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function readLocalEntries(): OfflineChangeEntry[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineChangeEntry[]) : [];
  } catch (error) {
    console.warn('Could not read the offline change queue from localStorage:', error);
    return [];
  }
}

function writeLocalEntries(entries: OfflineChangeEntry[]): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  } catch (error) {
    notifyStorageFailure(error);
    throw error;
  }
}

/**
 * Loads the persisted queue. IndexedDB is authoritative when it is available
 * and already holds entries; otherwise the localStorage fallback is migrated
 * into IndexedDB so older queues are never dropped.
 */
export async function loadQueueEntries(): Promise<OfflineChangeEntry[]> {
  if (!hasIndexedDb()) return readLocalEntries();
  try {
    const entries = await readIdbEntries();
    if (entries.length) return entries;
    const legacy = readLocalEntries();
    if (legacy.length) {
      await writeIdbEntries(legacy);
      try {
        window.localStorage.removeItem(QUEUE_KEY);
      } catch {
        /* ignore removal failures; the migrated copy is already in IndexedDB */
      }
      return legacy;
    }
    return entries;
  } catch (error) {
    console.warn('IndexedDB queue unavailable; falling back to localStorage:', error);
    return readLocalEntries();
  }
}

export async function saveQueueEntries(entries: OfflineChangeEntry[]): Promise<void> {
  if (!hasIndexedDb()) {
    writeLocalEntries(entries);
    return;
  }
  try {
    await writeIdbEntries(entries);
  } catch (error) {
    console.warn('Could not save the offline queue to IndexedDB; using localStorage:', error);
    try { writeLocalEntries(entries); } catch (fallbackError) { notifyStorageFailure(fallbackError); throw fallbackError; }
  }
}

export async function readConflicts(): Promise<SyncConflict[]> {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(CONFLICTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncConflict[]) : [];
  } catch (error) {
    console.warn('Could not read sync conflicts:', error);
    return [];
  }
}

export async function writeConflicts(conflicts: SyncConflict[]): Promise<void> {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts));
  } catch (error) {
    console.warn('Could not persist sync conflicts:', error);
    notifyStorageFailure(error);
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
