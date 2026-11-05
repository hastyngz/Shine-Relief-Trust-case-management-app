import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { analyzeSpreadsheetWorkbook } from '../src/services/spreadsheetImport/detector';
import { createSpreadsheetImportPreview } from '../src/services/spreadsheetImport/importers';
import { spreadsheetLineToPreview } from '../src/components/Import/importWizardHelpers';
import type { ImportAuditRecord } from '../src/types';
import { buildChildHouseBudgetExpense, planChildHouseBudgetImportUndo } from '../src/utils/householdBudget';

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['CHILD HOUSE BUDGET NOVEMBER 2026'],
  [],
  ['ITEM NO', 'ITEM', 'QTY', 'FREQUENCY', 'COST/ITEM', 'TOTAL COST(MK)', 'UNIT'],
  [1, 'Cooking oil', 2, 1, 14000, 19000, 'bottle'],
  [2, 'Sugar', 4, 1, 4500, 9000, 'kg'],
  [3, 'Ufa', 2, 2, 80000, 160000, 'bag'],
  [4, 'Salt', 2, 1, 2000, 4000, 'kg'],
  [5, 'Laundry soap', 2, 1, 4750, 9500, 'bar'],
  [6, 'Beans', 2, 1, 13000, 26000, 'kg'],
  [7, 'Bonya', 2, 1, 10000, 20000, 'kg'],
  [8, 'Surf', 2, 1, 1500, 3000, 'kg'],
  [9, 'Tissues', 2, 1, 3000, 6000, 'pack'],
  [10, 'Rice', 1, 1, 10000, 10000, 'kg'],
  [11, 'Flour', 1, 1, 15000, 15000, 'kg'],
  [12, 'Maize', 1, 1, 20000, 20000, 'kg'],
  [13, 'Milk', 1, 1, 25000, 25000, 'litre'],
  [14, 'Bread', 1, 1, 15500, 15500, 'loaf'],
  [15, 'Groundnuts', 1, 1, 35000, 35000, 'kg'],
  [16, 'Meat', 1, 1, 40000, 40000, 'kg'],
  [17, 'Tea', 1, 1, 20000, 20000, 'pack'],
  [17, 'Coffee', 1, 1, 20000, 20000, 'pack'],
  [18, 'Firewood', 1, 1, 20000, 20000, 'bundle'],
  [19, 'Charcoal', 1, 1, 20000, 20000, 'bag'],
  [20, 'Cooking salt', 1, 1, 1500, 1500, 'kg'],
  [21, 'Onions', 1, 1, 1500, 1500, 'kg'],
  [22, 'Assorted veggies', 'lampsome', 1, 5000, 5000, 'kg'],
  [23, 'Tomatoes/Onions', 'lampsome', 1, 10000, 10000, 'kg'],
  ['TOTAL', '', '', '', '', 515000, ''],
], { cellDates: false }), 'Child House Budget');

const analysis = await analyzeSpreadsheetWorkbook(workbook);
assert.equal(analysis.detectedKind, 'budget-monthly');
const preview = await createSpreadsheetImportPreview(
  workbook,
  analysis,
  analysis.detectedKind,
  [],
  'CHILD_HOUSE_BUDGET-NOVE-2026.xlsx',
);
const budgetLines = preview.lines.filter((line) => line.kind === 'budget');
const unmappedLines = preview.lines.filter((line) => line.kind === 'unmapped');

assert.equal(budgetLines.length, 22);
assert.equal(unmappedLines.length, 2);
assert.ok(!preview.lines.some((line) => line.kind !== 'unmapped' && line.row === 28));
assert.ok(budgetLines.every((line) => line.programmeId === 'child-house'));
assert.ok(budgetLines.every((line) => line.period === '2026-11'));
assert.equal(budgetLines.reduce((total, line) => total + line.budgetAmount, 0), 500000);

const ufa = budgetLines.find((line) => line.itemDescription === 'Ufa');
assert.equal(ufa?.category, 'Food');
assert.equal(ufa?.budgetAmount, 160000);
assert.match(ufa?.notes || '', /price per pack\/lot/);

const tissues = budgetLines.find((line) => line.itemDescription === 'Tissues');
assert.equal(tissues?.category, 'Household supplies');
const cookingOil = budgetLines.find((line) => line.itemDescription === 'Cooking oil');
assert.equal(cookingOil?.budgetAmount, 19000); // Preserve the workbook value for review; do not silently replace it with 28000.
assert.match(cookingOil?.notes || '', /source total MWK 19000 differs from quantity × frequency × unit cost MWK 28000/);

const expenseNamedPreview = await createSpreadsheetImportPreview(
  workbook, analysis, analysis.detectedKind, [], 'CHILD_HOUSE_expense-NOVE-2026.xlsx',
);
const expenseNamedLine = expenseNamedPreview.lines.find((line) => line.kind === 'budget');
assert.match(expenseNamedLine?.notes || '', /expense workbook filename but this sheet has budget-style amounts/);
assert.match(spreadsheetLineToPreview(expenseNamedLine!).warningOrConflict || '', /Do not treat these as actual spending/);

const duplicate18Workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(duplicate18Workbook, XLSX.utils.aoa_to_sheet([
  ['CHILD HOUSE BUDGET NOVEMBER 2026'],
  [],
  ['ITEM NO', 'ITEM', 'QTY', 'FREQUENCY', 'COST/ITEM', 'TOTAL COST(MK)', 'UNIT'],
  [18, 'Firewood', 1, 1, 20000, 20000, 'bundle'],
  [18, 'Synthetic charcoal', 1, 1, 20000, 20000, 'bag'],
]), 'Child House Budget');
const duplicate18Analysis = await analyzeSpreadsheetWorkbook(duplicate18Workbook);
const duplicate18Preview = await createSpreadsheetImportPreview(
  duplicate18Workbook, duplicate18Analysis, duplicate18Analysis.detectedKind, [], 'synthetic_child_house_budget.xlsx',
);
const duplicate18Rows = duplicate18Preview.lines.filter((line) => line.kind === 'budget' && line.itemNumber === '18');
assert.equal(duplicate18Rows.length, 2);
assert.ok(duplicate18Rows.every((line) => /duplicate item number 18/i.test(line.notes)));
const duplicateItemNumberRows = budgetLines.filter((line) => line.itemDescription === 'Tea' || line.itemDescription === 'Coffee');
assert.equal(duplicateItemNumberRows.length, 2);
assert.ok(duplicateItemNumberRows.every((line) => /duplicate item number 17/i.test(line.notes)));
assert.notEqual(duplicateItemNumberRows[0].row, duplicateItemNumberRows[1].row);


const importedExpense = buildChildHouseBudgetExpense({
  householdId: 'household-synthetic',
  period: '2026-11',
  quantity: 1,
  unitCost: 100,
  budgetAmount: 100,
  itemDescription: 'Synthetic maize',
  category: 'Food',
  sourceFileName: 'synthetic-budget.xlsx',
  sheet: 'Budget',
  row: 4,
  createdBy: 'Synthetic Manager',
});
const originalAudit = {
  id: 'AUD-SYNTHETIC-1',
  fileName: 'synthetic-budget.xlsx',
  fileType: 'xlsx',
  importedAt: importedExpense.createdAt,
  importedByUid: 'synthetic-user',
  importedByName: 'Synthetic Manager',
  totalExamined: 1,
  newRecordsCount: 1,
  profileUpdatesCount: 0,
  historicalRecordsCount: 0,
  unchangedCount: 0,
  duplicatesCount: 0,
  conflictsCount: 0,
  errorsCount: 0,
  status: 'completed',
  childHouseBudgetHouseholdId: 'household-synthetic',
  childHouseBudgetImportedExpenses: [{
    id: importedExpense.id,
    createdAt: importedExpense.createdAt,
    budgetLineId: importedExpense.budgetLineId || '',
  }],
} as ImportAuditRecord;
const validUndoPlan = planChildHouseBudgetImportUndo(originalAudit, [importedExpense], [originalAudit]);
assert.equal(validUndoPlan.eligible, true);
assert.deepEqual(validUndoPlan.expenseIds, [importedExpense.id]);
const editedBudgetRow = { ...importedExpense, updatedAt: new Date(Date.parse(importedExpense.createdAt) + 1000).toISOString() };
const editedUndoPlan = planChildHouseBudgetImportUndo(originalAudit, [editedBudgetRow], [originalAudit]);
assert.equal(editedUndoPlan.eligible, false);
assert.match(editedUndoPlan.reason || '', /changed since import/);
const missingUndoPlan = planChildHouseBudgetImportUndo(originalAudit, [], [originalAudit]);
assert.equal(missingUndoPlan.eligible, false);
assert.match(missingUndoPlan.reason || '', /missing/);
const alreadyReversedAudit = {
  ...originalAudit,
  id: 'AUD-SYNTHETIC-UNDO',
  reversesImportAuditId: originalAudit.id,
} as ImportAuditRecord;
const repeatedUndoPlan = planChildHouseBudgetImportUndo(originalAudit, [importedExpense], [originalAudit, alreadyReversedAudit]);
assert.equal(repeatedUndoPlan.eligible, false);
assert.match(repeatedUndoPlan.reason || '', /already been reversed/);

console.log('Child House budget import regression tests passed.');
