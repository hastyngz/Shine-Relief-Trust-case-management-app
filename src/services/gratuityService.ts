import { EmployeeCategory, SalaryHistoryRecord, SalaryFrequency } from '../types';

export interface GratuityEmployee {
  id: string;
  employeeCategory: EmployeeCategory;
  contractStartDate: string;
  employmentPeriodId?: string;
}

export interface GratuitySalaryRecord {
  effectiveDate: string;
  salaryAmount: number;
  salaryFrequency: SalaryFrequency;
  employmentPeriodId?: string;
}

export interface GratuitySalaryPeriod {
  startDate: string;
  endDate: string;
  salary: number;
  months: number;
  rate: number;
  gratuity: number;
}

export interface GratuityResult {
  employmentMonths: number;
  rate: number;
  salaryPeriods: GratuitySalaryPeriod[];
  totalGratuity: number;
}

function parseDate(value: string, fieldName: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || formatDate(date) !== value) {
    throw new Error(`${fieldName} must be a valid YYYY-MM-DD date`);
  }
  return date;
}

function fullMonthsBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() - start.getUTCMonth();
  return months - (end.getUTCDate() < start.getUTCDate() ? 1 : 0);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calculateGratuity(
  employee: GratuityEmployee,
  calculationEndDate: string,
  salaryHistory: Array<GratuitySalaryRecord | SalaryHistoryRecord>
): GratuityResult {
  const start = parseDate(employee.contractStartDate, 'Contract start date');
  const end = parseDate(calculationEndDate, 'Calculation end date');
  if (end < start) throw new Error('Calculation end date cannot be before contract start date');

  const rate = employee.employeeCategory === 'Ground Worker/Gardener' ? 0.05 : 0.10;
  const validRecords = salaryHistory
    .filter((record) => !employee.employmentPeriodId || !record.employmentPeriodId || record.employmentPeriodId === employee.employmentPeriodId)
    .map((record) => ({ ...record, date: parseDate(record.effectiveDate, 'Salary effective date') }))
    .filter((record) => record.date <= end)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (validRecords.some((record) => record.salaryAmount <= 0)) {
    throw new Error('Salary amount must be greater than zero');
  }

  const periods: GratuitySalaryPeriod[] = [];
  for (let index = 0; index < validRecords.length; index += 1) {
    const record = validRecords[index];
    const periodStart = record.date < start ? start : record.date;
    const nextEffectiveDate = validRecords[index + 1]?.date;
    const periodEnd = nextEffectiveDate && nextEffectiveDate < end ? nextEffectiveDate : end;
    const months = fullMonthsBetween(periodStart, periodEnd);
    if (periodEnd > periodStart && months > 0) {
      periods.push({
        startDate: formatDate(periodStart),
        endDate: formatDate(periodEnd),
        salary: record.salaryAmount,
        months,
        rate,
        gratuity: record.salaryAmount * rate * months,
      });
    }
  }

  return {
    employmentMonths: fullMonthsBetween(start, end),
    rate,
    salaryPeriods: periods,
    totalGratuity: periods.reduce((total, period) => total + period.gratuity, 0),
  };
}