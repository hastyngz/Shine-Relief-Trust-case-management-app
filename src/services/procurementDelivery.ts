import type { InventoryItem, ProcurementList } from '../types';
import { getProcurementOutstandingQuantity, validateProcurementDelivery } from './procurementLifecycle';

export interface ProcurementDeliveryChoice { itemIndex: number; inventoryItemId: string | null }
export interface ProcurementDeliveryIntent {
  version: 1; uid: string; procurementListId: string; deliveryId: string; date: string; reference: string;
  quantities: number[]; choices: ProcurementDeliveryChoice[];
}
export interface ProcurementDeliveryPosterResult { ok: true; duplicate: boolean; movement: Record<string, unknown> }
export type ProcurementDeliveryPoster = (payload: Record<string, unknown>) => Promise<ProcurementDeliveryPosterResult>;
export interface ProcurementDeliveryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export const createProcurementDeliveryId = (cryptoApi: Pick<Crypto, 'randomUUID' | 'getRandomValues'> | undefined = globalThis.crypto): string => {
  if (cryptoApi?.randomUUID) return `delivery_${cryptoApi.randomUUID()}`;
  if (cryptoApi?.getRandomValues) return `delivery_${Array.from(cryptoApi.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('')}`;
  throw new Error('Secure random ID generation is unavailable on this device. Update the browser before recording a delivery.');
};
const keyFor = (uid: string, listId: string) => `shine.procurement-delivery.v1:${encodeURIComponent(uid)}:${encodeURIComponent(listId)}`;
const validId = (value: unknown): value is string => typeof value === 'string' && /^delivery_[A-Za-z0-9_-]{8,100}$/.test(value);
export function readProcurementDeliveryIntent(storage: ProcurementDeliveryStorage, uid: string, listId: string): ProcurementDeliveryIntent | null {
  try {
    const raw = storage.getItem(keyFor(uid, listId));
    if (!raw) return null;
    const value = JSON.parse(raw) as ProcurementDeliveryIntent;
    if (value.version !== 1 || value.uid !== uid || value.procurementListId !== listId || !validId(value.deliveryId) ||
      typeof value.date !== 'string' || typeof value.reference !== 'string' || !Array.isArray(value.quantities) || !Array.isArray(value.choices) ||
      value.quantities.some((n) => !Number.isFinite(n) || n < 0) ||
      value.choices.some((c) => !Number.isInteger(c.itemIndex) || c.itemIndex < 0 || (c.inventoryItemId !== null && typeof c.inventoryItemId !== 'string'))) return null;
    return value;
  } catch { return null; }
}
export function clearProcurementDeliveryIntent(storage: ProcurementDeliveryStorage, uid: string, listId: string): void {
  try { storage.removeItem(keyFor(uid, listId)); } catch { /* The completed movement remains idempotent if local cleanup fails. */ }
}
export async function postProcurementDeliveryMovements(args: {
  uid: string; list: ProcurementList; deliveryId: string; date: string; reference: string; quantities: number[];
  choices: ProcurementDeliveryChoice[]; inventoryItems: InventoryItem[]; storage: ProcurementDeliveryStorage; postMovement: ProcurementDeliveryPoster;
}): Promise<{ movementIds: string[]; duplicateCount: number; intent: ProcurementDeliveryIntent }> {
  const proposed: ProcurementDeliveryIntent = {
    version: 1, uid: args.uid, procurementListId: args.list.id, deliveryId: args.deliveryId, date: args.date,
    reference: args.reference.trim(), quantities: [...args.quantities], choices: args.choices.map((choice) => ({ ...choice })),
  };
  const key = keyFor(args.uid, args.list.id);
  let raw: string | null;
  try { raw = args.storage.getItem(key); } catch { throw new Error('Saved delivery retry details could not be read. No inventory movement was submitted.'); }
  let intent = readProcurementDeliveryIntent(args.storage, args.uid, args.list.id);
  if (raw && !intent) throw new Error('Saved delivery retry details are invalid. No stock movement was submitted; contact an Administrator.');
  const errors = validateProcurementDelivery({ list: args.list, date: args.date, reference: args.reference, quantities: args.quantities, deliveryId: args.deliveryId });
  if (errors.length) throw new Error(errors.join(' '));
  if (args.choices.length !== args.list.items.length || args.choices.some((choice, index) => choice.itemIndex !== index)) throw new Error('Choose an inventory link for every line before posting.');
  const inventoryById = new Map(args.inventoryItems.map((item) => [item.id, item]));
  for (let i = 0; i < args.list.items.length; i++) {
    const quantity = args.quantities[i];
    const choice = args.choices[i];
    if (quantity > 0 && choice.inventoryItemId !== null) {
      const stock = inventoryById.get(choice.inventoryItemId);
      if (!stock) throw new Error(`The selected inventory item for line ${i + 1} is no longer available.`);
      if (stock.unit !== args.list.items[i].unit) throw new Error(`Unit mismatch on line ${i + 1}; convert the quantity explicitly before posting.`);
    }
  }
  if (intent) {
    if (intent.deliveryId !== proposed.deliveryId || intent.date !== proposed.date || intent.reference !== proposed.reference ||
      JSON.stringify(intent.quantities) !== JSON.stringify(proposed.quantities) || JSON.stringify(intent.choices) !== JSON.stringify(proposed.choices)) {
      throw new Error('A previous delivery attempt is pending. Retry its saved details before starting another delivery.');
    }
  } else {
    intent = proposed;
    try { args.storage.setItem(key, JSON.stringify(intent)); } catch { throw new Error('Delivery retry details could not be saved on this device. No inventory movement was submitted.'); }
  }
  const movementIds: string[] = [];
  let duplicateCount = 0;
  for (let index = 0; index < intent.quantities.length; index++) {
    const quantity = intent.quantities[index];
    const choice = intent.choices[index];
    if (quantity <= 0 || !choice?.inventoryItemId) continue;
    const id = `prcd_${intent.deliveryId.slice('delivery_'.length)}_${index}`;
    let result: ProcurementDeliveryPosterResult;
    try {
      result = await args.postMovement({ id, itemId: choice.inventoryItemId, type: 'Received', quantity, date: intent.date,
        reason: `Partial procurement delivery: ${args.list.title}`.slice(0, 1000),
        reference: `Delivery ${intent.reference} · procurement ${args.list.id} · line ${index + 1}`.slice(0, 250),
        sourceType: 'procurementReceipt', sourceId: args.list.id, sourceLineIndex: index, sourceDeliveryId: intent.deliveryId });
    } catch (error) {
      throw new Error(`Delivery posting stopped after ${movementIds.length} stock movement(s). Retry this exact delivery; stable movement IDs prevent duplicate stock additions. ${error instanceof Error ? error.message : 'The server did not confirm the movement.'}`);
    }
    const movement = result?.movement || {};
    if (!result?.ok || movement.id !== id || movement.inventoryItemId !== choice.inventoryItemId || movement.quantity !== quantity ||
      movement.sourceType !== 'procurementReceipt' || movement.sourceId !== args.list.id || movement.sourceLineIndex !== index) {
      throw new Error(`The server response for delivery line ${index + 1} did not match the request. Keep this delivery pending and contact an Administrator.`);
    }
    if (result.duplicate) duplicateCount++;
    movementIds.push(id);
  }
  return { movementIds, duplicateCount, intent };
}
