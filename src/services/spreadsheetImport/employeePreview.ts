import type { ImportPreviewItem } from '../../types';
import type { ImportedEmployeeLine } from './importers';

export function spreadsheetEmployeeLineToPreview(line: ImportedEmployeeLine): ImportPreviewItem {
  const id = `spreadsheet_${line.sheet}_${line.row}`;
  const gratuityTotal = line.otherPayrollAmounts
    .filter((amount) => amount.type === 'gratuity')
    .reduce((total, amount) => total + amount.amount, 0);
  const summary = line.salaryHistory.length
    ? `${line.employeeName} · ${line.department || 'Department not supplied'} · ${line.salaryHistory.length} monthly salary entries · latest MWK ${line.currentSalary.toLocaleString()}`
    : `${line.employeeName} · ${line.department || 'Department not supplied'} · ${line.otherPayrollAmounts.length} historical item${line.otherPayrollAmounts.length === 1 ? '' : 's'} · gratuity MWK ${gratuityTotal.toLocaleString()}`;
  return {
    tempId: id,
    resultType: line.status === 'matched' ? 'CONFLICT' : 'NEW_RECORD',
    targetEntity: 'employee',
    classification: 'STAFF_PAYROLL_RECORD',
    classificationLabel: 'Staff Payroll / Salary Record',
    isDateUnknown: true,
    title: line.employeeName,
    summary,
    originalSnippet: `${line.sheet}!row ${line.row}`,
    matchedId: line.matchedEmployeeId,
    matchedName: line.matchCandidates.find((candidate) => candidate.id === line.matchedEmployeeId)?.name,
    extractedData: { ...line, spreadsheetKind: 'payroll-grid' },
    isHistorical: !line.latestSourcePeriod,
    selected: line.status !== 'ambiguous',
    warningOrConflict: line.employmentStatus === 'Completed'
      ? `No salary was recorded in the latest workbook payment month (${line.latestWorkbookPaymentPeriod || 'not recorded'}). Last recorded salary: ${line.latestSourcePeriod || 'not recorded'}. Import as a former employee with historical payroll only.`
      : line.status === 'matched'
        ? line.salaryHistory.length
          ? 'Exact existing staff/employee match found. Confirm the update to preserve this employee’s salary history.'
          : 'Exact existing staff/employee match found. Confirm adding the gratuity amount to this employee’s historical payroll records.'
        : line.status === 'ambiguous'
          ? 'Possible name match found. Review the candidates before adding or updating any employee.'
          : undefined,
    missingFields: [],
  };
}
