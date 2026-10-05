import assert from 'node:assert/strict';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { correctImportPreviewText, exactPreviewDuplicateKey } from '../src/services/safeTextCorrections';
import {
  assertFixedReportCanDownload,
  createFixedReport,
  fixedReportFileName,
  type FixedReportInput,
} from '../src/services/qualityFixedReport';

const corrections = correctImportPreviewText({
  summary: '  the girls participated in 4 meetings in September 2026  ',
  originalSnippet: 'mary met 3 staff',
});
assert.equal(corrections.find((entry) => entry.field === 'summary')?.after, 'The girls participated in 4 meetings in September 2026.');
assert.equal(corrections.find((entry) => entry.field === 'originalSnippet')?.after, 'mary met 3 staff.');
assert.equal(correctImportPreviewText({ summary: 'Various people took part' })[0]?.after, 'Various people took part.');
assert.equal(correctImportPreviewText({ summary: '“organization” said it was fine' }).length, 0);
assert.equal(correctImportPreviewText({ summary: 'SEPTMBER' })[0]?.after, 'September');
assert.equal(correctImportPreviewText({ summary: 'the girls participate in drama' })[0]?.after, 'The girls participated in drama.');
assert.equal(correctImportPreviewText({ summary: 'Delivered 3000kg of maize' })[0]?.after, 'Delivered 3000 kg of maize.');
assert.equal(correctImportPreviewText({ summary: 'Staff visited one site – the group participated in drama' })[0]?.after, 'Staff visited one site - the group participated in drama.');
assert.equal(exactPreviewDuplicateKey({
  targetEntity: 'activity', title: 'Workshop', summary: '8 girls attended', extractedData: { id: 'row-one', row: 3 },
}), exactPreviewDuplicateKey({
  targetEntity: 'activity', title: 'Workshop', summary: '8 girls attended', extractedData: { id: 'row-two', row: 4 },
}));
assert.equal(correctImportPreviewText({ summary: 'A long sentence with several clauses, while both halves can be understood clearly' })[0]?.after,
  'A long sentence with several clauses, while both halves can be understood clearly.');

const base: FixedReportInput = {
  title: 'Activity report',
  sections: [{ title: 'Activities', text: 'The girls participated in four sessions.' }],
  changes: [{ section: 'Activities', originalText: 'The girls participated in sessions.', newText: 'The girls participated in four sessions.', by: 'Staff member', at: '2026-10-05T12:00:00.000Z', reason: 'Added the checked count.' }],
  openProblems: [],
  format: 'marked-docx',
  draft: false,
};
assert.equal(fixedReportFileName('activity report.docx', new Date('2026-10-05T12:00:00.000Z')), 'activity report - fixed - 2026-10-05');

const marked = await createFixedReport(base);
const archive = await JSZip.loadAsync(await marked.arrayBuffer());
const documentXml = await archive.file('word/document.xml')?.async('string');
assert.ok(documentXml?.includes('Was: The girls participated in sessions.'));
assert.ok(documentXml?.includes('The girls participated in four sessions.'));

const draft = await createFixedReport({ ...base, format: 'pdf', draft: true, openProblems: [{ severity: 'warning', text: 'One activity needs a count.' }] });
assert.ok(draft.size > 0);

const changesWorkbook = await createFixedReport({ ...base, format: 'xlsx' });
const workbook = XLSX.read(await changesWorkbook.arrayBuffer(), { type: 'array' });
assert.equal(workbook.Sheets.Changes?.['A2']?.v, 'Activities');
assert.equal(workbook.Sheets.Changes?.['F2']?.v, 'Added the checked count.');

assert.throws(() => assertFixedReportCanDownload({
  openProblems: [{ severity: 'blocker', text: 'A required check remains.' }],
  draft: false,
}), /final copy is not available/i);
assert.doesNotThrow(() => assertFixedReportCanDownload({
  openProblems: [{ severity: 'blocker', text: 'A required check remains.' }],
  draft: true,
}));

console.log('Safe correction and fixed-report tests passed.');
