import type { ProcurementList, ProcurementListItem, ProcurementQuote } from '../types';
export const DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK = 500000;
export interface ProcurementApprovalCheck { allowed: boolean; blockers: string[] }
export function selectProcurementQuote(item: ProcurementListItem, quote: ProcurementQuote): ProcurementListItem {
  const quantity = Number(item.quantity);
  if (!Number.isFinite(quote.amountMWK) || quote.amountMWK <= 0) throw new Error('A supplier quote must be a positive MWK amount.');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Set a valid item quantity before selecting a supplier quote.');
  return { ...item, selectedQuoteSupplier: quote.supplier, selectedQuoteAmountMWK: quote.amountMWK, unitPriceMWK: quote.amountMWK / quantity, totalMWK: quote.amountMWK, priceStatus: 'quoted' };
}
export function checkProcurementApproval(list: ProcurementList): ProcurementApprovalCheck {
  const blockers: string[] = [];
  if (!Array.isArray(list.items) || list.items.length === 0) return { allowed: false, blockers: ['Add at least one item before approval.'] };
  const threshold = list.quoteThresholdMWK ?? DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK;
  list.items.forEach((item, index) => {
    const label = item.description?.trim() || `Item ${index + 1}`; const quantity = Number(item.quantity); const unitPrice = Number(item.unitPriceMWK);
    const total = item.totalMWK ?? unitPrice * quantity;
    if (!Number.isFinite(quantity) || quantity <= 0) blockers.push(`${label}: quantity must be greater than zero.`);
    if (!item.unit?.trim()) blockers.push(`${label}: unit is missing.`);
    if (item.priceStatus !== 'quoted' || !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(total) || total <= 0) blockers.push(`${label}: confirm a valid price before approval.`);
    const requiresThreeQuotes = item.priceStatus !== 'quoted' || total >= threshold;
    if (requiresThreeQuotes && (item.quotes?.length || 0) < 3) blockers.push(`${label}: three supplier quotes are required (${item.quotes?.length || 0}/3).`);
    if (requiresThreeQuotes && (!item.selectedQuoteSupplier?.trim() || !Number.isFinite(item.selectedQuoteAmountMWK) || (item.selectedQuoteAmountMWK || 0) <= 0)) blockers.push(`${label}: select the preferred supplier quote.`);
  });
  return { allowed: blockers.length === 0, blockers };
}
