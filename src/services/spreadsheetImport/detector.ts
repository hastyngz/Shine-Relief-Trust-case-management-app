import * as XLSX from 'xlsx';

export type SpreadsheetKind =
  | 'budget-monthly'
  | 'workplan-matrix'
  | 'payroll-grid'
  | 'back-to-school'
  | 'item-list'
  | 'profit-loss'
  | 'unknown';

export interface SpreadsheetCell {
  address: string;
  formula?: string;
  cachedValue: XLSX.CellObject['v'];
  numberFormat?: string;
}

export interface SpreadsheetSheetAnalysis {
  name: string;
  rowsRead: number;
  cells: SpreadsheetCell[];
}

export interface SpreadsheetAnalysis {
  detectedKind: SpreadsheetKind;
  sheets: SpreadsheetSheetAnalysis[];
}

const MONTH_NAMES =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?|t?mb?er)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function worksheetRows(sheet: XLSX.WorkSheet): string[][] {
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  }).map((row) => row.map(normalize));
}

function hasHeader(rows: string[][], pattern: RegExp, lookahead = 30): boolean {
  return rows.slice(0, lookahead).some((row) => row.some((cell) => pattern.test(cell)));
}

function detectRows(rows: string[][], sheetName = ''): SpreadsheetKind {
  const allText = rows.flat().join(' ');
  const documentLabel = `${sheetName} ${allText}`;
  const hasMonths = MONTH_NAMES.test(allText);
  const hasMonthColumns = rows.some((row) => row.filter((cell) => MONTH_NAMES.test(cell)).length >= 2);
  const hasGratuityTable = rows.some((row) =>
    row.some((cell) => /\b(name|employee|staff|worker)\b/.test(cell)) &&
    row.some((cell) => /\bgratuity\b/.test(cell))
  );
  const payrollSheetName = /\b(payments?|payroll|salar(?:y|ies)|staff|employees?)\b/i.test(sheetName);
  const hasCost = hasHeader(rows, /\b(cost|unit cost|amount|price|budget)\b/);
  const hasQuantity = hasHeader(rows, /\b(qty|quantity)\b/);
  const workplanHeaders = [
    /\bkey priority area\b/,
    /\boutcome\b/,
    /\bmain activity\b/,
    /\bsub activity\b/,
    /\bprocess activities\b/,
    /\bindicator\b/,
    /\bprogress\b/,
  ];
  const workplanMatches = workplanHeaders.filter((pattern) => hasHeader(rows, pattern)).length;
  if (workplanMatches >= 5 && hasHeader(rows, /\bcost\b/) && hasMonthColumns) {
    return 'workplan-matrix';
  }

  if (
    hasHeader(rows, /\b(profit|net profit|loss|profit and loss|profit loss)\b/) &&
    hasHeader(rows, /\b(revenue|income|sales)\b/) &&
    hasHeader(rows, /\b(cost|expense|expenditure)\b/)
  ) {
    return 'profit-loss';
  }

  if (hasGratuityTable) return 'payroll-grid';

  // Flat employee roster / reconciliation table: a name column next to an amount column,
  // with payroll wording somewhere on the sheet and no quantity column (so not an item list).
  const hasRosterTable = rows.slice(0, 25).some((row) =>
    row.some((cell) => /\b(employee|staff|worker|name)\b/.test(cell)) &&
    row.some((cell) => /\b(salary|wage|amount|mwk|pay)\b/.test(cell) && !/\b(status|action)\b/.test(cell))
  );
  if (hasRosterTable && !hasQuantity && (payrollSheetName || /\b(employee|staff|payroll|salary|wage)\b/.test(documentLabel))) {
    return 'payroll-grid';
  }

  if (
    hasMonths &&
    (/\b(employee|staff|payroll|salary|wage|gross pay|net pay)\b/i.test(documentLabel) ||
      (payrollSheetName && hasMonthColumns))
  ) {
    return 'payroll-grid';
  }

  if (
    hasHeader(rows, /\b(back to school|school supplies|school uniform|exercise books|school items)\b/) &&
    (hasHeader(rows, /\b(child|learner|student|girl|name)\b/) || hasQuantity)
  ) {
    return 'back-to-school';
  }

  if (hasQuantity && hasCost && hasHeader(rows, /\b(item|description|particulars|materials|specification)\b/)) {
    return hasMonthColumns ? 'budget-monthly' : 'item-list';
  }

  if (hasQuantity && hasCost && hasMonthColumns) return 'budget-monthly';
  return 'unknown';
}

function getSheetCells(sheet: XLSX.WorkSheet): SpreadsheetCell[] {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const cells: SpreadsheetCell[] = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      if (!cell || (cell.v === undefined && !cell.f)) continue;
      cells.push({
        address,
        ...(cell.f ? { formula: cell.f } : {}),
        cachedValue: cell.v,
        ...(cell.z ? { numberFormat: cell.z } : {}),
      });
    }
  }
  return cells;
}

export function detectSpreadsheetKind(workbook: XLSX.WorkBook): SpreadsheetKind {
  const kinds = workbook.SheetNames.map((name) => detectRows(worksheetRows(workbook.Sheets[name]), name));
  const preference: SpreadsheetKind[] = [
    'workplan-matrix',
    'payroll-grid',
    'profit-loss',
    'back-to-school',
    'budget-monthly',
    'item-list',
  ];
  return preference.find((kind) => kinds.includes(kind)) || 'unknown';
}

export function analyzeSpreadsheetWorkbook(workbook: XLSX.WorkBook): SpreadsheetAnalysis {
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    return {
      name,
      rowsRead: worksheetRows(sheet).length,
      cells: getSheetCells(sheet),
    };
  });
  return { detectedKind: detectSpreadsheetKind(workbook), sheets };
}
