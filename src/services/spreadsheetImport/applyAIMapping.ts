import * as XLSX from 'xlsx';
import type { SpreadsheetAIField, SpreadsheetAIMappingProposal } from './aiMapping';

const FIELD_HEADERS: Record<SpreadsheetAIField, string> = {
  itemNumber: 'Item No',
  description: 'Description',
  quantity: 'Quantity',
  unit: 'Unit',
  unitPrice: 'Unit Price',
  unitCost: 'Unit Cost',
  totalAmount: 'Total Amount',
  notes: 'Notes',
  frequency: 'Frequency',
  programme: 'Programme',
  category: 'Category',
  keyPriorityArea: 'Key Priority Area',
  outcome: 'Outcome',
  mainActivity: 'Main Activity',
  subActivity: 'Sub Activity',
  processActivity: 'Process Activities',
  indicator: 'Indicator',
  progress: 'Progress',
  employeeName: 'Employee Name',
  employeeId: 'Employee ID',
  department: 'Department',
  position: 'Position',
  salary: 'Salary',
  revenue: 'Revenue',
  expense: 'Expense',
};

/** Clone the workbook and replace only user-approved mapped header cells with canonical labels. */
export function applySpreadsheetAIMapping(
  workbook: XLSX.WorkBook,
  proposal: SpreadsheetAIMappingProposal,
): XLSX.WorkBook {
  const mapped: XLSX.WorkBook = { ...workbook, Sheets: { ...workbook.Sheets } };
  for (const sheetMapping of proposal.sheets) {
    const original = workbook.Sheets[sheetMapping.name];
    if (!original) continue;
    const sheet: XLSX.WorkSheet = { ...original };
    mapped.Sheets[sheetMapping.name] = sheet;
    sheetMapping.columns.forEach(({ sourceColumn, field }) => {
      const address = XLSX.utils.encode_cell({ r: sheetMapping.headerRow, c: sourceColumn });
      const existing = sheet[address];
      if (!existing) return;
      const canonicalHeader = FIELD_HEADERS[field];
      sheet[address] = { ...existing, t: 's', v: canonicalHeader, w: canonicalHeader };
    });
  }
  return mapped;
}
