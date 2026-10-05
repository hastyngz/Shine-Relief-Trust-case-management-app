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
assert.equal(correctImportPreviewText({ summary: '“organization” said it was fine' })[0]?.after, '"organization" said it was fine.');
assert.equal(correctImportPreviewText({ summary: 'Staff said “organization” was acceptable' })[0]?.after, 'Staff said "organization" was acceptable.');
assert.equal(correctImportPreviewText({ summary: 'SEPTMBER' })[0]?.after, 'September');
assert.equal(correctImportPreviewText({ summary: 'early childhood sessions' })[0]?.after, 'Early Years sessions.');
assert.equal(correctImportPreviewText({ summary: '• Conducting life skills sessions' })[0]?.after, '- Activities included conducting life skills sessions.');
assert.equal(correctImportPreviewText({ summary: '5 September 2026' })[0]?.after, '05 September 2026.');
assert.equal(correctImportPreviewText({ summary: 'September 5, 2026' })[0]?.after, '05 September 2026.');
assert.equal(correctImportPreviewText({ summary: '5/9/2026' }).length, 0);
assert.equal(correctImportPreviewText({ summary: '1,250,000' }).length, 0);
assert.equal(correctImportPreviewText({ summary: 'MWK 1,250,000' }).length, 0);
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
const semicolonLong = 'Staff recorded all the visits and checked the totals against the daily register at every school in the district across several villages during the full reporting period for all activities; managers reviewed each entry and corrected the verified spelling before preparing the report.';
assert.ok(correctImportPreviewText({ summary: semicolonLong })[0]?.after?.includes('. Managers reviewed'));
const longText = 'Staff completed the household visits and recorded the attendance in the register during the monthly reporting period across all communities, while managers reviewed each record and checked that all entries matched the signed source before submitting the monthly report.';
assert.equal(correctImportPreviewText({ summary: longText })[0]?.after,
  'Staff completed the household visits and recorded the attendance in the register during the monthly reporting period across all communities. Managers reviewed each record and checked that all entries matched the signed source before submitting the monthly report.');
assert.equal(correctImportPreviewText({ summary: 'Staff completed the visits, while managers checked the list.' }).length, 0);

const base: FixedReportInput = {
  title: 'Activity report',
  sections: [{
    title: 'Activities',
    text: 'The girls participated in four sessions.',
    table: { headers: ['Activity', 'Count'], rows: [['Life-skills sessions', 4]] },
  }],
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
assert.ok(documentXml?.includes('<w:tbl>'));

const privateCopy = await createFixedReport({
  ...base,
  sections: [
    { title: 'Overview', text: 'Mary Smith attends Hope School.', identifyingValues: ['Mary Smith', 'Hope School'] },
    { title: 'Health follow-ups', text: 'A health note that must not leave the report.', sensitivity: 'health' },
  ],
  identifyingValues: ['Mary Smith', 'Hope School'],
  hideIdentifyingDetails: true,
});
const privateArchive = await JSZip.loadAsync(await privateCopy.arrayBuffer());
const privateXml = await privateArchive.file('word/document.xml')?.async('string');
assert.ok(privateXml?.includes('[hidden]'));
assert.ok(!privateXml?.includes('Mary Smith'));
assert.ok(!privateXml?.includes('Hope School'));
assert.ok(!privateXml?.includes('health note'));

const imageBytes = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/+SAAAAAASUVORK5CYII=',
  'base64',
));
const photoReport = await createFixedReport({
  ...base,
  sections: [{
    title: 'Approved photos',
    text: '',
    images: [{ data: imageBytes, type: 'png', altText: 'Children planting seedlings in the garden', consent: true }],
  }],
});
const photoArchive = await JSZip.loadAsync(await photoReport.arrayBuffer());
const photoXml = await photoArchive.file('word/document.xml')?.async('string');
assert.ok(photoXml?.includes('Children planting seedlings in the garden'));

const draft = await createFixedReport({ ...base, format: 'pdf', draft: true, openProblems: [{ severity: 'warning', text: 'One activity needs a count.' }] });
assert.ok(draft.size > 0);
assert.ok((await draft.text()).includes('DRAFT'));

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
