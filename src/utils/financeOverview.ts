import type { AppDatabase, HouseholdExpense } from '../types';

export interface FinancePeriodSummary {
  budgets: NonNullable<AppDatabase['budgets']>;
  budget: number;
  budgetActual: number;
  expenses: HouseholdExpense[];
  expenseActual: number;
  assetMaintenanceExpenses: HouseholdExpense[];
  assetMaintenanceTotal: number;
  unpaid: HouseholdExpense[];
  unpaidTotal: number;
  financeRegister: HouseholdExpense[];
  handover: NonNullable<AppDatabase['procurementLists']>;
  transportTrips: NonNullable<AppDatabase['schedules']>;
  transportFuel: number;
}

const validPeriod = (period: string): boolean => {
  if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(period)) return false;
  return true;
};

/** Derive all monthly finance figures from one explicit calendar-month scope. */
export function getFinancePeriodSummary(db: AppDatabase, period: string): FinancePeriodSummary {
  const budgets = validPeriod(period) ? (db.budgets || []).filter((item) => item.period === period) : [];
  const expenses = validPeriod(period)
    ? (db.expenses || []).filter((expense) => typeof expense.date === 'string' && expense.date.startsWith(period))
    : [];
  const budget = budgets.reduce((total, item) => total + (Number(item.budgetAmount) || 0), 0);
  const budgetActual = budgets.reduce((total, item) => total + (Number(item.actualExpenditure) || 0), 0);
  const expenseActual = expenses.reduce((total, expense) => total + (Number(expense.totalCost) || 0), 0);
  const assetMaintenanceExpenses = expenses.filter((expense) => expense.sourceType === 'asset_maintenance');
  const assetMaintenanceTotal = assetMaintenanceExpenses.reduce((total, expense) => total + (Number(expense.totalCost) || 0), 0);
  const unpaid = (db.expenses || []).filter((expense) => expense.paymentStatus === 'Payment Outstanding');
  const unpaidTotal = unpaid.reduce((total, expense) => total + (Number(expense.amountDue ?? expense.totalCost) || 0), 0);
  const registerIds = new Set(expenses.map((expense) => expense.id));
  const financeRegister = [
    ...expenses,
    ...unpaid.filter((expense) => !registerIds.has(expense.id)),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const handover = (db.procurementLists || []).filter((item) => item.status === 'purchased' && !item.financeHandedOverAt);
  const transportTrips = validPeriod(period)
    ? (db.schedules || []).filter((item) => item.type === 'transport_trip' && item.scheduledDate.startsWith(period))
    : [];
  const transportFuel = transportTrips.reduce((total, item) => total + (item.transportDetails?.fuelCostMWK || 0), 0);

  return {
    budgets, budget, budgetActual, expenses, expenseActual,
    assetMaintenanceExpenses, assetMaintenanceTotal, unpaid, unpaidTotal,
    financeRegister, handover, transportTrips, transportFuel,
  };
}
