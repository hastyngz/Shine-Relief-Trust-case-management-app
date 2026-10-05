import * as XLSX from 'xlsx';
import { BudgetCategory, BudgetPeriodType, EmployeeRecord, StaffUser, WorkplanPeriodType } from '../../types';
import { ProgrammeId, PROGRAMMES } from '../../data/programmes';
import { SpreadsheetAnalysis, SpreadsheetCell, SpreadsheetKind } from './detector';
import { matchNameCandidates } from './nameMatcher';

export interface ImportedBudgetLine {
  kind: 'budget';
  sheet: string;
  row: number;
  programmeId?: ProgrammeId;
  programme: string;
  category: BudgetCategory;
  itemDescription: string;
  unit: string;
  quantity: number;
  unitCost: number;
  budgetAmount: number;
  period: string;
  periodType: BudgetPeriodType;
  month?: number;
  notes: string;
}

export interface ImportedWorkplanLine {
  kind: 'workplan';
  sheet: string;
  row: number;
  programmeId?: ProgrammeId;
  domain: string;
  mainActivity: string;
  activity: string;
  description: string;
  period: string;
  periodType: WorkplanPeriodType;
  targetCount: number;
  unit: string;
  completedCount?: number;
  progress: number;
  budget?: number;
  costLevel?: 'activity' | 'group';
  indicator?: string;
}

export interface ImportedUnmappedLine {
  kind: 'unmapped';
  sheet: string;
  row: number;
  reason: string;
  values: unknown[];
}

export interface ImportedProcurementLine {
  kind: 'procurement';
  sheet: string;
  row: number;
  title: string;
  purpose: string;
  items: Array<{
    description: string;
    specification?: string;
    quantity: number;
    unit: string;
    unitPriceMWK?: number;
    totalMWK?: number;
    note?: string;
    priceStatus: 'quoted' | 'missing' | 'unclear';
    itemNumber?: string;
  }>;
}

export interface ImportedProjectionLine {
  kind: 'projection';
  sheet: string;
  row: number;
  programmeId: 'fish-farming' | 'chicken-farming' | 'fish-chicken' | 'rice-maize-mill' | 'tomato-farming';
  period: string;
  revenueMWK: number;
  costLines: Array<{ label: string; amountMWK?: number; status: 'priced' | 'unpriced' }>;
  netProfitMWK?: number;
  assumptions: string[];
}

export interface ImportedPayrollLine {
  kind: 'payroll';
  sheet: string;
  row: number;
  employeeName: string;
  employeeId?: string;
  department: string;
  payPeriod: string;
  amount: number;
  notes?: string;
  matchCandidates: Array<{ id: string; name: string }>;
  status: 'matched' | 'unmatched' | 'ambiguous' | 'review';
  specialType?: 'loan' | 'arrears' | 'gratuity';
}

export interface ImportedEmployeeLine {
  kind: 'employee';
  sheet: string;
  row: number;
  employeeName: string;
  department: string;
  positionTitle?: string;
  sourceYear: number;
  currentSalary: number;
  salaryHistory: Array<{ payPeriod: string; amount: number }>;
  otherPayrollAmounts: Array<{
    type: 'loan' | 'arrears' | 'gratuity';
    amount: number;
    payPeriod?: string;
    sourceReference?: string;
  }>;
  latestSourcePeriod?: string;
  latestWorkbookPaymentPeriod?: string;
  employmentStatus: 'Active' | 'Completed';
  matchCandidates: Array<{ id: string; name: string }>;
  matchedEmployeeId?: string;
  status: 'matched' | 'unmatched' | 'ambiguous';
}

export type ImportedSpreadsheetLine =
  | ImportedBudgetLine
  | ImportedWorkplanLine
  | ImportedProcurementLine
  | ImportedProjectionLine
  | ImportedPayrollLine
  | ImportedEmployeeLine
  | ImportedUnmappedLine;

export interface SpreadsheetImportPreview {
  kind: SpreadsheetKind;
  lines: ImportedSpreadsheetLine[];
  sheetStats: Array<{ sheet: string; rowsRead: number; imported: number; skipped: number }>;
  formulaDisagreements: Array<{ sheet: string; address: string; formula: string; cachedValue: unknown }>;
  sourceData: Record<string, unknown>;
}

const MONTHS: Array<{ label: RegExp; month: number }> = [
  { label: /^jan(?:uary)?\b/i, month: 1 }, { label: /^feb(?:ruary)?\b/i, month: 2 },
  { label: /^mar(?:ch)?\b/i, month: 3 }, { label: /^apr(?:il)?\b/i, month: 4 },
  { label: /^may\b/i, month: 5 }, { label: /^jun(?:e)?\b/i, month: 6 },
  { label: /^jul(?:y)?\b/i, month: 7 }, { label: /^aug(?:ust)?\b/i, month: 8 },
  { label: /^sep(?:t(?:ember)?)?\b/i, month: 9 }, { label: /^oct(?:ober)?\b/i, month: 10 },
  { label: /^nov(?:ember)?\b/i, month: 11 }, { label: /^dec(?:ember)?\b/i, month: 12 },
];

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalized(value: unknown): string {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = text(value).replace(/[,\sMWK]/gi, '');
  if (!cleaned) return undefined;
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : undefined;
}

function labelUnit(raw: string): { label: string; unit?: string } {
  const match = raw.trim().match(/^(.*?)(\d+(?:[.,]\d+)?)\s*(kg|g|bars?|teachers?|boxes|box|litres?|liters?|bags?|pieces?|pcs|months?|days?|visits?|students?|girls?)$/i);
  if (!match) return { label: raw.trim() };
  const description = match[1].trim();
  return {
    label: description || `${match[2]} ${match[3]}`,
    unit: match[3].toLowerCase(),
  };
}

function programmeFrom(...values: unknown[]): { id?: ProgrammeId; label: string } {
  const haystack = values.map(normalized).join(' ');
  if (/early years|early childhood/.test(haystack)) return { id: 'early-years', label: 'Early Years' };
  if (/child house|children home|bursary/.test(haystack)) {
    return /bursary/.test(haystack)
      ? { id: 'bursary', label: 'Bursary' }
      : { id: 'child-house', label: 'Child House' };
  }
  if (/shine village/.test(haystack)) {
    if (/bursary/.test(haystack)) return { id: 'bursary', label: 'Bursary' };
    if (/child house|children home/.test(haystack)) return { id: 'child-house', label: 'Child House' };
    return { label: '' };
  }
  if (/^village$/.test(haystack)) return { id: 'shine-village', label: 'Shine Village' };
  if (/fish/.test(haystack) && /chicken/.test(haystack)) return { id: 'fish-chicken', label: 'Fish & Chicken Farming (historical records)' };
  if (/fish/.test(haystack)) return { id: 'fish-farming', label: 'Fish Farming' };
  if (/chicken/.test(haystack)) return { id: 'chicken-farming', label: 'Chicken Farming' };
  if (/tomato/.test(haystack)) return { id: 'tomato-farming', label: 'Tomato Farming' };
  if (/maize|rice|mill/.test(haystack)) return { id: 'rice-maize-mill', label: 'Maize & Rice Mill' };
  if (/relief|family/.test(haystack)) return { id: 'relief-family', label: 'Relief & Family Preservation' };
  return { label: '' };
}

function categoryFrom(value: string): BudgetCategory {
  const categories: Array<[RegExp, BudgetCategory]> = [
    [/staff|salary|payroll|gratuity/, 'Staff'],
    [/food|meal|grocer/, 'Food'],
    [/health|medical/, 'Health/medical'],
    [/cloth|uniform|social support/, 'Clothing/social support'],
    [/repair|maintenan|plumbing/, 'Repairs/maintenance'],
    [/train/, 'Training'],
    [/transport|fuel/, 'Transport'],
    [/rent|housing|accommodation/, 'Rent'],
    [/electric|water|utilit/, 'Utilities'],
    [/equipment|asset|materials/, 'Equipment'],
    [/activit|session|event/, 'Programme activities'],
    [/administration|office/, 'Administration'],
    [/education|school|bursary|fees/, 'Education'],
  ];
  return categories.find(([pattern]) => pattern.test(normalized(value)))?.[1] || 'Other';
}

function monthColumn(header: unknown): number | undefined {
  const value = normalized(header).replace(/\s+20\d{2}$/, '');
  if (!/^[a-z]+$/.test(value)) return undefined;
  if (/^septmb?er$/.test(value)) return 9;
  return MONTHS.find(({ label }) => label.test(value))?.month;
}

function nonEmptyRow(row: unknown[]): boolean {
  return row.some((value) => text(value) !== '');
}

function worksheetRows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, raw: true, defval: '', blankrows: false,
  });
}

function inferYear(sheetName: string, rows: unknown[][]): number {
  const content = `${sheetName} ${rows.slice(0, 8).flat().map(text).join(' ')}`;
  return Number(content.match(/\b20\d{2}\b/)?.[0] || new Date().getFullYear());
}

function headerRowIndex(rows: unknown[][], kind: SpreadsheetKind): number {
  const patterns = kind === 'workplan-matrix'
    ? [/key priority area/, /sub activity/, /process activities/, /indicator/]
    : [/qty|quantity/, /cost|unit cost/, /item|description|particulars/];
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 35).forEach((row, index) => {
    const joined = row.map(normalized).join(' ');
    const score = patterns.filter((pattern) => pattern.test(joined)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function columnIndex(headers: unknown[], patterns: RegExp[]): number {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalized(header))));
}

function findMonthColumns(headers: unknown[]): Array<{ index: number; month: number }> {
  return headers.flatMap((header, index) => {
    const month = monthColumn(header);
    return month ? [{ index, month }] : [];
  });
}

function parseBudgetRows(
  sheetName: string,
  rows: unknown[][],
): { lines: ImportedSpreadsheetLine[]; imported: number; skipped: number } {
  const headerIndex = headerRowIndex(rows, 'budget-monthly');
  const headers = rows[headerIndex] || [];
  const quantityIndex = columnIndex(headers, [/^qty$/, /quantity/]);
  const costIndex = columnIndex(headers, [/^cost$/, /unit cost/, /price/]);
  const labelIndex = columnIndex(headers, [/item/, /description/, /particulars/, /name/]);
  const programmeIndex = columnIndex(headers, [/^programme$/, /^program$/]);
  const monthColumns = findMonthColumns(headers);
  const year = inferYear(sheetName, rows);
  let categorySection = '';
  let programmeLabel = '';
  let lastLabel = '';
  const lines: ImportedSpreadsheetLine[] = [];
  let skipped = 0;

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (!nonEmptyRow(row)) return;
    const sourceRow = headerIndex + offset + 2;
    const rawLabel = text(row[labelIndex >= 0 ? labelIndex : 0]);
    if (programmeIndex >= 0 && text(row[programmeIndex])) programmeLabel = text(row[programmeIndex]);
    const unitDetails = labelUnit(rawLabel);
    const embeddedQuantity = rawLabel.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|bars?|teachers?|boxes|box|litres?|liters?|bags?|pieces?|pcs|months?|days?|visits?|students?|girls?)$/i)?.[1];
    const quantity = number(row[quantityIndex]) ?? number(embeddedQuantity);
    const unitCost = number(row[costIndex]);
    if (!rawLabel && quantity === undefined && unitCost === undefined) return;

    if (rawLabel && quantity === undefined && unitCost === undefined) {
      if (row.filter((cell) => text(cell)).length === 1) {
        categorySection = rawLabel;
      } else {
        lastLabel = rawLabel;
      }
      if (/early years|child house|bursary|shine village|fish|chicken|tomato|maize|rice|relief/i.test(rawLabel)) {
        programmeLabel = rawLabel;
      }
      return;
    }

    const originalLabel = rawLabel || lastLabel;
    if (!originalLabel || quantity === undefined || unitCost === undefined) {
      skipped += 1;
      lines.push({ kind: 'unmapped', sheet: sheetName, row: sourceRow, reason: 'Missing item label, quantity, or unit cost', values: row });
      return;
    }
    lastLabel = originalLabel;
    const programme = programmeFrom(programmeLabel, categorySection);
    const note = `Original label: ${originalLabel}`;
    const activeMonths = monthColumns.filter(({ index }) => number(row[index]) !== undefined && number(row[index]) !== 0);
    if (activeMonths.length > 0) {
      activeMonths.forEach(({ index, month }) => {
        const statedAmount = number(row[index])!;
        const recomputedAmount = quantity * unitCost;
        const amountNote = Math.abs(statedAmount - recomputedAmount) > 0.01
          ? `; source month amount ${statedAmount} differs from recomputed quantity × unit cost ${recomputedAmount}`
          : '';
        lines.push({
          kind: 'budget', sheet: sheetName, row: sourceRow, programmeId: programme.id,
          programme: programme.label || 'Unassigned - programme review required',
          category: categoryFrom(categorySection || originalLabel), itemDescription: unitDetails.label,
          unit: text(row[columnIndex(headers, [/unit/])]) || unitDetails.unit || 'unit',
          quantity, unitCost, budgetAmount: recomputedAmount, period: `${year}-${String(month).padStart(2, '0')}`,
          periodType: 'monthly', month, notes: `${note}${amountNote}`,
        });
      });
    } else {
      lines.push({
        kind: 'budget', sheet: sheetName, row: sourceRow, programmeId: programme.id,
        programme: programme.label || 'Unassigned - programme review required',
        category: categoryFrom(categorySection || originalLabel), itemDescription: unitDetails.label,
        unit: text(row[columnIndex(headers, [/unit/])]) || unitDetails.unit || 'unit',
        quantity, unitCost, budgetAmount: quantity * unitCost, period: `Annual ${year}`,
        periodType: 'annual', notes: note,
      });
    }
  });
  return { lines, imported: lines.filter((line) => line.kind === 'budget').length, skipped };
}

function parseWorkplanRows(
  sheetName: string,
  rows: unknown[][],
): { lines: ImportedSpreadsheetLine[]; imported: number; skipped: number } {
  const headerIndex = headerRowIndex(rows, 'workplan-matrix');
  const headers = rows[headerIndex] || [];
  const findCol = (...patterns: RegExp[]) => columnIndex(headers, patterns);
  const priorityIndex = findCol(/key priority area/);
  const outcomeIndex = findCol(/^outcome$/);
  const mainIndex = findCol(/main activity/);
  const subIndex = findCol(/sub activity/);
  const processIndex = findCol(/process activities/);
  const costIndex = findCol(/^cost$/);
  const indicatorIndex = findCol(/indicator/);
  const progressIndex = findCol(/progress/);
  const monthColumns = findMonthColumns(headers);
  const lines: ImportedSpreadsheetLine[] = [];
  let priority = '';
  let outcome = '';
  let mainActivity = '';
  let subActivity = '';
  let skipped = 0;
  const year = inferYear(sheetName, rows);

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (!nonEmptyRow(row)) return;
    const sourceRow = headerIndex + offset + 2;
    priority = text(row[priorityIndex]) || priority;
    outcome = text(row[outcomeIndex]) || outcome;
    mainActivity = text(row[mainIndex]) || mainActivity;
    subActivity = text(row[subIndex]) || subActivity;
    const process = text(row[processIndex]);
    const indicator = text(row[indicatorIndex]);
    const progressRaw = text(row[progressIndex]);
    const progressPercent = progressRaw.match(/(\d+(?:\.\d+)?)\s*%/);
    const progressFraction = progressRaw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    const progressValue = number(progressRaw);
    const cost = number(row[costIndex]);
    const programme = programmeFrom(priority, outcome);
    const domain = priority || outcome || 'Unassigned';
    const monthsWithValues = monthColumns.filter(({ index }) => text(row[index]) !== '');
    if (!process && !subActivity && !indicator && cost === undefined && monthsWithValues.length === 0) return;
    const groupCostRow = !process && cost !== undefined && Boolean(mainActivity);
    const activity = groupCostRow ? mainActivity : subActivity || mainActivity || process;
    const description = process || activity;
    if (!activity) {
      skipped += 1;
      lines.push({ kind: 'unmapped', sheet: sheetName, row: sourceRow, reason: 'No activity label on this row or its merged parent row', values: row });
      return;
    }
    const indicatorTarget = indicator.match(/(?:target\s*)?(\d+(?:\.\d+)?)/i);
    const indicatorUnit = /%|percentage|rate/i.test(indicator)
      ? '%'
      : indicator.match(/\b(sessions?|girls?|children|learners?|days?|visits?|households?|activities|schools?)\b/i)?.[0];
    const targetCount = indicatorTarget ? Number(indicatorTarget[1]) : 0;
    const completedCount = progressFraction
      ? Number(progressFraction[1])
      : progressPercent && targetCount > 0
        ? targetCount * Number(progressPercent[1]) / 100
        : progressValue;
    const progress = targetCount > 0 && completedCount !== undefined
      ? Math.min(100, Math.max(0, completedCount / targetCount * 100))
      : progressPercent ? Number(progressPercent[1]) : 0;
    const periods = monthsWithValues.length
      ? monthsWithValues
      : [{ index: -1, month: 1 }];
    periods.forEach(({ index, month }) => {
      const period = `${year}-${String(month).padStart(2, '0')}`;
      const ownCost = process ? cost : groupCostRow ? cost : undefined;
      lines.push({
        kind: 'workplan', sheet: sheetName, row: sourceRow,
        programmeId: programme.id, domain, mainActivity, activity, description,
        period, periodType: 'monthly', targetCount,
        unit: indicatorUnit || 'activities',
        completedCount,
        progress,
        budget: ownCost,
        costLevel: groupCostRow ? 'group' : 'activity',
        indicator: indicator || undefined,
      });
    });
  });
  return { lines, imported: lines.filter((line) => line.kind === 'workplan').length, skipped };
}

function parseItemListRows(sheetName: string, rows: unknown[][]): ImportedProcurementLine | null {
  const headerIndex = headerRowIndex(rows, 'item-list');
  const headers = rows[headerIndex] || [];
  const itemNumberIndex = columnIndex(headers, [/item number/, /^item no/, /^no\.?$/]);
  const labelIndex = columnIndex(headers, [/description/, /^item$/, /particulars/, /materials/, /specification/]);
  const specIndex = columnIndex(headers, [/specification/, /details/]);
  const quantityIndex = columnIndex(headers, [/qty|quantity/]);
  const unitIndex = columnIndex(headers, [/^unit$/]);
  const priceIndex = columnIndex(headers, [/unit price/, /^price$/, /rate/]);
  const totalIndex = columnIndex(headers, [/total/, /amount/]);
  const noteIndex = columnIndex(headers, [/notes?/, /remarks?/]);
  if (labelIndex < 0 && itemNumberIndex < 0) return null;

  const items: ImportedProcurementLine['items'] = [];
  let previousDescription = '';
  rows.slice(headerIndex + 1).forEach((row) => {
    if (!nonEmptyRow(row)) return;
    const description = text(row[labelIndex >= 0 ? labelIndex : 0]) || previousDescription;
    const quantity = number(row[quantityIndex]) ?? 1;
    const unitPrice = number(row[priceIndex]);
    const total = number(row[totalIndex]);
    const note = text(row[noteIndex]);
    if (!description || /^(total|grand total)$/i.test(description)) return;
    previousDescription = description;
    items.push({
      description,
      specification: text(row[specIndex]) || undefined,
      quantity,
      unit: text(row[unitIndex]) || 'item',
      unitPriceMWK: unitPrice,
      totalMWK: total ?? (unitPrice === undefined ? undefined : unitPrice * quantity),
      note: note || undefined,
      priceStatus: /unclear|not clearly|marked \*/i.test(note)
        ? 'unclear'
        : unitPrice === undefined && total === undefined ? 'missing' : 'quoted',
      itemNumber: text(row[itemNumberIndex]) || undefined,
    });
  });
  if (items.length === 0) return null;
  return { kind: 'procurement', sheet: sheetName, row: headerIndex + 2, title: sheetName, purpose: sheetName, items };
}

function parseProjectionRows(sheetName: string, rows: unknown[][]): ImportedProjectionLine | null {
  const content = `${sheetName} ${rows.flat().map(text).join(' ')}`.toLowerCase();
  const programmeId = /tomato/.test(content)
    ? 'tomato-farming'
    : /maize|rice|mill/.test(content)
      ? 'rice-maize-mill'
      : /fish/.test(content) && /chicken/.test(content)
        ? 'fish-chicken'
        : /fish/.test(content)
          ? 'fish-farming'
          : /chicken/.test(content)
            ? 'chicken-farming'
        : undefined;
  if (!programmeId) return null;
  const headerIndex = headerRowIndex(rows, 'profit-loss');
  const headers = rows[headerIndex] || [];
  const labelIndex = columnIndex(headers, [/description/, /particulars/, /^item$/, /income/, /revenue/]);
  const amountIndex = columnIndex(headers, [/amount/, /value/, /mwk/, /cost/, /revenue/]);
  const period = text(rows.slice(0, headerIndex + 1).flat().find((value) => /\b20\d{2}\b/.test(text(value)))) || String(inferYear(sheetName, rows));
  let revenueMWK = 0;
  let hasRevenue = false;
  const costLines: ImportedProjectionLine['costLines'] = [];
  rows.slice(headerIndex + 1).forEach((row) => {
    const label = text(row[labelIndex >= 0 ? labelIndex : 0]);
    if (!label) return;
    const amount = number(row[amountIndex]);
    if (/revenue|sales|income/i.test(label)) {
      if (amount !== undefined) {
        revenueMWK += amount;
        hasRevenue = true;
      }
      return;
    }
    if (/profit|loss|total|net income/i.test(label)) return;
    costLines.push({ label, amountMWK: amount, status: amount === undefined ? 'unpriced' : 'priced' });
  });
  const totalCosts = costLines.reduce((sum, line) => sum + (line.amountMWK || 0), 0);
  return {
    kind: 'projection',
    sheet: sheetName,
    row: headerIndex + 2,
    programmeId,
    period,
    revenueMWK,
    costLines,
    netProfitMWK: hasRevenue && costLines.every((line) => line.status === 'priced')
      ? revenueMWK - totalCosts
      : undefined,
    assumptions: [
      ...(!hasRevenue ? ['Revenue is not priced in the source.'] : []),
      ...(costLines.some((line) => line.status === 'unpriced') ? ['Unpriced cost lines prevent a complete net profit calculation.'] : []),
    ],
  };
}

function parsePayrollRows(
  sheetName: string,
  rows: unknown[][],
  staff: StaffUser[],
  employees: EmployeeRecord[],
  sourceName: string,
): { lines: ImportedSpreadsheetLine[]; imported: number; skipped: number } {
  const headerIndex = rows.slice(0, 10).findIndex((row) => row.some((value) => monthColumn(value)));
  if (headerIndex < 0) return { lines: [], imported: 0, skipped: rows.length };
  const headers = rows[headerIndex];
  const labelledNameIndex = columnIndex(headers, [/employee/, /staff/, /name/, /personnel/]);
  const monthColumns = findMonthColumns(headers);
  const labelledGroupIndex = columnIndex(headers, [/department/, /group/, /category/, /team/]);
  const isCredibleName = (value: unknown) => {
    const name = text(value);
    return /[a-z]{2}/i.test(name) && number(name) === undefined
      && !/^(?:bank credit|total|grand total|subtotal|salary|wages?|farm|mill|house mums?|driver|watchmen?|administration|admistration|teachers?|ministry|grad?uity)$/i.test(name);
  };
  const nameScores = (labelledNameIndex >= 0 ? [labelledNameIndex] : [1, 2, 0]).map((index) => ({
    index,
    score: rows.slice(headerIndex + 1, headerIndex + 50).filter((row) =>
      isCredibleName(row[index]) && monthColumns.some(({ index: monthIndex }) => number(row[monthIndex]) !== undefined)
    ).length,
  }));
  const nameIndex = labelledNameIndex >= 0
    ? labelledNameIndex
    : nameScores.sort((a, b) => b.score - a.score)[0]?.index ?? 1;
  const labelledGroupColumn = labelledGroupIndex >= 0 ? labelledGroupIndex : undefined;
  const specialColumns: Array<{ index: number; type: 'loan' | 'arrears' }> = [];
  headers.forEach((header, index) => {
    const label = normalized(header);
    if (/loan/.test(label)) specialColumns.push({ index, type: 'loan' });
    else if (/arrears/.test(label)) specialColumns.push({ index, type: 'arrears' });
  });
  let department = '';
  const output: ImportedSpreadsheetLine[] = [];
  let skipped = 0;
  const staffNames = [
    ...staff.map((person) => ({ id: person.id, name: person.fullName })),
    ...employees.map((person) => ({ id: person.id, name: person.fullName })),
  ].filter((person, index, all) => all.findIndex((candidate) => candidate.id === person.id) === index);
  const employeesSeen = new Set<string>();
  const groupDetails = (group: string) => {
    const category = normalized(group);
    if (/^house mums?$/.test(category)) return { department: 'Residential Care', positionTitle: 'House Mum' };
    if (/^drivers?$/.test(category)) return { department: 'Operations', positionTitle: 'Driver' };
    if (/^watchmen?$/.test(category)) return { department: 'Security/Operations', positionTitle: 'Security Guard/Watchman' };
    if (/^admistration$|^administration$/.test(category)) return { department: 'Administration' };
    if (/^teachers?$/.test(category)) return { department: 'Education' };
    if (/^ministry$/.test(category)) return { department: 'Ministry' };
    return { department: group };
  };
  const year = inferYear(sourceName || sheetName, rows);
  const isGratuitySection = (group: string) => /^grad?uity$/i.test(normalized(group));
  const sourceRows = rows.slice(headerIndex + 1);
  const isGroupHeading = (value: string, row: unknown[]) => {
    if (!value || isCredibleName(value) || /^(?:bank credit|total|grand total|subtotal)\b/i.test(value)) return false;
    if (/farm|mill|house mums?|drivers?|watchmen?|administration|admistration|teachers?|ministry|grad?uity/i.test(value)) return true;
    return row.filter((cell) => text(cell)).length === 1;
  };
  const probableGroupIndices = labelledGroupColumn !== undefined
    ? [labelledGroupColumn]
    : Array.from({ length: Math.max(0, ...sourceRows.map((row) => row.length)) }, (_, index) => index)
      .filter((index) => index !== nameIndex)
      .sort((a, b) => {
        const headings = (column: number) => sourceRows.filter((row) => isGroupHeading(text(row[column]), row)).length;
        return headings(b) - headings(a);
      });
  const groupIndex = probableGroupIndices[0] ?? -1;
  let currentGroup = '';
  let workbookLatestMonth = 0;
  sourceRows.forEach((row) => {
    const groupLabel = groupIndex >= 0 ? text(row[groupIndex]) : '';
    const name = text(row[nameIndex]);
    if (isGroupHeading(groupLabel, row)) currentGroup = groupLabel;
    if (!name || /^(?:bank credit|total|grand total|subtotal)\b/i.test(name) || isGratuitySection(currentGroup)) return;
    monthColumns.forEach(({ index, month }) => {
      if (number(row[index]) !== undefined && number(row[index])! > 0) workbookLatestMonth = Math.max(workbookLatestMonth, month);
    });
  });
  sourceRows.forEach((row, offset) => {
    if (!nonEmptyRow(row)) return;
    const sourceRow = headerIndex + offset + 2;
    const groupLabel = groupIndex >= 0 ? text(row[groupIndex]) : '';
    const rowName = text(row[nameIndex]);
    const monthlyAmounts = monthColumns.map(({ index, month }) => ({
      month, amount: number(row[index]),
    })).filter((entry): entry is { month: number; amount: number } => entry.amount !== undefined && entry.amount > 0);
    const specialAmounts = specialColumns.map(({ index, type }) => ({ type, amount: number(row[index]) }))
      .filter((entry): entry is { type: 'loan' | 'arrears'; amount: number } => entry.amount !== undefined && entry.amount !== 0);
    if (isGroupHeading(groupLabel, row)) {
      department = groupLabel;
      if (!rowName) {
        if (monthlyAmounts.length || specialAmounts.length) skipped += 1;
        return;
      }
    }
    const employeeSourceName = rowName;
    if (monthlyAmounts.length === 0 && specialAmounts.length === 0) {
      return;
    }
    if (/^(?:bank credit|total|grand total|subtotal|salary|wages?|construction|materials?)\b/i.test(employeeSourceName)) {
      skipped += 1;
      return;
    }
    if (!employeeSourceName || monthlyAmounts.length === 0 && specialAmounts.length === 0) {
      skipped += 1;
      if (!employeeSourceName) {
        output.push({ kind: 'unmapped', sheet: sheetName, row: sourceRow, reason: 'Payroll amount has no employee name', values: row });
      }
      return;
    }
    const nameParts = employeeSourceName.split(/\r?\n|;| \| /).map((part) => part.trim()).filter(Boolean);
    const employeeName = nameParts[0];
    if (!/[a-z]{2}/i.test(employeeName) || /^\d+$/.test(employeeName)) {
      skipped += 1;
      return;
    }
    const employeeDetails = groupDetails(department);
    const otherPayrollAmounts = [
      ...specialAmounts.map(({ type, amount }) => ({
        type,
        amount,
        sourceReference: `${sourceName || sheetName}/${sheetName}/${sourceRow}/${type}`,
      })),
      ...(isGratuitySection(department)
        ? monthlyAmounts.map(({ month, amount }) => ({
          type: 'gratuity' as const,
          amount,
          payPeriod: `${year}-${String(month).padStart(2, '0')}`,
          sourceReference: `${sourceName || sheetName}/${sheetName}/${sourceRow}/gratuity`,
        }))
        : []),
    ].filter((entry) => entry.amount > 0);
    const employeeKey = normalized(employeeName);
    const existingEmployeeLine = employeesSeen.has(employeeKey)
      ? output.find((line): line is ImportedEmployeeLine => line.kind === 'employee' && normalized(line.employeeName) === employeeKey)
      : undefined;
    if (existingEmployeeLine) {
      const salaryByPeriod = new Map(existingEmployeeLine.salaryHistory.map((entry) => [entry.payPeriod, entry]));
      const conflictingPeriods: string[] = [];
      for (const { month, amount } of monthlyAmounts) {
        if (isGratuitySection(department)) continue;
        const payPeriod = `${year}-${String(month).padStart(2, '0')}`;
        const previous = salaryByPeriod.get(payPeriod);
        if (previous && previous.amount !== amount) {
          conflictingPeriods.push(payPeriod);
          continue;
        }
        salaryByPeriod.set(payPeriod, { payPeriod, amount });
      }
      existingEmployeeLine.salaryHistory = Array.from(salaryByPeriod.values())
        .sort((a, b) => a.payPeriod.localeCompare(b.payPeriod));
      existingEmployeeLine.currentSalary = existingEmployeeLine.salaryHistory.at(-1)?.amount || existingEmployeeLine.currentSalary;
      existingEmployeeLine.latestSourcePeriod = existingEmployeeLine.salaryHistory.at(-1)?.payPeriod || existingEmployeeLine.latestSourcePeriod;
      existingEmployeeLine.otherPayrollAmounts.push(...otherPayrollAmounts);
      existingEmployeeLine.employmentStatus = existingEmployeeLine.salaryHistory.some((entry) =>
        entry.payPeriod === `${year}-${String(workbookLatestMonth).padStart(2, '0')}`)
        ? 'Active'
        : existingEmployeeLine.employmentStatus;
      if (conflictingPeriods.length) {
        output.push({
          kind: 'unmapped',
          sheet: sheetName,
          row: sourceRow,
          reason: `Conflicting salary amounts for ${employeeName} in ${conflictingPeriods.join(', ')}; review the repeated rows.`,
          values: row,
        });
      }
      skipped += 1;
      return;
    }
    employeesSeen.add(employeeKey);
    const nameMatches = matchNameCandidates(employeeName, staffNames);
    const exact = nameMatches.exact;
    const candidates = exact.length === 1 ? exact : nameMatches.possible.slice(0, 5);
    const status: ImportedEmployeeLine['status'] = exact.length === 1
      ? 'matched'
      : exact.length > 1 || candidates.length > 1
        ? 'ambiguous'
        : 'unmatched';
    const salaryHistory = (!isGratuitySection(department) ? monthlyAmounts : []).map(({ month, amount }) => ({
      payPeriod: `${year}-${String(month).padStart(2, '0')}`,
      amount,
    })).sort((a, b) => a.payPeriod.localeCompare(b.payPeriod));
    const latestSourcePeriod = salaryHistory.at(-1)?.payPeriod;
    const hasLatestSalary = salaryHistory.some((entry) => entry.payPeriod === `${year}-${String(workbookLatestMonth).padStart(2, '0')}`);
    output.push({
      kind: 'employee',
      sheet: sheetName,
      row: sourceRow,
      employeeName,
      department: employeeDetails.department,
      positionTitle: employeeDetails.positionTitle,
      sourceYear: year,
      currentSalary: salaryHistory.at(-1)?.amount || 0,
      salaryHistory,
      otherPayrollAmounts,
      latestSourcePeriod,
      latestWorkbookPaymentPeriod: workbookLatestMonth
        ? `${year}-${String(workbookLatestMonth).padStart(2, '0')}`
        : undefined,
      employmentStatus: hasLatestSalary ? 'Active' : 'Completed',
      matchCandidates: candidates,
      matchedEmployeeId: exact.length === 1 ? exact[0].id : undefined,
      status,
    });
  });
  return {
    lines: output,
    imported: output.filter((line) => line.kind === 'employee').length,
    skipped,
  };
}

function evaluateFormula(formula: string, cells: Map<string, unknown>): number | undefined {
  const sumMatch = formula.match(/^SUM\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)\)$/i);
  if (sumMatch && sumMatch[1].toUpperCase() === sumMatch[3].toUpperCase()) {
    let sum = 0;
    for (let row = Number(sumMatch[2]); row <= Number(sumMatch[4]); row += 1) {
      sum += number(cells.get(`${sumMatch[1].toUpperCase()}${row}`)) || 0;
    }
    return sum;
  }
  const arithmetic = formula.match(/^(\$?[A-Z]+\$?\d+|-?\d+(?:\.\d+)?)\s*([*+/-])\s*(\$?[A-Z]+\$?\d+|-?\d+(?:\.\d+)?)$/i);
  if (!arithmetic) return undefined;
  const valueOf = (operand: string) => {
    const reference = operand.match(/^\$?([A-Z]+)\$?(\d+)$/i);
    return reference ? number(cells.get(`${reference[1].toUpperCase()}${reference[2]}`)) : number(operand);
  };
  const left = valueOf(arithmetic[1]);
  const right = valueOf(arithmetic[3]);
  if (left === undefined || right === undefined) return undefined;
  if (arithmetic[2] === '*') return left * right;
  if (arithmetic[2] === '+') return left + right;
  if (arithmetic[2] === '-') return left - right;
  if (right === 0) return undefined;
  return left / right;
}

function formulaDisagreements(analysis: SpreadsheetAnalysis): SpreadsheetImportPreview['formulaDisagreements'] {
  return analysis.sheets.flatMap((sheet) => sheet.cells.flatMap((cell) => {
    if (!cell.formula) return [];
    const formulaValue = number(cell.cachedValue);
    if (formulaValue === undefined) return [];
    const cachedCells = new Map(sheet.cells.map(({ address, cachedValue }) => [address, cachedValue]));
    const computedValue = evaluateFormula(cell.formula.replace(/^=/, '').replace(/\s+/g, ''), cachedCells);
    if (computedValue !== undefined && Math.abs(computedValue - formulaValue) > 0.01) {
      return [{ sheet: sheet.name, address: cell.address, formula: cell.formula, cachedValue: cell.cachedValue }];
    }
    return [];
  }));
}

export function createSpreadsheetImportPreview(
  workbook: XLSX.WorkBook,
  analysis: SpreadsheetAnalysis,
  kind: SpreadsheetKind,
  staff: StaffUser[] = [],
  employees: EmployeeRecord[] = [],
  sourceName = '',
): SpreadsheetImportPreview {
  const lines: ImportedSpreadsheetLine[] = [];
  const procurementGroups: ImportedProcurementLine[] = [];
  const sheetStats = analysis.sheets.map((sheet) => {
    const rawRows = worksheetRows(workbook.Sheets[sheet.name]);
    let result: { lines: ImportedSpreadsheetLine[]; imported: number; skipped: number };
    if (kind === 'budget-monthly') {
      result = parseBudgetRows(sheet.name, rawRows);
    } else if (kind === 'workplan-matrix') {
      result = parseWorkplanRows(sheet.name, rawRows);
    } else if (kind === 'item-list' || kind === 'back-to-school') {
      const procurement = parseItemListRows(sheet.name, rawRows);
      if (procurement) procurementGroups.push(procurement);
      result = {
        lines: procurement ? [procurement] : [],
        imported: procurement?.items.length || 0,
        skipped: Math.max(0, rawRows.slice(1).filter(nonEmptyRow).length - (procurement?.items.length || 0)),
      };
    } else if (kind === 'profit-loss') {
      const projection = parseProjectionRows(sheet.name, rawRows);
      result = { lines: projection ? [projection] : [], imported: projection ? 1 : 0, skipped: projection ? 0 : 1 };
    } else if (kind === 'payroll-grid') {
      result = parsePayrollRows(sheet.name, rawRows, staff, employees, sourceName);
    } else {
      result = { lines: rawRows.slice(1).filter(nonEmptyRow).map((values, index) => ({
        kind: 'unmapped', sheet: sheet.name, row: index + 2,
        reason: `No importer is configured for detected kind "${kind}" yet`, values,
      })), imported: 0, skipped: rawRows.slice(1).filter(nonEmptyRow).length };
    }
    lines.push(...result.lines);
    return { sheet: sheet.name, rowsRead: sheet.rowsRead, imported: result.imported, skipped: result.skipped };
  });

  if (kind === 'item-list' || kind === 'back-to-school') {
    const merged = new Map<string, ImportedProcurementLine['items'][number]>();
    procurementGroups.forEach((group) => group.items.forEach((item, index) => {
      const key = item.itemNumber ? `number:${normalized(item.itemNumber)}` : `description:${normalized(item.description)}:${index}`;
      const current = merged.get(key);
      if (!current) merged.set(key, { ...item });
      else {
        const preferred = item.priceStatus === 'quoted' ? item : current;
        merged.set(key, {
          ...current,
          ...preferred,
          note: [current.note, item.note].filter(Boolean).join('; ') || undefined,
          priceStatus: current.priceStatus === 'unclear' || item.priceStatus === 'unclear'
            ? 'unclear'
            : preferred.priceStatus,
        });
      }
    }));
    const items = Array.from(merged.values());
    lines.splice(0, lines.length, ...(items.length ? [{
      kind: 'procurement' as const,
      sheet: procurementGroups.map((group) => group.sheet).join(', '),
      row: procurementGroups[0]?.row || 1,
      title: procurementGroups.map((group) => group.title).join(' / ') || 'Procurement list',
      purpose: procurementGroups.map((group) => group.purpose).join(' / ') || 'Imported item list',
      items,
    }] : []));
  }

  const sourceData = {
    detectedKind: kind,
    sheets: analysis.sheets.map((sheet) => ({
      name: sheet.name,
      rowsRead: sheet.rowsRead,
      cells: sheet.cells.map((cell) => ({
        address: cell.address,
        formula: cell.formula,
        cachedValue: cell.cachedValue,
        numberFormat: cell.numberFormat,
      })),
    })),
  };
  return { kind, lines, sheetStats, formulaDisagreements: formulaDisagreements(analysis), sourceData };
}

export function availableProgrammeOptions(): Array<{ id: ProgrammeId; name: string }> {
  return PROGRAMMES.map(({ id, name }) => ({ id, name }));
}
