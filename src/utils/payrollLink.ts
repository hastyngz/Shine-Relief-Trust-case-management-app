import type { PayrollRecord } from '../types';

/** Relink only one employee's payroll rows; preserve all unrelated records. */
export function linkPayrollRecordsToStaffAccount(
  records: PayrollRecord[],
  employeeId: string,
  staffUid: string | null,
  updatedAt: string,
  updatedBy: string,
  updatedByUid: string,
): { records: PayrollRecord[]; updatedCount: number } {
  let updatedCount = 0;
  const linkedRecords = records.map((record) => {
    if (record.employeeId !== employeeId || record.staffUid === staffUid) return record;
    updatedCount += 1;
    return { ...record, staffUid, updatedAt, updatedBy, updatedByUid };
  });
  return { records: linkedRecords, updatedCount };
}
