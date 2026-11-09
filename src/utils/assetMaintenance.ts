import type { AssetRecord, HouseholdExpense } from '../types';
import { isValidInventoryDate } from './inventory';

export const ADMIN_OPERATIONS_COST_CENTRE_ID = 'ADMIN_OPERATIONS';
export const ADMIN_OPERATIONS_COST_CENTRE_NAME = 'Administration & Operations';

export interface AssetMaintenanceExpenseInput {
  asset: AssetRecord;
  historyEntryId: string;
  expenseId: string;
  date: string;
  workDone: string;
  amountMWK: number;
  supplier?: string;
  invoiceReference?: string;
  actor: string;
  now: string;
}

/** Build a normal finance expense linked to the exact asset-maintenance history event. */
export function buildAssetMaintenanceExpense(input: AssetMaintenanceExpenseInput): HouseholdExpense {
  const { asset, historyEntryId, expenseId, date, workDone, amountMWK, actor, now } = input;
  if (!isValidInventoryDate(date)) throw new Error('Enter a valid maintenance date.');
  if (!workDone.trim()) throw new Error('Describe the maintenance work before posting its expense.');
  if (!Number.isFinite(amountMWK) || amountMWK <= 0) throw new Error('Enter a positive maintenance cost before posting an expense.');
  if (!historyEntryId.trim() || !expenseId.trim() || !actor.trim()) throw new Error('Maintenance expense identifiers and recorder are required.');

  const supplier = input.supplier?.trim();
  const invoiceReference = input.invoiceReference?.trim();
  const itemDescription = `Vehicle maintenance — ${asset.assetTag} ${asset.name}: ${workDone.trim()}`;
  return {
    id: expenseId,
    // This reserved non-household ID keeps organisation-wide costs out of individual household totals.
    householdId: ADMIN_OPERATIONS_COST_CENTRE_ID,
    date,
    category: 'Repairs',
    itemDescription,
    quantity: '1',
    unit: 'service',
    unitCost: amountMWK,
    totalCost: amountMWK,
    supplier: supplier || undefined,
    invoiceReference: invoiceReference || undefined,
    notes: `Asset ID: ${asset.id}; asset tag: ${asset.assetTag}; maintenance history ID: ${historyEntryId}`,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    financialYear: date.slice(0, 4),
    budgetCategory: 'Administration & Operations',
    subcategory: 'Vehicle / Asset Maintenance',
    costCentre: ADMIN_OPERATIONS_COST_CENTRE_NAME,
    sourceType: 'asset_maintenance',
    sourceRecordId: historyEntryId,
    paymentStatus: 'Payment Outstanding',
    amountDue: amountMWK,
    auditTrail: [{ action: 'created', by: actor, at: now }],
  };
}

/** Idempotently append a maintenance expense; one service history ID can post only once. */
export function addAssetMaintenanceExpense(
  expenses: HouseholdExpense[],
  expense: HouseholdExpense,
): { expenses: HouseholdExpense[]; added: boolean } {
  const existing = expenses.find((item) =>
    item.sourceType === 'asset_maintenance' && item.sourceRecordId === expense.sourceRecordId
  );
  if (existing) return { expenses, added: false };
  return { expenses: [expense, ...expenses], added: true };
}
