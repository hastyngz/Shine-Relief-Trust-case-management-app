import assert from 'node:assert/strict';
import {
  applyMappingToGrids,
  buildSpreadsheetSample,
  normalizeSample,
  parseAmount,
  parseMappingResponse,
  parseQuantity,
  redactCellText,
} from '../src/services/spreadsheetImport/aiMapping';

const FILE = 'CHILD HOUSE BUDGET-NOVE-2026-1.xlsx';
const header = ['ITEM NO', 'ITEM', 'QTY', 'FREQUENCY', 'COST/ITEM', 'TOTAL COST(MK)'];
const body: unknown[][] = [
  [1, 'Ufa', '50kgs', 2, 80000, 160000],
  [2, 'Rice', '4kgs', 1, 3000, 12000],
  [3, 'cooking oil', '2litres', 1, 14000, 19000],
  [4, 'Sugar', '4kgs', 1, 4500, 9000],
  [5, 'Salt', '2kgs', 1, 4000, 4000],
  [6, 'Laundry soap', '10 bars', 1, 9500, 9500],
  [7, 'Soya pieces', '1 bale', 1, 48000, 48000],
  [8, 'Eggs', '1tray ', 1, 15000, 15000],
  [9, 'Beans', '5ltrs', 1, 26000, 26000],
  [10, 'Bonya', '5ltrs', 1, 20000, 20000],
  [11, 'Assorted vegetables', 'lampsome', 1, 5000, 5000],
  [12, 'Tomatoes/Onions', 'lampsome', 1, 10000, 10000],
  [13, 'Surf', '2kgs', 1, 3000, 3000],
  [14, 'Bathing soap', '3bars', 1, 2500, 7500],
  [15, 'Toothpaste', '1tube', 1, 6500, 6500],
  [16, 'Body Lotion', '3bottles', 1, 4500, 13500],
  [17, 'Glycerine', '3bottles', 1, 2000, 6000],
  [18, 'Sanitary pads', '6pads', 1, 2500, 15000],
  [17, 'Tissues', '4 rolls', 1, 6000, 6000],
  [18, 'LOCK', 1, 1, 25000, 25000],
  [19, 'electricity', 1, 1, 20000, 20000],
  [20, 'water', 1, 1, 20000, 20000],
  [21, 'charcoal', '1bag', 1, 25000, 25000],
  [22, 'Transport', 1, 1, 30000, 30000],
  ['', 'TOTAL', '', '', '', 515000],
];
const grids = [{ name: 'Sheet1', grid: [[], [], header, ...body] }];

const goodReply = JSON.stringify({
  sheets: [{
    name: 'Sheet1', role: 'budget-table', headerRow: 3,
    columns: { itemNo: 0, item: 1, quantity: 2, frequency: 3, unitCost: 4, total: 5 },
  }],
  programmeId: 'child-house',
  period: '2026-11',
  confidence: 'high',
  explanation: 'Monthly Child House budget with item, quantity, frequency, cost and total columns.',
});

const sample = buildSpreadsheetSample(FILE, grids);

function verifySample() {
  assert.equal(sample.sheets.length, 1);
  assert.equal(sample.sheets[0].rows[0].row, 3, 'rows keep their true worksheet number even when rows above are blank');
  assert.equal(sample.sheets[0].totalColumns, 6);
  assert.ok(sample.sheets[0].rows.length <= 25);
  assert.ok(normalizeSample(JSON.parse(JSON.stringify(sample))), 'a sample survives the round trip to the server');
  assert.equal(normalizeSample({ fileName: 'x', sheets: [] }), null);
  assert.equal(normalizeSample({ fileName: 'x', sheets: [{ name: 's', totalRows: 1, totalColumns: 1, rows: [{ row: 1, cells: [5] }] }] }), null, 'non-text cells are rejected');
  assert.equal(redactCellText('call +265 999 123 456 or a.b@example.org'), 'call [number] or [email]');
  assert.equal(redactCellText('MWK 515,000'), 'MWK 515,000', 'ordinary amounts are not redacted');
}

function verifyHappyPath() {
  const parsed = parseMappingResponse(`Here you go:\n\`\`\`json\n${goodReply}\n\`\`\``, sample);
  assert.ok(parsed.ok && parsed.mapping, parsed.reason);
  const mapping = parsed.mapping!;
  assert.equal(mapping.programmeId, 'child-house');
  assert.equal(mapping.period, '2026-11');
  assert.deepEqual(mapping.warnings, []);

  const result = applyMappingToGrids(grids, mapping, { fallbackYear: 2026 });
  const budget = result.lines.filter((line) => line.kind === 'budget');
  assert.equal(budget.length, 24, 'all 24 item rows are read, including both rows numbered 17 and 18');
  assert.equal(result.parsedTotal, 515000);
  assert.equal(result.statedTotal, 515000);
  assert.ok(!result.warnings.some((warning) => /add up to/.test(warning)), 'rows match the sheet total');
  assert.ok(result.warnings.some((warning) => /Item number 17 is used more than once/.test(warning)), 'duplicate numbering is flagged, not silently merged');

  const ufa: any = budget[0];
  assert.equal(ufa.itemDescription, 'Ufa');
  assert.equal(ufa.quantity, 50);
  assert.equal(ufa.unit, 'kg');
  assert.equal(ufa.unitCost, 80000);
  assert.equal(ufa.budgetAmount, 160000, 'the sheet total is kept: 80,000 × frequency 2');
  assert.equal(ufa.frequency, 2);
  assert.equal(ufa.period, '2026-11');
  assert.equal(ufa.periodType, 'monthly');
  assert.equal(ufa.programmeId, 'child-house');
  assert.equal(ufa.category, 'Food');

  const byName = (name: string): any => budget.find((line: any) => line.itemDescription === name);
  assert.equal(byName('Bathing soap').quantity, 3);
  assert.equal(byName('Bathing soap').unit, 'bars');
  assert.equal(byName('Assorted vegetables').unit, 'lump sum');
  assert.equal(byName('electricity').category, 'Utilities');
  assert.equal(byName('charcoal').category, 'Utilities');
  assert.equal(byName('Transport').category, 'Transport');
  assert.equal(byName('Sanitary pads').category, 'Household supplies');
  assert.equal(byName('LOCK').category, 'Repairs/maintenance');
  // "3bottles × 4,500 = 13,500" and "6pads × 2,500 = 15,000" are quantity × cost lines and must not warn.
  assert.ok(!result.warnings.some((warning) => /Body Lotion|Sanitary pads/.test(warning)));
  // "cooking oil 2 litres, 14,000 each, total 19,000" matches neither calculation, so it must be flagged.
  assert.ok(result.warnings.some((warning) => /cooking oil/.test(warning)), 'the cooking oil total that does not match cost is flagged');
}

function verifyBadReplies() {
  assert.equal(parseMappingResponse('I cannot help with that', sample).ok, false);
  assert.equal(parseMappingResponse('{"sheets":[]}', sample).ok, false);

  const invented = JSON.parse(goodReply);
  invented.sheets[0].columns.total = 12;
  const outOfRange = parseMappingResponse(JSON.stringify(invented), sample);
  assert.equal(outOfRange.ok, false, 'a column that does not exist is rejected');

  const duplicated = JSON.parse(goodReply);
  duplicated.sheets[0].columns.unitCost = 1;
  assert.equal(parseMappingResponse(JSON.stringify(duplicated), sample).ok, false, 'one column cannot serve two fields');

  const wrongSheet = JSON.parse(goodReply);
  wrongSheet.sheets[0].name = 'Other';
  assert.equal(parseMappingResponse(JSON.stringify(wrongSheet), sample).ok, false, 'sheet names must exist in the sample');

  const wrongHeader = JSON.parse(goodReply);
  wrongHeader.sheets[0].headerRow = 99;
  assert.equal(parseMappingResponse(JSON.stringify(wrongHeader), sample).ok, false);

  const unsupported = JSON.parse(goodReply);
  unsupported.programmeId = 'tomato-farming';
  unsupported.period = '2026-03';
  const checked = parseMappingResponse(JSON.stringify(unsupported), sample);
  assert.ok(checked.ok);
  assert.equal(checked.mapping!.programmeId, undefined, 'a programme that is not named in the file is dropped');
  assert.equal(checked.mapping!.period, undefined, 'a month that is not named in the file is dropped');
  assert.equal(checked.mapping!.warnings.length, 2);

  const madeUp = JSON.parse(goodReply);
  madeUp.programmeId = 'not-a-programme';
  assert.equal(parseMappingResponse(JSON.stringify(madeUp), sample).mapping!.programmeId, undefined);
}

function verifyNoAmountsFromAI() {
  // Even if the AI smuggles amounts into its reply, they are ignored: figures come only from the workbook.
  const reply = JSON.parse(goodReply);
  reply.rows = [{ item: 'Ufa', total: 1 }];
  reply.sheets[0].total = 1;
  const parsed = parseMappingResponse(JSON.stringify(reply), sample);
  const result = applyMappingToGrids(grids, parsed.mapping!, { fallbackYear: 2026 });
  assert.equal(result.parsedTotal, 515000);
}

function verifyHelpers() {
  assert.equal(parseAmount('MWK 1,250.50'), 1250.5);
  assert.equal(parseAmount('12 000'), undefined, 'ambiguous spaced numbers are not guessed');
  assert.equal(parseAmount(''), undefined);
  assert.deepEqual(parseQuantity('50kgs'), { quantity: 50, unit: 'kg' });
  assert.deepEqual(parseQuantity('1tray '), { quantity: 1, unit: 'tray' });
  assert.deepEqual(parseQuantity('2litres'), { quantity: 2, unit: 'litres' });
  assert.deepEqual(parseQuantity('lampsome'), { quantity: 1, unit: 'lump sum' });
  assert.deepEqual(parseQuantity(7), { quantity: 7 });
  assert.equal(parseQuantity('a few').quantity, 1);
  assert.ok(parseQuantity('a few').note);
}

function verifyOptionalColumns() {
  // A different layout: no item numbers, no frequency, no total column. The amount is calculated.
  const other = [{ name: 'Nov', grid: [['Description', 'Qty', 'Price'], ['Maize flour', '2 bags', 30000], ['Soap', 10, 1500]] }];
  const mapping = parseMappingResponse(JSON.stringify({
    sheets: [{ name: 'Nov', role: 'budget-table', headerRow: 1, columns: { item: 0, quantity: 1, unitCost: 2 } }],
    confidence: 'medium', explanation: 'x',
  }), buildSpreadsheetSample('nov.xlsx', other));
  assert.ok(mapping.ok, mapping.reason);
  const result = applyMappingToGrids(other, mapping.mapping!, { fallbackYear: 2026 });
  const lines: any[] = result.lines.filter((line) => line.kind === 'budget');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].budgetAmount, 60000);
  assert.equal(lines[0].amountBasis, 'calculated');
  assert.equal(lines[1].budgetAmount, 15000);
  assert.equal(lines[0].period, 'Annual 2026');
  assert.equal(lines[0].programmeId, undefined);
  assert.match(lines[0].programme, /review required/i);
}

verifySample();
verifyHappyPath();
verifyBadReplies();
verifyNoAmountsFromAI();
verifyHelpers();
verifyOptionalColumns();
console.log('import AI mapping tests passed');
