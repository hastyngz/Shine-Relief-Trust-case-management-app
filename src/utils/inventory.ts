export type InventoryExpiryStatus = 'not-tracked' | 'expired' | 'expiring-soon' | 'ok';

export interface InventoryExpiryResult {
  status: InventoryExpiryStatus;
  daysRemaining: number | null;
}

/** Classify a date-only expiry value without relying on local timezone parsing. */
export function getInventoryExpiryStatus(expiryDate?: string, today = new Date().toISOString().slice(0, 10)): InventoryExpiryResult {
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
