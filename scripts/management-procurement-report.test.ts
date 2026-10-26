import assert from 'node:assert/strict';
import type { ProcurementList } from '../src/types';
import {
  buildProcurementOperationsCsv,
  buildProcurementOperationsDocument,
  buildProcurementOperationsReport,
  PROCUREMENT_REPORT_CLASSIFICATION,
  PROCUREMENT_OPERATIONS_REPORT_TYPE,
} from '../src/services/managementProcurementReport';

const makeList = (overrides: Partial<ProcurementList> = {}): ProcurementList => ({
  id: 'synthetic-list',
  title: 'Synthetic list',
  purpose: 'Synthetic test only',
  items: [],
  totalMWK: 0,
  status: 'draft',
  createdAt: '2026-01-10T00:00:00.000Z',
  updatedAt: '2026-01-10T00:00:00.000Z',
  createdBy: 'synthetic-user',
  updatedBy: 'synthetic-user',
  ...overrides,
});

const withinRange = makeList({
  id: 'within-range',
  programmeId: 'fish-farming',
  status: 'approved',
  totalMWK: 600_000,
  approvedAt: '2026-01-12T12:00:00.000Z',
  items: [{
    description: 'Synthetic item A', quantity: 2, unit: 'box', unitPriceMWK: 300_000, totalMWK: 600_000,
    priceStatus: 'quoted', quoteRequirementReason: 'threshold',
    quotes: [
      { supplier: 'Supplier A', amountMWK: 300_000 },
      { supplier: 'Supplier A', amountMWK: 305_000 },
      { supplier: 'Supplier B', amountMWK: 299_000 },
    ],
    selectedQuoteSupplier: 'Supplier Z', selectedQuoteAmountMWK: 300_000,
  }],
});
const discrepancy = makeList({
  id: 'discrepancy',
  programmeId: 'fish-farming',
  status: 'purchased',
  totalMWK: 500,
  createdAt: '2026-01-20T00:00:00.000Z',
  orderedAt: '2026-01-21T00:00:00.000Z',
  purchaseOrderReference: 'SYNTHETIC-PO',
  items: [{ description: 'Synthetic item B', quantity: 2, unit: 'unit', unitPriceMWK: 300, totalMWK: 600, priceStatus: 'quoted' }],
});
const missingDate = makeList({
  id: 'missing-date',
  programmeId: 'unregistered-programme' as never,
  createdAt: 'not-a-date',
  items: [{ description: 'Synthetic item C', quantity: 1, unit: 'unit', priceStatus: 'missing' }],
});

const sourceFixtures = [withinRange, discrepancy, missingDate];
const sourceSnapshot = JSON.stringify(sourceFixtures);
const report = buildProcurementOperationsReport(sourceFixtures, {
  dateBasis: 'createdAt', startDate: '2026-01-01', endDate: '2026-01-15',
});
assert.equal(JSON.stringify(sourceFixtures), sourceSnapshot);
assert.equal(PROCUREMENT_OPERATIONS_REPORT_TYPE, 'management-procurement');
assert.ok(PROCUREMENT_REPORT_CLASSIFICATION.includes('INTERNAL'));
assert.equal(report.counts.selectedListCount, 1);
assert.equal(report.counts.missingDateCount, 1);
assert.equal(report.counts.varianceListCount, 0);
assert.ok(!JSON.stringify(report).includes('Synthetic item A'));
assert.ok(!JSON.stringify(report).includes('Supplier A'));
assert.ok(!JSON.stringify(report).includes('unregistered-programme'));
assert.ok(report.rows.some((row) => row[1] === 'Lists missing the selected milestone date' && row[2] === 1));

const allDates = buildProcurementOperationsReport([withinRange, discrepancy, missingDate], { dateBasis: 'createdAt' });
assert.equal(allDates.counts.selectedListCount, 3);
assert.equal(allDates.counts.missingDateCount, 1);
assert.equal(allDates.counts.unresolvedProgrammeCount, 1);
assert.equal(allDates.counts.varianceListCount, 1);
assert.equal(allDates.rows.find((row) => row[1] === 'Lists with recorded-vs-recomputed variance')?.[2], 1);
assert.equal(allDates.rows.find((row) => row[1] === 'Lists with recorded-vs-recomputed variance')?.[3], 100);
assert.ok(allDates.rows.some((row) => row[1] === 'Unresolved programme IDs' && row[2] === 1));
assert.ok(allDates.rows.some((row) => row[1] === 'Awaiting receipt acknowledgement (purchased)' && row[2] === 1));
assert.ok(allDates.rows.some((row) => row[1] === 'Awaiting finance handover (receipt acknowledged)' && row[2] === 0));
assert.ok(allDates.rows.find((row) => row[1] === 'Awaiting receipt acknowledgement (purchased)')?.[4]?.toString().includes('not an inventory movement'));
assert.ok(allDates.rows.some((row) => row[1] === 'Items containing duplicate supplier entries' && row[2] === 1));
assert.ok(allDates.rows.some((row) => row[1] === 'Required items with fewer than three distinct supplier quotes' && row[2] === 2));
assert.ok(allDates.rows.some((row) => row[1] === 'Selected quote does not match a stored supplier quote' && row[2] === 1));
assert.ok(allDates.rows.some((row) => row[1] === 'Lists with incomplete item cost data' && row[2] === 1));
assert.ok(allDates.rows.some((row) => row[1] === 'Awaiting approval (draft, no approval date)' && row[2] === 1));

const programmeFiltered = buildProcurementOperationsReport([withinRange, discrepancy, missingDate], {
  dateBasis: 'createdAt', programmeId: 'fish-farming',
});
assert.equal(programmeFiltered.counts.selectedListCount, 2);
assert.equal(programmeFiltered.counts.missingDateCount, 0);
assert.equal(programmeFiltered.counts.unresolvedProgrammeCount, 0);

const belowThresholdTagged = makeList({
  id: 'below-threshold-tagged',
  items: [{ description: 'Synthetic low-cost item', quantity: 1, unit: 'unit', unitPriceMWK: 100, totalMWK: 100, priceStatus: 'quoted', quoteRequirementReason: 'threshold' }],
});
const belowThresholdReport = buildProcurementOperationsReport([belowThresholdTagged], { dateBasis: 'createdAt' });
assert.equal(belowThresholdReport.rows.find((row) => row[1] === 'Items with a quote requirement')?.[2], 0);
assert.equal(belowThresholdReport.rows.find((row) => row[1] === 'Items tagged with a threshold reason')?.[2], 1);

assert.throws(() => buildProcurementOperationsReport([], { dateBasis: 'createdAt', startDate: '2026-02-30' }), /valid report dates/i);
assert.throws(() => buildProcurementOperationsReport([], { dateBasis: 'createdAt', startDate: '2026-02-02', endDate: '2026-02-01' }), /start date/i);
assert.throws(() => buildProcurementOperationsReport([], { dateBasis: 'bogus' as 'createdAt' }), /supported procurement milestone/i);

const csv = buildProcurementOperationsCsv(allDates, 'All programmes');
assert.ok(csv.includes(PROCUREMENT_REPORT_CLASSIFICATION));
assert.ok(!csv.includes('Synthetic item A'));
assert.ok(!csv.includes('Supplier A'));

const docxBlob = await buildProcurementOperationsDocument(allDates, 'docx', 'All programmes');
const JSZip = (await import('jszip')).default;
const docxArchive = await JSZip.loadAsync(await docxBlob.arrayBuffer());
const docxText = await docxArchive.file('word/document.xml')!.async('text');
assert.ok(docxText.includes(PROCUREMENT_REPORT_CLASSIFICATION));
assert.ok(!docxText.includes('Synthetic item A'));
assert.ok(!docxText.includes('Supplier A'));

const xlsxBlob = await buildProcurementOperationsDocument(allDates, 'xlsx', 'All programmes');
const XLSX = (await import('xlsx')).default;
const workbook = XLSX.read(await xlsxBlob.arrayBuffer(), { type: 'array' });
const workbookText = Object.values(workbook.Sheets)
  .flatMap((sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][])
  .flat()
  .map(String)
  .join('\n');
assert.ok(workbookText.includes(PROCUREMENT_REPORT_CLASSIFICATION));
assert.ok(!workbookText.includes('Synthetic item A'));
assert.ok(!workbookText.includes('Supplier A'));

console.log('Internal procurement report aggregate tests passed.');
