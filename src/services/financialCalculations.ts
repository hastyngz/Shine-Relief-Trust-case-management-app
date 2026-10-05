import {
  BudgetItem,
  HouseholdExpense,
  PayrollPaymentStatus,
  SalaryHistoryRecord,
  SalaryFrequency,
} from '../types';

export const FINANCIAL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export interface PayrollSalarySegment {
  salaryHistoryRecordId: string;
  effectiveDate: string;
  startDate: string;
  endDate: string;
  salaryAmount: number;
  salaryFrequency: SalaryFrequency;
  expectedAmount: number;
}

export interface PayrollCalculation {
  expectedAmount: number;
  applicableSalary: number;
  salaryHistoryRecordIds: string[];
  salarySegments: PayrollSalarySegment[];
}

export interface BudgetVariance {
  budgeted: number;
  actual: number;
  remaining: number;
  variance: number;
  variancePercent: number | null;
  status: 'Within budget' | 'Approaching budget' | 'Over budget' | 'Unbudgeted expenditure';
}

export interface BudgetThresholds {
  approachingPercent: number;
}

export interface PayrollFilters {
  financialYear?: string;
  month?: number;
  employeeId?: string;
  departmentOrProgramme?: string;
  employeeCategory?: string;
  paymentStatus?: PayrollPaymentStatus;
}

export interface BudgetLineTotals {
  annual: number;
  monthly: Record<number, number>;
  programme: Record<string, number>;
  category: Record<string, number>;
}

export function outstandingExpenseSummary(expenses: HouseholdExpense[]): { count: number; amount: number } {
  const outstanding = expenses.filter((expense) => expense.paymentStatus === 'Payment Outstanding');
  return {
    count: outstanding.length,
    amount: outstanding.reduce((total, expense) => total + (expense.amountDue ?? expense.totalCost), 0),
  };
}

function parseDate(value: string, name: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid YYYY-MM-DD date`);
  }
  return date;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

function dayRate(amount: number, frequency: SalaryFrequency, date: Date): number {
  if (frequency === 'Daily') return amount;
  if (frequency === 'Weekly') return amount / 7;
  if (frequency === 'Annual') {
    const days = (Date.UTC(date.getUTCFullYear() + 1, 0, 1) - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000;
    return amount / days;
  }
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return amount / daysInMonth;
}

export function calculatePayrollExpected(
  employeeId: string,
  periodStartDate: string,
  periodEndDate: string,
  salaryHistory: SalaryHistoryRecord[]
): PayrollCalculation {
  const start = parseDate(periodStartDate, 'Pay period start date');
  const end = parseDate(periodEndDate, 'Pay period end date');
  if (end < start) throw new Error('Pay period end date cannot precede its start date');

  const history = salaryHistory
    .filter((record) => record.employeeId === employeeId)
    .map((record) => ({ record, effective: parseDate(record.effectiveDate, 'Salary effective date') }))
    .sort((a, b) => a.effective.getTime() - b.effective.getTime());
  if (history.some(({ record }) => record.salaryAmount <= 0)) throw new Error('Salary amount must be greater than zero');

  let activeIndex = -1;
  history.forEach(({ effective }, index) => {
    if (effective <= start) activeIndex = index;
  });
  if (activeIndex < 0) throw new Error('No salary history applies at the start of this pay period');

  const segments: PayrollSalarySegment[] = [];
  let cursor = start;
  while (cursor <= end) {
    while (activeIndex + 1 < history.length && history[activeIndex + 1].effective <= cursor) activeIndex += 1;
    const active = history[activeIndex];
    const nextEffective = history[activeIndex + 1]?.effective;
    const segmentLastDate = nextEffective && nextEffective <= end
      ? new Date(nextEffective.getTime() - 86400000)
      : end;
    let amount = 0;
    for (let day = new Date(cursor); day <= segmentLastDate; day = nextDay(day)) {
      amount += dayRate(active.record.salaryAmount, active.record.salaryFrequency, day);
    }
    segments.push({
      salaryHistoryRecordId: active.record.id,
      effectiveDate: active.record.effectiveDate,
      startDate: dateString(cursor),
      endDate: dateString(segmentLastDate),
      salaryAmount: active.record.salaryAmount,
      salaryFrequency: active.record.salaryFrequency,
      expectedAmount: amount,
    });
    cursor = nextDay(segmentLastDate);
  }

  const expectedAmount = segments.reduce((sum, segment) => sum + segment.expectedAmount, 0);
  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return {
    expectedAmount: Math.round(expectedAmount),
    applicableSalary: Math.round(segments.reduce((sum, segment) => sum + segment.salaryAmount * (new Date(`${segment.endDate}T00:00:00.000Z`).getTime() - new Date(`${segment.startDate}T00:00:00.000Z`).getTime() + 86400000) / dayCount, 0)),
    salaryHistoryRecordIds: [...new Set(segments.map((segment) => segment.salaryHistoryRecordId))],
    salarySegments: segments.map((segment) => ({ ...segment, expectedAmount: Math.round(segment.expectedAmount) })),
  };
}

export function calculatePayrollStatus(expectedAmount: number, amountPaid: number): PayrollPaymentStatus {
  if (amountPaid <= 0) return 'Unpaid';
  if (amountPaid >= expectedAmount) return 'Paid';
  return 'Partially Paid';
}

export function calculatePlannedAmount(line: Pick<BudgetItem, 'quantity' | 'unitCost' | 'daysFrequency'>): number {
  const quantity = Number(line.quantity);
  const unitCost = Number(line.unitCost);
  const frequency = line.daysFrequency === undefined ? 1 : Number(line.daysFrequency);
  if (![quantity, unitCost, frequency].every(Number.isFinite) || quantity < 0 || unitCost < 0 || frequency < 0) {
    throw new Error('Budget quantity, unit cost, and frequency must be non-negative finite numbers');
  }
  return Math.round(quantity * unitCost * frequency);
}

export function calculateBudgetVariance(
  budgeted: number,
  actual: number,
  thresholds: BudgetThresholds = { approachingPercent: 80 }
): BudgetVariance {
  const safeBudget = Number.isFinite(budgeted) ? budgeted : 0;
  const safeActual = Number.isFinite(actual) ? actual : 0;
  const remaining = safeBudget - safeActual;
  const variance = safeActual - safeBudget;
  const variancePercent = safeBudget === 0 ? null : (variance / safeBudget) * 100;
  const spendPercent = safeBudget === 0 ? (safeActual > 0 ? Number.POSITIVE_INFINITY : 0) : (safeActual / safeBudget) * 100;
  const status = safeBudget === 0
    ? safeActual > 0 ? 'Unbudgeted expenditure' : 'Within budget'
    : safeActual > safeBudget ? 'Over budget'
      : spendPercent >= thresholds.approachingPercent ? 'Approaching budget' : 'Within budget';
  return { budgeted: safeBudget, actual: safeActual, remaining, variance, variancePercent, status };
}

export function sumBudgetLines(lines: BudgetItem[], predicate: (line: BudgetItem) => boolean = () => true): number {
  return lines.filter(predicate).reduce((sum, line) => sum + (Number.isFinite(line.budgetAmount) ? line.budgetAmount : calculatePlannedAmount(line)), 0);
}

export function aggregateBudgetLines(lines: BudgetItem[]): BudgetLineTotals {
  return lines.reduce<BudgetLineTotals>((totals, line) => {
    const planned = Number.isFinite(line.budgetAmount) ? line.budgetAmount : calculatePlannedAmount(line);
    totals.annual += planned;
    if (line.month && line.month >= 1 && line.month <= 12) totals.monthly[line.month] = (totals.monthly[line.month] || 0) + planned;
    totals.programme[line.programme] = (totals.programme[line.programme] || 0) + planned;
    totals.category[line.category] = (totals.category[line.category] || 0) + planned;
    return totals;
  }, { annual: 0, monthly: {}, programme: {}, category: {} });
}

export function filterPayrollRecords<T extends {
  payPeriodStartDate: string;
  employeeId: string;
  departmentOrProgramme?: string;
  employeeCategory?: string;
  paymentStatus: PayrollPaymentStatus;
}>(records: T[], filters: PayrollFilters): T[] {
  return records.filter((record) => {
    if (filters.financialYear && !record.payPeriodStartDate.startsWith(filters.financialYear)) return false;
    if (filters.month && Number(record.payPeriodStartDate.slice(5, 7)) !== filters.month) return false;
    if (filters.employeeId && record.employeeId !== filters.employeeId) return false;
    if (filters.departmentOrProgramme && record.departmentOrProgramme !== filters.departmentOrProgramme) return false;
    if (filters.employeeCategory && record.employeeCategory !== filters.employeeCategory) return false;
    if (filters.paymentStatus && record.paymentStatus !== filters.paymentStatus) return false;
    return true;
  });
}
