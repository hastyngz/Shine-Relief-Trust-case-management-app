import type { HouseholdExpense } from '../types';

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
