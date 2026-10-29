import assert from 'node:assert/strict';
import type { ProcurementList } from '../src/types';
import { getProcurementDeliveredQuantity, getProcurementOutstandingQuantity, getProcurementPaymentSummary, isProcurementFullyReceived, validateProcurementDelivery, validateProcurementPayment } from '../src/services/procurementLifecycle';

const base = (): ProcurementList => ({ id: 'PRC-SYNTHETIC', title: 'Synthetic supplies', purpose: 'Test only', items: [
  { description: 'Books', quantity: 12, unit: 'packs', priceStatus: 'quoted' },
  { description: 'Soap', quantity: 5, unit: 'bars', priceStatus: 'quoted' },
], totalMWK: 10000, status: 'purchased', deliveries: [{ id: 'delivery_00000001', date: '2026-10-20', reference: 'DN-1', recordedAt: '2026-10-20T10:00:00Z', recordedBy: 'synthetic', lines: [{ itemIndex: 0, quantity: 4, inventoryItemId: 'stock-1' }] }], payments: [{ id: 'payment_0000001', date: '2026-10-20', amountMWK: 2500, reference: 'PAY-1', recordedAt: '2026-10-20T10:00:00Z', recordedBy: 'synthetic' }], createdAt: '2026-10-01', updatedAt: '2026-10-01', createdBy: 'synthetic', updatedBy: 'synthetic' });

const list = base();
assert.equal(getProcurementDeliveredQuantity(list, 0), 4);
assert.equal(getProcurementOutstandingQuantity(list, 0), 8);
assert.equal(getProcurementOutstandingQuantity(list, 1), 5);
assert.equal(isProcurementFullyReceived(list), false);
assert.deepEqual(getProcurementPaymentSummary(list), { paidMWK: 2500, outstandingMWK: 7500, overpaid: false });
assert.deepEqual(validateProcurementDelivery({ list, date: '2026-10-29', reference: 'DN-2', quantities: [8, 0], deliveryId: 'delivery_00000002' }), []);
assert.ok(validateProcurementDelivery({ list, date: '2026-02-30', reference: 'DN-2', quantities: [9, 0], deliveryId: 'delivery_00000002' }).some((e) => e.includes('valid delivery date')));
assert.ok(validateProcurementDelivery({ list, date: '2026-10-29', reference: 'DN-2', quantities: [9, 0], deliveryId: 'delivery_00000002' }).some((e) => e.includes('exceeds the outstanding')));
assert.ok(validateProcurementDelivery({ list, date: '2026-10-29', reference: 'DN-2', quantities: [0, 0], deliveryId: 'delivery_00000002' }).some((e) => e.includes('positive received quantity')));
assert.ok(validateProcurementDelivery({ list, date: '2026-10-29', reference: 'DN-2', quantities: [1, 0], deliveryId: 'delivery_00000001' }).some((e) => e.includes('already been recorded')));
assert.deepEqual(validateProcurementPayment({ list, date: '2026-10-29', amountMWK: 7500, reference: 'PAY-2', paymentId: 'payment_0000002' }), []);
assert.ok(validateProcurementPayment({ list, date: '2026-10-29', amountMWK: 7501, reference: 'PAY-2', paymentId: 'payment_0000002' }).some((e) => e.includes('exceeds the outstanding')));
assert.ok(validateProcurementPayment({ list, date: '2026-02-30', amountMWK: 1, reference: 'PAY-2', paymentId: 'payment_0000002' }).some((e) => e.includes('valid payment date')));
console.log('Procurement lifecycle validation tests passed.');
