/**
 * AI-assisted spreadsheet layout mapping.
 *
 * The AI only answers "which column is which?" for a budget-style table. It never reads
 * or returns amounts: every number, label and total is read from the workbook by the
 * deterministic code in this file. The AI's answer is validated before use, and the result
 * still goes through the normal import review screen.
 *
 * This module has no browser, Firebase or xlsx dependency so it can run in the browser,
 * the Express server and the Cloudflare Worker, and be unit tested directly.
 */
import { PROGRAMMES } from '../../data/programmes';
import type { ProgrammeId } from '../../data/programmes';
import type { BudgetCategory } from '../../types';
import type { ImportedBudgetLine, ImportedUnmappedLine } from './importers';

export const AI_SAMPLE_LIMITS = {
  maxSheets: 6,
  maxRows: 25,
  maxColumns: 20,
  maxCellChars: 80,
  maxNameChars: 160,
} as const;

export type MappableColumn = 'itemNo' | 'item' | 'quantity' | 'unit' | 'frequency' | 'unitCost' | 'total' | 'note';
export const MAPPABLE_COLUMNS: readonly MappableColumn[] = [
  'itemNo', 'item', 'quantity', 'unit', 'frequency', 'unitCost', 'total', 'note',
];

export interface SampleRow {
  /** 1-based row number in the worksheet. */
  row: number;
  cells: string[];
}

export interface SampleSheet {
  name: string;
  totalRows: number;
  totalColumns: number;
  rows: SampleRow[];
}

export interface SpreadsheetSample {
  fileName: string;
  sheets: SampleSheet[];
}

export interface SheetMapping {
  name: string;
  role: 'budget-table';
  /** 1-based worksheet row holding the column headings. */
  headerRow: number;
  /** 0-based column indexes (A = 0). */
  columns: Partial<Record<MappableColumn, number>>;
}

export interface SpreadsheetMapping {
  sheets: SheetMapping[];
  programmeId?: ProgrammeId;
  /** YYYY-MM, only kept when the file name or headings corroborate it. */
  period?: string;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  warnings: string[];
}

export interface ParsedMappingResult {
  ok: boolean;
  mapping?: SpreadsheetMapping;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Sample building and privacy redaction
// ---------------------------------------------------------------------------

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Removes e-mail addresses and phone/ID-length digit runs, and truncates long text, so a
 * sample sent to the AI provider carries layout information rather than personal contact data.
 */
export function redactCellText(value: unknown, maxChars: number = AI_SAMPLE_LIMITS.maxCellChars): string {
  let text = clean(value);
  text = text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]');
  text = text.replace(/\+?\d[\d\s().-]{6,}\d/g, (match) => (match.replace(/\D/g, '').length >= 8 ? '[number]' : match));
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function rowHasContent(cells: unknown[]): boolean {
  return cells.some((cell) => clean(cell) !== '');
}

function lastFilledColumn(cells: unknown[]): number {
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    if (clean(cells[index]) !== '') return index + 1;
  }
  return 0;
}

export function buildSpreadsheetSample(
  fileName: string,
  grids: Array<{ name: string; grid: unknown[][] }>,
): SpreadsheetSample {
  const sheets = grids.slice(0, AI_SAMPLE_LIMITS.maxSheets).map(({ name, grid }) => {
    const rows: SampleRow[] = [];
    let totalColumns = 0;
    let totalRows = 0;
    grid.forEach((cells) => {
      if (!rowHasContent(cells)) return;
      totalRows += 1;
      totalColumns = Math.max(totalColumns, lastFilledColumn(cells));
    });
    for (let index = 0; index < grid.length && rows.length < AI_SAMPLE_LIMITS.maxRows; index += 1) {
      if (!rowHasContent(grid[index])) continue;
      const cells = grid[index].slice(0, AI_SAMPLE_LIMITS.maxColumns).map((cell) => redactCellText(cell));
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
      rows.push({ row: index + 1, cells });
    }
    return {
      name: redactCellText(name, AI_SAMPLE_LIMITS.maxNameChars),
      totalRows,
      totalColumns,
      rows,
    };
  });
  return { fileName: redactCellText(fileName, AI_SAMPLE_LIMITS.maxNameChars), sheets };
}

/** Validates and re-redacts a sample received from a client. Returns null when it is malformed. */
export function normalizeSample(raw: unknown): SpreadsheetSample | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.fileName !== 'string' || !Array.isArray(source.sheets)) return null;
  if (source.sheets.length === 0 || source.sheets.length > AI_SAMPLE_LIMITS.maxSheets) return null;
  const sheets: SampleSheet[] = [];
  for (const sheet of source.sheets as unknown[]) {
    if (!sheet || typeof sheet !== 'object') return null;
    const entry = sheet as Record<string, unknown>;
    if (typeof entry.name !== 'string' || !Array.isArray(entry.rows) || entry.rows.length > AI_SAMPLE_LIMITS.maxRows) return null;
    const totalColumns = Number(entry.totalColumns);
    const totalRows = Number(entry.totalRows);
    if (!Number.isInteger(totalColumns) || totalColumns < 0 || totalColumns > 1000) return null;
    if (!Number.isInteger(totalRows) || totalRows < 0 || totalRows > 1_000_000) return null;
    const rows: SampleRow[] = [];
    for (const row of entry.rows as unknown[]) {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      const rowNumber = Number(item.row);
      if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 1_000_000) return null;
      if (!Array.isArray(item.cells) || item.cells.length > AI_SAMPLE_LIMITS.maxColumns) return null;
      if (item.cells.some((cell) => typeof cell !== 'string')) return null;
      rows.push({ row: rowNumber, cells: (item.cells as string[]).map((cell) => redactCellText(cell)) });
    }
    sheets.push({ name: redactCellText(entry.name, AI_SAMPLE_LIMITS.maxNameChars), totalRows, totalColumns, rows });
  }
  return { fileName: redactCellText(source.fileName, AI_SAMPLE_LIMITS.maxNameChars), sheets };
}

// ---------------------------------------------------------------------------
// Corroborating what the AI claims about programme and period
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const PROGRAMME_HINTS: Record<ProgrammeId, RegExp> = {
  'early-years': /early\s*years|early\s*childhood/,
  'shine-village': /shine\s*village/,
  bursary: /bursary/,
  'child-house': /child(?:ren)?(?:'s|s)?\s*(?:house|home)/,
  'relief-family': /relief|family\s*preservation/,
  'fish-farming': /fish/,
  'chicken-farming': /chicken|poultry/,
  'fish-chicken': /fish[\s\S]*chicken|chicken[\s\S]*fish/,
  'rice-maize-mill': /maize\s*mill|rice\s*mill|maize\s*&\s*rice|maize\s*and\s*rice/,
  'tomato-farming': /tomato\s*farm/,
};

/** Text that identifies the document: file name, sheet names and anything above/at the header row. */
function identityText(sample: SpreadsheetSample, sheets: SheetMapping[]): string {
  const parts = [sample.fileName];
  for (const sheet of sample.sheets) {
    parts.push(sheet.name);
    const mapping = sheets.find((candidate) => candidate.name === sheet.name);
    if (!mapping) continue;
    sheet.rows.filter((row) => row.row <= mapping.headerRow).forEach((row) => parts.push(row.cells.join(' ')));
  }
  return parts.join(' ').toLowerCase();
}

function monthMentioned(month: number, text: string): boolean {
  const full = MONTH_NAMES[month - 1];
  return text.split(/[^a-z]+/).some((token) =>
    token.length >= 3 && (full.startsWith(token) || (month === 9 && token === 'sept')));
}

export function inferYearFromText(text: string, fallback: number): number {
  const match = text.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : fallback;
}

// ---------------------------------------------------------------------------
// Parsing the AI's reply
// ---------------------------------------------------------------------------

function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseMappingResponse(text: string, sample: SpreadsheetSample): ParsedMappingResult {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'The AI reply could not be understood. Choose the spreadsheet type manually instead.' };
  }
  const reply = parsed as Record<string, unknown>;
  const warnings: string[] = [];
  const sheets: SheetMapping[] = [];

  for (const entry of Array.isArray(reply.sheets) ? reply.sheets as unknown[] : []) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const sampleSheet = sample.sheets.find((sheet) => sheet.name === candidate.name);
    if (!sampleSheet || candidate.role !== 'budget-table') continue;

    const headerRow = Number(candidate.headerRow);
    if (!Number.isInteger(headerRow) || !sampleSheet.rows.some((row) => row.row === headerRow)) {
      warnings.push(`Sheet "${sampleSheet.name}": the AI pointed to a heading row that does not exist, so the sheet was skipped.`);
      continue;
    }

    const limit = Math.min(sampleSheet.totalColumns, AI_SAMPLE_LIMITS.maxColumns);
    const columns: Partial<Record<MappableColumn, number>> = {};
    const used = new Set<number>();
    let valid = true;
    const rawColumns = candidate.columns && typeof candidate.columns === 'object'
      ? candidate.columns as Record<string, unknown>
      : {};
    for (const key of MAPPABLE_COLUMNS) {
      const value = rawColumns[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= limit || used.has(value)) {
        warnings.push(`Sheet "${sampleSheet.name}": the AI's "${key}" column was not a valid, unused column, so the sheet was skipped.`);
        valid = false;
        break;
      }
      used.add(value);
      columns[key] = value;
    }
    if (!valid) continue;
    if (columns.item === undefined || (columns.total === undefined && columns.unitCost === undefined)) {
      warnings.push(`Sheet "${sampleSheet.name}": an item column and either a cost or total column are needed, so the sheet was skipped.`);
      continue;
    }
    sheets.push({ name: sampleSheet.name, role: 'budget-table', headerRow, columns });
  }

  if (sheets.length === 0) {
    const explanation = typeof reply.explanation === 'string' ? clean(reply.explanation).slice(0, 300) : '';
    return {
      ok: false,
      reason: `${explanation ? `${explanation} ` : ''}The AI did not find a budget-style table it could map. Choose the spreadsheet type manually instead.`.trim(),
    };
  }

  const identity = identityText(sample, sheets);

  let programmeId: ProgrammeId | undefined;
  const claimedProgramme = PROGRAMMES.find((programme) => programme.id === reply.programmeId);
  if (claimedProgramme) {
    if (PROGRAMME_HINTS[claimedProgramme.id].test(identity)) {
      programmeId = claimedProgramme.id;
    } else {
      warnings.push(`The AI suggested ${claimedProgramme.name}, but that programme is not named in the file name or headings, so choose the programme during review.`);
    }
  }

  let period: string | undefined;
  if (typeof reply.period === 'string') {
    const match = reply.period.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (match) {
      const yearPresent = new RegExp(`(^|\\D)${match[1]}(\\D|$)`).test(identity);
      if (yearPresent && monthMentioned(Number(match[2]), identity)) {
        period = reply.period;
      } else {
        warnings.push(`The AI suggested ${reply.period}, but that month and year are not both in the file name or headings, so the period was not applied.`);
      }
    }
  }

  const confidence = reply.confidence === 'high' || reply.confidence === 'medium' ? reply.confidence : 'low';
  const explanation = typeof reply.explanation === 'string' ? clean(reply.explanation).slice(0, 300) : '';
  return { ok: true, mapping: { sheets, programmeId, period, confidence, explanation, warnings } };
}

// ---------------------------------------------------------------------------
// Deterministic reading of every row using the validated mapping
// ---------------------------------------------------------------------------

export function parseAmount(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const match = clean(value).match(/^(?:MWK|MK)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:MWK|MK)?$/i);
  if (!match) return undefined;
  const result = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(result) ? result : undefined;
}

const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  l: 'litres', lt: 'litres', ltr: 'litres', ltrs: 'litres', litre: 'litres', litres: 'litres', liter: 'litres', liters: 'litres',
  bar: 'bars', bars: 'bars',
};

function normalizeUnit(raw: string): string {
  const unit = raw.trim().toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[unit] || unit;
}

export interface ParsedQuantity {
  quantity: number;
  unit?: string;
  note?: string;
}

/** Reads "50kgs", "10 bars", "1tray", "lampsome" or a plain number. */
export function parseQuantity(value: unknown): ParsedQuantity {
  if (typeof value === 'number' && Number.isFinite(value)) return { quantity: value };
  const text = clean(value).toLowerCase();
  if (!text) return { quantity: 1 };
  if (/^(?:lump\s*-?\s*sum|lumpsum|lampsome|lampsum|lumpsome)$/.test(text)) return { quantity: 1, unit: 'lump sum' };
  const match = text.match(/^(\d+(?:[.,]\d+)*)\s*([a-z][a-z .\/-]*)?$/);
  if (match) {
    const numeric = /^\d{1,3}(?:,\d{3})+$/.test(match[1]) ? match[1].replace(/,/g, '') : match[1].replace(',', '.');
    const quantity = Number(numeric);
    if (Number.isFinite(quantity) && quantity > 0) {
      return { quantity, unit: match[2] ? normalizeUnit(match[2]) : undefined };
    }
  }
  return { quantity: 1, note: `Quantity "${clean(value)}" was not understood and was set to 1` };
}

function categoryForItem(label: string, section = ''): BudgetCategory {
  const text = `${section} ${label}`.toLowerCase();
  const rules: Array<[RegExp, BudgetCategory]> = [
    [/electric|\bwater\b|power|airtime|internet|charcoal|firewood|\bgas\b/, 'Utilities'],
    [/transport|fuel|diesel|petrol|bus fare/, 'Transport'],
    [/medic|drug|clinic|hospital|health/, 'Health/medical'],
    [/school|fees|uniform|exercise book|stationer/, 'Education'],
    [/soap|surf|detergent|toothpaste|lotion|glycerine|vaseline|\bpads?\b|tissue|toilet|bleach|jik|broom|mop|sanitary/, 'Household supplies'],
    [/ufa|maize|flour|rice|oil|sugar|salt|soya|egg|bean|bonya|vegetable|tomato|onion|meat|fish|milk|bread|cabbage|groundnut|food|meal|grocer/, 'Food'],
    [/repair|maintenan|plumb|lock|paint/, 'Repairs/maintenance'],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || 'Other';
}

export interface ApplyOptions {
  fallbackYear: number;
}

export interface MappedSheetStat {
  sheet: string;
  rowsRead: number;
  imported: number;
  skipped: number;
}

export interface ApplyResult {
  lines: Array<ImportedBudgetLine | ImportedUnmappedLine>;
  sheetStats: MappedSheetStat[];
  warnings: string[];
  parsedTotal: number;
  statedTotal?: number;
}

const money = (value: number) => value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
const close = (a: number, b: number) => Math.abs(a - b) <= 0.5;

export function applyMappingToGrids(
  grids: Array<{ name: string; grid: unknown[][] }>,
  mapping: SpreadsheetMapping,
  options: ApplyOptions,
): ApplyResult {
  const lines: ApplyResult['lines'] = [];
  const sheetStats: MappedSheetStat[] = [];
  const warnings: string[] = [];
  let parsedTotal = 0;
  let statedTotal: number | undefined;
  const programme = PROGRAMMES.find((candidate) => candidate.id === mapping.programmeId);
  const periodMonth = mapping.period ? Number(mapping.period.slice(5)) : undefined;

  for (const sheetMapping of mapping.sheets) {
    const source = grids.find((grid) => grid.name === sheetMapping.name);
    if (!source) continue;
    const { columns } = sheetMapping;
    const cell = (row: unknown[], key: MappableColumn) => (columns[key] === undefined ? undefined : row[columns[key] as number]);
    const stat: MappedSheetStat = {
      sheet: sheetMapping.name,
      rowsRead: source.grid.filter(rowHasContent).length,
      imported: 0,
      skipped: 0,
    };
    const itemNumberRows = new Map<string, number[]>();
    let section = '';

    for (let index = sheetMapping.headerRow; index < source.grid.length; index += 1) {
      const row = source.grid[index];
      if (!rowHasContent(row)) continue;
      const sourceRow = index + 1;
      const label = clean(cell(row, 'item'));
      const itemNumber = clean(cell(row, 'itemNo'));
      const total = parseAmount(cell(row, 'total'));
      const unitCost = parseAmount(cell(row, 'unitCost'));
      const hasQuantityText = clean(cell(row, 'quantity')) !== '';

      if (/^(?:grand\s+|sub\s*-?\s*)?total\b/i.test(label)
        || (!label && !itemNumber && total !== undefined && unitCost === undefined && !hasQuantityText)) {
        if (total !== undefined && /^(?:grand\s+)?total\b|^$/i.test(label)) statedTotal = total;
        continue;
      }
      if (!label) {
        stat.skipped += 1;
        lines.push({ kind: 'unmapped', sheet: sheetMapping.name, row: sourceRow, reason: 'This row has amounts but no item name', values: row });
        continue;
      }
      if (total === undefined && unitCost === undefined) {
        section = label;
        continue;
      }

      const parsedQuantity = parseQuantity(cell(row, 'quantity'));
      const unitText = clean(cell(row, 'unit'));
      const quantity = parsedQuantity.quantity;
      const unit = unitText ? normalizeUnit(unitText) : parsedQuantity.unit || 'unit';
      const rawFrequency = columns.frequency === undefined ? undefined : parseAmount(cell(row, 'frequency'));
      const frequency = rawFrequency !== undefined && rawFrequency > 0 ? rawFrequency : 1;
      const notes = [`Original label: ${label}`];
      if (itemNumber) notes.push(`Item no. ${itemNumber}`);
      if (frequency !== 1) notes.push(`Frequency ${frequency}`);
      if (parsedQuantity.note) notes.push(parsedQuantity.note);
      const extraNote = clean(cell(row, 'note'));
      if (extraNote) notes.push(`Note: ${extraNote}`);

      let budgetAmount: number;
      let costPerItem: number;
      let amountBasis: 'stated-total' | 'calculated';
      if (total !== undefined) {
        budgetAmount = total;
        amountBasis = 'stated-total';
        if (unitCost !== undefined) {
          costPerItem = unitCost;
          const byFrequency = unitCost * frequency;
          const byQuantity = unitCost * quantity * frequency;
          if (!close(total, byFrequency) && !close(total, byQuantity)) {
            const message = `Check amount: stated total MWK ${money(total)}, but cost × frequency = MWK ${money(byFrequency)} and quantity × cost × frequency = MWK ${money(byQuantity)}`;
            notes.push(message);
            warnings.push(`Row ${sourceRow} (${label}): ${message.replace('Check amount: ', '')}`);
          }
        } else {
          costPerItem = Math.round((total / (quantity * frequency)) * 100) / 100;
          notes.push('Unit cost derived from the stated total');
        }
      } else {
        costPerItem = unitCost as number;
        budgetAmount = costPerItem * quantity * frequency;
        amountBasis = 'calculated';
        notes.push('No total column value; amount calculated as quantity × cost × frequency');
      }

      if (itemNumber) itemNumberRows.set(itemNumber, [...(itemNumberRows.get(itemNumber) || []), sourceRow]);
      parsedTotal += budgetAmount;
      stat.imported += 1;
      lines.push({
        kind: 'budget',
        sheet: sheetMapping.name,
        row: sourceRow,
        programmeId: programme?.id,
        programme: programme?.name || 'Unassigned - programme review required',
        category: categoryForItem(label, section),
        itemDescription: label,
        unit,
        quantity,
        unitCost: costPerItem,
        budgetAmount,
        period: periodMonth ? (mapping.period as string) : `Annual ${options.fallbackYear}`,
        periodType: periodMonth ? 'monthly' : 'annual',
        month: periodMonth,
        notes: notes.join(' · '),
        frequency,
        amountBasis,
      });
    }

    itemNumberRows.forEach((rowNumbers, itemNumber) => {
      if (rowNumbers.length > 1) {
        warnings.push(`Item number ${itemNumber} is used more than once (rows ${rowNumbers.join(' and ')}). All of those rows were kept.`);
      }
    });
    sheetStats.push(stat);
  }

  if (statedTotal !== undefined && !close(statedTotal, parsedTotal)) {
    warnings.push(`The rows add up to MWK ${money(parsedTotal)}, but the sheet's total line says MWK ${money(statedTotal)}.`);
  }
  return { lines, sheetStats, warnings, parsedTotal, statedTotal };
}
