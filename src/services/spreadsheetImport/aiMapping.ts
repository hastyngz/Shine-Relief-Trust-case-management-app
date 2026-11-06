import type { SpreadsheetKind } from './detector';

export const AI_MAPPABLE_KINDS = [
  'budget-monthly',
  'workplan-matrix',
  'payroll-grid',
  'back-to-school',
  'item-list',
  'profit-loss',
] as const satisfies readonly SpreadsheetKind[];

export const AI_MAPPABLE_FIELDS = [
  'itemNumber', 'description', 'quantity', 'unit', 'unitPrice', 'unitCost',
  'totalAmount', 'notes', 'frequency', 'programme', 'category',
  'keyPriorityArea', 'outcome', 'mainActivity', 'subActivity', 'processActivity',
  'indicator', 'progress', 'employeeName', 'employeeId', 'department', 'position',
  'salary', 'revenue', 'expense',
] as const;

export type SpreadsheetAIField = typeof AI_MAPPABLE_FIELDS[number];

export interface SpreadsheetAIRequest {
  fileLabel: string;
  sheets: Array<{ name: string; headerRow: number; rows: string[][] }>;
}

export interface SpreadsheetAISourceSheet {
  name: string;
  rows: string[][];
}

export interface SyntheticSpreadsheetAIRequest {
  request: SpreadsheetAIRequest;
  originalSheetNames: Map<string, string>;
}

export interface SpreadsheetAIColumnMapping {
  sourceColumn: number;
  field: SpreadsheetAIField;
  confidence: number;
  explanation?: string;
}

export interface SpreadsheetAISheetMapping {
  name: string;
  headerRow: number;
  columns: SpreadsheetAIColumnMapping[];
  warnings: string[];
}

export interface SpreadsheetAIMappingProposal {
  kind: Exclude<SpreadsheetKind, 'unknown'>;
  confidence: number;
  programmeId?: string;
  periodMonth?: number;
  summary: string;
  sheets: SpreadsheetAISheetMapping[];
  warnings: string[];
}

export const SPREADSHEET_AI_LIMITS = {
  sheets: 8,
  rowsPerSheet: 35,
  columnsPerRow: 16,
  cellCharacters: 160,
  totalCharacters: 24_000,
} as const;

const PROGRAMME_IDS = new Set([
  'early-years', 'shine-village', 'bursary', 'child-house', 'relief-family',
  'fish-farming', 'chicken-farming', 'fish-chicken', 'rice-maize-mill', 'tomato-farming',
]);

const SAFE_HEADER_WORDS = new Set([
  'item', 'items', 'no', 'number', 'description', 'particulars', 'specification',
  'qty', 'quantity', 'unit', 'units', 'cost', 'price', 'rate', 'amount', 'total',
  'frequency', 'times', 'note', 'notes', 'remark', 'remarks', 'programme', 'program',
  'category', 'code', 'key', 'priority', 'area', 'outcome', 'main', 'activity',
  'activities', 'sub', 'process', 'indicator', 'progress', 'status', 'employee',
  'employees', 'staff', 'worker', 'personnel', 'name', 'id', 'department', 'position',
  'job', 'title', 'salary', 'wage', 'pay', 'gross', 'net', 'revenue', 'income',
  'expense', 'expenses', 'expenditure', 'profit', 'loss', 'sales', 'child', 'children',
  'learner', 'student', 'girl', 'school', 'supplies', 'uniform', 'book', 'books',
  'budget', 'actual', 'target', 'january', 'february', 'march', 'april', 'may',
  'june', 'july', 'august', 'september', 'sept', 'septmber', 'october', 'november',
  'december', 'subtotal', 'opening', 'closing', 'balance', 'transport', 'travel',
]);

const SYNTHETIC_CELL_VALUES = new Set([
  'SYNTHETIC_TEXT',
  'SYNTHETIC_NUMBER',
  'SYNTHETIC_DATE',
  'SYNTHETIC_BLANK',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeHeaderLabel(value: string, columnIndex: number): string {
  const words = value.normalize('NFKD').toLowerCase().match(/[a-z]+/g) || [];
  if (!words.length || words.length > 8 || words.some((word) => !SAFE_HEADER_WORDS.has(word))) {
    return `Column ${columnIndex + 1}`;
  }
  return words.join(' ');
}

function isSafeHeaderLabel(value: string, columnIndex: number): boolean {
  return value === `Column ${columnIndex + 1}` || safeHeaderLabel(value, columnIndex) === value;
}

function syntheticCellType(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'SYNTHETIC_BLANK';
  if (/^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})$/.test(trimmed)) {
    return 'SYNTHETIC_DATE';
  }
  if (/^[\s(A-Za-z$]*-?[\d,]+(?:\.\d+)?[\s)]*$/.test(trimmed)) return 'SYNTHETIC_NUMBER';
  return 'SYNTHETIC_TEXT';
}

function findHeaderRow(rows: string[][]): number {
  let bestRow = 0;
  let bestScore = 0;
  rows.slice(0, SPREADSHEET_AI_LIMITS.rowsPerSheet - 2).forEach((row, rowIndex) => {
    const score = row.slice(0, 16).reduce((total, cell, columnIndex) => {
      const label = safeHeaderLabel(cell, columnIndex);
      return total + (label === `Column ${columnIndex + 1}` ? 0 : 1);
    }, 0);
    if (score > bestScore || (score > 0 && score === bestScore)) {
      bestScore = score;
      bestRow = rowIndex;
    }
  });
  return bestRow;
}

export function createSyntheticSpreadsheetAIRequest(
  sourceSheets: SpreadsheetAISourceSheet[],
): SyntheticSpreadsheetAIRequest {
  if (!sourceSheets.length || sourceSheets.length > SPREADSHEET_AI_LIMITS.sheets) {
    throw new Error(`Choose a workbook with 1 to ${SPREADSHEET_AI_LIMITS.sheets} sheets for AI mapping.`);
  }
  const originalSheetNames = new Map<string, string>();
  const sheets = sourceSheets.map((source, index) => {
    const alias = `Sheet ${index + 1}`;
    originalSheetNames.set(alias, source.name);
    const sourceRows = source.rows.slice(0, SPREADSHEET_AI_LIMITS.rowsPerSheet - 2)
      .map((row) => row.slice(0, 16));
    const headerRow = findHeaderRow(sourceRows);
    const sourceHeader = sourceRows[headerRow] || [];
    const columnCount = Math.max(1, sourceHeader.length);
    const header = Array.from({ length: columnCount }, (_, columnIndex) =>
      safeHeaderLabel(sourceHeader[columnIndex] || '', columnIndex)
    );
    const types = Array.from({ length: columnCount }, (_, columnIndex) => {
      const counts = new Map<string, number>();
      sourceRows.forEach((row, rowIndex) => {
        if (rowIndex === headerRow || !row[columnIndex]) return;
        const type = syntheticCellType(row[columnIndex]);
        counts.set(type, (counts.get(type) || 0) + 1);
      });
      return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || 'SYNTHETIC_TEXT';
    });
    const rows = [
      ...Array.from({ length: headerRow }, () => [] as string[]),
      header,
      types,
      types,
    ];
    return { name: alias, headerRow, rows };
  });
  return {
    request: { fileLabel: 'Sanitized spreadsheet structure', sheets },
    originalSheetNames,
  };
}

export function restoreSpreadsheetAIMappingSheetNames(
  proposal: SpreadsheetAIMappingProposal,
  originalSheetNames: Map<string, string>,
): SpreadsheetAIMappingProposal {
  return {
    ...proposal,
    sheets: proposal.sheets.map((sheet) => {
      const name = originalSheetNames.get(sheet.name);
      if (!name) throw new Error('The AI mapping returned an unknown worksheet alias.');
      return { ...sheet, name };
    }),
  };
}

export function validateSpreadsheetAIRequest(value: unknown): SpreadsheetAIRequest {
  if (!isRecord(value)) throw new Error('Invalid spreadsheet mapping request.');
  if (value.fileLabel !== 'Sanitized spreadsheet structure') {
    throw new Error('Only sanitized spreadsheet structure may be sent for AI mapping.');
  }
  const fileLabel = value.fileLabel;
  if (!Array.isArray(value.sheets) || value.sheets.length === 0 || value.sheets.length > SPREADSHEET_AI_LIMITS.sheets) {
    throw new Error(`Choose a workbook with 1 to ${SPREADSHEET_AI_LIMITS.sheets} sheets for AI mapping.`);
  }

  let totalCharacters = fileLabel.length;
  const names = new Set<string>();
  const sheets = value.sheets.map((rawSheet) => {
    if (!isRecord(rawSheet) || typeof rawSheet.name !== 'string' || !Array.isArray(rawSheet.rows)) {
      throw new Error('A spreadsheet sheet has an invalid structure.');
    }
    const name = rawSheet.name;
    const rawRows = rawSheet.rows;
    const headerRow = rawSheet.headerRow;
    if (!/^Sheet [1-8]$/.test(name) || names.has(name) ||
      !Number.isInteger(headerRow) || Number(headerRow) < 0 ||
      rawRows.length !== Number(headerRow) + 3 ||
      rawRows.length > SPREADSHEET_AI_LIMITS.rowsPerSheet) {
      throw new Error('A spreadsheet sheet has an invalid name or sample size.');
    }
    names.add(name);
    const rows = rawRows.map((rawRow, rowIndex) => {
      if (!Array.isArray(rawRow) || rawRow.length > SPREADSHEET_AI_LIMITS.columnsPerRow) {
        throw new Error('A spreadsheet sample row has too many columns.');
      }
      const row = rawRow.map((rawCell, columnIndex) => {
        if (typeof rawCell !== 'string') throw new Error('Spreadsheet sample cells must be text.');
        const cell = rawCell;
        totalCharacters += cell.length;
        if (cell.length > SPREADSHEET_AI_LIMITS.cellCharacters) {
          throw new Error('A sanitized spreadsheet cell exceeds the allowed size.');
        }
        return cell;
      });
      if (rowIndex < Number(headerRow) && row.length !== 0) {
        throw new Error('Only sanitized worksheet headers and generated sample rows may be sent for AI mapping.');
      }
      if (rowIndex === Number(headerRow) &&
        (!row.length || row.some((cell, columnIndex) => !isSafeHeaderLabel(cell, columnIndex)))) {
        throw new Error('The spreadsheet header contains unsupported or sensitive text.');
      }
      if (rowIndex > Number(headerRow)) {
        const header = rawRows[Number(headerRow)] as unknown[];
        if (row.length !== header.length || row.some((cell) => !SYNTHETIC_CELL_VALUES.has(cell))) {
          throw new Error('Only generated synthetic cell examples may be sent for AI mapping.');
        }
      }
      return row;
    });
    return { name, headerRow: Number(headerRow), rows };
  });
  if (totalCharacters > SPREADSHEET_AI_LIMITS.totalCharacters) {
    throw new Error(`The sampled spreadsheet structure is too large (maximum ${SPREADSHEET_AI_LIMITS.totalCharacters} characters).`);
  }
  return { fileLabel, sheets };
}

export function validateSpreadsheetAIMappingProposal(
  value: unknown,
  request: SpreadsheetAIRequest,
): SpreadsheetAIMappingProposal {
  if (!isRecord(value) || !AI_MAPPABLE_KINDS.includes(value.kind as any)) {
    throw new Error('The AI returned an unsupported spreadsheet type.');
  }
  const confidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence)
    ? Math.min(1, Math.max(0, value.confidence)) : 0;
  const summary = typeof value.summary === 'string' ? value.summary.trim().slice(0, 300) : '';
  if (!summary || !Array.isArray(value.sheets)) throw new Error('The AI mapping response is incomplete.');

  const inputByName = new Map(request.sheets.map((sheet) => [sheet.name, sheet]));
  const usedNames = new Set<string>();
  const sheets: SpreadsheetAISheetMapping[] = value.sheets.slice(0, SPREADSHEET_AI_LIMITS.sheets).map((rawSheet) => {
    if (!isRecord(rawSheet) || typeof rawSheet.name !== 'string') throw new Error('The AI returned an invalid sheet mapping.');
    const input = inputByName.get(rawSheet.name);
    const headerRow = rawSheet.headerRow;
    if (!input || usedNames.has(rawSheet.name) || !Number.isInteger(headerRow) ||
      Number(headerRow) !== input.headerRow || Number(headerRow) >= input.rows.length) {
      throw new Error('The AI mapping refers to a sheet or header row that was not sampled.');
    }
    usedNames.add(rawSheet.name);
    const sourceHeader = input.rows[Number(headerRow)] || [];
    if (!Array.isArray(rawSheet.columns) || rawSheet.columns.length > 24) throw new Error('The AI returned too many column mappings.');
    const fields = new Set<string>();
    const indices = new Set<number>();
    const columns: SpreadsheetAIColumnMapping[] = rawSheet.columns.map((rawColumn) => {
      if (!isRecord(rawColumn) || !Number.isInteger(rawColumn.sourceColumn) ||
        Number(rawColumn.sourceColumn) < 0 || Number(rawColumn.sourceColumn) >= sourceHeader.length ||
        !AI_MAPPABLE_FIELDS.includes(rawColumn.field as any)) {
        throw new Error('The AI returned an unsupported column mapping.');
      }
      const sourceColumn = Number(rawColumn.sourceColumn);
      const field = rawColumn.field as SpreadsheetAIField;
      if (indices.has(sourceColumn) || fields.has(field)) throw new Error('The AI returned duplicate column mappings.');
      indices.add(sourceColumn);
      fields.add(field);
      const rawConfidence = rawColumn.confidence;
      return {
        sourceColumn,
        field,
        confidence: typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
          ? Math.min(1, Math.max(0, rawConfidence)) : 0,
        ...(typeof rawColumn.explanation === 'string' ? { explanation: rawColumn.explanation.trim().slice(0, 180) } : {}),
      };
    });
    const warnings = Array.isArray(rawSheet.warnings)
      ? rawSheet.warnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 6).map((warning) => warning.trim().slice(0, 200))
      : [];
    return { name: rawSheet.name, headerRow: Number(headerRow), columns, warnings };
  });
  if (usedNames.size !== inputByName.size) {
    throw new Error('The AI response did not account for every sampled worksheet.');
  }

  const programmeId = value.kind === 'budget-monthly' && typeof value.programmeId === 'string' && PROGRAMME_IDS.has(value.programmeId)
    ? value.programmeId : undefined;
  const periodMonth = value.kind === 'budget-monthly' && Number.isInteger(value.periodMonth) && Number(value.periodMonth) >= 1 && Number(value.periodMonth) <= 12
    ? Number(value.periodMonth) : undefined;
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 8).map((warning) => warning.trim().slice(0, 200))
    : [];
  return {
    kind: value.kind as SpreadsheetAIMappingProposal['kind'], confidence, summary, sheets, warnings,
    ...(programmeId ? { programmeId } : {}), ...(periodMonth ? { periodMonth } : {}),
  };
}
