import type { ImportPreviewItem } from '../../types';
import type { ImportedEmployeeLine } from './importers';

export function spreadsheetEmployeeLineToPreview(line: ImportedEmployeeLine): ImportPreviewItem {
  const id = `spreadsheet_${line.sheet}_${line.row}`;
  return {
    tempId: id,
    resultType: line.status === 'matched' ? 'CONFLICT' : 'NEW_RECORD',
    targetEntity: 'employee',
    classification: 'STAFF_PAYROLL_RECORD',
    classificationLabel: 'Staff Payroll / Salary Record',
    isDateUnknown: true,
    title: line.employeeName,
    summary: `${line.employeeName} · ${line.department || 'Department not supplied'} · ${line.salaryHistory.length} monthly salary entries · latest MWK ${line.currentSalary.toLocaleString()}`,
    originalSnippet: `${line.sheet}!row ${line.row}`,
    matchedId: line.matchedEmployeeId,
    matchedName: line.matchCandidates.find((candidate) => candidate.id === line.matchedEmployeeId)?.name,
    extractedData: { ...line, spreadsheetKind: 'payroll-grid' },
    isHistorical: !line.latestSourcePeriod,
    selected: line.status !== 'ambiguous',
    warningOrConflict: line.employmentStatus === 'Completed'
      ? `No salary was recorded in the latest workbook payment month (${line.latestWorkbookPaymentPeriod || 'not recorded'}). Last recorded salary: ${line.latestSourcePeriod || 'not recorded'}. Import as a former employee with historical payroll only.`
      : line.status === 'matched'
        ? 'Exact existing staff/employee match found. Confirm the update to preserve this employee’s salary history.'
        : line.status === 'ambiguous'
          ? 'Possible name match found. Review the candidates before adding or updating any employee.'
          : undefined,
    missingFields: [],
  };
}
