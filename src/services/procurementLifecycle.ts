import type { ProcurementDelivery, ProcurementList, ProcurementPayment } from '../types';

export function isValidProcurementDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function getProcurementDeliveredQuantity(list: ProcurementList, itemIndex: number): number {
  const historyTotal = (list.deliveries || []).reduce((sum, delivery) => sum + delivery.lines.reduce(
    (lineSum, line) => lineSum + (line.itemIndex === itemIndex ? line.quantity : 0), 0), 0);
  const serverTotal = Number(list.receivedQuantities?.[itemIndex] || 0);
  return Math.max(historyTotal, Number.isFinite(serverTotal) && serverTotal >= 0 ? serverTotal : 0);
}

export function getProcurementOutstandingQuantity(list: ProcurementList, itemIndex: number): number {
  const ordered = list.items[itemIndex]?.quantity;
  if (!Number.isFinite(ordered) || ordered < 0) return 0;
  return Math.max(0, ordered - getProcurementDeliveredQuantity(list, itemIndex));
}

export function getProcurementPaymentSummary(list: ProcurementList): { paidMWK: number; outstandingMWK: number; overpaid: boolean } {
  const paidMWK = (list.payments || []).reduce((sum, payment) => sum + payment.amountMWK, 0);
  return { paidMWK, outstandingMWK: Math.max(0, list.totalMWK - paidMWK), overpaid: paidMWK > list.totalMWK };
}

export function validateProcurementDelivery(args: {
  list: ProcurementList; date: string; reference: string; quantities: number[]; deliveryId: string;
}): string[] {
  const errors: string[] = [];
  if (args.list.status !== 'purchased') errors.push('Only a purchased procurement list can receive a delivery.');
  if (!isValidProcurementDate(args.date)) errors.push('Enter a valid delivery date.');
  if (!args.reference.trim() || args.reference.trim().length > 250) errors.push('Enter a delivery note or supplier reference (maximum 250 characters).');
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(args.deliveryId)) errors.push('The delivery operation ID is invalid. Start a new delivery attempt.');
  if (args.quantities.length !== args.list.items.length) errors.push('Enter a quantity for every procurement line.');
  args.list.items.forEach((item, index) => {
    const quantity = args.quantities[index];
    if (!Number.isFinite(quantity) || quantity < 0) errors.push(`Line ${index + 1} must have a non-negative received quantity.`);
    else if (quantity > getProcurementOutstandingQuantity(args.list, index)) errors.push(`Line ${index + 1} exceeds the outstanding quantity (${getProcurementOutstandingQuantity(args.list, index)} ${item.unit}).`);
  });
  if (!args.quantities.some((quantity) => Number.isFinite(quantity) && quantity > 0)) errors.push('Record at least one positive received quantity.');
  if ((args.list.deliveries || []).some((delivery) => delivery.id === args.deliveryId)) errors.push('This delivery ID has already been recorded. Refresh the list before recording another delivery.');
  return errors;
}

export function validateProcurementPayment(args: {
  list: ProcurementList; date: string; amountMWK: number; reference: string; paymentId: string;
}): string[] {
  const errors: string[] = [];
  if (args.list.status !== 'purchased') errors.push('Payments can only be recorded against a purchased procurement list.');
  if (!isValidProcurementDate(args.date)) errors.push('Enter a valid payment date.');
  if (!Number.isFinite(args.amountMWK) || args.amountMWK <= 0) errors.push('Payment amount must be greater than zero.');
  if (!args.reference.trim() || args.reference.trim().length > 250) errors.push('Enter a payment transaction or voucher reference (maximum 250 characters).');
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(args.paymentId)) errors.push('The payment record ID is invalid.');
  if ((args.list.payments || []).some((payment) => payment.id === args.paymentId)) errors.push('This payment record has already been recorded. Refresh the list.');
  const summary = getProcurementPaymentSummary(args.list);
  if (Number.isFinite(args.amountMWK) && args.amountMWK > summary.outstandingMWK) errors.push(`Payment exceeds the outstanding amount of MWK ${summary.outstandingMWK.toLocaleString()}.`);
  return errors;
}

export function isProcurementFullyReceived(list: ProcurementList): boolean {
  return list.items.every((item, index) => getProcurementOutstandingQuantity(list, index) === 0);
}

export function isProcurementFullyPaid(list: ProcurementList): boolean {
  const summary = getProcurementPaymentSummary(list);
  return !summary.overpaid && summary.outstandingMWK === 0;
}

export function getProcurementReceiptSummary(list: ProcurementList): { complete: boolean; deliveredLines: number; totalLines: number } {
  const deliveredLines = list.items.filter((_, index) => getProcurementDeliveredQuantity(list, index) > 0).length;
  return { complete: isProcurementFullyReceived(list), deliveredLines, totalLines: list.items.length };
}

export type ProcurementLifecycleRecord = ProcurementDelivery | ProcurementPayment;
