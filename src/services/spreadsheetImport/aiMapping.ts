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
  sheets: Array<{ name: string; rows: string[][] }>;
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
  columnsPerRow: 32,
  cellCharacters: 160,
  totalCharacters: 24_000,
} as const;

const PROGRAMME_IDS = new Set([
  'early-years', 'shine-village', 'bursary', 'child-house', 'relief-family',
  'fish-farming', 'chicken-farming', 'fish-chicken', 'rice-maize-mill', 'tomato-farming',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateSpreadsheetAIRequest(value: unknown): SpreadsheetAIRequest {
  if (!isRecord(value)) throw new Error('Invalid spreadsheet mapping request.');
  const fileLabel = typeof value.fileLabel === 'string' ? value.fileLabel.trim().slice(0, 160) : '';
  if (!Array.isArray(value.sheets) || value.sheets.length === 0 || value.sheets.length > SPREADSHEET_AI_LIMITS.sheets) {
    throw new Error(`Choose a workbook with 1 to ${SPREADSHEET_AI_LIMITS.sheets} sheets for AI mapping.`);
  }

  let totalCharacters = fileLabel.length;
  const names = new Set<string>();
  const sheets = value.sheets.map((rawSheet) => {
    if (!isRecord(rawSheet) || typeof rawSheet.name !== 'string' || !Array.isArray(rawSheet.rows)) {
      throw new Error('A spreadsheet sheet has an invalid structure.');
    }
    const name = rawSheet.name.trim().slice(0, 100);
    if (!name || names.has(name) || rawSheet.rows.length === 0 || rawSheet.rows.length > SPREADSHEET_AI_LIMITS.rowsPerSheet) {
      throw new Error('A spreadsheet sheet has an invalid name or sample size.');
    }
    names.add(name);
    const rows = rawSheet.rows.map((rawRow) => {
      if (!Array.isArray(rawRow) || rawRow.length > SPREADSHEET_AI_LIMITS.columnsPerRow) {
        throw new Error('A spreadsheet sample row has too many columns.');
      }
      return rawRow.map((rawCell) => {
        if (typeof rawCell !== 'string') throw new Error('Spreadsheet sample cells must be text.');
        const cell = rawCell.slice(0, SPREADSHEET_AI_LIMITS.cellCharacters);
        totalCharacters += cell.length;
        return cell;
      });
    });
    return { name, rows };
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
    if (!input || usedNames.has(rawSheet.name) || !Number.isInteger(headerRow) || Number(headerRow) < 0 || Number(headerRow) >= input.rows.length) {
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
