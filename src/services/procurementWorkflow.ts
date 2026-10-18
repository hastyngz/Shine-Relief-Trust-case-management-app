import type { ProcurementList, ProcurementListItem, ProcurementQuote } from '../types';
export const DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK = 500000;
export interface ProcurementApprovalCheck { allowed: boolean; blockers: string[] }
export function selectProcurementQuote(item: ProcurementListItem, quote: ProcurementQuote): ProcurementListItem {
  const quantity = Number(item.quantity);
  if (!Number.isFinite(quote.amountMWK) || quote.amountMWK <= 0) throw new Error('A supplier quote must be a positive MWK amount.');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Set a valid item quantity before selecting a supplier quote.');
  if (!(item.quotes || []).some((candidate) => candidate.supplier === quote.supplier && candidate.amountMWK === quote.amountMWK)) {
    throw new Error('Select a quote already recorded for this item.');
  }
  return { ...item, selectedQuoteSupplier: quote.supplier, selectedQuoteAmountMWK: quote.amountMWK, unitPriceMWK: quote.amountMWK / quantity, totalMWK: quote.amountMWK, priceStatus: 'quoted' };
}
export function checkProcurementApproval(list: ProcurementList): ProcurementApprovalCheck {
  const blockers: string[] = [];
  if (!Array.isArray(list.items) || list.items.length === 0) return { allowed: false, blockers: ['Add at least one item before approval.'] };
  const threshold = list.quoteThresholdMWK ?? DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK;
  list.items.forEach((item, index) => {
    const label = item.description?.trim() || `Item ${index + 1}`;
    const quantity = Number(item.quantity); const unitPrice = Number(item.unitPriceMWK);
    const total = item.totalMWK ?? unitPrice * quantity;
    if (!Number.isFinite(quantity) || quantity <= 0) blockers.push(`${label}: quantity must be greater than zero.`);
    if (!item.unit?.trim()) blockers.push(`${label}: unit is missing.`);
    if (item.priceStatus !== 'quoted' || !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(total) || total <= 0) blockers.push(`${label}: confirm a valid price before approval.`);
    const suppliers = new Set((item.quotes || []).map((quote) => quote.supplier.trim().toLocaleLowerCase()).filter(Boolean));
    const requiresThreeQuotes = item.priceStatus !== 'quoted' || total >= threshold;
    if (requiresThreeQuotes && suppliers.size < 3) blockers.push(`${label}: three different supplier quotes are required (${suppliers.size}/3).`);
    const selected = (item.quotes || []).find((quote) => quote.supplier === item.selectedQuoteSupplier && quote.amountMWK === item.selectedQuoteAmountMWK);
    if (requiresThreeQuotes && !selected) blockers.push(`${label}: select one of the recorded supplier quotes as preferred.`);
  });
  return { allowed: blockers.length === 0, blockers };
}
