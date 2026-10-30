import assert from 'node:assert/strict';
import { checkProcurementApproval, normalizeImportedProcurementItems, selectProcurementQuote } from '../src/services/procurementWorkflow';
import { buildSupplierActivityIndex } from '../src/utils/supplierActivity';
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

const duplicateSupplierQuotes = [
  { supplier: 'Same Supplier', amountMWK: 1000000 },
  { supplier: ' same supplier ', amountMWK: 950000 },
  { supplier: 'SAME SUPPLIER', amountMWK: 900000 },
];
const duplicateQuoteCheck = checkProcurementApproval({ ...baseList, items: [{ ...selected, quotes: duplicateSupplierQuotes }] });
assert.equal(duplicateQuoteCheck.allowed, false, 'repeated supplier names must not satisfy the three-quote requirement');
assert.ok(duplicateQuoteCheck.blockers.some((message) => message.includes('three supplier quotes')));

const imported = normalizeImportedProcurementItems([
  { description: 'Synthetic A4 paper', quantity: '2', unit: 'ream', unitPriceMWK: '1200', priceStatus: 'quoted' },
  { description: 'Synthetic toner', quantity: 1, unit: 'cartridge' },
]);
assert.equal(imported.totalMWK, 2400);
assert.equal(imported.items[0].totalMWK, 2400);
assert.equal(imported.items[1].priceStatus, 'missing');
assert.throws(() => normalizeImportedProcurementItems([]), /at least one item/);
assert.throws(() => normalizeImportedProcurementItems([{ description: 'Invalid quantity', quantity: 0, unit: 'box' }]), /quantity greater than zero/);
assert.throws(() => normalizeImportedProcurementItems([{ description: 'Boolean quantity', quantity: true, unit: 'box' }]), /quantity greater than zero/);
assert.throws(() => normalizeImportedProcurementItems([{ description: 'Boolean amount', quantity: 1, unit: 'box', unitPriceMWK: true, priceStatus: 'quoted' }]), /numeric MWK amount/);
assert.throws(() => normalizeImportedProcurementItems([{ description: 'Inconsistent total', quantity: 2, unit: 'box', unitPriceMWK: 10, totalMWK: 50, priceStatus: 'quoted' }]), /does not match/);
assert.throws(() => normalizeImportedProcurementItems([{ description: 'Duplicate quotes', quantity: 1, unit: 'box', quotes: [
  { supplier: 'A', amountMWK: 10 }, { supplier: ' a ', amountMWK: 11 },
] }]), /duplicate supplier quotes/);

assert.throws(() => selectProcurementQuote(baseItem, { supplier: 'Supplier', amountMWK: 0 }), /positive MWK amount/);
assert.throws(() => selectProcurementQuote({ ...baseItem, quantity: 0 }, quotes[0]), /valid item quantity/);
const supplierIndex = buildSupplierActivityIndex([
  { ...baseList, id: 'PRC-TEST-001', updatedAt: '2026-10-20T10:00:00.000Z', items: [
    { ...baseItem, quotes: [
      { supplier: 'Acme Supplies', amountMWK: 12000, quotedAt: '2026-10-18' },
      { supplier: 'Acme Supplies', amountMWK: 12500, quotedAt: '2026-02-31' },
      { supplier: 'Beta Traders', amountMWK: 13000, quotedAt: '2026-10-19' },
    ] },
  ] },
  { ...baseList, id: 'PRC-TEST-002', updatedAt: '2026-10-25T10:00:00.000Z', items: [
    { ...baseItem, quotes: [{ supplier: ' ACME   SUPPLIES ', amountMWK: 11000, quotedAt: '2026-10-25' }] },
  ] },
], [
  { id: 'EXP-1', supplier: 'Acme Supplies', date: '2026-10-27' },
  { id: 'EXP-INVALID', supplier: 'Acme Supplies', date: '2026-13-01' },
  { id: 'EXP-2', supplier: 'Gamma Services', date: '2026-10-26' },
  { id: 'EXP-3', supplier: 'N/A', date: '2026-10-28' },
] as unknown as import('../src/types').HouseholdExpense[], [
  { id: 'INV-1', supplier: 'Gamma Services', updatedAt: '2026-10-28T12:00:00.000Z' },
] as unknown as import('../src/types').InventoryItem[]);
assert.deepEqual(supplierIndex, [
  { name: 'Acme Supplies', quoteCount: 2, procurementListCount: 2, expenseRecordCount: 1, inventoryItemCount: 0, lastActivityDate: '2026-10-27' },
  { name: 'Beta Traders', quoteCount: 1, procurementListCount: 1, expenseRecordCount: 0, inventoryItemCount: 0, lastActivityDate: '2026-10-19' },
  { name: 'Gamma Services', quoteCount: 0, procurementListCount: 0, expenseRecordCount: 1, inventoryItemCount: 1, lastActivityDate: '2026-10-26' },
], 'supplier names should be grouped case-insensitively and counts/date should reflect existing source records only');
assert.deepEqual(buildSupplierActivityIndex([], []), []);
assert.equal(supplierIndex.some((supplier) => 'amountMWK' in supplier), false, 'supplier index must not aggregate or expose financial amounts');
console.log('Procurement workflow and supplier activity index tests passed.');
