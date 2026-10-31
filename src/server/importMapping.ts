import { PROGRAMMES } from '../data/programmes';
import {
  normalizeSample,
  parseMappingResponse,
  type SpreadsheetMapping,
} from '../services/spreadsheetImport/aiMapping';
import { openRouterTextCompletion } from './aiService';

export class SpreadsheetMappingInputError extends Error {}

export interface SpreadsheetMappingResponse {
  success: boolean;
  mapping?: SpreadsheetMapping;
  reason?: string;
  model?: string;
  /** The result is only a suggestion; the import review screen still requires staff confirmation. */
  reviewRequired: true;
}

const PROGRAMME_LIST = PROGRAMMES.map((programme) => `${programme.id} (${programme.name})`).join(', ');

const SYSTEM_PROMPT = `You help a charity's import tool read spreadsheet layouts.
You receive the first rows of one or more worksheets. Each row has its 1-based worksheet row number and its cells in column order (column 0 is A, 1 is B, 2 is C, and so on).

For each worksheet decide whether it holds a budget-style table: one line per item with an item name and a cost or a total. If it does, report where the column headings are and which column holds each field.
Report only row numbers and column numbers. Never copy, calculate or return amounts, names or any other data values.

Reply with ONLY one JSON object and no other text:
{
  "sheets": [
    { "name": "<exact worksheet name>", "role": "budget-table" or "skip", "headerRow": <row number of the column headings>,
      "columns": { "itemNo": <col>, "item": <col>, "quantity": <col>, "unit": <col>, "frequency": <col>, "unitCost": <col>, "total": <col>, "note": <col> } }
  ],
  "programmeId": "<one id from the list below, or null>",
  "period": "<YYYY-MM, or null>",
  "confidence": "high" or "medium" or "low",
  "explanation": "<one short sentence for staff>"
}

Rules:
- Leave out a column key when that column does not exist. Never use one column for two fields.
- "item" is the item description. "quantity" may contain text such as "50kgs" or "lumpsum". "unitCost" is the cost per item or unit. "total" is the line total.
- Set "programmeId" and "period" only when the file name or the text above the table states them (for example a file called "CHILD HOUSE BUDGET NOV 2026" means child-house and 2026-11). Otherwise use null.
- Programme ids: ${PROGRAMME_LIST}.
- Give role "skip" to any worksheet that is not a budget-style table.`;

export async function mapSpreadsheetWithAI(rawSample: unknown): Promise<SpreadsheetMappingResponse> {
  const sample = normalizeSample(rawSample);
  if (!sample) throw new SpreadsheetMappingInputError('A valid spreadsheet sample is required.');
  const { text, model } = await openRouterTextCompletion(SYSTEM_PROMPT, JSON.stringify(sample));
  const parsed = parseMappingResponse(text, sample);
  return { success: parsed.ok, mapping: parsed.mapping, reason: parsed.reason, model, reviewRequired: true };
}
