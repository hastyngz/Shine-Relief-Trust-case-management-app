import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { analyzeSpreadsheetWorkbook, detectSpreadsheetKind } from '../src/services/spreadsheetImport/detector';
import { createSpreadsheetImportPreview, isValidPayrollEmployeeName } from '../src/services/spreadsheetImport/importers';
import { matchNameCandidates } from '../src/services/spreadsheetImport/nameMatcher';
import { extractEarlyYearsMetrics } from '../src/services/docxParserService';

function workbook(rows: Array<Array<string | number>>, sheetName = 'Sheet1'): XLSX.WorkBook {
  const result = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(result, XLSX.utils.aoa_to_sheet(rows), sheetName);
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
const payrollEmployees = payrollPreview.lines.filter((line) => line.kind === 'employee');
assert.equal(payrollLines.length, 0);
assert.equal(payrollEmployees.length, 1);
assert.equal(payrollEmployees[0].salaryHistory.length, 3);
assert.ok(payrollEmployees[0].otherPayrollAmounts.some((line) => line.type === 'loan'));
assert.ok(payrollEmployees[0].otherPayrollAmounts.some((line) => line.type === 'arrears'));

assert.equal(isValidPayrollEmployeeName('PAYMENTS'), false);
assert.equal(isValidPayrollEmployeeName('TOTAL SALARY'), false);
assert.equal(isValidPayrollEmployeeName('123456'), false);
assert.equal(isValidPayrollEmployeeName('Jane Synthetic'), true);
const payrollWithSummaryRows = workbook([
  ['', 'Employee Name', 'January 2026', 'February 2026'],
  ['', 'PAYMENTS', 1244000, 1244000],
  ['', '', 1244000, 1244000],
  ['', '12345', 10000, 10000],
  ['', 'SUMMARY - STAFF', 1244000, 1244000],
  ['', 'Jane Synthetic', 50000, 55000],
], 'PAYMENTS');
const summaryRowsPreview = createSpreadsheetImportPreview(
  payrollWithSummaryRows,
  analyzeSpreadsheetWorkbook(payrollWithSummaryRows),
  'payroll-grid',
);
assert.deepEqual(
  summaryRowsPreview.lines.filter((line) => line.kind === 'employee').map((line) => line.employeeName),
  ['Jane Synthetic'],
  'totals, blank names, numeric names, and summary labels do not become employee records',
);
assert.equal(
  summaryRowsPreview.lines.filter((line) => line.kind === 'unmapped').length,
  0,
  'summary and nameless payroll rows are dropped before preview rather than sent to unclassified review',
);

const matrixPayrollWorkbook = workbook([
  ['Employees, salary 2026'],
  ['', '', '', 'SEPTMBER 2026'],
  ['', 'FARM', '', ''],
  ['', '', 'Synthetic Farm Employee', 150000],
  ['', 'BANK CREDIT', '', 150000],
  ['', 'MILL', '', ''],
  ['', '', 'Synthetic Mill Employee', 125000],
], 'Employees salary 2026');
assert.equal(detectSpreadsheetKind(matrixPayrollWorkbook), 'payroll-grid');
const matrixPayrollPreview = createSpreadsheetImportPreview(
  matrixPayrollWorkbook,
  analyzeSpreadsheetWorkbook(matrixPayrollWorkbook),
  'payroll-grid',
);
const matrixPayrollLines = matrixPayrollPreview.lines.filter((line) => line.kind === 'employee');
assert.equal(matrixPayrollLines.length, 2);
assert.deepEqual(matrixPayrollLines.map((line) => [line.employeeName, line.department, line.currentSalary]), [
  ['Synthetic Farm Employee', 'FARM', 150000],
  ['Synthetic Mill Employee', 'MILL', 125000],
]);

const repeatedEmployeePayrollWorkbook = workbook([
  ['Payroll 2026'],
  ['', '', '', 'August 2026', 'September 2026'],
  ['', 'TEACHERS'],
  ['', '', 'Synthetic Employee', 115000, 120000],
  ['', 'GRADUITY'],
  ['', '', 'Synthetic Employee', 0, 50000],
], 'Payroll 2026');
const repeatedEmployeePreview = createSpreadsheetImportPreview(
  repeatedEmployeePayrollWorkbook,
  analyzeSpreadsheetWorkbook(repeatedEmployeePayrollWorkbook),
  'payroll-grid',
  [],
  [],
  'Payroll 2026.xlsx',
);
const repeatedEmployee = repeatedEmployeePreview.lines.find((line) => line.kind === 'employee');
assert.equal(repeatedEmployeePreview.lines.filter((line) => line.kind === 'employee').length, 1);
assert.equal(repeatedEmployee?.salaryHistory.length, 2);
assert.ok(repeatedEmployee?.otherPayrollAmounts.some((amount) =>
  amount.type === 'gratuity' && amount.amount === 50000 && amount.payPeriod === '2026-09'));

for (const fileName of [
  'scripts/fixtures/only sep employees salary 2026.xlsx',
  'scripts/fixtures/SHINE RELEIF SLARY TEMPLATE JUNE 2026-1.xlsx',
  'scripts/fixtures/SEPTEMBER SHINE RELEIF SLARY TEMPLATE JUNE 2026-1.xlsx',
]) {
  const fixtureWorkbook = XLSX.read(fs.readFileSync(fileName), { cellFormula: true });
  const fixtureAnalysis = analyzeSpreadsheetWorkbook(fixtureWorkbook);
  assert.equal(fixtureAnalysis.detectedKind, 'payroll-grid', `${fileName} should be detected as payroll`);
  const fixturePreview = createSpreadsheetImportPreview(
    fixtureWorkbook, fixtureAnalysis, fixtureAnalysis.detectedKind, [], [], fileName,
  );
  const detectedEmployees = fixturePreview.lines.filter((line) => line.kind === 'employee');
  assert.ok(detectedEmployees.length > 0, `${fileName} should produce employee preview rows`);
  assert.ok(detectedEmployees.some((employee) => employee.department), 'staff group should carry to employee rows');
  assert.ok(detectedEmployees.some((employee) => employee.salaryHistory.length > 1), 'month-by-month salary history should be captured');
  assert.ok(detectedEmployees.every((employee) => employee.salaryHistory.every((entry) => entry.amount > 0)), 'blank/zero cells must not become salary entries');
  assert.equal(
    fixturePreview.lines.some((line) => line.kind === 'unmapped' && /payroll amount has no employee name/i.test(line.reason)),
    false,
    'amount-only payroll rows are dropped rather than staged as unmapped review rows',
  );
  assert.equal(fixturePreview.lines.filter((line) => line.kind === 'employee').some((employee) =>
    /^(?:farm|mill|house mums|driver|watchmen|admistration|bank credit|total|grand total|subtotal)$/i.test(employee.employeeName)), false);
  assert.equal(fixturePreview.lines.some((line) => line.kind !== 'unmapped' && line.sheet === 'Sheet2'), false, 'unrelated Sheet2 must not generate employee or payroll rows');
  const varyingSalaryEmployee = detectedEmployees.find((employee) =>
    new Set(employee.salaryHistory.map((entry) => entry.amount)).size > 1);
  assert.ok(varyingSalaryEmployee, 'monthly salary changes should remain visible in salary history');
  assert.equal(varyingSalaryEmployee.currentSalary, varyingSalaryEmployee.salaryHistory.at(-1)?.amount);
  if (fileName.includes('SHINE RELEIF')) {
    const formerEmployee = detectedEmployees.find((employee) => employee.employeeName === 'Moses Yohane');
    assert.equal(formerEmployee?.employmentStatus, 'Completed', 'a former employee without the latest salary month should be kept for history only');
    assert.ok(formerEmployee?.salaryHistory.length, 'former employees retain earlier monthly salary history');
    const gratuityRecipient = detectedEmployees.find((employee) => employee.otherPayrollAmounts.some((item) => item.type === 'gratuity'));
    assert.ok(gratuityRecipient, 'gratuity section rows remain linked to their named employees');
    assert.ok(gratuityRecipient?.otherPayrollAmounts.some((item) => item.payPeriod), 'monthly gratuity periods remain distinguishable');
  }
}

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
