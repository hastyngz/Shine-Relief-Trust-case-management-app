import type { HouseholdExpense, InventoryItem, ProcurementList } from '../types';

export interface SupplierActivity {
  /** Display name retained from the first encountered source record. */
  name: string;
  quoteCount: number;
  procurementListCount: number;
  expenseRecordCount: number;
  inventoryItemCount: number;
  lastActivityDate?: string;
}

/**
 * Builds a read-only supplier index from existing procurement quotes and expense
 * records. It deliberately does not invent a master supplier identity or expose
 * contact details; names are deduplicated case-insensitively for display only.
 */
export function buildSupplierActivityIndex(
  procurementLists: ProcurementList[],
  expenses: HouseholdExpense[],
  inventoryItems: InventoryItem[] = [],
): SupplierActivity[] {
  const suppliers = new Map<string, SupplierActivity & { listIds: Set<string> }>();
  const ensure = (rawName: unknown): (SupplierActivity & { listIds: Set<string> }) | null => {
    if (typeof rawName !== 'string') return null;
    const name = rawName.trim();
    if (!name || /^(n\/?a|none|unknown)$/i.test(name)) return null;
    const key = name.toLocaleLowerCase();
    let entry = suppliers.get(key);
    if (!entry) {
      entry = { name, quoteCount: 0, procurementListCount: 0, expenseRecordCount: 0, inventoryItemCount: 0, listIds: new Set<string>() };
      suppliers.set(key, entry);
    }
    return entry;
  };
  const addDate = (entry: SupplierActivity, value?: string) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return;
    if (!entry.lastActivityDate || value > entry.lastActivityDate) entry.lastActivityDate = value;
  };

  for (const list of procurementLists || []) {
    for (const item of list.items || []) {
      for (const quote of item.quotes || []) {
        const entry = ensure(quote.supplier);
        if (!entry) continue;
        entry.quoteCount += 1;
        if (list.id) entry.listIds.add(list.id);
        addDate(entry, quote.quotedAt);
      }
    }
  }

  for (const expense of expenses || []) {
    const entry = ensure(expense.supplier);
    if (!entry) continue;
    entry.expenseRecordCount += 1;
    addDate(entry, expense.date);
  }

  for (const item of inventoryItems || []) {
    const entry = ensure(item.supplier);
    if (!entry) continue;
    entry.inventoryItemCount += 1;
  }

  return [...suppliers.values()]
    .map(({ listIds, ...entry }) => ({ ...entry, procurementListCount: listIds.size }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
