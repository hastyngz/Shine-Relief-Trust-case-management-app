const MOVEMENT_TYPES = new Set([
  'Received',
  'Issued',
  'Returned',
  'Damaged',
  'Adjustment',
  'Transfer In',
  'Transfer Out',
]);

export interface InventoryIntegrityAuditSummary {
  totalItems: number;
  malformedItemRecords: number;
  invalidBalanceItems: number;
  invalidMinimumStockLevelItems: number;
  invalidUnitCostItems: number;
  missingStockCodeItems: number;
  duplicateStockCodeGroups: number;
  extraDuplicateStockCodeItems: number;
  malformedMovementLists: number;
  malformedMovementEntries: number;
  movementsMissingActorUid: number;
  movementsMissingCreatedAt: number;
  duplicateMovementIdGroups: number;
  extraDuplicateMovementEntries: number;
  hasFindings: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Inspect a parsed app database export without mutating it or returning record
 * identifiers or personal data. This is an anomaly summary, not a repair or a
 * proof that current balances reconcile with historical movements.
 */
export function auditInventorySnapshot(snapshot: unknown): InventoryIntegrityAuditSummary {
  const root = asRecord(snapshot);
  if (!root || !Array.isArray(root.inventoryItems)) {
    throw new Error('Snapshot must be a database export containing an inventoryItems array.');
  }

  const items = root.inventoryItems as unknown[];
  const summary: InventoryIntegrityAuditSummary = {
    totalItems: items.length,
    malformedItemRecords: 0,
    invalidBalanceItems: 0,
    invalidMinimumStockLevelItems: 0,
    invalidUnitCostItems: 0,
    missingStockCodeItems: 0,
    duplicateStockCodeGroups: 0,
    extraDuplicateStockCodeItems: 0,
    malformedMovementLists: 0,
    malformedMovementEntries: 0,
    movementsMissingActorUid: 0,
    movementsMissingCreatedAt: 0,
    duplicateMovementIdGroups: 0,
    extraDuplicateMovementEntries: 0,
    hasFindings: false,
  };
  const stockCodeCounts = new Map<string, number>();
  const movementIdCounts = new Map<string, number>();

  for (const candidate of items) {
    const item = asRecord(candidate);
    if (!item) {
      summary.malformedItemRecords += 1;
      continue;
    }

    if (typeof item.quantityOnHand !== 'number' || !Number.isFinite(item.quantityOnHand) || item.quantityOnHand < 0) {
      summary.invalidBalanceItems += 1;
    }
    if (typeof item.minimumStockLevel !== 'number' || !Number.isFinite(item.minimumStockLevel) || item.minimumStockLevel < 0) {
      summary.invalidMinimumStockLevelItems += 1;
    }
    if (item.unitCostMWK !== undefined && (typeof item.unitCostMWK !== 'number' || !Number.isFinite(item.unitCostMWK) || item.unitCostMWK < 0)) {
      summary.invalidUnitCostItems += 1;
    }

    if (!hasText(item.stockCode)) {
      summary.missingStockCodeItems += 1;
    } else {
      const normalizedCode = item.stockCode.trim().toLocaleLowerCase('en-US');
      stockCodeCounts.set(normalizedCode, (stockCodeCounts.get(normalizedCode) || 0) + 1);
    }

    if (!Array.isArray(item.movements)) {
      summary.malformedMovementLists += 1;
      continue;
    }

    const itemMovementIds = new Set<string>();
    for (const movementCandidate of item.movements as unknown[]) {
      const movement = asRecord(movementCandidate);
      if (!movement) {
        summary.malformedMovementEntries += 1;
        continue;
      }

      const movementType = movement.type;
      const quantity = movement.quantity;
      const validType = typeof movementType === 'string' && MOVEMENT_TYPES.has(movementType);
      const validQuantity = typeof quantity === 'number'
        && Number.isFinite(quantity)
        && (movementType === 'Adjustment' ? quantity >= 0 : quantity > 0);
      const movementId = hasText(movement.id) ? movement.id.trim() : '';
      const createdAtPresent = hasText(movement.createdAt);
      if (!validType || !validQuantity || !movementId || !hasText(movement.date)
        || !hasText(movement.location) || !hasText(movement.reason)
        || !hasText(movement.recordedBy) || !createdAtPresent) {
        summary.malformedMovementEntries += 1;
      }
      if (!hasText(movement.recordedByUid)) summary.movementsMissingActorUid += 1;
      if (!createdAtPresent) summary.movementsMissingCreatedAt += 1;

      if (movementId) {
        movementIdCounts.set(movementId, (movementIdCounts.get(movementId) || 0) + 1);
        if (itemMovementIds.has(movementId)) summary.malformedMovementEntries += 1;
        itemMovementIds.add(movementId);
      }
    }
  }

  for (const count of stockCodeCounts.values()) {
    if (count > 1) {
      summary.duplicateStockCodeGroups += 1;
      summary.extraDuplicateStockCodeItems += count - 1;
    }
  }
  for (const count of movementIdCounts.values()) {
    if (count > 1) {
      summary.duplicateMovementIdGroups += 1;
      summary.extraDuplicateMovementEntries += count - 1;
    }
  }

  summary.hasFindings = Object.entries(summary)
    .some(([key, value]) => key !== 'totalItems' && key !== 'hasFindings' && typeof value === 'number' && value > 0);
  return summary;
}
