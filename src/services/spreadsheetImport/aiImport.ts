import type * as XLSX from 'xlsx';
import { API_BASE_URL } from '../apiBase';
import type { SpreadsheetAnalysis } from './detector';
import {
  applyMappingToGrids,
  buildSpreadsheetSample,
  inferYearFromText,
  type SpreadsheetMapping,
  type SpreadsheetSample,
} from './aiMapping';
import { formulaDisagreements, type SpreadsheetImportPreview } from './importers';

export interface SheetGrid {
  name: string;
  grid: unknown[][];
}

/** Reads every sheet as a plain grid that keeps true worksheet row numbers (blank rows included). */
export function workbookToGrids(XLSXLib: typeof import('xlsx'), workbook: XLSX.WorkBook): SheetGrid[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const range = XLSXLib.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const grid: unknown[][] = [];
    for (let row = 0; row <= range.e.r; row += 1) {
      const cells: unknown[] = [];
      for (let column = 0; column <= range.e.c; column += 1) {
        const cell = sheet[XLSXLib.utils.encode_cell({ r: row, c: column })];
        cells.push(cell && cell.v !== undefined ? cell.v : '');
      }
      grid.push(cells);
    }
    return { name, grid };
  });
}

export function buildSampleFromGrids(fileName: string, grids: SheetGrid[]): SpreadsheetSample {
  return buildSpreadsheetSample(fileName, grids);
}

/** Turns a validated mapping into the same preview object the wizard already renders. */
export function buildAIPreview(
  grids: SheetGrid[],
  analysis: SpreadsheetAnalysis,
  mapping: SpreadsheetMapping,
  sourceName: string,
  model?: string,
): SpreadsheetImportPreview {
  const identity = `${sourceName} ${analysis.sheets.map((sheet) => sheet.name).join(' ')}`;
  const result = applyMappingToGrids(grids, mapping, {
    fallbackYear: inferYearFromText(identity, new Date().getFullYear()),
  });
  const mappedSheets = new Set(mapping.sheets.map((sheet) => sheet.name));
  const sheetStats = analysis.sheets.map((sheet) => {
    const stat = result.sheetStats.find((candidate) => candidate.sheet === sheet.name);
    return stat || { sheet: sheet.name, rowsRead: sheet.rowsRead, imported: 0, skipped: mappedSheets.has(sheet.name) ? 0 : sheet.rowsRead };
  });
  return {
    kind: 'budget-monthly',
    lines: result.lines,
    sheetStats,
    formulaDisagreements: formulaDisagreements(analysis),
    sourceData: {
      detectedKind: 'budget-monthly',
      mappedByAI: true,
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
    },
    aiMapping: {
      explanation: mapping.explanation,
      confidence: mapping.confidence,
      model,
      programmeId: mapping.programmeId,
      period: mapping.period,
      parsedTotal: result.parsedTotal,
      statedTotal: result.statedTotal,
      warnings: [...mapping.warnings, ...result.warnings],
    },
  };
}

export class AIMappingError extends Error {}

/** Asks the server for a column mapping. Only the redacted sample leaves the browser. */
export async function requestSpreadsheetMapping(
  sample: SpreadsheetSample,
  idToken: string | null,
): Promise<{ mapping: SpreadsheetMapping; model?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/ai/map-spreadsheet`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sample }),
    });
  } catch {
    throw new AIMappingError('Could not reach the AI service. Check your connection, or choose the spreadsheet type manually.');
  }
  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (response.status === 429) {
    throw new AIMappingError('The AI service is busy. Wait a moment and try again, or choose the spreadsheet type manually.');
  }
  if (!response.ok) {
    throw new AIMappingError(String(data.error || 'The AI service could not read this spreadsheet. Choose the type manually instead.'));
  }
  if (!data.success || !data.mapping) {
    throw new AIMappingError(String(data.reason || 'The AI could not map this spreadsheet. Choose the type manually instead.'));
  }
  return { mapping: data.mapping as SpreadsheetMapping, model: typeof data.model === 'string' ? data.model : undefined };
}
