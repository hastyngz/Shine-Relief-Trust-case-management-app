import { auth } from '../../firebase';
import { API_BASE_URL } from '../apiBase';
import {
  SpreadsheetAIRequest,
  SpreadsheetAIMappingProposal,
  SPREADSHEET_AI_LIMITS,
  validateSpreadsheetAIRequest,
  validateSpreadsheetAIMappingProposal,
} from './aiMapping';

export async function requestSpreadsheetAIMapping(
  file: File,
  consentConfirmed: boolean,
): Promise<{ proposal: SpreadsheetAIMappingProposal; provider: string; model?: string }> {
  if (!consentConfirmed) throw new Error('Confirm external AI processing before requesting a mapping.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in again before requesting an AI mapping.');

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellFormula: false,
    cellStyles: false,
    cellText: true,
  });
  if (workbook.SheetNames.length > SPREADSHEET_AI_LIMITS.sheets) {
    throw new Error(`AI mapping supports up to ${SPREADSHEET_AI_LIMITS.sheets} worksheets at a time. Use manual mapping for larger workbooks.`);
  }
  const request: SpreadsheetAIRequest = {
    fileLabel: 'Spreadsheet workbook',
    sheets: workbook.SheetNames.map((name) => {
      const allRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
        header: 1,
        raw: false,
        defval: '',
        blankrows: true,
      });
      return {
        name,
        // Only the first 35 rows / 16 columns are sent. This is not a file upload.
        rows: allRows.slice(0, SPREADSHEET_AI_LIMITS.rowsPerSheet).map((row) =>
          row.slice(0, 16).map((cell) => String(cell ?? '').slice(0, SPREADSHEET_AI_LIMITS.cellCharacters))
        ),
      };
    }).filter((sheet) => sheet.rows.some((row) => row.some((cell) => cell.trim()))),
  };
  const boundedRequest = validateSpreadsheetAIRequest(request);
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/ai/map-spreadsheet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ consentConfirmed: true, ...boundedRequest }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'AI mapping is unavailable.');
  }
  const proposal = validateSpreadsheetAIMappingProposal(payload?.proposal, boundedRequest);
  return {
    proposal,
    provider: typeof payload?.provider === 'string' ? payload.provider.slice(0, 80) : 'External AI provider',
    ...(typeof payload?.model === 'string' ? { model: payload.model.slice(0, 120) } : {}),
  };
}
