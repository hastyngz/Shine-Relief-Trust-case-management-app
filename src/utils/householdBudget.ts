import type { ExpenseCategory, HouseholdExpense } from '../types';

export interface HouseholdBudgetComparisonRow {
  key: string;
  itemDescription: string;
  category: HouseholdExpense['category'];
  unit?: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  percentageUsed: number | null;
  overspent: boolean;
  budgetRecordIds: string[];
  actualRecordIds: string[];
}

export interface HouseholdBudgetComparison {
  householdId: string;
  month: string;
  budgetTotal: number;
  actualTotal: number;
  variance: number;
  percentageUsed: number | null;
  rows: HouseholdBudgetComparisonRow[];
}

function normalizedItemKey(expense: HouseholdExpense): string {
  return [
    expense.itemDescription.trim().toLocaleLowerCase().replace(/\s+/g, ' '),
    expense.category,
    (expense.unit || '').trim().toLocaleLowerCase(),
  ].join('::');
}

function recordMonth(expense: HouseholdExpense): string {
  return expense.month || expense.date.slice(0, 7);
}

/** Compare one household and month. Legacy expense records remain actuals. */
export function buildHouseholdBudgetVsActual(
  expenses: HouseholdExpense[],
  householdId: string,
  month: string,
): HouseholdBudgetComparison {
  const relevant = expenses.filter((expense) =>
    expense.householdId === householdId && recordMonth(expense) === month
  );
  const groups = new Map<string, HouseholdBudgetComparisonRow>();

  for (const expense of relevant) {
    const key = normalizedItemKey(expense);
    let row = groups.get(key);
    if (!row) {
      row = {
        key,
        itemDescription: expense.itemDescription.trim(),
        category: expense.category,
        unit: expense.unit,
        budgetAmount: 0,
        actualAmount: 0,
        variance: 0,
        percentageUsed: 0,
        overspent: false,
        budgetRecordIds: [],
        actualRecordIds: [],
      };
      groups.set(key, row);
    }

    if (expense.recordType === 'budget') {
      row.budgetAmount += expense.totalCost;
      row.budgetRecordIds.push(expense.id);
    } else {
      row.actualAmount += expense.totalCost;
      row.actualRecordIds.push(expense.id);
    }
  }

  const rows = Array.from(groups.values())
    .map((row) => {
      const variance = row.actualAmount - row.budgetAmount;
      const percentageUsed = row.budgetAmount > 0
        ? (row.actualAmount / row.budgetAmount) * 100
        : row.actualAmount > 0 ? null : 0;
      return {
        ...row,
        variance,
        percentageUsed,
        overspent: variance > 0,
      };
    })
    .sort((a, b) => a.itemDescription.localeCompare(b.itemDescription));

  const budgetTotal = rows.reduce((total, row) => total + row.budgetAmount, 0);
  const actualTotal = rows.reduce((total, row) => total + row.actualAmount, 0);
  return {
    householdId,
    month,
    budgetTotal,
    actualTotal,
    variance: actualTotal - budgetTotal,
    percentageUsed: budgetTotal > 0 ? (actualTotal / budgetTotal) * 100 : actualTotal > 0 ? null : 0,
    rows,
  };
}


export interface ChildHouseBudgetImportInput {
  householdId: string;
  period: string;
  quantity: number;
  unitCost: number;
  budgetAmount: number;
  itemDescription: string;
  category?: string;
  unit?: string;
  frequency?: number;
  itemNumber?: string;
  notes?: string;
  sourceFileName: string;
  sheet: string;
  row: number;
  createdBy: string;
}

/** Create a stable, duplicate-safe monthly Child House budget record. */
export function buildChildHouseBudgetExpense(input: ChildHouseBudgetImportInput): HouseholdExpense {
  if (!input.householdId.trim()) throw new Error('Choose a Child House household before importing its budget.');
  if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) {
    throw new Error('Child House budget rows must have a specific month (YYYY-MM) before they can be imported into Budget vs Actual.');
  }
  const categoryText = (input.category || '').toLowerCase();
  const category: ExpenseCategory = /grocery|food|feeding/.test(categoryText) ? 'Groceries'
    : /utilit|electric|water/.test(categoryText) ? 'Utilities'
    : /repair|maintenance/.test(categoryText) ? 'Repairs'
    : /cloth|social/.test(categoryText) ? 'Clothing/social support'
    : /rent/.test(categoryText) ? 'Rent'
    : /household|suppl/.test(categoryText) ? 'Household supplies'
    : 'Other';
  const identity = [input.householdId, input.period, input.sheet, input.row, input.itemDescription.trim().toLowerCase()].join('|');
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  }
  const stableId = `CHB-${(hash >>> 0).toString(36)}`;
  const now = new Date().toISOString();
  const sourceNote = `Imported from ${input.sourceFileName}, ${input.sheet} row ${input.row}${input.itemNumber ? `; item number ${input.itemNumber}` : ''}`;
  return {
    id: stableId,
    householdId: input.householdId,
    date: `${input.period}-01`,
    month: input.period,
    recordType: 'budget',
    category,
    itemDescription: input.itemDescription.trim(),
    quantity: String(input.quantity),
    unit: input.unit || undefined,
    unitCost: Number(input.unitCost) || 0,
    totalCost: Number(input.budgetAmount) || 0,
    frequency: input.frequency === undefined ? undefined : String(input.frequency),
    notes: [input.notes, sourceNote].filter(Boolean).join(' · '),
    budgetLineId: stableId,
    financialYear: input.period.slice(0, 4),
    programme: 'Child House',
    budgetCategory: input.category || undefined,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
  };
}
