import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { analyzeSpreadsheetWorkbook, detectSpreadsheetKind } from '../src/services/spreadsheetImport/detector';
import { createSpreadsheetImportPreview } from '../src/services/spreadsheetImport/importers';
import { matchNameCandidates } from '../src/services/spreadsheetImport/nameMatcher';
import { extractEarlyYearsMetrics } from '../src/services/docxParserService';

function workbook(rows: Array<Array<string | number>>): XLSX.WorkBook {
  const result = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(result, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return result;
}

const detectorFixtures: Array<{ kind: string; rows: Array<Array<string | number>> }> = [
  {
    kind: 'workplan-matrix',
    rows: [[
      'Key Priority Area', 'Outcome', 'Main Activity', 'Sub Activity', 'Process Activities',
      'Cost', 'January', 'February', 'Indicator', 'Progress',
    ], ['EARLY YEARS', 'Learning', 'Classes', 'Reading', 'Story sessions', 100, 1, 1, 'sessions held', '2']],
  },
  {
    kind: 'payroll-grid',
    rows: [['Staff Name', 'Salary', 'January', 'SEPTMBER', 'JULY ', 'LOAN', 'Arrears'], ['Synthetic Staff', 1000, 1000, 1000, 1000, 50, 40]],
  },
  {
    kind: 'profit-loss',
    rows: [['Revenue', 'Cost', 'Net Profit'], ['Sales', 1000, 500]],
  },
  {
    kind: 'back-to-school',
    rows: [['Back to school', 'Learner', 'School uniform', 'Quantity'], ['Synthetic Learner', 'Uniform', 1, 1]],
  },
  {
    kind: 'budget-monthly',
    rows: [['Item description', 'QTY', 'COST', 'January', 'February'], ['Meals', 10, 100, 500, 500]],
  },
  {
    kind: 'item-list',
    rows: [['Item description', 'Quantity', 'Unit price'], ['Pipe', 2, 100]],
  },
  {
    kind: 'unknown',
    rows: [['Notes'], ['Synthetic note']],
  },
];

for (const fixture of detectorFixtures) {
  assert.equal(detectSpreadsheetKind(workbook(fixture.rows)), fixture.kind);
}

const formulaWorkbook = workbook([['Amount'], [10]]);
const formulaSheet = formulaWorkbook.Sheets.Sheet1;
formulaSheet.A2 = { t: 'n', f: '5+5', v: 9, z: '#,##0' };
const formulaCell = analyzeSpreadsheetWorkbook(formulaWorkbook).sheets[0].cells.find((cell) => cell.address === 'A2');
assert.equal(formulaCell?.formula, '5+5');
assert.equal(formulaCell?.cachedValue, 9);
assert.equal(formulaCell?.numberFormat, '#,##0');

const budgetWorkbook = workbook([
  ['Programme', 'Category', 'Item Description', 'QTY', 'COST', 'September 2026', 'October 2026'],
  ['Early Years', 'Food', 'Maize 3000kg', 3, 100, 400, 300],
  ['Early Years', 'Food', 'Beans', 2, 50, 0, 100],
]);
const budgetAnalysis = analyzeSpreadsheetWorkbook(budgetWorkbook);
const budgetPreview = createSpreadsheetImportPreview(budgetWorkbook, budgetAnalysis, 'budget-monthly');
const budgetLines = budgetPreview.lines.filter((line) => line.kind === 'budget');
assert.equal(budgetLines.length, 3);
assert.equal(budgetLines[0].budgetAmount, 300);
assert.match(budgetLines[0].notes, /source month amount 400 differs from recomputed/);
assert.equal(budgetLines[0].programmeId, 'early-years');
assert.equal(budgetLines[0].unit, 'kg');
assert.equal(budgetLines[0].itemDescription, 'Maize');

const listWorkbook = workbook([
  ['Item No', 'Description', 'Quantity', 'Unit', 'Unit Price', 'Notes'],
  ['1', 'Pipe fittings', 4, 'pieces', '', 'Price not clearly written'],
]);
const listPreview = createSpreadsheetImportPreview(listWorkbook, analyzeSpreadsheetWorkbook(listWorkbook), 'item-list');
const listLine = listPreview.lines.find((line) => line.kind === 'procurement');
assert.equal(listLine?.items[0].priceStatus, 'unclear');

const projectionWorkbook = workbook([
  ['Fish & Chicken P&L 2026'],
  ['Description', 'Amount MWK'],
  ['Sales revenue', 900],
  ['Chicks', ''],
  ['Incubator', ''],
]);
const projectionPreview = createSpreadsheetImportPreview(projectionWorkbook, analyzeSpreadsheetWorkbook(projectionWorkbook), 'profit-loss');
const projection = projectionPreview.lines.find((line) => line.kind === 'projection');
assert.equal(projection?.costLines.filter((line) => line.status === 'unpriced').length, 2);
assert.equal(projection?.netProfitMWK, undefined);

const mismatchWorkbook = workbook([['Value', 'Total'], [10, 99]]);
const mismatchSheet = mismatchWorkbook.Sheets.Sheet1;
mismatchSheet.B2 = { t: 'n', f: 'A2*2', v: 99 };
const mismatchPreview = createSpreadsheetImportPreview(
  mismatchWorkbook,
  analyzeSpreadsheetWorkbook(mismatchWorkbook),
  'unknown',
);
assert.equal(mismatchPreview.formulaDisagreements.length, 1);

const payrollWorkbook = workbook([
  ['Staff Name', 'Salary', 'January', 'SEPTMBER', 'JULY ', 'LOAN', 'Arrears'],
  ['Synthetic Staff', 1000, 1000, 1000, 1000, 50, 40],
]);
const payrollPreview = createSpreadsheetImportPreview(
  payrollWorkbook,
  analyzeSpreadsheetWorkbook(payrollWorkbook),
  'payroll-grid',
);
const payrollLines = payrollPreview.lines.filter((line) => line.kind === 'payroll');
assert.equal(payrollLines.length, 5);
assert.ok(payrollLines.some((line) => line.kind === 'payroll' && line.payPeriod.endsWith('-09')));
assert.ok(payrollLines.some((line) => line.kind === 'payroll' && line.specialType === 'loan'));
assert.ok(payrollLines.every((line) => line.kind !== 'payroll' || line.status !== 'matched'));

const aliasMatch = matchNameCandidates('Magret Synthetic', [{ id: 'staff-1', name: 'Margaret Synthetic' }]);
assert.equal(aliasMatch.exact.length, 0);
assert.equal(aliasMatch.possible.length, 1);

const cycleMetrics = extractEarlyYearsMetrics(
  'Early Years: 84 learners enrolled, 5 continuing, 10 graduated; target enrolment 100. Teachers: 4; caregivers: 2; ratio target 1:25. Classes start 21 September 2026; feeding programme start 28 September 2026.',
);
assert.equal(cycleMetrics.enrolled, 84);
assert.equal(cycleMetrics.continuing, 5);
assert.equal(cycleMetrics.graduates, 10);
assert.equal(cycleMetrics.teacherCount, 4);
assert.equal(cycleMetrics.caregiverCount, 2);
assert.equal(cycleMetrics.classesStartDate, '21 September 2026');
assert.equal(cycleMetrics.feedingProgrammeStartDate, '28 September 2026');

console.log('Spreadsheet detection, formula preservation and budget/list/projection preview tests passed.');
