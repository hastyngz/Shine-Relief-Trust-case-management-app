import assert from 'node:assert/strict';
import { checkProcurementApproval, selectProcurementQuote } from '../src/services/procurementWorkflow';
import type { ProcurementList, ProcurementListItem, ProcurementQuote } from '../src/types';
const baseItem: ProcurementListItem = { description: 'Synthetic stationery pack', quantity: 10, unit: 'pack', unitPriceMWK: 12000, totalMWK: 120000, priceStatus: 'quoted' };
const baseList: ProcurementList = { id: 'PRC-TEST-001', title: 'Synthetic stationery purchase', purpose: 'Automated test fixture only', items: [baseItem], totalMWK: 120000, status: 'draft', quoteThresholdMWK: 500000, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'synthetic-test', updatedBy: 'synthetic-test' };
assert.equal(checkProcurementApproval(baseList).allowed, true);
assert.equal(checkProcurementApproval({ ...baseList, items: [] }).allowed, false);
const expensiveItem: ProcurementListItem = { ...baseItem, unitPriceMWK: 100000, totalMWK: 1000000 };
const missingQuotes = checkProcurementApproval({ ...baseList, items: [expensiveItem] });
assert.equal(missingQuotes.allowed, false); assert.ok(missingQuotes.blockers.some((message) => message.includes('three supplier quotes')));
const quotes: ProcurementQuote[] = [{ supplier: 'Supplier A', amountMWK: 1000000 }, { supplier: 'Supplier B', amountMWK: 950000 }, { supplier: 'Supplier C', amountMWK: 900000 }];
const selected = selectProcurementQuote({ ...expensiveItem, quotes }, quotes[2]);
assert.equal(selected.selectedQuoteSupplier, 'Supplier C'); assert.equal(selected.selectedQuoteAmountMWK, 900000);
assert.equal(selected.unitPriceMWK, 90000); assert.equal(selected.totalMWK, 900000);
assert.equal(checkProcurementApproval({ ...baseList, items: [selected] }).allowed, true);
const previouslyUnpriced: ProcurementListItem = { description: 'Synthetic toner', quantity: 1, unit: 'cartridge', priceStatus: 'missing' };
const singleQuote: ProcurementQuote = { supplier: 'Only supplier', amountMWK: 12000 };
const oneQuoteSelection = selectProcurementQuote({ ...previouslyUnpriced, quotes: [singleQuote] }, singleQuote);
assert.equal(checkProcurementApproval({ ...baseList, items: [oneQuoteSelection] }).allowed, false,
  'selecting one quote must not erase the three-quote requirement created by a missing price');
const threeUnpricedQuotes: ProcurementQuote[] = [
  singleQuote,
  { supplier: 'Second supplier', amountMWK: 13000 },
  { supplier: 'Third supplier', amountMWK: 12500 },
];
const selectedFromMissingPrice = selectProcurementQuote({ ...previouslyUnpriced, quotes: threeUnpricedQuotes }, singleQuote);
assert.equal(checkProcurementApproval({ ...baseList, items: [selectedFromMissingPrice] }).allowed, true,
  'an originally unpriced item can pass after three distinct quotes and preferred quote selection');

assert.throws(() => selectProcurementQuote(baseItem, { supplier: 'Supplier', amountMWK: 0 }), /positive MWK amount/);
assert.throws(() => selectProcurementQuote({ ...baseItem, quantity: 0 }, quotes[0]), /valid item quantity/);
console.log('Procurement workflow tests passed.');
