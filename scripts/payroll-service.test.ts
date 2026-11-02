import assert from 'node:assert/strict';
import type { EmployeeRecord, PayrollRecord, SalaryHistoryRecord } from '../src/types';
import { linkPayrollRecordsToStaffAccount } from '../src/utils/payrollLink';
import {
  buildMonthlyPayrollSummary,
  employeeRecordFromPayrollRecord,
  filterPayrollDataForViewer,
  formatPayrollPeriod,
  getPayrollSubmissionValidationError,
  monthlyPayrollTaskId,
  payrollTaskDescription,
  payrollTaskStatus,
  shouldCreateMonthlyPayrollTask,
} from '../src/services/payrollService';

const employees: EmployeeRecord[] = [
  { id: 'emp-1', fullName: 'Alex Example', salaryMWK: 80000, employmentStatus: 'Active', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
  { id: 'emp-former', fullName: 'Former Example', salaryMWK: 70000, employmentStatus: 'Completed', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
];
const salaryHistory: SalaryHistoryRecord[] = [
  { id: 'salary-1-old', employeeId: 'emp-1', effectiveDate: '2026-08-01', salaryAmount: 75000, salaryFrequency: 'Monthly', reasonForChange: '', recordedBy: '', recordedDate: '', auditMetadata: { createdAt: '', createdByUid: '' } },
  { id: 'salary-1-new', employeeId: 'emp-1', effectiveDate: '2026-09-01', salaryAmount: 80000, salaryFrequency: 'Monthly', reasonForChange: '', recordedBy: '', recordedDate: '', auditMetadata: { createdAt: '', createdByUid: '' } },
];
const summary = buildMonthlyPayrollSummary('2026-09', employees, salaryHistory, []);
assert.equal(summary.employees.length, 1);
assert.equal(summary.expectedTotal, 80000, 'use salary history applicable to the selected month');
assert.equal(summary.outstandingTotal, 80000);
assert.equal(summary.outstandingCount, 1);
assert.equal(payrollTaskStatus(summary), 'Open');

const paidRecord: PayrollRecord = {
  id: 'pay-1', employeeId: 'emp-1', staffUid: 'emp-1', employeeName: 'Alex Example', payPeriod: '2026-09',
  payPeriodStartDate: '2026-09-01', payPeriodEndDate: '2026-09-30', applicableSalary: 80000,
  salaryHistoryRecordIds: ['salary-1-new'], expectedAmount: 80000, amountPaid: 80000,
  paymentStatus: 'Paid', createdBy: '', createdByUid: '', createdAt: '', updatedBy: '', updatedByUid: '', updatedAt: '',
};
const otherRecord: PayrollRecord = { ...paidRecord, id: 'pay-former', employeeId: 'emp-former', staffUid: 'emp-former', employeeName: 'Former Example' };
const staffPayroll = filterPayrollDataForViewer(employees, [paidRecord, otherRecord], 'emp-1', false);
assert.deepEqual(staffPayroll.employees.map((employee) => employee.id), ['emp-1']);
assert.deepEqual(staffPayroll.records.map((record) => record.id), ['pay-1']);
const staffWithoutRoster = filterPayrollDataForViewer([], [paidRecord], 'emp-1', false);
assert.equal(staffWithoutRoster.employees.length, 1, 'staff can derive a self-only summary from their own payroll record');
assert.equal(staffWithoutRoster.employees[0].id, 'emp-1');
assert.equal(staffWithoutRoster.employees[0].salaryMWK, 80000);

// A payroll employee has a stable internal EMP-* ID; the separate staff UID
// must control self-service access without exposing another employee's record.
const linkedPayrollRecord = { ...paidRecord, id: 'pay-linked', employeeId: 'EMP-123', staffUid: 'worker-uid' } as unknown as PayrollRecord;
const linkedStaffView = filterPayrollDataForViewer([], [linkedPayrollRecord], 'worker-uid', false);
assert.deepEqual(linkedStaffView.records.map((record) => record.id), ['pay-linked']);
assert.equal(linkedStaffView.employees[0].id, 'EMP-123');
assert.equal((linkedStaffView.employees[0] as EmployeeRecord & { staffUid?: string }).staffUid, 'worker-uid');
assert.deepEqual(filterPayrollDataForViewer([], [linkedPayrollRecord], 'another-uid', false).records, []);
const conflictingPayrollLink = { ...linkedPayrollRecord, employeeId: 'worker-uid', staffUid: 'another-uid' } as unknown as PayrollRecord;
assert.deepEqual(filterPayrollDataForViewer([], [conflictingPayrollLink], 'worker-uid', false).records, [],
  'an explicit link to another staff account must override any coincidental employeeId/UID match');
const linkedEmployee = { ...employees[0], staffUid: 'worker-uid' } as EmployeeRecord;
const linkedSummary = buildMonthlyPayrollSummary('2026-09', [linkedEmployee], salaryHistory, []);
assert.equal((linkedSummary.employees[0] as typeof linkedSummary.employees[number] & { staffUid?: string }).staffUid, 'worker-uid');
assert.equal((employeeRecordFromPayrollRecord(linkedPayrollRecord) as EmployeeRecord & { staffUid?: string }).staffUid, 'worker-uid');
const linkedRecords = linkPayrollRecordsToStaffAccount([paidRecord, otherRecord], 'emp-1', 'new-staff-uid', '2026-11-02T08:00:00.000Z', 'Synthetic Manager', 'manager-uid');
assert.equal(linkedRecords.updatedCount, 1);
assert.equal(linkedRecords.records[0].staffUid, 'new-staff-uid');
assert.equal(linkedRecords.records[0].updatedByUid, 'manager-uid');
assert.equal(linkedRecords.records[1], otherRecord, 'linking one employee must not change another employee payroll');
const unlinkedRecords = linkPayrollRecordsToStaffAccount(linkedRecords.records, 'emp-1', null, '2026-11-02T08:05:00.000Z', 'Synthetic Manager', 'manager-uid');
assert.equal(unlinkedRecords.records[0].staffUid, null);
const managerPayroll = filterPayrollDataForViewer(employees, [paidRecord, otherRecord], 'manager-uid', true);
assert.equal(managerPayroll.employees.length, employees.length);
assert.equal(managerPayroll.records.length, 2);
assert.deepEqual(filterPayrollDataForViewer(employees, [paidRecord], '', false), { employees: [], records: [] });
const historicalProfile = employeeRecordFromPayrollRecord(paidRecord);
assert.equal(historicalProfile.id, 'emp-1');
assert.equal(historicalProfile.fullName, 'Alex Example');
assert.equal(historicalProfile.salaryMWK, 80000);
const paidSummary = buildMonthlyPayrollSummary('2026-09', employees, salaryHistory, [paidRecord]);
assert.equal(paidSummary.paidCount, 1);
assert.equal(paidSummary.outstandingCount, 0);
assert.equal(paidSummary.paidTotal, 80000);
assert.equal(paidSummary.outstandingTotal, 0);
const gratuityRecord: PayrollRecord = {
  ...paidRecord,
  id: 'pay-gratuity',
  payPeriod: '2026-09-GRATUITY-source-row',
  applicableSalary: 0,
  expectedAmount: 90000,
  amountPaid: 0,
  paymentStatus: 'Pending',
};
const summaryWithGratuity = buildMonthlyPayrollSummary('2026-09', employees, salaryHistory, [gratuityRecord]);
assert.equal(summaryWithGratuity.employees[0].payment, undefined, 'gratuity records do not replace monthly salary due');
const newerSalaryProfile = {
  ...employees[0],
  salaryMWK: 90000,
  latestSalaryPeriod: '2026-09',
};
assert.equal(
  buildMonthlyPayrollSummary('2026-08', [newerSalaryProfile], [], []).employees.length,
  0,
  'a newer current salary is not used to invent a historical payroll amount when history is unavailable',
);
assert.equal(payrollTaskStatus(paidSummary), 'Completed');
assert.equal(monthlyPayrollTaskId('2026-09'), 'PAYROLL-2026-09');
assert.equal(formatPayrollPeriod('2026-09'), 'September 2026');
assert.equal(shouldCreateMonthlyPayrollTask(new Date('2026-10-26T12:00:00')), false);
assert.equal(shouldCreateMonthlyPayrollTask(new Date('2026-10-27T12:00:00')), true);
assert.equal(shouldCreateMonthlyPayrollTask(new Date('2026-10-28T12:00:00')), true);
assert.match(payrollTaskDescription('2026-09', '2026-09-27', paidSummary), /Status: Completed/);

const validPayrollSubmission = {
  employeeName: 'Synthetic Employee',
  employeeId: 'synthetic-employee',
  payPeriod: '2026-09',
  payPeriodStartDate: '2026-09-01',
  payPeriodEndDate: '2026-09-30',
  applicableSalary: 80000,
  allowancesMWK: 5000,
  deductionsMWK: 0,
  expectedAmount: 85000,
  paymentAmount: 25000,
  datePaid: '2026-09-15',
  isPayment: true,
  outstandingAmount: 85000,
};
assert.equal(getPayrollSubmissionValidationError(validPayrollSubmission), null);
assert.match(getPayrollSubmissionValidationError({ ...validPayrollSubmission, payPeriod: '2026-13' }) || '', /valid YYYY-MM/);
assert.match(getPayrollSubmissionValidationError({ ...validPayrollSubmission, payPeriodEndDate: '2026-09-31' }) || '', /valid YYYY-MM/);
assert.match(getPayrollSubmissionValidationError({ ...validPayrollSubmission, payPeriodStartDate: '2026-10-01' }) || '', /in order/);
assert.match(getPayrollSubmissionValidationError({ ...validPayrollSubmission, payPeriodEndDate: '2026-10-01' }) || '', /in order/);
assert.match(getPayrollSubmissionValidationError({ ...validPayrollSubmission, datePaid: '2026-02-31' }) || '', /real payment date/);
assert.match(getPayrollSubmissionValidationError({ ...validPayrollSubmission, paymentAmount: 90000 }) || '', /outstanding balance/);
assert.match(getPayrollSubmissionValidationError({ ...validPayrollSubmission, expectedAmount: Number.NaN }) || '', /non-negative MWK/);
assert.match(getPayrollSubmissionValidationError({ ...validPayrollSubmission, paymentAmount: 0 }) || '', /positive payment amount/);
assert.equal(
  getPayrollSubmissionValidationError({ ...validPayrollSubmission, isPayment: false, paymentAmount: 0 }),
  null,
  'an unpaid payroll entry can be created without a payment date or payment amount',
);
assert.match(getPayrollSubmissionValidationError({ ...validPayrollSubmission, isPayment: false, paymentAmount: 90000 }) || '', /cannot exceed the expected amount/);

console.log('Payroll monthly summary, salary history, task status and due-date tests passed.');
