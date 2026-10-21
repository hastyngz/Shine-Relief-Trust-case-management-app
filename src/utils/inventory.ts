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

/** Classify a date-only expiry value without relying on local timezone parsing. */
export function getInventoryExpiryStatus(expiryDate?: string, today = getLocalDateInputValue()): InventoryExpiryResult {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  };
  if (!expiryDate || !validDate(expiryDate) || !validDate(today)) return { status: 'not-tracked', daysRemaining: null };
  const expiry = Date.parse(`${expiryDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  const daysRemaining = Math.round((expiry - current) / 86_400_000);
  if (daysRemaining < 0) return { status: 'expired', daysRemaining };
  if (daysRemaining <= 30) return { status: 'expiring-soon', daysRemaining };
  return { status: 'ok', daysRemaining };
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
