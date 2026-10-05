import assert from 'node:assert/strict';
import { BudgetItem, PayrollRecord, SalaryHistoryRecord } from '../src/types';
import {
  aggregateBudgetLines,
  calculateBudgetVariance,
  calculatePayrollExpected,
  calculatePayrollStatus,
  calculatePlannedAmount,
  filterPayrollRecords,
  FINANCIAL_MONTHS,
  outstandingExpenseSummary,
} from '../src/services/financialCalculations';
import { updateExpenseWithAudit, withExpenseCreationAudit } from '../src/services/expenseAudit';

const salary = (id: string, employeeId: string, effectiveDate: string, salaryAmount: number): SalaryHistoryRecord => ({
  id, employeeId, effectiveDate, salaryAmount, salaryFrequency: 'Monthly', reasonForChange: 'Fixture',
  recordedBy: 'test', recordedDate: '2026-01-01T00:00:00.000Z',
  auditMetadata: { createdAt: '2026-01-01T00:00:00.000Z', createdByUid: 'test' },
});

const initial = salary('salary-1', 'employee-1', '2025-01-01', 100000);
const changed = salary('salary-2', 'employee-1', '2025-07-01', 120000);
const annualPayroll = calculatePayrollExpected('employee-1', '2025-01-01', '2025-12-31', [initial, changed]);
assert.equal(annualPayroll.expectedAmount, 1320000);
assert.deepEqual(annualPayroll.salaryHistoryRecordIds, ['salary-1', 'salary-2']);
assert.equal(calculatePayrollExpected('employee-1', '2025-01-01', '2025-12-31', [initial]).expectedAmount, 1200000);
assert.equal(calculatePayrollExpected('employee-1', '2025-01-01', '2025-01-31', [
  salary('salary-january', 'employee-1', '2025-01-01', 100000),
  salary('salary-midmonth', 'employee-1', '2025-01-16', 200000),
]).expectedAmount, 151613);
assert.throws(() => calculatePayrollExpected('employee-2', '2025-01-01', '2025-01-31', [initial]));
assert.throws(() => calculatePayrollExpected('employee-1', '2025-02-01', '2025-01-31', [initial]));
assert.equal(calculatePayrollStatus(100000, 0), 'Unpaid');
assert.equal(calculatePayrollStatus(100000, 50000), 'Partially Paid');
assert.equal(calculatePayrollStatus(100000, 100000), 'Paid');
assert.equal(calculatePayrollStatus(100000, 120000), 'Paid');

const line = (id: string, month: number, category: string, programme: string, qty: number, unitCost: number, daysFrequency?: number) => ({
  id, period: `2026-${String(month).padStart(2, '0')}`, periodType: 'monthly' as const,
  financialYear: '2026', month, programme, category, itemDescription: id, unit: 'unit',
  quantity: qty, unitCost, daysFrequency, budgetAmount: calculatePlannedAmount({ quantity: qty, unitCost, daysFrequency }),
  createdAt: '2026-01-01T00:00:00.000Z',
} as BudgetItem);
const budgets = [line('b1', 1, 'Rent', 'Homes', 2, 1000), line('b2', 1, 'Food', 'Homes', 3, 500, 2), line('b3', 2, 'Education', 'School', 4, 200)];
const totals = aggregateBudgetLines(budgets);
assert.equal(totals.annual, 5800);
assert.equal(totals.monthly[1], 5000);
assert.equal(totals.monthly[2], 800);
assert.equal(totals.category.Rent, 2000);
assert.equal(totals.programme.Homes, 5000);
assert.deepEqual(FINANCIAL_MONTHS.slice(0, 3), ['January', 'February', 'March']);
assert.equal(calculateBudgetVariance(100, 0).status, 'Within budget');
assert.deepEqual(outstandingExpenseSummary([
  { id: 'legacy-paid', householdId: 'house-1', date: '2026-01-01', category: 'Food', itemDescription: 'Legacy', quantity: '1', unitCost: 500, totalCost: 500, createdAt: '2026-01-01' },
  { id: 'due-1', householdId: 'house-1', date: '2026-01-02', category: 'Food', itemDescription: 'Flour', quantity: '2', unitCost: 800, totalCost: 1600, paymentStatus: 'Payment Outstanding', amountDue: 1000, createdAt: '2026-01-02' },
  { id: 'paid-2', householdId: 'house-1', date: '2026-01-03', category: 'Food', itemDescription: 'Oil', quantity: '1', unitCost: 300, totalCost: 300, paymentStatus: 'Paid', createdAt: '2026-01-03' },
]), { count: 1, amount: 1000 });
const unpaidExpense = withExpenseCreationAudit({
  id: 'one-expense',
  householdId: 'house-1',
  date: '2026-09-20',
  category: 'Other',
  itemDescription: 'School supplies',
  quantity: '4',
  unitCost: 1000,
  totalCost: 4000,
  supplier: 'Stationery supplier',
  paymentStatus: 'Payment Outstanding',
  amountDue: 4000,
  createdAt: '2026-09-20T00:00:00.000Z',
}, 'Staff One', '2026-09-20T00:00:00.000Z');
const paidExpense = updateExpenseWithAudit(unpaidExpense, {
  paymentStatus: 'Paid',
  datePaid: '2026-10-01',
  paymentMethod: 'Bank transfer',
  paymentReference: 'TX-123',
}, 'Manager One', '2026-10-01T10:00:00.000Z');
assert.equal(paidExpense.id, unpaidExpense.id, 'payment updates the existing expense rather than creating a duplicate');
assert.equal(paidExpense.date, unpaidExpense.date, 'payment retains the original expense date');
assert.equal(paidExpense.supplier, unpaidExpense.supplier, 'payment retains supplier details');
assert.equal(paidExpense.paymentStatus, 'Paid');
assert.equal(paidExpense.auditTrail?.length, 2);
assert.deepEqual(
  ((paidExpense.auditTrail || [])[1]),
  {
    action: 'payment-status-changed',
    by: 'Manager One',
    at: '2026-10-01T10:00:00.000Z',
    previousStatus: 'Payment Outstanding',
    newStatus: 'Paid',
    changes: [
      { field: 'datePaid', after: '2026-10-01' },
      { field: 'paymentMethod', after: 'Bank transfer' },
      { field: 'paymentReference', after: 'TX-123' },
    ],
  },
);
assert.equal(calculateBudgetVariance(100, 100).status, 'Approaching budget');
assert.equal(calculateBudgetVariance(100, 50).remaining, 50);
assert.equal(calculateBudgetVariance(100, 120).variancePercent, 20);
assert.equal(calculateBudgetVariance(0, 0).variancePercent, null);
assert.equal(calculateBudgetVariance(0, 100).status, 'Unbudgeted expenditure');
assert.equal(Number.isFinite(calculateBudgetVariance(0, 0).remaining), true);

const payrollRecords = [
  { id: 'p1', employeeId: 'employee-1', employeeName: 'Example One', payPeriod: '2025-01', payPeriodStartDate: '2025-01-01', payPeriodEndDate: '2025-01-31', applicableSalary: 100000, salaryHistoryRecordIds: ['salary-1'], expectedAmount: 100000, amountPaid: 50000, paymentStatus: 'Partially Paid', createdBy: 'test', createdByUid: 'test', createdAt: '', updatedBy: 'test', updatedByUid: 'test', updatedAt: '' },
  { id: 'p2', employeeId: 'employee-2', employeeName: 'Example Two', payPeriod: '2025-02', payPeriodStartDate: '2025-02-01', payPeriodEndDate: '2025-02-28', applicableSalary: 90000, salaryHistoryRecordIds: ['salary-3'], expectedAmount: 90000, amountPaid: 0, paymentStatus: 'Unpaid', createdBy: 'test', createdByUid: 'test', createdAt: '', updatedBy: 'test', updatedByUid: 'test', updatedAt: '' },
] satisfies PayrollRecord[];
assert.equal(filterPayrollRecords(payrollRecords, { financialYear: '2025', month: 2, paymentStatus: 'Unpaid' }).length, 1);
assert.equal(filterPayrollRecords(payrollRecords, { employeeId: 'employee-1' }).length, 1);

console.log('Phase 3B payroll and budget calculation tests passed.');
