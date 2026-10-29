import type { InventoryItem, ProcurementList } from '../types';

export const NOT_INVENTORY_TRACKED = '__not_inventory_tracked__';
const INTENT_PREFIX = 'shine.procurement-receipt.v1';

export interface ProcurementReceiptLineChoice {
  itemIndex: number;
  inventoryItemId: string | null;
}

export interface ProcurementReceiptIntent {
  version: 1;
  uid: string;
  procurementListId: string;
  date: string;
  lines: Array<{
    itemIndex: number;
    inventoryItemId: string | null;
    quantity: number;
    unit: string;
    reference: string;
    reason: string;
  }>;
}

export interface ProcurementReceiptMovementResult {
  ok: true;
  duplicate: boolean;
  movement: Record<string, unknown>;
}

export type ProcurementReceiptPoster = (
  payload: Record<string, unknown>,
) => Promise<ProcurementReceiptMovementResult>;

export interface ProcurementReceiptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ProcurementReceiptResult {
  movementIds: string[];
  date: string;
  duplicateCount: number;
}

function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function intentKey(uid: string, procurementListId: string): string {
  return `${INTENT_PREFIX}:${encodeURIComponent(uid)}:${encodeURIComponent(procurementListId)}`;
}

export function buildProcurementReceiptMovementId(procurementListId: string, itemIndex: number): string {
  if (!/^[A-Za-z0-9_-]{1,70}$/.test(procurementListId) || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex > 9999) {
    throw new Error('The procurement list or line number cannot be used for a safe receipt retry ID.');
  }
  return `prc_${procurementListId}_${itemIndex}`;
}

export function readProcurementReceiptIntent(
  storage: ProcurementReceiptStorage,
  uid: string,
  procurementListId: string,
): ProcurementReceiptIntent | null {
  if (!uid || !procurementListId) return null;
  try {
    const raw = storage.getItem(intentKey(uid, procurementListId));
    if (!raw) return null;
    const value = JSON.parse(raw) as ProcurementReceiptIntent;
    if (value.version !== 1 || value.uid !== uid || value.procurementListId !== procurementListId || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isFinite(Date.parse(`${value.date}T00:00:00Z`)) || !Array.isArray(value.lines)) return null;
    if (!value.lines.every((line) => Number.isInteger(line.itemIndex) && line.itemIndex >= 0 &&
        (line.inventoryItemId === null || (typeof line.inventoryItemId === 'string' && line.inventoryItemId.length > 0)) &&
        Number.isFinite(line.quantity) && line.quantity > 0 && typeof line.unit === 'string' && line.unit.length > 0 &&
        typeof line.reference === 'string' && line.reference.length > 0 && line.reference.length <= 250 &&
        typeof line.reason === 'string' && line.reason.length > 0 && line.reason.length <= 1000)) return null;
    return value;
  } catch {
    return null;
  }
}

export function clearProcurementReceiptIntent(
  storage: ProcurementReceiptStorage,
  uid: string,
  procurementListId: string,
): void {
  try { storage.removeItem(intentKey(uid, procurementListId)); } catch { /* A completed receipt is not rolled back by local cleanup failure. */ }
}

function makeIntent(
  uid: string,
  list: ProcurementList,
  choices: ProcurementReceiptLineChoice[],
  inventoryItems: InventoryItem[],
  date: string,
): ProcurementReceiptIntent {
  if (!uid || list.status !== 'purchased' || list.receivedAt) throw new Error('Only an unreceived purchased list can be posted to inventory.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) throw new Error('A valid receipt date is required.');
  if (choices.length !== list.items.length) throw new Error('Choose whether every procurement line is tracked in inventory before confirming receipt.');

  const byIndex = new Map<number, ProcurementReceiptLineChoice>();
  for (const choice of choices) {
    if (!Number.isInteger(choice.itemIndex) || choice.itemIndex < 0 || choice.itemIndex >= list.items.length || byIndex.has(choice.itemIndex)) {
      throw new Error('The receipt contains an invalid or duplicate procurement line selection.');
    }
    byIndex.set(choice.itemIndex, choice);
  }

  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const lines = list.items.map((line, itemIndex) => {
    const choice = byIndex.get(itemIndex);
    if (!choice) throw new Error('Choose an inventory item or mark every line as not inventory tracked.');
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !line.unit.trim()) throw new Error(`Procurement line ${itemIndex + 1} has an invalid quantity or unit.`);
    const reference = `Procurement ${list.id} · line ${itemIndex + 1}${list.purchaseOrderReference ? ` · PO ${list.purchaseOrderReference}` : ''}`.slice(0, 250);
    const reason = `Procurement receipt: ${list.title}`.slice(0, 1000);
    if (choice.inventoryItemId === null) return { itemIndex, inventoryItemId: null, quantity: line.quantity, unit: line.unit.trim(), reference, reason };
    const inventoryItem = inventoryById.get(choice.inventoryItemId);
    if (!inventoryItem) throw new Error(`The selected inventory item for procurement line ${itemIndex + 1} is no longer available. Refresh and choose again.`);
    if (inventoryItem.unit !== line.unit) throw new Error(`Unit mismatch on procurement line ${itemIndex + 1}; convert the quantity explicitly before posting.`);
    return { itemIndex, inventoryItemId: inventoryItem.id, quantity: line.quantity, unit: line.unit.trim(), reference, reason };
  });
  return { version: 1, uid, procurementListId: list.id, date, lines };
}

function sameIntent(a: ProcurementReceiptIntent, b: ProcurementReceiptIntent): boolean {
  return a.uid === b.uid && a.procurementListId === b.procurementListId &&
    a.lines.length === b.lines.length && a.lines.every((line, index) => {
      const other = b.lines[index];
      return line.itemIndex === other.itemIndex && line.inventoryItemId === other.inventoryItemId &&
        line.quantity === other.quantity && line.unit === other.unit;
    });
}

export async function postProcurementReceiptMovements(args: {
  uid: string;
  list: ProcurementList;
  choices: ProcurementReceiptLineChoice[];
  inventoryItems: InventoryItem[];
  storage: ProcurementReceiptStorage;
  postMovement: ProcurementReceiptPoster;
  date?: string;
}): Promise<ProcurementReceiptResult> {
  const proposed = makeIntent(args.uid, args.list, args.choices, args.inventoryItems, args.date || new Date().toISOString().slice(0, 10));
  const key = intentKey(args.uid, args.list.id);
  let rawIntent: string | null;
  try {
    rawIntent = args.storage.getItem(key);
  } catch {
    throw new Error('Saved receipt retry details could not be read on this device. No inventory movement was submitted.');
  }
  let intent = readProcurementReceiptIntent(args.storage, args.uid, args.list.id);
  if (rawIntent && !intent) throw new Error('Saved receipt retry details are invalid. No new inventory movement was submitted; contact an Administrator for recovery.');
  if (intent) {
    if (!sameIntent(intent, proposed)) throw new Error('A previous receipt attempt is still pending. Retry the saved line selections; do not change them until the attempt is resolved.');
  } else {
    intent = proposed;
    try {
      args.storage.setItem(key, JSON.stringify(intent));
    } catch {
      throw new Error('Receipt retry details could not be saved on this device. No inventory movement was submitted.');
    }
  }

  const movementIds: string[] = [];
  let duplicateCount = 0;
  for (const line of intent.lines) {
    if (!line.inventoryItemId) continue;
    const id = buildProcurementReceiptMovementId(intent.procurementListId, line.itemIndex);
    let result: ProcurementReceiptMovementResult;
    try {
      result = await args.postMovement({
        id,
        itemId: line.inventoryItemId,
        type: 'Received',
        quantity: line.quantity,
        date: intent.date,
        reason: line.reason,
        reference: line.reference,
        sourceType: 'procurementReceipt',
        sourceId: intent.procurementListId,
        sourceLineIndex: line.itemIndex,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The server did not confirm this stock movement.';
      throw new Error(`Receipt posting stopped after ${movementIds.length} linked movement(s). Retry this same receipt; stable operation IDs prevent duplicate stock additions. ${detail}`);
    }
    const movement = result?.movement || {};
    if (!result?.ok || movement.id !== id || movement.inventoryItemId !== line.inventoryItemId || movement.quantity !== line.quantity || movement.sourceType !== 'procurementReceipt' || movement.sourceId !== intent.procurementListId || movement.sourceLineIndex !== line.itemIndex) {
      throw new Error(`The server response for procurement line ${line.itemIndex + 1} did not match the requested receipt. Keep this receipt pending and contact an Administrator.`);
    }
    if (result.duplicate) duplicateCount += 1;
    if (typeof movement.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(movement.date) && movement.date !== intent.date) {
      intent = { ...intent, date: movement.date };
      try {
        args.storage.setItem(key, JSON.stringify(intent));
      } catch {
        throw new Error('The prior receipt date was recovered, but it could not be saved for retry. Keep this receipt pending and retry on this device.');
      }
    }
    movementIds.push(id);
  }
  return { movementIds, date: intent.date, duplicateCount };
}
