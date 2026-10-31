import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { analyzeSpreadsheetWorkbook } from '../src/services/spreadsheetImport/detector';
import { createSpreadsheetImportPreview } from '../src/services/spreadsheetImport/importers';

async function preview(rows: unknown[][], sheetName = 'Sheet1') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  const analysis = await analyzeSpreadsheetWorkbook(workbook);
  return createSpreadsheetImportPreview(workbook, analysis, 'item-list', [], 'items.xlsx');
}

async function verifyRepeatedNumberInOneSheetKeepsBothRows() {
  const result = await preview([
    ['Item No', 'Item', 'Qty', 'Unit price', 'Total'],
    [17, 'Glycerine', 3, 2000, 6000],
    [18, 'Sanitary pads', 6, 2500, 15000],
    [17, 'Tissues', 4, 1500, 6000],
    [18, 'Lock', 1, 25000, 25000],
  ]);
  const procurement: any = result.lines.find((line) => line.kind === 'procurement');
  assert.equal(procurement.items.length, 4, 'a number repeated inside one sheet must not overwrite the earlier row');
  assert.deepEqual(procurement.items.map((item: any) => item.description), ['Glycerine', 'Sanitary pads', 'Tissues', 'Lock']);
  assert.equal(procurement.items.reduce((sum: number, item: any) => sum + (item.totalMWK || 0), 0), 52000);
}

async function verifySameNumberOnDifferentSheetsStillMerges() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Item No', 'Item', 'Qty', 'Unit price'],
    [1, 'Cement', 10, ''],
  ]), 'Quote A');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Item No', 'Item', 'Qty', 'Unit price'],
    [1, 'Cement', 10, 12000],
  ]), 'Quote B');
  const analysis = await analyzeSpreadsheetWorkbook(workbook);
  const result = await createSpreadsheetImportPreview(workbook, analysis, 'item-list', [], 'quotes.xlsx');
  const procurement: any = result.lines.find((line) => line.kind === 'procurement');
  assert.equal(procurement.items.length, 1, 'the same item quoted on two sheets is still combined');
  assert.equal(procurement.items[0].unitPriceMWK, 12000, 'and the quoted price wins');
}

await verifyRepeatedNumberInOneSheetKeepsBothRows();
await verifySameNumberOnDifferentSheetsStillMerges();
console.log('duplicate item number import tests passed');
