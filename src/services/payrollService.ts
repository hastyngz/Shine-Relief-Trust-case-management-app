import type {
  EmployeeRecord,
  PayrollRecord,
  SalaryHistoryRecord,
} from '../types';

export interface MonthlyPayrollEmployee {
  employeeId: string;
  employeeName: string;
  department?: string;
  positionTitle?: string;
  applicableSalary: number;
  payment?: PayrollRecord;
  paidAmount: number;
  outstandingAmount: number;
  status: 'Paid' | 'Partially Paid' | 'Outstanding';
}

export interface PayrollViewerData {
  employees: EmployeeRecord[];
  records: PayrollRecord[];
}

/** Restrict the client-side payroll view as a second boundary after Firestore rules. */
export function filterPayrollDataForViewer(
  employees: EmployeeRecord[],
  records: PayrollRecord[],
  viewerUid: string,
  canProcessPayroll: boolean,
): PayrollViewerData {
  if (canProcessPayroll) return { employees, records };
  if (!viewerUid) return { employees: [], records: [] };
  const visibleRecords = records.filter((record) => record.employeeId === viewerUid);
  const visibleEmployees = employees.filter((employee) => employee.id === viewerUid);
  // Staff cannot read the manager-only employees collection. If their own
  // payroll record is available, derive a minimal self-only summary profile.
  if (visibleEmployees.length === 0 && visibleRecords.length > 0) {
    const latestRecord = [...visibleRecords].sort((left, right) =>
      right.payPeriodStartDate.localeCompare(left.payPeriodStartDate)
      || right.updatedAt.localeCompare(left.updatedAt)
    )[0];
    visibleEmployees.push(employeeRecordFromPayrollRecord(latestRecord));
  }
  return { employees: visibleEmployees, records: visibleRecords };
}

export interface MonthlyPayrollSummary {
  employees: MonthlyPayrollEmployee[];
  expectedTotal: number;
  paidTotal: number;
  outstandingTotal: number;
  paidCount: number;
  outstandingCount: number;
}

export function employeeRecordFromPayrollRecord(record: PayrollRecord): EmployeeRecord {
  return {
    id: record.employeeId,
    fullName: record.employeeName,
    department: record.departmentOrProgramme,
    salaryMWK: record.applicableSalary,
    employmentStatus: 'Active',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  };
}

export function monthlyPayrollTaskId(period: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error(`Invalid payroll period: ${period}`);
  return `PAYROLL-${period}`;
}

export function payrollTaskStatus(summary: MonthlyPayrollSummary): 'Open' | 'In Progress' | 'Completed' {
  if (summary.employees.length > 0 && summary.outstandingCount === 0) return 'Completed';
  return summary.paidCount > 0 ? 'In Progress' : 'Open';
}

export function shouldCreateMonthlyPayrollTask(date: Date): boolean {
  return date.getDate() >= 27;
}

export function formatPayrollPeriod(period: string): string {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`Invalid payroll period: ${period}`);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid payroll month: ${period}`);
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), month - 1, 1)));
}

function applicableSalary(
  employeeId: string,
  periodEnd: string,
  salaryHistory: SalaryHistoryRecord[],
  fallback: number,
): number {
  const history = salaryHistory
    .filter((record) => record.employeeId === employeeId && record.effectiveDate <= periodEnd)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return history[0]?.salaryAmount ?? fallback;
}

export function buildMonthlyPayrollSummary(
  period: string,
  importedEmployees: EmployeeRecord[],
  salaryHistory: SalaryHistoryRecord[],
  payrollRecords: PayrollRecord[],
): MonthlyPayrollSummary {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error(`Invalid payroll period: ${period}`);
  }
  const periodEnd = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).toISOString().slice(0, 10);
  const employees = new Map<string, Omit<MonthlyPayrollEmployee, 'applicableSalary' | 'payment' | 'paidAmount' | 'outstandingAmount' | 'status'>>();
  importedEmployees.forEach((employee) => {
    if (employee.employmentStatus && employee.employmentStatus !== 'Active') return;
    employees.set(employee.id, {
      employeeId: employee.id,
      employeeName: employee.fullName,
      department: employee.department,
      positionTitle: employee.positionTitle,
    });
  });
  const rows = Array.from(employees.values()).flatMap((employee) => {
    const profile = importedEmployees.find((candidate) => candidate.id === employee.employeeId);
    const salaryFallback = profile?.latestSalaryPeriod && profile.latestSalaryPeriod > periodEnd
      ? 0
      : profile?.salaryMWK || 0;
    const applicableAmount = applicableSalary(employee.employeeId, periodEnd, salaryHistory, salaryFallback);
    if (!Number.isFinite(applicableAmount) || applicableAmount <= 0) return [];
    const payment = payrollRecords
      .filter((record) => record.employeeId === employee.employeeId
        && (record.payPeriod === period
          || record.payPeriodStartDate?.startsWith(`${period}-`)
            && !/(?:GRATUITY|LOAN|ARREARS)/i.test(record.payPeriod)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const expected = payment?.expectedAmount ?? applicableAmount;
    const paidAmount = payment?.amountPaid || 0;
    const status: MonthlyPayrollEmployee['status'] = payment?.paymentStatus === 'Paid' || (expected > 0 && paidAmount >= expected)
      ? 'Paid'
      : paidAmount > 0 ? 'Partially Paid' : 'Outstanding';
    return [{
      ...employee,
      applicableSalary: payment?.applicableSalary ?? applicableAmount,
      payment,
      paidAmount,
      outstandingAmount: Math.max(expected - paidAmount, 0),
      status,
    }];
  }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return {
    employees: rows,
    expectedTotal: rows.reduce((total, row) => total + (row.payment?.expectedAmount ?? row.applicableSalary), 0),
    paidTotal: rows.reduce((total, row) => total + row.paidAmount, 0),
    outstandingTotal: rows.reduce((total, row) => total + row.outstandingAmount, 0),
    paidCount: rows.filter((row) => row.status === 'Paid').length,
    outstandingCount: rows.filter((row) => row.status !== 'Paid').length,
  };
}

export function payrollTaskDescription(
  period: string,
  dueDate: string,
  summary: MonthlyPayrollSummary,
): string {
  const status = summary.outstandingCount === 0 ? 'Completed' : summary.paidCount > 0 ? 'In Progress' : 'Open';
  const employeeList = summary.employees.map((employee) =>
    `${employee.employeeName}: MWK ${(employee.payment?.expectedAmount ?? employee.applicableSalary).toLocaleString()} (${employee.status})`,
  ).join('\n');
  return [
    `${formatPayrollPeriod(period)} payroll needs to be processed.`,
    `Payroll period: ${period}`,
    `Employees expected to be paid: ${summary.employees.length}`,
    `Total expected payroll: MWK ${summary.expectedTotal.toLocaleString()}`,
    `Paid: ${summary.paidCount}; outstanding: ${summary.outstandingCount}`,
    `Due date: ${dueDate}`,
    `Status: ${status}`,
    'Employees:',
    employeeList || 'No active employees with a salary are currently due.',
  ].join('\n');
}
