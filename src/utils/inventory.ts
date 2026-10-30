import type { InventoryItem } from '../types';

/** Create collision-resistant client-side IDs for inventory records and movements. */
export function createInventoryId(prefix: string, cryptoApi: Pick<Crypto, 'randomUUID' | 'getRandomValues'> | undefined = globalThis.crypto): string {
  if (cryptoApi?.randomUUID) return `${prefix}_${cryptoApi.randomUUID()}`;
  if (cryptoApi?.getRandomValues) {
    const words = cryptoApi.getRandomValues(new Uint32Array(4));
    return `${prefix}_${Array.from(words, (word) => word.toString(16).padStart(8, '0')).join('')}`;
  }
  // Compatibility fallback for older/non-secure browser contexts. This is less
  // collision-resistant than Web Crypto, so prefer UUIDs whenever available.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

export type InventoryExpiryStatus = 'not-tracked' | 'expired' | 'expiring-soon' | 'ok';

export interface InventoryExpiryResult {
  status: InventoryExpiryStatus;
  daysRemaining: number | null;
}

/** Format a calendar date in the device's local timezone for date inputs. */
export function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Validate a date-only value as a real Gregorian calendar date (not just a parseable string). */
export function isValidInventoryDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** Classify a date-only expiry value without relying on local timezone parsing. */
export function getInventoryExpiryStatus(expiryDate?: string, today = getLocalDateInputValue()): InventoryExpiryResult {
  if (!expiryDate || !isValidInventoryDate(expiryDate) || !isValidInventoryDate(today)) return { status: 'not-tracked', daysRemaining: null };
  const expiry = Date.parse(`${expiryDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  const daysRemaining = Math.round((expiry - current) / 86_400_000);
  if (daysRemaining < 0) return { status: 'expired', daysRemaining };
  if (daysRemaining <= 30) return { status: 'expiring-soon', daysRemaining };
  return { status: 'ok', daysRemaining };
}


export interface InventoryExpirySummary {
  expired: number;
  expiringSoon: number;
  notTracked: number;
}

/** Count date-tracked inventory alerts using the same local calendar-day rules as the register filter. */
export function summarizeInventoryExpiry(items: InventoryItem[], today = getLocalDateInputValue()): InventoryExpirySummary {
  return items.reduce<InventoryExpirySummary>((summary, item) => {
    const status = getInventoryExpiryStatus(item.expiryDate, today).status;
    if (status === 'expired') summary.expired += 1;
    else if (status === 'expiring-soon') summary.expiringSoon += 1;
    else if (status === 'not-tracked') summary.notTracked += 1;
    return summary;
  }, { expired: 0, expiringSoon: 0, notTracked: 0 });
}

export interface InventoryStocktakeAdjustment {
  previousQuantity: number;
  countedQuantity: number;
  variance: number;
  quantity: number;
}

/** The variance is positive when physical stock exceeds the recorded balance. */
export function getInventoryStocktakeAdjustment(previousQuantity: number, countedQuantity: number): InventoryStocktakeAdjustment {
  if (!Number.isFinite(previousQuantity) || previousQuantity < 0 || !Number.isFinite(countedQuantity) || countedQuantity < 0) {
    throw new RangeError('Stock quantities must be finite numbers that are zero or greater.');
  }
  const variance = countedQuantity - previousQuantity;
  return { previousQuantity, countedQuantity, variance, quantity: Math.abs(variance) };
}


/** Keep the single-location stock model honest until a transfer ledger exists. */
export function resolveInventoryLocationForSave(currentLocation: string | undefined, requestedLocation: string, isEditing: boolean): string {
  return isEditing && currentLocation ? currentLocation : requestedLocation;
}


export interface PendingInventoryMovementRequest {
  id: string;
  itemId: string;
  signature: string;
  mode: 'movement' | 'stocktake';
  payload: Record<string, unknown>;
  status?: 'needs-review';
}

/** Validate untrusted persisted movement entries before they can be retried. */
function isPendingInventoryMovementRequest(value: unknown): value is PendingInventoryMovementRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<PendingInventoryMovementRequest>;
  return typeof entry.id === 'string' && entry.id.trim().length > 0
    && typeof entry.itemId === 'string' && entry.itemId.trim().length > 0
    && typeof entry.signature === 'string' && entry.signature.length > 0
    && (entry.mode === 'movement' || entry.mode === 'stocktake')
    && (entry.status === undefined || entry.status === 'needs-review')
    && Boolean(entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload));
}
const pendingInventoryKey = (uid: string) => `shine_inventory_pending_movement_${uid}`;

/** null means malformed/unavailable; an empty array means no pending requests. */
export function loadPendingInventoryMovements(uid: string): PendingInventoryMovementRequest[] | null {
  if (typeof window === 'undefined' || !uid.trim()) return null;
  try {
    const raw = window.localStorage.getItem(pendingInventoryKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [parsed]; // legacy single-object compatibility
    if (entries.length > 100 || !entries.every(isPendingInventoryMovementRequest)) return null;
    const ids = entries.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) return null;
    return entries as PendingInventoryMovementRequest[];
  } catch { return null; }
}

/** Append distinct transactions; an existing ID is accepted only for the identical request. */
export function savePendingInventoryMovement(uid: string, pending: PendingInventoryMovementRequest): boolean {
  if (typeof window === 'undefined' || !uid.trim() || !isPendingInventoryMovementRequest(pending)) return false;
  try {
    const existing = loadPendingInventoryMovements(uid);
    if (!existing) return false;
    const sameId = existing.find((entry) => entry.id === pending.id);
    if (sameId) return sameId.itemId === pending.itemId && sameId.signature === pending.signature
      && sameId.mode === pending.mode && JSON.stringify(sameId.payload) === JSON.stringify(pending.payload);
    if (existing.length >= 100) return false;
    window.localStorage.setItem(pendingInventoryKey(uid), JSON.stringify([...existing, pending]));
    return true;
  } catch { return false; }
}

/** Backwards-compatible accessor for the oldest queued transaction. */
export function loadPendingInventoryMovement(uid: string): PendingInventoryMovementRequest | null {
  return loadPendingInventoryMovements(uid)?.[0] ?? null;
}

/** Persist a definitive server rejection on the FIFO head so review survives reloads. */
export function markPendingInventoryMovementRejected(uid: string, id: string): boolean {
  if (typeof window === 'undefined' || !uid.trim() || !id.trim()) return false;
  try {
    const existing = loadPendingInventoryMovements(uid);
    if (!existing || existing[0]?.id !== id) return false;
    if (existing[0].status === 'needs-review') return true;
    const updated = [{ ...existing[0], status: 'needs-review' as const }, ...existing.slice(1)];
    window.localStorage.setItem(pendingInventoryKey(uid), JSON.stringify(updated));
    return true;
  } catch { return false; }
}

/** Remove only the FIFO head by default, preserving all later requests. */
export function clearPendingInventoryMovement(uid: string, id?: string): boolean {
  if (typeof window === 'undefined' || !uid.trim()) return false;
  try {
    const existing = loadPendingInventoryMovements(uid);
    if (!existing) return false;
    if (!existing.length) return true;
    if (existing[0].id !== (id ?? existing[0].id)) return false;
    const remaining = existing.slice(1);
    if (remaining.length) window.localStorage.setItem(pendingInventoryKey(uid), JSON.stringify(remaining));
    else window.localStorage.removeItem(pendingInventoryKey(uid));
    return true;
  } catch { return false; }
}



export type PendingInventoryFlushResult =
  | { status: 'empty'; processed: number }
  | { status: 'failed'; processed: number; failedId: string }
  | { status: 'needs-review'; processed: number; failedId: string }
  | { status: 'storage-error'; processed: number; failedId: string }
  | { status: 'unavailable'; processed: 0 };

/**
 * Flush a user's queued inventory movements sequentially.
 * The callback must resolve only after server confirmation and any required local
 * application succeeds. A failed request stops the queue; a 4xx is persisted as
 * needs-review and is never automatically retried or bypassed.
 */
export async function flushPendingInventoryMovements(
  uid: string,
  submit: (pending: PendingInventoryMovementRequest) => Promise<void>,
): Promise<PendingInventoryFlushResult> {
  let processed = 0;
  while (true) {
    const queue = loadPendingInventoryMovements(uid);
    if (!queue) return { status: 'unavailable', processed: 0 };
    const head = queue[0];
    if (!head) return { status: 'empty', processed };
    if (head.status === 'needs-review') return { status: 'needs-review', processed, failedId: head.id };

    try {
      await submit(head);
    } catch (error) {
      const status = error instanceof Error ? (error as Error & { status?: number }).status : undefined;
      if (status !== undefined && status >= 400 && status < 500) {
        if (!markPendingInventoryMovementRejected(uid, head.id)) {
          return { status: 'storage-error', processed, failedId: head.id };
        }
        return { status: 'needs-review', processed, failedId: head.id };
      }
      return { status: 'failed', processed, failedId: head.id };
    }

    // If local storage fails after server confirmation, keep the same id for an
    // idempotent retry rather than risking silent loss of the transaction.
    if (!clearPendingInventoryMovement(uid, head.id)) {
      return { status: 'storage-error', processed, failedId: head.id };
    }
    processed += 1;
  }
}


export type InventoryStockFilter = 'all' | 'low' | 'expiry';

export interface InventoryRegisterFilters {
  query?: string;
  category?: string;
  location?: string;
  stock?: InventoryStockFilter;
  today?: string;
}

/** Apply the inventory register's search and alert filters consistently. */
export function filterInventoryItems(items: InventoryItem[], filters: InventoryRegisterFilters = {}): InventoryItem[] {
  const term = (filters.query || '').trim().toLowerCase();
  const category = filters.category || 'All categories';
  const location = filters.location || 'All locations';
  const stock = filters.stock || 'all';
  return [...items].filter((item) => {
    const matchesQuery = !term || [item.name, item.stockCode, item.category, item.location, item.supplier]
      .some((value) => value?.toLowerCase().includes(term));
    const matchesCategory = category === 'All categories' || item.category === category;
    const matchesLocation = location === 'All locations' || item.location === location;
    const expiryStatus = getInventoryExpiryStatus(item.expiryDate, filters.today).status;
    const matchesStock = stock === 'all'
      || (stock === 'low' && item.quantityOnHand <= item.minimumStockLevel)
      || (stock === 'expiry' && ['expired', 'expiring-soon'].includes(expiryStatus));
    return matchesQuery && matchesCategory && matchesLocation && matchesStock;
  }).sort((a, b) => a.name.localeCompare(b.name));
}
