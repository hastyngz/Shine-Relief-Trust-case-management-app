import type { ProcurementList, ProcurementListItem, ProcurementQuote } from '../types';
import { PROGRAMME_BY_ID, PROGRAMMES, LEGACY_PROGRAMMES, type ProgrammeId } from '../data/programmes';
import { DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK } from './procurementWorkflow';
import { createFixedReport } from './qualityFixedReport';

export const PROCUREMENT_OPERATIONS_REPORT_TYPE = 'management-procurement' as const;
export const PROCUREMENT_REPORT_CLASSIFICATION = 'INTERNAL — NOT FOR SPONSOR/DONOR DISTRIBUTION';
export const PROCUREMENT_REPORT_RETENTION_DAYS = 90;

export const PROCUREMENT_REPORT_DATE_BASES = [
  { id: 'createdAt', label: 'List creation date' },
  { id: 'approvedAt', label: 'Approval date' },
  { id: 'orderedAt', label: 'Order date' },
  { id: 'receivedAt', label: 'Receipt acknowledgement date' },
  { id: 'financeHandedOverAt', label: 'Finance handover date' },
] as const;

export type ProcurementReportDateBasis = (typeof PROCUREMENT_REPORT_DATE_BASES)[number]['id'];
export type ProcurementReportCell = string | number;

export interface ProcurementOperationsReportFilters {
  dateBasis: ProcurementReportDateBasis;
  startDate?: string;
  endDate?: string;
  programmeId?: string;
}

export interface ProcurementOperationsReport {
  headers: string[];
  rows: ProcurementReportCell[][];
  filters: ProcurementOperationsReportFilters;
  counts: {
    selectedListCount: number;
    missingDateCount: number;
    varianceListCount: number;
    incompleteCostListCount: number;
    invalidRecordedTotalCount: number;
    unresolvedProgrammeCount: number;
  };
}

const validDateBases = new Set<string>(PROCUREMENT_REPORT_DATE_BASES.map(({ id }) => id));

function dateOnly(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value);
  if (!match) return undefined;
  const candidate = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(candidate.getTime()) && candidate.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : undefined;
}

function finiteNonNegative(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function itemRecomputedTotal(item: ProcurementListItem): number | undefined {
  const quantity = finiteNonNegative(item.quantity);
  const unitPrice = finiteNonNegative(item.unitPriceMWK);
  if (quantity === undefined || quantity <= 0 || unitPrice === undefined || unitPrice <= 0) return undefined;
  return quantity * unitPrice;
}

function uniqueSupplierQuotes(item: ProcurementListItem): Array<{ supplier: string; amount: number }> {
  const bySupplier = new Map<string, { supplier: string; amount: number }>();
  for (const quote of Array.isArray(item.quotes) ? item.quotes : []) {
    if (typeof quote?.supplier !== 'string' || !quote.supplier.trim()) continue;
    const amount = finiteNonNegative(quote.amountMWK);
    if (amount === undefined || amount <= 0) continue;
    const key = quote.supplier.trim().toLocaleLowerCase();
    if (!bySupplier.has(key)) bySupplier.set(key, { supplier: quote.supplier.trim(), amount });
  }
  return [...bySupplier.values()];
}

function selectedQuoteMatches(item: ProcurementListItem, quotes: Array<{ supplier: string; amount: number }>): boolean {
  const supplier = typeof item.selectedQuoteSupplier === 'string' ? item.selectedQuoteSupplier.trim().toLocaleLowerCase() : '';
  const amount = finiteNonNegative(item.selectedQuoteAmountMWK);
  if (!supplier || amount === undefined || amount <= 0) return false;
  return item.totalMWK === amount && quotes.some((quote) => quote.supplier.toLocaleLowerCase() === supplier && quote.amount === amount);
}

function statusLabel(value: unknown): 'draft' | 'approved' | 'purchased' | 'unknown' {
  return value === 'draft' || value === 'approved' || value === 'purchased' ? value : 'unknown';
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function programmeLabel(programmeId: unknown): string | undefined {
  if (typeof programmeId !== 'string' || !Object.prototype.hasOwnProperty.call(PROGRAMME_BY_ID, programmeId)) return undefined;
  return PROGRAMME_BY_ID[programmeId as ProgrammeId].name;
}

function getDateValue(list: ProcurementList, basis: ProcurementReportDateBasis): unknown {
  return list[basis];
}

export function buildProcurementOperationsReport(
  sourceLists: readonly ProcurementList[] | undefined,
  filters: ProcurementOperationsReportFilters = { dateBasis: 'createdAt' },
): ProcurementOperationsReport {
  if (!validDateBases.has(filters.dateBasis)) throw new Error('Choose a supported procurement milestone date basis.');
  const startDate = filters.startDate ? dateOnly(filters.startDate) : undefined;
  const endDate = filters.endDate ? dateOnly(filters.endDate) : undefined;
  if ((filters.startDate && !startDate) || (filters.endDate && !endDate)) throw new Error('Enter valid report dates.');
  if (startDate && endDate && startDate > endDate) throw new Error('The start date must not be after the end date.');

  const allLists = Array.isArray(sourceLists) ? sourceLists : [];
  const programmeFilteredLists = allLists.filter((list) => !filters.programmeId || list.programmeId === filters.programmeId);
  const hasDateRange = !!startDate || !!endDate;
  let missingDateCount = 0;
  const lists = programmeFilteredLists.filter((list) => {
    const date = dateOnly(getDateValue(list, filters.dateBasis));
    if (!date) {
      missingDateCount += 1;
      return !hasDateRange;
    }
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });

  const statusCounts: Record<'draft' | 'approved' | 'purchased' | 'unknown', { count: number; recordedTotal: number }> = {
    draft: { count: 0, recordedTotal: 0 },
    approved: { count: 0, recordedTotal: 0 },
    purchased: { count: 0, recordedTotal: 0 },
    unknown: { count: 0, recordedTotal: 0 },
  };
  const programmeGroups = new Map<string, { count: number; recordedTotal: number }>();
  let invalidRecordedTotalCount = 0;
  let varianceListCount = 0;
  let absoluteVarianceTotal = 0;
  let incompleteCostListCount = 0;
  let recomputedCostListCount = 0;
  let recomputedItemTotal = 0;
  let recordedTotal = 0;

  const itemPriceStatus: Record<'quoted' | 'missing' | 'unclear' | 'unknown', number> = { quoted: 0, missing: 0, unclear: 0, unknown: 0 };
  let quoteRequiredItemCount = 0;
  let quoteRequiredByThresholdCount = 0;
  let quoteRequiredByReasonCount = 0;
  let thresholdReasonTagCount = 0;
  let missingRequiredQuoteCount = 0;
  let missingSelectedQuoteCount = 0;
  let selectedQuoteMismatchCount = 0;
  let duplicateSupplierCount = 0;

  const awaitingApprovalCount = lists.filter((list) => statusLabel(list.status) === 'draft' && !dateOnly(list.approvedAt)).length;
  const missingApprovalDateCount = lists.filter((list) => ['approved', 'purchased'].includes(statusLabel(list.status)) && !dateOnly(list.approvedAt)).length;
  const awaitingPurchaseOrderCount = lists.filter((list) => statusLabel(list.status) === 'approved' && (!dateOnly(list.orderedAt) || !hasText(list.purchaseOrderReference))).length;
  const missingPurchaseOrderMetadataCount = lists.filter((list) => statusLabel(list.status) === 'purchased' && (!dateOnly(list.orderedAt) || !hasText(list.purchaseOrderReference))).length;
  const awaitingReceiptAcknowledgementCount = lists.filter((list) => statusLabel(list.status) === 'purchased' && !dateOnly(list.receivedAt)).length;
  const awaitingFinanceHandoverCount = lists.filter((list) => !!dateOnly(list.receivedAt) && !dateOnly(list.financeHandedOverAt)).length;
  const missingFinanceReferenceCount = lists.filter((list) => !!dateOnly(list.financeHandedOverAt) && !hasText(list.financeReference)).length;

  for (const list of lists) {
    const status = statusLabel(list.status);
    const statusGroup = statusCounts[status];
    statusGroup.count += 1;
    const storedTotal = finiteNonNegative(list.totalMWK);
    if (storedTotal === undefined) {
      invalidRecordedTotalCount += 1;
    } else {
      statusGroup.recordedTotal += storedTotal;
      recordedTotal += storedTotal;
    }

    const rawProgrammeId = list.programmeId;
    const resolvedLabel = programmeLabel(rawProgrammeId);
    const groupKey = resolvedLabel ? `programme:${rawProgrammeId}` : (hasText(rawProgrammeId) ? 'unresolved' : 'unassigned');
    const group = programmeGroups.get(groupKey) || { count: 0, recordedTotal: 0 };
    group.count += 1;
    if (storedTotal !== undefined) group.recordedTotal += storedTotal;
    programmeGroups.set(groupKey, group);

    const items: ProcurementListItem[] = Array.isArray(list.items) ? list.items : [];
    let completeCost = items.length > 0;
    let recomputedTotal = 0;
    for (const item of items) {
      const lineTotal = itemRecomputedTotal(item);
      if (lineTotal === undefined) completeCost = false;
      else recomputedTotal += lineTotal;

      const priceStatus: keyof typeof itemPriceStatus = item.priceStatus === 'quoted' || item.priceStatus === 'missing' || item.priceStatus === 'unclear'
        ? item.priceStatus
        : 'unknown';
      itemPriceStatus[priceStatus] += 1;

      const threshold = finiteNonNegative(list.quoteThresholdMWK) || DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK;
      const comparisonTotal = finiteNonNegative(item.totalMWK) ?? lineTotal;
      const requiredByThreshold = comparisonTotal !== undefined && comparisonTotal >= threshold;
      const requiredByReason = item.quoteRequirementReason === 'price-unknown';
      if (item.quoteRequirementReason === 'threshold') thresholdReasonTagCount += 1;
      const quoteRequired = requiredByThreshold || requiredByReason || priceStatus !== 'quoted';
      const quotes = uniqueSupplierQuotes(item);
      const itemQuotes: ProcurementQuote[] = Array.isArray(item.quotes) ? item.quotes : [];
      if (new Set(itemQuotes.map((quote) => typeof quote?.supplier === 'string' ? quote.supplier.trim().toLocaleLowerCase() : '').filter(Boolean)).size < itemQuotes.filter((quote) => hasText(quote?.supplier)).length) {
        duplicateSupplierCount += 1;
      }
      if (quoteRequired) {
        quoteRequiredItemCount += 1;
        if (requiredByThreshold) quoteRequiredByThresholdCount += 1;
        if (requiredByReason || priceStatus !== 'quoted') quoteRequiredByReasonCount += 1;
        if (quotes.length < 3) missingRequiredQuoteCount += 1;
        if (!hasText(item.selectedQuoteSupplier) || finiteNonNegative(item.selectedQuoteAmountMWK) === undefined) missingSelectedQuoteCount += 1;
        else if (!selectedQuoteMatches(item, quotes)) selectedQuoteMismatchCount += 1;
      } else if ((hasText(item.selectedQuoteSupplier) || item.selectedQuoteAmountMWK !== undefined) && !selectedQuoteMatches(item, quotes)) {
        selectedQuoteMismatchCount += 1;
      }
    }

    if (completeCost) {
      recomputedCostListCount += 1;
      recomputedItemTotal += recomputedTotal;
      const storedTotalForVariance = storedTotal;
      if (storedTotalForVariance !== undefined && Math.abs(storedTotalForVariance - recomputedTotal) > 0.01) {
        varianceListCount += 1;
        absoluteVarianceTotal += Math.abs(storedTotalForVariance - recomputedTotal);
      }
    } else {
      incompleteCostListCount += 1;
    }
  }

  const headers = ['Section', 'Measure', 'Count', 'MWK amount', 'Notes'];
  const rows: ProcurementReportCell[][] = [];
  const add = (section: string, measure: string, count: number, amount: number | '' = '', notes = '') => rows.push([section, measure, count, amount, notes]);
  add('Scope', 'Lists included in selected period', lists.length, '', `Date basis: ${PROCUREMENT_REPORT_DATE_BASES.find(({ id }) => id === filters.dateBasis)?.label}`);
  add('Date exceptions', 'Lists missing the selected milestone date', missingDateCount, '', hasDateRange ? 'Counted separately; not assigned to the selected date range.' : 'Included in the all-dates view.');
  for (const status of ['draft', 'approved', 'purchased', 'unknown'] as const) {
    add('List status', status === 'unknown' ? 'Unknown or invalid status' : status, statusCounts[status].count, statusCounts[status].recordedTotal, 'MWK totals are the values recorded on procurement lists.');
  }
  add('Totals and integrity', 'Lists with recorded-vs-recomputed variance', varianceListCount, absoluteVarianceTotal, 'Absolute variance across fully priceable lists; warning only, source records are not changed.');
  add('Totals and integrity', 'Lists with incomplete item cost data', incompleteCostListCount, '', 'At least one item cannot be recomputed from quantity × unit price, or the list has no items.');
  add('Totals and integrity', 'Lists with missing or invalid recorded total', invalidRecordedTotalCount, '', 'Recorded list total is not a finite non-negative MWK amount.');
  add('Totals and integrity', 'Recomputed item total across fully priceable lists', recomputedCostListCount, recomputedItemTotal, 'Only lists with quantity and unit price on every item are included.');
  add('Totals and integrity', 'Recorded MWK total across valid list totals', lists.length - invalidRecordedTotalCount, recordedTotal, 'This is recorded procurement value, not proof of payment or supplier settlement.');

  add('Workflow milestones', 'Awaiting approval (draft, no approval date)', awaitingApprovalCount);
  add('Workflow milestones', 'Approval date missing on approved/purchased list', missingApprovalDateCount);
  add('Workflow milestones', 'Awaiting purchase order metadata (approved)', awaitingPurchaseOrderCount);
  add('Workflow milestones', 'Purchase-order metadata incomplete (purchased)', missingPurchaseOrderMetadataCount);
  add('Workflow milestones', 'Awaiting receipt acknowledgement (purchased)', awaitingReceiptAcknowledgementCount, '', 'A recorded receipt acknowledgement is not an inventory movement or stock reconciliation.');
  add('Workflow milestones', 'Awaiting finance handover (receipt acknowledged)', awaitingFinanceHandoverCount);
  add('Workflow milestones', 'Finance handover missing a reference', missingFinanceReferenceCount);

  for (const status of ['quoted', 'missing', 'unclear', 'unknown'] as const) add('Item price status', status, itemPriceStatus[status]);
  add('Quote review', 'Items with a quote requirement', quoteRequiredItemCount);
  add('Quote review', 'Items at or above the quote threshold', quoteRequiredByThresholdCount, '', 'Uses recorded item total when present, otherwise quantity × unit price; threshold comes from the list or configured default.');
  add('Quote review', 'Items tagged with a threshold reason', thresholdReasonTagCount, '', 'Tag count is informational; the approval workflow applies its configured amount threshold.');
  add('Quote review', 'Items requiring quotes by reason/unknown price', quoteRequiredByReasonCount);
  add('Quote review', 'Required items with fewer than three distinct supplier quotes', missingRequiredQuoteCount);
  add('Quote review', 'Required items without a selected quote', missingSelectedQuoteCount);
  add('Quote review', 'Selected quote does not match a stored supplier quote', selectedQuoteMismatchCount);
  add('Quote review', 'Items containing duplicate supplier entries', duplicateSupplierCount);

  for (const programme of [...PROGRAMMES, ...LEGACY_PROGRAMMES]) {
    const group = programmeGroups.get(`programme:${programme.id}`);
    if (group) add('Programme subtotal', programme.name, group.count, group.recordedTotal, 'Recorded MWK total; programme ID resolved from the approved registry.');
  }
  const unresolved = programmeGroups.get('unresolved');
  if (unresolved) add('Programme subtotal', 'Unresolved programme IDs', unresolved.count, unresolved.recordedTotal, 'IDs are not displayed or guessed.');
  const unassigned = programmeGroups.get('unassigned');
  if (unassigned) add('Programme subtotal', 'No programme attribution', unassigned.count, unassigned.recordedTotal);

  return {
    headers,
    rows,
    filters: { ...filters, startDate, endDate },
    counts: {
      selectedListCount: lists.length,
      missingDateCount,
      varianceListCount,
      incompleteCostListCount,
      invalidRecordedTotalCount,
      unresolvedProgrammeCount: unresolved?.count || 0,
    },
  };
}

export function procurementProgrammeOptions(): Array<{ id: ProgrammeId; label: string }> {
  return [...PROGRAMMES, ...LEGACY_PROGRAMMES].map(({ id, name }) => ({ id, label: name }));
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildProcurementOperationsCsv(report: ProcurementOperationsReport, programmeName = 'All programmes'): string {
  const dateBasisLabel = PROCUREMENT_REPORT_DATE_BASES.find(({ id }) => id === report.filters.dateBasis)?.label || report.filters.dateBasis;
  const dateRange = report.filters.startDate || report.filters.endDate
    ? `${report.filters.startDate || 'No start bound'} to ${report.filters.endDate || 'No end bound'}`
    : 'Unfiltered — all stored lists';
  const rows: unknown[][] = [
    [PROCUREMENT_REPORT_CLASSIFICATION],
    ['Procurement Operations Report'],
    ['Date basis', dateBasisLabel],
    ['Date range', dateRange],
    ['Programme', programmeName],
    ['Lists included', report.counts.selectedListCount],
    ['Lists missing selected milestone date', report.counts.missingDateCount],
    ['Receipt limitation', 'Receipt acknowledgement is not proof of an inventory movement, stock balance, payment, or supplier settlement.'],
    [],
    report.headers,
    ...report.rows,
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export async function buildProcurementOperationsDocument(
  report: ProcurementOperationsReport,
  format: 'docx' | 'xlsx',
  programmeName = 'All programmes',
): Promise<Blob> {
  const dateBasisLabel = PROCUREMENT_REPORT_DATE_BASES.find(({ id }) => id === report.filters.dateBasis)?.label || report.filters.dateBasis;
  const dateRange = report.filters.startDate || report.filters.endDate
    ? `${report.filters.startDate || 'No start bound'} to ${report.filters.endDate || 'No end bound'}`
    : 'Unfiltered — all stored lists';
  if (format === 'xlsx') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const summary = XLSX.utils.aoa_to_sheet([
      [PROCUREMENT_REPORT_CLASSIFICATION],
      ['Procurement Operations Report'],
      ['Date basis', dateBasisLabel],
      ['Date range', dateRange],
      ['Programme', programmeName],
      ['Lists included', report.counts.selectedListCount],
      ['Lists missing selected milestone date', report.counts.missingDateCount],
      ['Receipt limitation', 'Receipt acknowledgement is not proof of an inventory movement, stock balance, payment, or supplier settlement.'],
      ['Scope', 'Aggregate-only; item descriptions, supplier names, notes, and raw procurement records are excluded.'],
    ]);
    const aggregates = XLSX.utils.aoa_to_sheet([report.headers, ...report.rows]);
    XLSX.utils.book_append_sheet(workbook, summary, 'Internal Summary');
    XLSX.utils.book_append_sheet(workbook, aggregates, 'Aggregates');
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  return createFixedReport({
    title: `${PROCUREMENT_REPORT_CLASSIFICATION} | Procurement Operations Report`,
    sections: [
      { title: 'Internal classification', text: PROCUREMENT_REPORT_CLASSIFICATION },
      {
        title: 'Scope and limitations',
        text: [
          `Date basis: ${dateBasisLabel}`,
          `Date range: ${dateRange}`,
          `Programme: ${programmeName}`,
          `Lists included in selected period: ${report.counts.selectedListCount}`,
          `Lists missing the selected milestone date: ${report.counts.missingDateCount}`,
          'Aggregate-only report. Item descriptions, supplier names, notes, and raw procurement records are excluded.',
          'A receipt acknowledgement is not proof of an inventory movement, stock balance, payment, or supplier settlement.',
        ].join('\n'),
      },
      { title: 'Aggregate results', text: '', table: { headers: report.headers, rows: report.rows } },
    ],
    changes: [],
    openProblems: [],
    format,
    draft: false,
  });
}
