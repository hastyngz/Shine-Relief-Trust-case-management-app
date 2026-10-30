import type { ProcurementList, ProcurementListItem, ProcurementQuote } from '../types';
export const DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK = 500000;
export interface ProcurementApprovalCheck { allowed: boolean; blockers: string[] }

/** Normalize supplier labels consistently so spacing/case variants cannot count as separate quotes. */
export function normalizeProcurementSupplierIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase() : '';
}

/** Quote dates are date-only values and must be real Gregorian calendar dates. */
function isValidQuoteDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function selectProcurementQuote(item: ProcurementListItem, quote: ProcurementQuote): ProcurementListItem {
  const quantity = Number(item.quantity);
  if (!Number.isFinite(quote.amountMWK) || quote.amountMWK <= 0) throw new Error('A supplier quote must be a positive MWK amount.');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Set a valid item quantity before selecting a supplier quote.');
  const supplier = typeof quote.supplier === 'string' ? quote.supplier.trim() : '';
  const quoteIsOnItem = (item.quotes || []).some((candidate) =>
    typeof candidate.supplier === 'string' && normalizeProcurementSupplierIdentity(candidate.supplier) === normalizeProcurementSupplierIdentity(supplier) &&
    candidate.amountMWK === quote.amountMWK);
  if (!supplier || !quoteIsOnItem) throw new Error('Select a supplier quote recorded for this item.');
  return { ...item, selectedQuoteSupplier: supplier, selectedQuoteAmountMWK: quote.amountMWK, quoteRequirementReason: item.priceStatus !== 'quoted' ? 'price-unknown' : item.quoteRequirementReason, unitPriceMWK: quote.amountMWK / quantity, totalMWK: quote.amountMWK, priceStatus: 'quoted' };
}
export function checkProcurementApproval(list: ProcurementList): ProcurementApprovalCheck {
  const blockers: string[] = [];
  if (!Array.isArray(list.items) || list.items.length === 0) return { allowed: false, blockers: ['Add at least one item before approval.'] };
  const threshold = list.quoteThresholdMWK ?? DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK;
  const validThreshold = typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0;
  if (!validThreshold) blockers.push('The procurement quote threshold is invalid. Restore a positive MWK threshold before approval.');
  list.items.forEach((item, index) => {
    const label = item.description?.trim() || `Item ${index + 1}`; const quantity = Number(item.quantity); const unitPrice = Number(item.unitPriceMWK);
    const total = item.totalMWK ?? unitPrice * quantity;
    if (!Number.isFinite(quantity) || quantity <= 0) blockers.push(`${label}: quantity must be greater than zero.`);
    if (!item.unit?.trim()) blockers.push(`${label}: unit is missing.`);
    if (item.priceStatus !== 'quoted' || !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(total) || total <= 0) blockers.push(`${label}: confirm a valid price before approval.`);
    const uniqueQuotes = new Map<string, ProcurementQuote>();
    for (const quote of Array.isArray(item.quotes) ? item.quotes : []) {
      const supplier = typeof quote?.supplier === 'string' ? quote.supplier.trim() : '';
      if (supplier && Number.isFinite(quote.amountMWK) && quote.amountMWK > 0) {
        uniqueQuotes.set(normalizeProcurementSupplierIdentity(supplier), quote);
      }
    }
    const requiresThreeQuotes = !validThreshold || item.priceStatus !== 'quoted' || total >= threshold || item.quoteRequirementReason === 'price-unknown';
    if (requiresThreeQuotes && uniqueQuotes.size < 3) blockers.push(`${label}: three supplier quotes from distinct suppliers are required (${uniqueQuotes.size}/3).`);
    const selectedSupplier = typeof item.selectedQuoteSupplier === 'string' ? normalizeProcurementSupplierIdentity(item.selectedQuoteSupplier) : '';
    const selectedQuote = uniqueQuotes.get(selectedSupplier);
    const selectedQuoteIsValid = Boolean(selectedQuote && Number.isFinite(item.selectedQuoteAmountMWK) &&
      selectedQuote.amountMWK === item.selectedQuoteAmountMWK && item.totalMWK === item.selectedQuoteAmountMWK);
    if (requiresThreeQuotes && !selectedQuoteIsValid) blockers.push(`${label}: select the preferred supplier quote from the recorded quotes.`);
    if (!requiresThreeQuotes && (item.selectedQuoteSupplier || item.selectedQuoteAmountMWK) && !selectedQuoteIsValid) {
      blockers.push(`${label}: the selected supplier quote does not match a recorded quote.`);
    }
  });
  return { allowed: blockers.length === 0, blockers };
}

function optionalImportedAmount(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`${label} must be a numeric MWK amount.`);
  if (typeof value === 'string' && value.trim() === '') throw new Error(`${label} must be a numeric MWK amount.`);
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be a non-negative MWK amount.`);
  return amount > 0 ? amount : undefined;
}

export function normalizeImportedProcurementItems(value: unknown): { items: ProcurementListItem[]; totalMWK: number } {
  if (!Array.isArray(value) || value.length === 0) throw new Error('An imported procurement list must contain at least one item.');
  if (value.length > 500) throw new Error('An imported procurement list cannot contain more than 500 items.');

  const items = value.map((source: unknown, index): ProcurementListItem => {
    const row = source && typeof source === 'object' && !Array.isArray(source)
      ? source as Record<string, unknown>
      : null;
    if (!row) throw new Error(`Procurement item ${index + 1} must be a structured record.`);
    const description = typeof row.description === 'string' ? row.description.trim() : '';
    const unit = typeof row.unit === 'string' ? row.unit.trim() : '';
    const quantity = (typeof row.quantity === 'number' || (typeof row.quantity === 'string' && row.quantity.trim() !== ''))
      ? Number(row.quantity)
      : Number.NaN;
    if (!description || description.length > 300) throw new Error(`Procurement item ${index + 1} needs a description of 1–300 characters.`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Procurement item ${index + 1} needs a quantity greater than zero.`);
    if (!unit || unit.length > 60) throw new Error(`Procurement item ${index + 1} needs a unit of 1–60 characters.`);

    const rawStatus = row.priceStatus;
    if (rawStatus !== undefined && rawStatus !== 'quoted' && rawStatus !== 'missing' && rawStatus !== 'unclear') {
      throw new Error(`Procurement item ${index + 1} has an unsupported price status.`);
    }
    const unitPriceMWK = optionalImportedAmount(row.unitPriceMWK, `Procurement item ${index + 1} unit price`);
    const suppliedTotal = optionalImportedAmount(row.totalMWK, `Procurement item ${index + 1} total`);
    const hasPrice = unitPriceMWK !== undefined || suppliedTotal !== undefined;
    const priceStatus: ProcurementListItem['priceStatus'] = rawStatus === undefined
      ? (hasPrice ? 'quoted' : 'missing')
      : rawStatus;
    if (priceStatus === 'quoted' && !hasPrice) throw new Error(`Procurement item ${index + 1} is marked priced but has no positive price.`);
    if (priceStatus !== 'quoted' && hasPrice) throw new Error(`Procurement item ${index + 1} has a price but is not marked quoted.`);

    let normalizedUnitPrice: number | undefined;
    let totalMWK: number | undefined;
    if (priceStatus === 'quoted') {
      normalizedUnitPrice = unitPriceMWK ?? (suppliedTotal as number) / quantity;
      totalMWK = normalizedUnitPrice * quantity;
      if (suppliedTotal !== undefined && Math.abs(totalMWK - suppliedTotal) > 0.01) {
        throw new Error(`Procurement item ${index + 1} total does not match quantity × unit price.`);
      }
    }

    const rawQuotes = row.quotes;
    if (rawQuotes !== undefined && !Array.isArray(rawQuotes)) throw new Error(`Procurement item ${index + 1} quotes must be a list.`);
    const quotes = (Array.isArray(rawQuotes) ? rawQuotes : []).map((rawQuote: unknown, quoteIndex) => {
      const quote = rawQuote && typeof rawQuote === 'object' && !Array.isArray(rawQuote)
        ? rawQuote as Record<string, unknown>
        : null;
      const supplier = typeof quote?.supplier === 'string' ? quote.supplier.trim() : '';
      const amountMWK = optionalImportedAmount(quote?.amountMWK, `Procurement item ${index + 1} quote ${quoteIndex + 1}`);
      if (!supplier || supplier.length > 200 || !amountMWK) {
        throw new Error(`Procurement item ${index + 1} quote ${quoteIndex + 1} needs a supplier and positive MWK amount.`);
      }
      const quotedAt = quote && typeof quote.quotedAt === 'string' ? quote.quotedAt : undefined;
      if (quote?.quotedAt !== undefined && (quotedAt === undefined || !isValidQuoteDate(quotedAt))) {
        throw new Error(`Procurement item ${index + 1} quote ${quoteIndex + 1} has an invalid quote date.`);
      }
      return { supplier, amountMWK, ...(quotedAt !== undefined ? { quotedAt } : {}) };
    });
    if (new Set(quotes.map((quote) => normalizeProcurementSupplierIdentity(quote.supplier))).size !== quotes.length) {
      throw new Error(`Procurement item ${index + 1} contains duplicate supplier quotes.`);
    }

    if (row.selectedQuoteSupplier !== undefined && row.selectedQuoteSupplier !== null && row.selectedQuoteSupplier !== '' &&
        typeof row.selectedQuoteSupplier !== 'string') {
      throw new Error(`Procurement item ${index + 1} selected supplier is invalid.`);
    }
    const selectedQuoteSupplier = typeof row.selectedQuoteSupplier === 'string' ? row.selectedQuoteSupplier.trim().replace(/\s+/g, ' ') : '';
    const selectedQuoteAmountMWK = optionalImportedAmount(row.selectedQuoteAmountMWK, `Procurement item ${index + 1} selected quote`);
    if (Boolean(selectedQuoteSupplier) !== Boolean(selectedQuoteAmountMWK) ||
        (selectedQuoteSupplier && !quotes.some((quote) => normalizeProcurementSupplierIdentity(quote.supplier) === normalizeProcurementSupplierIdentity(selectedQuoteSupplier) && quote.amountMWK === selectedQuoteAmountMWK))) {
      throw new Error(`Procurement item ${index + 1} selected quote must match a recorded supplier quote.`);
    }
    const quoteRequirementReason = row.quoteRequirementReason;
    if (quoteRequirementReason !== undefined && quoteRequirementReason !== 'threshold' && quoteRequirementReason !== 'price-unknown') {
      throw new Error(`Procurement item ${index + 1} has an unsupported quote requirement reason.`);
    }
    const textField = (field: string, max: number): string | undefined => {
      const fieldValue = row[field];
      if (fieldValue === undefined || fieldValue === null || fieldValue === '') return undefined;
      if (typeof fieldValue !== 'string' || fieldValue.length > max) throw new Error(`Procurement item ${index + 1} ${field} is invalid.`);
      return fieldValue;
    };
    return {
      description,
      quantity,
      unit,
      priceStatus,
      ...(normalizedUnitPrice !== undefined ? { unitPriceMWK: normalizedUnitPrice, totalMWK } : {}),
      ...(textField('specification', 1000) ? { specification: textField('specification', 1000) } : {}),
      ...(textField('note', 1000) ? { note: textField('note', 1000) } : {}),
      ...(textField('itemNumber', 80) ? { itemNumber: textField('itemNumber', 80) } : {}),
      ...(textField('budgetLineId', 200) ? { budgetLineId: textField('budgetLineId', 200) } : {}),
      ...(quotes.length ? { quotes } : {}),
      ...(selectedQuoteSupplier ? { selectedQuoteSupplier, selectedQuoteAmountMWK } : {}),
      ...(quoteRequirementReason ? { quoteRequirementReason } : {}),
    };
  });
  const totalMWK = items.reduce((sum, item) => sum + (item.totalMWK || 0), 0);
  return { items, totalMWK };
}
