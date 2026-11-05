import type * as XLSX from 'xlsx';
import { BudgetCategory, BudgetPeriodType, ContractStatus, EmployeeCategory, EmployeeContractFields, EmployeeRecord, EmploymentStatus, WorkplanPeriodType } from '../../types';
import { ProgrammeId, PROGRAMMES } from '../../data/programmes';
import { SpreadsheetAnalysis, SpreadsheetCell, SpreadsheetKind } from './detector';
import { matchNameCandidates } from './nameMatcher';
import { applySpreadsheetAIMapping } from './applyAIMapping';
import type { SpreadsheetAIMappingProposal } from './aiMapping';

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
  itemNumber?: string;
  frequency?: number;
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
  contractFields?: Partial<EmployeeContractFields>;
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
  { label: /^nov(?:e|ember)?\b/i, month: 11 }, { label: /^dec(?:ember)?\b/i, month: 12 },
];

function monthFromLabel(value: string): number | undefined {
  const words = value.match(/[a-z]+/gi) || [];
  return MONTHS.find(({ label }) => words.some((word) => label.test(word)))?.month;
}

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalized(value: unknown): string {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isValidPayrollEmployeeName(value: unknown): boolean {
  const name = text(value);
  if (!name || number(name) !== undefined || !/[a-z]{2}/i.test(name)) return false;
  return !/^(?:(?:grand|sub)\s*)?(?:total|subtotal)\b|^(?:payments?|summary|summaries)\b/i.test(name);
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = text(value).replace(/[ ,MWK]/gi, '');
  if (!cleaned) return undefined;
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : undefined;
}

function quantityAndUnit(value: unknown): { quantity?: number; unit?: string } {
  const direct = number(value);
  if (direct !== undefined) return { quantity: direct };
  const match = text(value).replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([a-z][a-z -]{0,18})$/i);
  if (!match) return {};
  const rawUnit = match[2].trim().toLowerCase().replace(/\s+/g, ' ');
  const aliases: Record<string, string> = {
    kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg', g: 'g', gs: 'g', gram: 'g', grams: 'g',
    litre: 'litre', litres: 'litre', liter: 'litre', liters: 'litre', ltr: 'litre', ltrs: 'litre', l: 'litre', ls: 'litre',
    bar: 'bar', bars: 'bar', piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
    roll: 'roll', rolls: 'roll', tray: 'tray', trays: 'tray', bag: 'bag', bags: 'bag',
    bottle: 'bottle', bottles: 'bottle', tube: 'tube', tubes: 'tube', pad: 'pad', pads: 'pad',
  };
  return { quantity: Number(match[1]), unit: aliases[rawUnit] || rawUnit };
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
    [/ufa|maize|flour|rice|sugar|salt|oil|soya|eggs?|beans|bonya|vegg(?:ies|etables?)?|tomatoes?|onions?|fish|meat|milk|bread|groundnuts|nsima/, 'Food'],
    [/soap|surf|detergent|toothpaste|lotion|glycerine|vaseline|sanitary|pads?|tissues?|toilet paper|jik|bleach/, 'Household supplies'],
    [/charcoal|firewood|gas|paraffin/, 'Utilities'],
    [/locks?|padlocks?|bulbs?|buckets?|mats?|blankets?/, 'Equipment'],
  ];
  return categories.find(([pattern]) => pattern.test(normalized(value)))?.[1] || 'Other';
}

function monthColumn(header: unknown): number | undefined {
  const tokens = normalized(header).split(' ').filter(Boolean);
  const monthTokens = tokens.map((token) => ({
    token,
    month: /^sept(?:ember|mber|mb?er)?$/.test(token)
      ? 9
      : MONTHS.find(({ label }) => label.test(token))?.month,
  })).filter((entry): entry is { token: string; month: number } => entry.month !== undefined);
  if (monthTokens.length !== 1) return undefined;

  const monthDescriptors = new Set([
    'salary', 'salaries', 'wage', 'wages', 'pay', 'payroll', 'payment', 'payments',
    'amount', 'amounts', 'gross', 'net', 'monthly', 'total', 'remuneration', 'earning', 'earnings',
    'mwk', 'kwacha', 'currency',
  ]);
  const hasUnexpectedToken = tokens.some((token) =>
    token !== monthTokens[0].token && !/^20\d{2}$/.test(token) && !monthDescriptors.has(token)
  );
  return hasUnexpectedToken ? undefined : monthTokens[0].month;
}

function nonEmptyRow(row: unknown[]): boolean {
  return row.some((value) => text(value) !== '');
}

function worksheetRows(XLSX: typeof import('xlsx'), sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, raw: true, defval: '', blankrows: false,
  });
}

function inferYear(sheetName: string, rows: unknown[][], fallbackLabel = ''): number {
  // Prefer the sheet and its own header/data year over the filename. A file may
  // be named for the current payroll year while containing historical rows.
  const content = `${sheetName} ${rows.slice(0, 8).flat().map(text).join(' ')}`;
  const explicitYear = content.match(/\b20\d{2}\b/)?.[0];
  const fallbackYear = fallbackLabel.match(/\b20\d{2}\b/)?.[0];
  return Number(explicitYear || fallbackYear || new Date().getFullYear());
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

function employeeContractColumns(headers: unknown[]) {
  return {
    name: columnIndex(headers, [/employee name/, /staff name/, /worker name/, /personnel name/, /^name$/, /^employee$/]),
    department: columnIndex(headers, [/^department$/, /^team$/, /^division$/]),
    position: columnIndex(headers, [/^position$/, /^job title$/, /^designation$/, /^title$/]),
    category: columnIndex(headers, [/employee category/, /employment category/, /staff category/, /^category$/]),
    contractStart: columnIndex(headers, [/contract start/, /^start date$/]),
    contractEnd: columnIndex(headers, [/contract end/, /^end date$/]),
    contractType: columnIndex(headers, [/contract type/, /agreement type/]),
    contractDuration: columnIndex(headers, [/contract duration/, /^duration$/]),
    contractStatus: columnIndex(headers, [/contract status/]),
    employmentStatus: columnIndex(headers, [/employment status/, /employee status/]),
    renewalInformation: columnIndex(headers, [/renewal information/, /renewal info/, /renewal notes/]),
    salary: columnIndex(headers, [/current salary/, /^salary$/]),
  };
}

function importedDate(value: unknown): string | undefined {
  const valueText = text(value);
  if (!valueText) return undefined;
  const serial = typeof value === 'number' ? value : Number.NaN;
  if (Number.isFinite(serial) && serial > 0 && serial < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  const parts = valueText.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/);
  if (parts) {
    const first = Number(parts[1]);
    const second = Number(parts[2]);
    const third = Number(parts[3]);
    const year = parts[1].length === 4 ? first : third;
    const month = second;
    const day = parts[1].length === 4 ? third : first;
    if (year >= 1900 && year <= 2200 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
        return date.toISOString().slice(0, 10);
      }
    }
  }
  const parsed = new Date(valueText);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function parseEmployeeContractFields(row: unknown[], columns: ReturnType<typeof employeeContractColumns>): Partial<EmployeeContractFields> {
  const fields: Partial<EmployeeContractFields> = {};
  const position = text(row[columns.position]);
  if (position) fields.position = position;
  const category = normalized(row[columns.category]);
  if (/ground worker|gardener/.test(category)) fields.employeeCategory = 'Ground Worker/Gardener' as EmployeeCategory;
  else if (/other staff/.test(category)) fields.employeeCategory = 'Other Staff' as EmployeeCategory;
  const contractStartDate = importedDate(row[columns.contractStart]);
  const contractEndDate = importedDate(row[columns.contractEnd]);
  if (contractStartDate) fields.contractStartDate = contractStartDate;
  if (contractEndDate) fields.contractEndDate = contractEndDate;
  const contractType = text(row[columns.contractType]);
  const contractDuration = text(row[columns.contractDuration]);
  const renewalInformation = text(row[columns.renewalInformation]);
  if (contractType) fields.contractType = contractType;
  if (contractDuration) fields.contractDuration = contractDuration;
  if (renewalInformation) fields.renewalInformation = renewalInformation;
  const contractStatusMap: Record<string, ContractStatus> = {
    active: 'Active', current: 'Active', 'expiring soon': 'Expiring Soon', expired: 'Expired',
    renewed: 'Renewed', completed: 'Completed', terminated: 'Terminated', resigned: 'Resigned',
  };
  const contractStatus = contractStatusMap[normalized(row[columns.contractStatus])];
  if (contractStatus) fields.contractStatus = contractStatus;
  const employmentStatusMap: Record<string, EmploymentStatus> = {
    active: 'Active', 'on leave': 'On Leave', completed: 'Completed', terminated: 'Terminated', resigned: 'Resigned',
  };
  const employmentStatus = employmentStatusMap[normalized(row[columns.employmentStatus])];
  if (employmentStatus) fields.employmentStatus = employmentStatus;
  return fields;
}

function parseContractRows(
  sheetName: string,
  rows: unknown[][],
  headerIndex: number,
  employees: EmployeeRecord[],
  sourceName: string,
): { lines: ImportedSpreadsheetLine[]; imported: number; skipped: number } {
  const headers = rows[headerIndex] || [];
  const columns = employeeContractColumns(headers);
  const employeeNames = employees.map((employee) => ({ id: employee.id, name: employee.fullName }));
  const output: ImportedEmployeeLine[] = [];
  const employeesByName = new Map<string, ImportedEmployeeLine>();
  const sourceYear = inferYear(sheetName, rows, sourceName);
  let skipped = 0;
  for (const [offset, row] of rows.slice(headerIndex + 1).entries()) {
    if (!nonEmptyRow(row)) continue;
    const employeeName = text(row[columns.name]).trim();
    if (!isValidPayrollEmployeeName(employeeName)) {
      skipped += 1;
      continue;
    }
    const contractFields = parseEmployeeContractFields(row, columns);
    const gratuityIndex = columnIndex(headers, [/^total gratuity$/, /^gratuity amount$/, /^gratuity$/]);
    const gratuity = gratuityIndex >= 0 ? number(row[gratuityIndex]) : undefined;
    const otherPayrollAmounts: ImportedEmployeeLine['otherPayrollAmounts'] = gratuity && gratuity > 0
      ? [{ type: 'gratuity', amount: gratuity, sourceReference: `${sourceName || sheetName}/${sheetName}/${headerIndex + offset + 2}/gratuity` }]
      : [];
    if (Object.keys(contractFields).length === 0 && otherPayrollAmounts.length === 0) {
      skipped += 1;
      continue;
    }
    const existingLine = employeesByName.get(normalized(employeeName));
    if (existingLine) {
      existingLine.contractFields = { ...existingLine.contractFields, ...contractFields };
      existingLine.otherPayrollAmounts.push(...otherPayrollAmounts);
      continue;
    }
    const nameMatches = matchNameCandidates(employeeName, employeeNames);
    const candidates = nameMatches.exact.length === 1 ? nameMatches.exact : nameMatches.possible.slice(0, 5);
    const status: ImportedEmployeeLine['status'] = nameMatches.exact.length === 1
      ? 'matched'
      : candidates.length > 1 ? 'ambiguous' : 'unmatched';
    const line: ImportedEmployeeLine = {
      kind: 'employee',
      sheet: sheetName,
      row: headerIndex + offset + 2,
      employeeName,
      department: columns.department >= 0 ? text(row[columns.department]) : '',
      positionTitle: contractFields.position,
      sourceYear,
      currentSalary: number(row[columns.salary]) || 0,
      salaryHistory: [],
      otherPayrollAmounts,
      employmentStatus: contractFields.employmentStatus === 'Completed' ? 'Completed' : 'Active',
      contractFields,
      matchCandidates: candidates,
      matchedEmployeeId: nameMatches.exact.length === 1 ? nameMatches.exact[0].id : undefined,
      status,
    };
    employeesByName.set(normalized(employeeName), line);
    output.push(line);
  }
  return { lines: output, imported: output.length, skipped };
}

function parseBudgetRows(
  sheetName: string,
  rows: unknown[][],
  options: { sourceName?: string; programmeId?: string; periodMonth?: number } = {},
): { lines: ImportedSpreadsheetLine[]; imported: number; skipped: number } {
  const headerIndex = headerRowIndex(rows, 'budget-monthly');
  const headers = rows[headerIndex] || [];
  const quantityIndex = columnIndex(headers, [/^qty$/, /quantity/]);
  const costIndex = columnIndex(headers, [/^cost$/, /unit cost/, /cost per item/, /^cost (?:item|each|per)\b/, /price/]);
  const labelIndex = columnIndex(headers, [/description/, /^item$/, /^item name$/, /particulars/, /^name$/]);
  const programmeIndex = columnIndex(headers, [/^programme$/, /^program$/]);
  const frequencyIndex = columnIndex(headers, [/frequency/, /times per/, /occurrences/]);
  const totalIndex = columnIndex(headers, [/^total(?: amount)?$/, /total cost/, /budget amount/]);
  const itemNumberIndex = columnIndex(headers, [/^item\s*(?:no|number|#)$/i, /^no\.?$/i, /^number$/i]);
  const monthColumns = findMonthColumns(headers);
  const year = inferYear(sheetName, rows, options.sourceName || '');
  const reportingHeaderText = `${sheetName} ${rows.slice(0, headerIndex + 1).flat().map(text).join(' ')}`;
  const sourcePeriodMonth = options.periodMonth || monthFromLabel(reportingHeaderText) || monthFromLabel(options.sourceName || '');
  let categorySection = '';
  let programmeLabel = '';
  let lastLabel = '';
  const lines: ImportedSpreadsheetLine[] = [];
  let skipped = 0;

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (!nonEmptyRow(row)) return;
    const sourceRow = headerIndex + offset + 2;
    const rawLabel = text(row[labelIndex >= 0 ? labelIndex : 0]);
    if (/^(?:grand\s*|sub\s*)?total$/i.test(rawLabel)) return;
    if (programmeIndex >= 0 && text(row[programmeIndex])) programmeLabel = text(row[programmeIndex]);
    const unitDetails = labelUnit(rawLabel);
    const parsedQuantity = quantityAndUnit(row[quantityIndex]);
    const embeddedQuantity = rawLabel.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|bars?|teachers?|boxes|box|litres?|liters?|bags?|pieces?|pcs|months?|days?|visits?|students?|girls?)$/i)?.[1];
    const quantity = parsedQuantity.quantity ?? number(embeddedQuantity);
    const unitCost = number(row[costIndex]);
    const frequency = number(row[frequencyIndex]);
    const sourceTotal = number(row[totalIndex]);
    const itemNumber = itemNumberIndex >= 0 ? text(row[itemNumberIndex]) || undefined : undefined;
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
    const overrideProgramme = options.programmeId
      ? PROGRAMMES.find((candidate) => candidate.id === options.programmeId)
      : undefined;
    const programme = overrideProgramme
      ? { id: overrideProgramme.id, label: overrideProgramme.name }
      : (() => {
        const rowProgramme = programmeFrom(programmeLabel, categorySection);
        return rowProgramme.id
          ? rowProgramme
          : programmeFrom(reportingHeaderText, options.sourceName || '');
      })();
    const note = `Original label: ${originalLabel}`;
    const expenseWorkbookWarning = /expense/i.test(options.sourceName || '') && !/actual/i.test(options.sourceName || '')
      ? '; expense workbook filename but this sheet has budget-style amounts; confirm actual spending is separately evidenced'
      : '';
    const unit = text(row[columnIndex(headers, [/^unit$/])]) || parsedQuantity.unit || unitDetails.unit || 'unit';
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
          unit,
          quantity, unitCost, budgetAmount: statedAmount, itemNumber, frequency, period: `${year}-${String(month).padStart(2, '0')}`,
          periodType: 'monthly', month, notes: `${note}${amountNote}${expenseWorkbookWarning}`,
        });
      });
    } else {
      const calculatedAmount = quantity * unitCost * (frequency || 1);
      const budgetAmount = sourceTotal ?? calculatedAmount;
      const amountNote = sourceTotal !== undefined && Math.abs(sourceTotal - calculatedAmount) > 0.01
        ? `; source total MWK ${sourceTotal} differs from quantity × frequency × unit cost MWK ${calculatedAmount}; verify before import${frequency !== undefined && quantity > 1 && Math.abs(sourceTotal - unitCost * frequency) <= 0.01
          ? `. Cost × frequency equals the source total, so the cost looks like a price per pack/lot rather than per ${unit}`
          : ''}`
        : '';
      const frequencyNote = frequency !== undefined ? `; frequency ${frequency}` : '';
      lines.push({
        kind: 'budget', sheet: sheetName, row: sourceRow, programmeId: programme.id,
        programme: programme.label || 'Unassigned - programme review required',
        category: categoryFrom(categorySection || originalLabel), itemDescription: unitDetails.label,
        unit,
        quantity, unitCost, budgetAmount, itemNumber, frequency,
        period: sourcePeriodMonth ? `${year}-${String(sourcePeriodMonth).padStart(2, '0')}` : `Annual ${year}`,
        periodType: sourcePeriodMonth ? 'monthly' : 'annual', month: sourcePeriodMonth,
        notes: `${note}${frequencyNote}${amountNote}${expenseWorkbookWarning}`,
      });
    }
  });
  const itemNumberRows = new Map<string, Set<string>>();
  lines.forEach((line) => {
    if (line.kind !== 'budget' || !line.itemNumber) return;
    const sourceRowKey = `${line.sheet}:${line.row}`;
    const rowsForNumber = itemNumberRows.get(line.itemNumber) || new Set<string>();
    rowsForNumber.add(sourceRowKey);
    itemNumberRows.set(line.itemNumber, rowsForNumber);
  });
  lines.forEach((line) => {
    if (line.kind !== 'budget' || !line.itemNumber || (itemNumberRows.get(line.itemNumber)?.size || 0) < 2) return;
    line.notes += `; duplicate item number ${line.itemNumber} appears more than once in this sheet; verify the source row`;
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
  const priceIndex = columnIndex(headers, [/unit price/, /^price$/, /cost per item/, /cost item/, /rate/]);
  const totalIndex = columnIndex(headers, [/total/, /amount/]);
  const noteIndex = columnIndex(headers, [/notes?/, /remarks?/]);
  if (labelIndex < 0 && itemNumberIndex < 0) return null;

  const items: ImportedProcurementLine['items'] = [];
  let previousDescription = '';
  rows.slice(headerIndex + 1).forEach((row) => {
    if (!nonEmptyRow(row)) return;
    const description = text(row[labelIndex >= 0 ? labelIndex : 0]) || previousDescription;
    const parsedQuantity = quantityAndUnit(row[quantityIndex]);
    const rawQuantity = text(row[quantityIndex]);
    const quantity = parsedQuantity.quantity ?? 1;
    const unitPrice = number(row[priceIndex]);
    const total = number(row[totalIndex]);
    const quantityWarning = rawQuantity && parsedQuantity.quantity === undefined
      ? `Quantity needs review: ${rawQuantity}`
      : '';
    const note = [text(row[noteIndex]), quantityWarning].filter(Boolean).join('; ');
    if (!description || /^(total|grand total)$/i.test(description)) return;
    previousDescription = description;
    items.push({
      description,
      specification: text(row[specIndex]) || undefined,
      quantity,
      unit: text(row[unitIndex]) || parsedQuantity.unit || 'item',
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
  employees: EmployeeRecord[],
  sourceName: string,
): { lines: ImportedSpreadsheetLine[]; imported: number; skipped: number } {
  const headerIndex = rows.slice(0, 10).findIndex((row) => row.some((value) => monthColumn(value)));
  const contractHeaderIndex = rows.slice(0, 15).findIndex((row) => {
    const columns = employeeContractColumns(row);
    return columns.name >= 0 && [columns.position, columns.category, columns.contractStart, columns.contractEnd,
      columns.contractType, columns.contractDuration, columns.contractStatus, columns.employmentStatus,
      columns.renewalInformation].some((index) => index >= 0);
  });
  if (headerIndex < 0 && contractHeaderIndex >= 0) {
    return parseContractRows(sheetName, rows, contractHeaderIndex, employees, sourceName);
  }
  if (headerIndex < 0) {
    const gratuityHeaderIndex = rows.slice(0, 15).findIndex((row) =>
      columnIndex(row, [/name/, /employee/, /staff/, /worker/]) >= 0 &&
      row.some((value) => /gratuity/.test(normalized(value)) && !/(?:salary|rate|percent|month)/.test(normalized(value)))
    );
    if (gratuityHeaderIndex < 0) return { lines: [], imported: 0, skipped: rows.length };

    const headers = rows[gratuityHeaderIndex];
    const nameIndex = columnIndex(headers, [/employee/, /staff/, /worker/, /name/]);
    const amountIndex = headers.findIndex((value) =>
      /gratuity/.test(normalized(value)) && !/(?:salary|rate|percent|month)/.test(normalized(value))
    );
    const departmentIndex = columnIndex(headers, [/department/, /group/, /category/, /team/]);
    const year = inferYear(sheetName, rows, sourceName);
    const employeeNames = employees.map((person) => ({ id: person.id, name: person.fullName }));
    const output: ImportedEmployeeLine[] = [];
    const employeesByName = new Map<string, ImportedEmployeeLine>();
    let currentDepartment = '';
    let skipped = 0;

    rows.slice(gratuityHeaderIndex + 1).forEach((row, offset) => {
      const rowDepartment = departmentIndex >= 0 ? text(row[departmentIndex]) : '';
      if (rowDepartment) currentDepartment = rowDepartment;
      const employeeName = text(row[nameIndex]).split(/\r?\n|;| \| /)[0]?.trim() || '';
      const amount = number(row[amountIndex]);
      if (!employeeName || amount === undefined || amount <= 0) return;
      if (!isValidPayrollEmployeeName(employeeName) || /^(?:total|grand total|subtotal|summary)$/i.test(employeeName)) {
        skipped += 1;
        return;
      }

      const sourceRow = gratuityHeaderIndex + offset + 2;
      const sourceReference = `${sourceName || sheetName}/${sheetName}/${sourceRow}/gratuity`;
      const gratuityAmount = { type: 'gratuity' as const, amount, sourceReference };
      const employeeKey = normalized(employeeName);
      const existingLine = employeesByName.get(employeeKey);
      if (existingLine) {
        existingLine.otherPayrollAmounts.push(gratuityAmount);
        return;
      }

      const nameMatches = matchNameCandidates(employeeName, employeeNames);
      const exact = nameMatches.exact;
      const candidates = exact.length === 1 ? exact : nameMatches.possible.slice(0, 5);
      const status: ImportedEmployeeLine['status'] = exact.length === 1
        ? 'matched'
        : exact.length > 1 || candidates.length > 1
          ? 'ambiguous'
          : 'unmatched';
      const line: ImportedEmployeeLine = {
        kind: 'employee',
        sheet: sheetName,
        row: sourceRow,
        employeeName,
        department: currentDepartment,
        sourceYear: year,
        currentSalary: 0,
        salaryHistory: [],
        otherPayrollAmounts: [gratuityAmount],
        employmentStatus: 'Active',
        matchCandidates: candidates,
        matchedEmployeeId: exact.length === 1 ? exact[0].id : undefined,
        status,
      };
      employeesByName.set(employeeKey, line);
      output.push(line);
    });

    return { lines: output, imported: output.length, skipped };
  }
  const headers = rows[headerIndex];
  const labelledNameIndex = columnIndex(headers, [/employee/, /staff/, /name/, /personnel/]);
  const monthColumns = findMonthColumns(headers);
  const contractColumns = employeeContractColumns(headers);
  const labelledGroupIndex = columnIndex(headers, [/department/, /group/, /team/, /division/]);
  const isCredibleName = (value: unknown) => isValidPayrollEmployeeName(value)
    && !/^(?:bank credit|salary|wages?|farm|mill|house mums?|driver|watchmen?|administration|admistration|teachers?|ministry|grad?uity)$/i.test(text(value));
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
  const employeeNames = employees.map((person) => ({ id: person.id, name: person.fullName }));
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
  const year = inferYear(sheetName, rows, sourceName);
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
    if (!isValidPayrollEmployeeName(name)
      || /^(?:bank credit|salary|wages?|farm|mill|house mums?|driver|watchmen?|administration|admistration|teachers?|ministry|grad?uity)\b/i.test(name)
      || isGratuitySection(currentGroup)) return;
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
    const contractFields = parseEmployeeContractFields(row, contractColumns);
    if (labelledGroupColumn !== undefined && groupLabel) {
      department = groupLabel;
    } else if (isGroupHeading(groupLabel, row)) {
      department = groupLabel;
      if (!rowName) {
        if (monthlyAmounts.length || specialAmounts.length) skipped += 1;
        return;
      }
    }
    const employeeSourceName = rowName;
    if (monthlyAmounts.length === 0 && specialAmounts.length === 0 && Object.keys(contractFields).length === 0) {
      return;
    }
    if (!isValidPayrollEmployeeName(employeeSourceName)
      || /^(?:bank credit|salary|wages?|construction|materials?)\b/i.test(employeeSourceName)) {
      skipped += 1;
      return;
    }
    if (!employeeSourceName || monthlyAmounts.length === 0 && specialAmounts.length === 0 && Object.keys(contractFields).length === 0) {
      skipped += 1;
      return;
    }
    const nameParts = employeeSourceName.split(/\r?\n|;| \| /).map((part) => part.trim()).filter(Boolean);
    const employeeName = nameParts[0];
    if (!isValidPayrollEmployeeName(employeeName)) {
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
      existingEmployeeLine.contractFields = { ...existingEmployeeLine.contractFields, ...contractFields };
      existingEmployeeLine.positionTitle = contractFields.position || existingEmployeeLine.positionTitle;
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
    const nameMatches = matchNameCandidates(employeeName, employeeNames);
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
      positionTitle: contractFields.position || employeeDetails.positionTitle,
      sourceYear: year,
      currentSalary: salaryHistory.at(-1)?.amount || 0,
      salaryHistory,
      otherPayrollAmounts,
      latestSourcePeriod,
      latestWorkbookPaymentPeriod: workbookLatestMonth
        ? `${year}-${String(workbookLatestMonth).padStart(2, '0')}`
        : undefined,
      employmentStatus: hasLatestSalary ? 'Active' : 'Completed',
      contractFields,
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

export async function createSpreadsheetImportPreview(
  workbook: XLSX.WorkBook,
  analysis: SpreadsheetAnalysis,
  kind: SpreadsheetKind,
  employees: EmployeeRecord[] = [],
  sourceName = '',
  mappingProposal?: SpreadsheetAIMappingProposal,
): Promise<SpreadsheetImportPreview> {
  const XLSX = await import('xlsx');
  const sourceWorkbook = mappingProposal
    ? await applySpreadsheetAIMapping(workbook, mappingProposal)
    : workbook;
  const selectedKind = mappingProposal?.kind || kind;
  const lines: ImportedSpreadsheetLine[] = [];
  const procurementGroups: ImportedProcurementLine[] = [];
  const sheetStats = analysis.sheets.map((sheet) => {
    const rawRows = worksheetRows(XLSX, sourceWorkbook.Sheets[sheet.name]);
    let result: { lines: ImportedSpreadsheetLine[]; imported: number; skipped: number };
    const aiSheetMapping = mappingProposal?.sheets.find((candidate) => candidate.name === sheet.name);
    if (mappingProposal && aiSheetMapping && aiSheetMapping.columns.length === 0 && sheet.rowsRead > 0) {
      result = { lines: [], imported: 0, skipped: 0 };
    } else if (selectedKind === 'budget-monthly') {
      result = parseBudgetRows(sheet.name, rawRows, {
        sourceName,
        programmeId: mappingProposal?.programmeId,
        periodMonth: mappingProposal?.periodMonth,
      });
    } else if (selectedKind === 'workplan-matrix') {
      result = parseWorkplanRows(sheet.name, rawRows);
    } else if (selectedKind === 'item-list' || selectedKind === 'back-to-school') {
      const procurement = parseItemListRows(sheet.name, rawRows);
      if (procurement) procurementGroups.push(procurement);
      result = {
        lines: procurement ? [procurement] : [],
        imported: procurement?.items.length || 0,
        skipped: Math.max(0, rawRows.slice(1).filter(nonEmptyRow).length - (procurement?.items.length || 0)),
      };
    } else if (selectedKind === 'profit-loss') {
      const projection = parseProjectionRows(sheet.name, rawRows);
      result = { lines: projection ? [projection] : [], imported: projection ? 1 : 0, skipped: projection ? 0 : 1 };
    } else if (selectedKind === 'payroll-grid') {
      result = parsePayrollRows(sheet.name, rawRows, employees, sourceName);
    } else {
      result = { lines: rawRows.slice(1).filter(nonEmptyRow).map((values, index) => ({
        kind: 'unmapped', sheet: sheet.name, row: index + 2,
        reason: `No importer is configured for detected kind "${selectedKind}" yet`, values,
      })), imported: 0, skipped: rawRows.slice(1).filter(nonEmptyRow).length };
    }
    lines.push(...result.lines);
    return { sheet: sheet.name, rowsRead: sheet.rowsRead, imported: result.imported, skipped: result.skipped };
  });

  if (selectedKind === 'item-list' || selectedKind === 'back-to-school') {
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
  return { kind: selectedKind, lines, sheetStats, formulaDisagreements: formulaDisagreements(analysis), sourceData };
}

export function availableProgrammeOptions(): Array<{ id: ProgrammeId; name: string }> {
  return PROGRAMMES.map(({ id, name }) => ({ id, name }));
}
