import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList, FileSpreadsheet, FileText, FileType, Pencil, Plus, Search, X } from 'lucide-react';
import type { InventoryItem, InventoryMovement } from '../types';
import { getDatabase, saveDatabase, saveInventoryItem } from '../utils/storage';
import { postInventoryMovement } from '../services/r2StorageClient';
import { clearPendingInventoryMovement, flushPendingInventoryMovements, loadPendingInventoryMovement, loadPendingInventoryMovements, markPendingInventoryMovementRejected, savePendingInventoryMovement } from '../utils/inventory';
import { useAuth } from '../contexts/AuthContext';
import { filterInventoryItems, createInventoryId, getInventoryExpiryStatus, isValidInventoryDate, getInventoryStocktakeAdjustment, getLocalDateInputValue, resolveInventoryLocationForSave, summarizeInventoryExpiry } from '../utils/inventory';
import { exportInventoryRegister } from '../utils/inventoryExport';

interface InventoryViewProps {
  items: InventoryItem[];
  onRefresh: () => void;
}

const locations = ['Main Office', 'Shine House', 'Shine Village', 'Early Years Centre', 'Farm', 'Other'];
const categories = ['Food & Groceries', 'Cleaning Supplies', 'Stationery', 'Toiletries', 'Equipment', 'Farm Supplies', 'Other'];
const units = ['bags', 'pieces', 'bottles', 'boxes', 'packs', 'kg', 'litres', 'trays', 'units'];

const money = (value?: number) => typeof value === 'number' && Number.isFinite(value)
  ? `MWK ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`
  : 'Not recorded';


export const InventoryView: React.FC<InventoryViewProps> = ({ items, onRefresh }) => {
  const { currentUser, staffProfile, isViewOnly } = useAuth();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [locationFilter, setLocationFilter] = useState('All locations');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'expiry'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingTarget, setEditingTarget] = useState<InventoryItem | null>(null);
  const [movementTarget, setMovementTarget] = useState<InventoryItem | null>(null);
  const [stocktakeTarget, setStocktakeTarget] = useState<InventoryItem | null>(null);
  const [stocktake, setStocktake] = useState({ countedQuantity: '', date: getLocalDateInputValue(), reason: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingMovementId, setPendingMovementId] = useState<string | null>(null);
  const [pendingMovementSignature, setPendingMovementSignature] = useState<string | null>(null);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [rejectedPendingId, setRejectedPendingId] = useState<string | null>(null);
  const autoFlushInProgress = useRef(false);
  const autoFlushAttempted = useRef(false);
  const [newItem, setNewItem] = useState({ name: '', stockCode: '', category: categories[0], unit: units[0], quantity: '0', minimum: '0', location: locations[0], supplier: '', unitCost: '', expiryDate: '', condition: 'Good' as NonNullable<InventoryItem['condition']>, notes: '' });
  const [movement, setMovement] = useState({ type: 'Received' as 'Received' | 'Issued', quantity: '', date: getLocalDateInputValue(), destination: '', reference: '', reason: '' });

  const filtered = useMemo(() => filterInventoryItems(items, {
    query, category: categoryFilter, location: locationFilter, stock: stockFilter,
  }), [items, query, categoryFilter, locationFilter, stockFilter]);
  const lowStock = items.filter((item) => item.quantityOnHand <= item.minimumStockLevel);
  const expirySummary = summarizeInventoryExpiry(items);
  const expiryAlerts = expirySummary.expired + expirySummary.expiringSoon;
  const totalValue = items.reduce((sum, item) => sum + Math.max(0, item.quantityOnHand) * Math.max(0, item.unitCostMWK || 0), 0);

  const [exporting, setExporting] = useState(false);
  const handleExport = async (format: 'docx' | 'xlsx' | 'pdf') => {
    if (exporting || filtered.length === 0) return;
    setExporting(true);
    setNotice('');
    try {
      await exportInventoryRegister(filtered, format);
      setNotice(`Inventory register exported as ${format.toUpperCase()} (${filtered.length} item${filtered.length === 1 ? '' : 's'}).`);
    } catch (error) {
      console.error('Inventory export failed', error);
      setNotice(`Could not create the ${format.toUpperCase()} export. Please try again.`);
    } finally {
      setExporting(false);
    }
  };

  const actor = staffProfile?.fullName || currentUser?.displayName || currentUser?.email || 'SHINE Staff';
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser?.uid) {
      setPendingMovementId(null);
      setPendingMovementSignature(null);
      return;
    }
    const queue = loadPendingInventoryMovements(currentUser.uid);
    setPendingQueueCount(queue?.length ?? 0);
    const pending = queue?.[0] ?? null;
    if (pending?.status === 'needs-review') setRejectedPendingId(pending.id);
    else if (rejectedPendingId && rejectedPendingId !== pending?.id) setRejectedPendingId(null);
    if (!pending) {
      if (pendingMovementId) {
        setPendingMovementId(null);
        setPendingMovementSignature(null);
      }
      return;
    }
    if (pendingMovementId === pending.id) return;
    const item = items.find((entry) => entry.id === pending.itemId);
    if (!item) return;
    setPendingMovementId(pending.id);
    setPendingMovementSignature(pending.signature);
    setNotice(pending.status === 'needs-review'
      ? 'The oldest stock transaction was rejected and needs review. Discard it explicitly before later queued transactions can proceed.'
      : 'A stock transaction is awaiting server confirmation. Keep its details unchanged and retry when online; the same transaction ID prevents duplicate stock movements.');
    if (pending.mode === 'movement') {
      setMovementTarget(item);
      setStocktakeTarget(null);
      setMovement({
        type: pending.payload.type === 'Issued' ? 'Issued' : 'Received',
        quantity: String(pending.payload.quantity ?? ''),
        date: String(pending.payload.date || getLocalDateInputValue()),
        destination: String(pending.payload.destination || ''),
        reference: String(pending.payload.reference || ''),
        reason: String(pending.payload.reason || ''),
      });
    } else {
      setStocktakeTarget(item);
      setMovementTarget(null);
      setStocktake({
        countedQuantity: String(pending.payload.countedQuantity ?? ''),
        date: String(pending.payload.date || getLocalDateInputValue()),
        reason: String(pending.payload.formReason || ''),
      });
    }
  }, [currentUser?.uid, items, pendingMovementId]);
  const persist = (item: InventoryItem): boolean => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      saveInventoryItem({ ...item, updatedBy: actor, updatedByUid: currentUser?.uid });
      setNotice('Inventory record saved on this device. Cloud sync will follow the app’s normal sync process.');
      onRefresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the inventory record.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submitNewItem = (event: FormEvent) => {
    event.preventDefault();
    const opening = Number(newItem.quantity);
    const minimum = Number(newItem.minimum);
    const cost = newItem.unitCost.trim() ? Number(newItem.unitCost) : undefined;
    if (!newItem.name.trim() || !newItem.stockCode.trim() || !newItem.unit.trim() || !newItem.location.trim()) {
      setError('Enter an item name, stock code, unit and storage location.');
      return;
    }
    if ((!editingTarget && (!Number.isFinite(opening) || opening < 0 || opening !== 0)) || !Number.isFinite(minimum) || minimum < 0 || (cost !== undefined && (!Number.isFinite(cost) || cost < 0))) {
      setError(!editingTarget && opening !== 0
        ? 'Register new items with zero stock first. After the item syncs, record opening stock with Receive so the balance and movement are committed together.'
        : 'Quantities and costs must be zero or greater.');
      return;
    }
    if (items.some((item) => item.id !== editingTarget?.id && item.stockCode.trim().toLowerCase() === newItem.stockCode.trim().toLowerCase())) {
      setError('That stock code is already in use. Choose a unique code.');
      return;
    }
    const now = new Date().toISOString();
    if (editingTarget) {
      const updated: InventoryItem = {
        ...editingTarget,
        stockCode: newItem.stockCode.trim(),
        name: newItem.name.trim(),
        category: newItem.category,
        unit: newItem.unit,
        minimumStockLevel: minimum,
        location: resolveInventoryLocationForSave(editingTarget.location, newItem.location, true),
        supplier: newItem.supplier.trim() || undefined,
        unitCostMWK: cost,
        expiryDate: newItem.expiryDate || undefined,
        condition: newItem.condition,
        notes: newItem.notes.trim() || undefined,
        updatedAt: now,
      };
      if (!persist(updated)) return;
      setShowAdd(false);
      setEditingTarget(null);
      setNewItem({ name: '', stockCode: '', category: categories[0], unit: units[0], quantity: '0', minimum: '0', location: locations[0], supplier: '', unitCost: '', expiryDate: '', condition: 'Good' as NonNullable<InventoryItem['condition']>, notes: '' });
      return;
    }
    const openingMovement: InventoryMovement[] = [];
    const item: InventoryItem = {
      id: createInventoryId('inv'), stockCode: newItem.stockCode.trim(), name: newItem.name.trim(), category: newItem.category,
      unit: newItem.unit, quantityOnHand: 0, minimumStockLevel: minimum, location: newItem.location,
      supplier: newItem.supplier.trim() || undefined, unitCostMWK: cost, expiryDate: newItem.expiryDate || undefined, condition: newItem.condition, notes: newItem.notes.trim() || undefined,
      movements: openingMovement, createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor,
      createdByUid: currentUser?.uid, updatedByUid: currentUser?.uid,
    };
    if (!persist(item)) return;
    setShowAdd(false);
    setNewItem({ name: '', stockCode: '', category: categories[0], unit: units[0], quantity: '0', minimum: '0', location: locations[0], supplier: '', unitCost: '', expiryDate: '', condition: 'Good' as NonNullable<InventoryItem['condition']>, notes: '' });
  };

  const applyConfirmedMovement = (
    item: InventoryItem,
    movementId: string,
    response: Awaited<ReturnType<typeof postInventoryMovement>>,
  ): boolean => {
    const serverMovement = response.movement as unknown as InventoryMovement & { newQuantity: number; previousQuantity: number };
    const db = getDatabase();
    if (!Array.isArray(db.inventoryItems)) db.inventoryItems = [];
    const index = db.inventoryItems.findIndex((entry) => entry.id === item.id);
    if (index < 0) {
      setError('The server confirmed the stock movement, but this item is no longer in the local register. Refresh the register before continuing.');
      return false;
    }
    const current = db.inventoryItems[index];
    const movementEntry: InventoryMovement = {
      id: serverMovement.id,
      type: serverMovement.type,
      quantity: serverMovement.quantity,
      date: serverMovement.date,
      location: serverMovement.location,
      destination: serverMovement.destination,
      reference: serverMovement.reference,
      reason: serverMovement.reason,
      recordedBy: serverMovement.recordedBy,
      recordedByUid: serverMovement.recordedByUid,
      createdAt: serverMovement.createdAt,
      previousQuantity: serverMovement.previousQuantity,
      newQuantity: serverMovement.newQuantity,
    };
    const updated: InventoryItem = {
      ...current,
      quantityOnHand: serverMovement.newQuantity,
      movements: [...(current.movements || []).filter((entry) => entry.id !== movementId), movementEntry],
      lastMovementId: movementId,
      updatedAt: serverMovement.createdAt,
      updatedBy: serverMovement.recordedBy,
      updatedByUid: serverMovement.recordedByUid,
    };
    db.inventoryItems[index] = updated;
    const saved = saveDatabase(db, false);
    if (!saved.ok) {
      setError('The server confirmed the movement, but this phone could not refresh its local copy. Refresh the register while online; do not submit the same movement again.');
      return false;
    }
    onRefresh();
    return true;
  };

  const restorePendingInventoryForm = (): boolean => {
    if (!currentUser?.uid) return false;
    const pending = loadPendingInventoryMovement(currentUser.uid);
    if (!pending) return false;
    const item = items.find((entry) => entry.id === pending.itemId);
    if (!item) return false;
    setPendingMovementId(pending.id);
    setPendingMovementSignature(pending.signature);
    setError('');
    setNotice('Restored the pending transaction. Retry it unchanged when online; the server will safely recognize an already-recorded transaction.');
    if (pending.mode === 'movement') {
      setMovementTarget(item);
      setStocktakeTarget(null);
      setMovement({
        type: pending.payload.type === 'Issued' ? 'Issued' : 'Received',
        quantity: String(pending.payload.quantity ?? ''),
        date: String(pending.payload.date || getLocalDateInputValue()),
        destination: String(pending.payload.destination || ''),
        reference: String(pending.payload.reference || ''),
        reason: String(pending.payload.reason || ''),
      });
    } else {
      setStocktakeTarget(item);
      setMovementTarget(null);
      setStocktake({
        countedQuantity: String(pending.payload.countedQuantity ?? ''),
        date: String(pending.payload.date || getLocalDateInputValue()),
        reason: String(pending.payload.formReason || ''),
      });
    }
    return true;
  };

  const discardRejectedPendingMovement = () => {
    if (!currentUser?.uid || !rejectedPendingId) return;
    const removed = clearPendingInventoryMovement(currentUser.uid, rejectedPendingId);
    if (!removed) {
      setError('The rejected transaction could not be removed safely. It remains saved on this device; free storage space or reload and try again.');
      return;
    }
    setPendingMovementId(null);
    setPendingMovementSignature(null);
    setRejectedPendingId(null);
    autoFlushAttempted.current = false;
    setPendingQueueCount(loadPendingInventoryMovements(currentUser.uid)?.length ?? 0);
    setError('');
    setNotice('The rejected transaction was removed from this device after your confirmation. Its rejected request did not change server stock.');
  };

  const submitMovement = async (event: FormEvent) => {
    event.preventDefault();
    if (!movementTarget || saving || autoFlushInProgress.current) return;
    const quantity = Number(movement.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a quantity greater than zero.');
      return;
    }
    if (!isValidInventoryDate(movement.date)) {
      setError('Enter a valid movement date in YYYY-MM-DD format.');
      return;
    }
    if (!movement.reason.trim()) {
      setError('Add a reason for this stock movement.');
      return;
    }
    const signature = JSON.stringify({
      itemId: movementTarget.id, type: movement.type, quantity, date: movement.date,
      destination: movement.destination.trim(), reference: movement.reference.trim(), reason: movement.reason.trim(),
    });
    const queue = currentUser?.uid ? loadPendingInventoryMovements(currentUser.uid) : null;
    if (!currentUser?.uid || !queue) {
      setError('The pending stock queue could not be read safely. No movement was sent; check device storage before retrying.');
      return;
    }
    const isRetryingHead = Boolean(pendingMovementId && queue[0]?.id === pendingMovementId && pendingMovementSignature === signature);
    if (queue.length > 0 && !isRetryingHead) {
      const queued = savePendingInventoryMovement(currentUser.uid, {
        id: createInventoryId('mov'), itemId: movementTarget.id, signature, mode: 'movement',
        payload: { type: movement.type, quantity, date: movement.date, destination: movement.destination.trim(), reference: movement.reference.trim(), reason: movement.reason.trim() },
      });
      if (!queued) {
        setError('The new transaction was not queued. Existing pending transactions were preserved; check storage space and try again.');
        return;
      }
      setPendingQueueCount(loadPendingInventoryMovements(currentUser.uid)?.length ?? queue.length + 1);
      restorePendingInventoryForm();
      setNotice('Added to the end of the pending queue. The oldest transaction must be confirmed first; queued requests do not change server stock until accepted.');
      setError('');
      return;
    }
    const movementId = isRetryingHead ? pendingMovementId as string : createInventoryId('mov');
    if (!currentUser?.uid || !savePendingInventoryMovement(currentUser.uid, {
      id: movementId, itemId: movementTarget.id, signature, mode: 'movement',
      payload: { type: movement.type, quantity, date: movement.date, destination: movement.destination.trim(), reference: movement.reference.trim(), reason: movement.reason.trim() },
    })) {
      restorePendingInventoryForm();
      setError('No stock movement was sent. Another transaction may still be awaiting confirmation, or device storage may be unavailable. Resolve the pending transaction first; if storage is full, free space and retry.');
      return;
    }
    setPendingMovementId(movementId);
    setPendingMovementSignature(signature);
    setPendingQueueCount(loadPendingInventoryMovements(currentUser.uid)?.length ?? 1);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('');
      setNotice('Stock movement saved as pending on this device only. Stock has NOT changed on the server. When the connection returns, SHINE will try submitting it automatically. If confirmation fails, keep the details unchanged and retry.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await postInventoryMovement({
        id: movementId,
        itemId: movementTarget.id,
        type: movement.type,
        quantity,
        date: movement.date,
        destination: movement.destination.trim() || undefined,
        reference: movement.reference.trim() || undefined,
        reason: movement.reason.trim(),
      });
      if (applyConfirmedMovement(movementTarget, movementId, response)) {
        setNotice(response.duplicate
          ? 'This stock movement was already recorded. The server confirmed the existing transaction.'
          : 'Stock movement recorded and confirmed by the server.');
        setPendingMovementId(null);
        setPendingMovementSignature(null);
        setRejectedPendingId(null);
        autoFlushAttempted.current = false;
        if (currentUser?.uid) clearPendingInventoryMovement(currentUser.uid, movementId);
        if (currentUser?.uid) setPendingQueueCount(loadPendingInventoryMovements(currentUser.uid)?.length ?? 0);
        setMovementTarget(null);
        setMovement({ type: 'Received', quantity: '', date: getLocalDateInputValue(), destination: '', reference: '', reason: '' });
      }
    } catch (err) {
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
      if (status !== undefined && status >= 400 && status < 500) {
        // Keep definitive rejections at the FIFO head until staff explicitly discard them.
        if (currentUser?.uid) markPendingInventoryMovementRejected(currentUser.uid, movementId);
        setRejectedPendingId(movementId);
      }
      setError(err instanceof Error
        ? `The stock movement was not confirmed: ${err.message} ${status !== undefined && status < 500 ? 'Correct the details or refresh the register before retrying.' : 'Keep the form unchanged and retry to safely check the same movement.'}`
        : 'The stock movement was not confirmed. Keep the form unchanged and retry to safely check the same movement.');
    } finally {
      setSaving(false);
    }
  };

  const submitStocktake = async (event: FormEvent) => {
    event.preventDefault();
    if (!stocktakeTarget || saving || autoFlushInProgress.current) return;
    const counted = Number(stocktake.countedQuantity);
    if (!Number.isFinite(counted) || counted < 0) {
      setError('The counted quantity must be zero or greater.');
      return;
    }
    if (!isValidInventoryDate(stocktake.date)) {
      setError('Enter a valid stocktake date in YYYY-MM-DD format.');
      return;
    }
    if (!stocktake.reason.trim()) {
      setError('Record who/what was checked or why the stocktake was performed.');
      return;
    }
    const signature = JSON.stringify({
      itemId: stocktakeTarget.id, type: 'Adjustment', countedQuantity: counted, date: stocktake.date,
      reference: 'STOCKTAKE', reason: `Physical stocktake: ${stocktake.reason.trim()}. Counted quantity ${counted} ${stocktakeTarget.unit}.`,
    });
    const queue = currentUser?.uid ? loadPendingInventoryMovements(currentUser.uid) : null;
    if (!currentUser?.uid || !queue) {
      setError('The pending stock queue could not be read safely. No stocktake was sent; check device storage before retrying.');
      return;
    }
    const isRetryingHead = Boolean(pendingMovementId && queue[0]?.id === pendingMovementId && pendingMovementSignature === signature);
    if (queue.length > 0 && !isRetryingHead) {
      const queued = savePendingInventoryMovement(currentUser.uid, {
        id: createInventoryId('mov'), itemId: stocktakeTarget.id, signature, mode: 'stocktake',
        payload: { countedQuantity: counted, date: stocktake.date, reference: 'STOCKTAKE', reason: `Physical stocktake: ${stocktake.reason.trim()}. Counted quantity ${counted} ${stocktakeTarget.unit}.`, formReason: stocktake.reason.trim() },
      });
      if (!queued) {
        setError('The new transaction was not queued. Existing pending transactions were preserved; check storage space and try again.');
        return;
      }
      setPendingQueueCount(loadPendingInventoryMovements(currentUser.uid)?.length ?? queue.length + 1);
      restorePendingInventoryForm();
      setNotice('Added to the end of the pending queue. The oldest transaction must be confirmed first; queued requests do not change server stock until accepted.');
      setError('');
      return;
    }
    const movementId = isRetryingHead ? pendingMovementId as string : createInventoryId('mov');
    const serverReason = `Physical stocktake: ${stocktake.reason.trim()}. Counted quantity ${counted} ${stocktakeTarget.unit}.`;
    if (!currentUser?.uid || !savePendingInventoryMovement(currentUser.uid, {
      id: movementId, itemId: stocktakeTarget.id, signature, mode: 'stocktake',
      payload: { countedQuantity: counted, date: stocktake.date, reference: 'STOCKTAKE', reason: serverReason, formReason: stocktake.reason.trim() },
    })) {
      restorePendingInventoryForm();
      setError('No stocktake was sent. Another transaction may still be awaiting confirmation, or device storage may be unavailable. Resolve the pending transaction first; if storage is full, free space and retry.');
      return;
    }
    setPendingMovementId(movementId);
    setPendingMovementSignature(signature);
    setPendingQueueCount(loadPendingInventoryMovements(currentUser.uid)?.length ?? 1);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('');
      setNotice('Stocktake saved as pending on this device only. Stock has NOT changed on the server. When the connection returns, SHINE will try submitting it automatically. If confirmation fails, keep the details unchanged and retry.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await postInventoryMovement({
        id: movementId,
        itemId: stocktakeTarget.id,
        type: 'Adjustment',
        countedQuantity: counted,
        date: stocktake.date,
        reference: 'STOCKTAKE',
        reason: `Physical stocktake: ${stocktake.reason.trim()}. Counted quantity ${counted} ${stocktakeTarget.unit}.`,
      });
      if (applyConfirmedMovement(stocktakeTarget, movementId, response)) {
        setNotice(response.duplicate
          ? 'This stocktake was already recorded. The server confirmed the existing transaction.'
          : 'Stocktake recorded and confirmed by the server.');
        setPendingMovementId(null);
        setPendingMovementSignature(null);
        setRejectedPendingId(null);
        autoFlushAttempted.current = false;
        if (currentUser?.uid) clearPendingInventoryMovement(currentUser.uid, movementId);
        if (currentUser?.uid) setPendingQueueCount(loadPendingInventoryMovements(currentUser.uid)?.length ?? 0);
        setStocktakeTarget(null);
        setStocktake({ countedQuantity: '', date: getLocalDateInputValue(), reason: '' });
      }
    } catch (err) {
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
      if (status !== undefined && status >= 400 && status < 500) {
        // Keep definitive rejections at the FIFO head until staff explicitly discard them.
        if (currentUser?.uid) markPendingInventoryMovementRejected(currentUser.uid, movementId);
        setRejectedPendingId(movementId);
      }
      setError(err instanceof Error
        ? `The stocktake was not confirmed: ${err.message} ${status !== undefined && status < 500 ? 'Correct the details or refresh the register before retrying.' : 'Keep the form unchanged and retry to safely check the same movement.'}`
        : 'The stocktake was not confirmed. Keep the form unchanged and retry to safely check the same movement.');
    } finally {
      setSaving(false);
    }
  };


  // Flush the persisted FIFO only after reconnect. Never retry a rejected head,
  // skip a failed head, or submit if the restored form has been edited.
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser?.uid) return;
    const uid = currentUser.uid;
    const flushWhenOnline = async () => {
      if (autoFlushInProgress.current || autoFlushAttempted.current || saving || !navigator.onLine) return;
      const queue = loadPendingInventoryMovements(uid);
      if (!queue || !queue.length) return;
      const head = queue[0];
      if (head.status === 'needs-review') {
        autoFlushAttempted.current = true;
        setRejectedPendingId(head.id);
        setNotice('The oldest stock transaction needs review. Discard it explicitly before the remaining queue can continue.');
        return;
      }
      if (pendingMovementId !== head.id || pendingMovementSignature !== head.signature) return;

      const currentSignature = head.mode === 'movement' && movementTarget?.id === head.itemId
        ? JSON.stringify({
          itemId: movementTarget.id, type: movement.type, quantity: Number(movement.quantity), date: movement.date,
          destination: movement.destination.trim(), reference: movement.reference.trim(), reason: movement.reason.trim(),
        })
        : head.mode === 'stocktake' && stocktakeTarget?.id === head.itemId
          ? JSON.stringify({
            itemId: stocktakeTarget.id, type: 'Adjustment', countedQuantity: Number(stocktake.countedQuantity), date: stocktake.date,
            reference: 'STOCKTAKE', reason: `Physical stocktake: ${stocktake.reason.trim()}. Counted quantity ${Number(stocktake.countedQuantity)} ${stocktakeTarget.unit}.`,
          })
          : '';
      if (currentSignature !== head.signature) {
        setNotice('A pending stock transaction has been edited. Restore its saved details or discard it explicitly before retrying; no automatic submission was made.');
        return;
      }

      autoFlushAttempted.current = true;
      autoFlushInProgress.current = true;
      setSaving(true);
      setError('');
      setNotice('Connection restored. Sending pending stock transactions in order; server-confirmed balances remain authoritative.');
      try {
        const result = await flushPendingInventoryMovements(uid, async (pending) => {
          const item = items.find((entry) => entry.id === pending.itemId);
          if (!item) throw new Error('The queued stock item is not available in the current register. Refresh before retrying.');
          const payload = pending.payload;
          const queuedDate = String(payload.date || '');
          if (!isValidInventoryDate(queuedDate)) {
            const invalidDate = new Error('The saved stock transaction has an invalid date and needs review before it can be sent.') as Error & { status: number };
            invalidDate.status = 400;
            throw invalidDate;
          }
          const response = pending.mode === 'movement'
            ? await postInventoryMovement({
              id: pending.id,
              itemId: pending.itemId,
              type: payload.type === 'Issued' ? 'Issued' : 'Received',
              quantity: Number(payload.quantity),
              date: String(payload.date || ''),
              destination: String(payload.destination || '') || undefined,
              reference: String(payload.reference || '') || undefined,
              reason: String(payload.reason || ''),
            })
            : await postInventoryMovement({
              id: pending.id,
              itemId: pending.itemId,
              type: 'Adjustment',
              countedQuantity: Number(payload.countedQuantity),
              date: String(payload.date || ''),
              reference: 'STOCKTAKE',
              reason: String(payload.reason || ''),
            });
          if (!applyConfirmedMovement(item, pending.id, response)) {
            throw new Error('The server confirmed this transaction, but the local register could not be refreshed. The same ID is retained for safe retry.');
          }
        });
        const remaining = loadPendingInventoryMovements(uid);
        setPendingQueueCount(remaining?.length ?? 0);
        setPendingMovementId(null);
        setPendingMovementSignature(null);
        setRejectedPendingId(result.status === 'needs-review' ? result.failedId : null);
        if (remaining?.length) {
          restorePendingInventoryForm();
          if (result.status === 'needs-review') {
            setRejectedPendingId(result.failedId);
            setNotice('A stock transaction was rejected and needs review. Discard that transaction explicitly before later queued transactions can proceed.');
          } else if (result.status === 'failed') {
            setError('Automatic retry stopped because the server did not confirm the oldest remaining transaction. Its ID and payload are preserved; retry when the connection is stable.');
          } else if (result.status === 'storage-error' || result.status === 'unavailable') {
            setError('Automatic retry stopped because the pending queue could not be safely updated or read. No later transaction was sent.');
          }
        } else if (result.status === 'empty' && result.processed > 0) {
          setMovementTarget(null);
          setStocktakeTarget(null);
          setMovement({ type: 'Received', quantity: '', date: getLocalDateInputValue(), destination: '', reference: '', reason: '' });
          setStocktake({ countedQuantity: '', date: getLocalDateInputValue(), reason: '' });
          setError('');
          setNotice(`Connection restored. ${result.processed} pending stock transaction${result.processed === 1 ? '' : 's'} confirmed by the server in FIFO order.`);
        } else if (result.status === 'failed') {
          setError('Automatic retry stopped. The oldest transaction remains saved on this device; reconnect again or retry it manually.');
        } else if (result.status === 'storage-error' || result.status === 'unavailable') {
          setError('Automatic retry stopped because the pending queue could not be safely updated or read. The remaining transaction is not treated as complete.');
        }
      } finally {
        autoFlushInProgress.current = false;
        setSaving(false);
      }
    };
    const onOnline = () => {
      if (saving || autoFlushInProgress.current) return;
      autoFlushAttempted.current = false;
      void flushWhenOnline();
    };
    window.addEventListener('online', onOnline);
    const initialRetry = window.setTimeout(() => { void flushWhenOnline(); }, 0);
    return () => {
      window.clearTimeout(initialRetry);
      window.removeEventListener('online', onOnline);
    };
  }, [currentUser?.uid, items, movement, movementTarget, onRefresh, pendingMovementId, pendingMovementSignature, saving, stocktake, stocktakeTarget]);

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-1 pb-28 sm:pb-8" aria-labelledby="inventory-title">
      <header className="fx-card overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <div className="bg-gradient-to-r from-teal-950 via-teal-900 to-emerald-800 px-5 py-6 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white/10 p-3"><Boxes className="h-7 w-7 text-amber-300" /></div>
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Administration &amp; Operations</p><h1 id="inventory-title" className="mt-1 text-2xl font-bold sm:text-3xl">Inventory &amp; Stores</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-teal-50">Register stock, record receipts and issues, monitor minimum levels and retain a movement history for each item.</p></div>
            </div>
            {!isViewOnly && <button type="button" onClick={() => { setError(''); setEditingTarget(null); setNewItem({ name: '', stockCode: '', category: categories[0], unit: units[0], quantity: '0', minimum: '0', location: locations[0], supplier: '', unitCost: '', expiryDate: '', condition: 'Good' as NonNullable<InventoryItem['condition']>, notes: '' }); setShowAdd(true); }} className="fx-press fx-btn-main inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"><Plus className="h-4 w-4" /> Add stock item</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5 sm:p-6">
          <div className="rounded-2xl bg-stone-50 p-4"><Boxes className="h-5 w-5 text-teal-800" /><p className="mt-2 text-2xl font-bold">{items.length}</p><p className="text-xs text-stone-600">Registered items</p></div>
          <div className="rounded-2xl bg-amber-50 p-4"><AlertTriangle className="h-5 w-5 text-amber-800" /><p className="mt-2 text-2xl font-bold">{lowStock.length}</p><p className="text-xs text-stone-600">At/below minimum</p></div>
          <div className="rounded-2xl bg-stone-50 p-4"><ClipboardList className="h-5 w-5 text-teal-800" /><p className="mt-2 text-2xl font-bold">{items.reduce((sum, item) => sum + (item.movements?.length || 0), 0)}</p><p className="text-xs text-stone-600">Recorded movements</p></div>
          <div className="rounded-2xl bg-amber-50 p-4"><CalendarClock className="h-5 w-5 text-amber-800" /><p className="mt-2 text-2xl font-bold">{expiryAlerts}</p><p className="text-xs text-stone-600">Expired / due within 30 days</p><p className="mt-1 text-[11px] text-stone-500">{expirySummary.expired} expired · {expirySummary.expiringSoon} due soon</p></div>
          <div className="rounded-2xl bg-stone-50 p-4"><CheckCircle2 className="h-5 w-5 text-teal-800" /><p className="mt-2 text-lg font-bold">{money(totalValue)}</p><p className="text-xs text-stone-600">Estimated stock value</p></div>
        </div>
      </header>

      {pendingQueueCount > 0 && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>{pendingQueueCount} inventory transaction{pendingQueueCount === 1 ? '' : 's'} stored on this device.</strong> They are in FIFO order and do not change authoritative stock until server-confirmed. {rejectedPendingId ? 'The oldest transaction was rejected by the server and needs review; later transactions remain queued behind it.' : 'Retry the oldest transaction first and resolve it before later entries are sent.'}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}
      {rejectedPendingId && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">This transaction was rejected and has not changed server stock. Review the error above. Discarding it removes only this local pending request; it does not alter server records.</p><button type="button" onClick={discardRejectedPendingMovement} disabled={saving} className="fx-press mt-3 min-h-11 rounded-lg border border-amber-700 px-4 py-2 font-bold text-amber-950 disabled:opacity-50">Discard rejected transaction</button></div>}

      <section className="space-y-3">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-stone-900">Stock register</h2><p className="text-sm text-stone-600">Showing {filtered.length} of {items.length} items. Narrow the register by category, storage location or alert status.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 sm:min-w-56"><Search className="h-4 w-4 shrink-0 text-stone-500" /><span className="sr-only">Search inventory</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item, code, location…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><button type="button" onClick={() => void handleExport('docx')} disabled={exporting || filtered.length === 0} className="fx-press inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 disabled:opacity-50"><FileText className="h-4 w-4" /> Word</button><button type="button" onClick={() => void handleExport('xlsx')} disabled={exporting || filtered.length === 0} className="fx-press inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" /> Excel</button><button type="button" onClick={() => void handleExport('pdf')} disabled={exporting || filtered.length === 0} className="fx-press inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 disabled:opacity-50"><FileType className="h-4 w-4" /> PDF</button></div></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs font-semibold text-stone-600">Category<select aria-label="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900"><option>All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-xs font-semibold text-stone-600">Storage location<select aria-label="Filter by storage location" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900"><option>All locations</option>{locations.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-xs font-semibold text-stone-600">Stock alerts<select aria-label="Filter by stock alert" value={stockFilter} onChange={(e) => setStockFilter(e.target.value as 'all' | 'low' | 'expiry')} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900"><option value="all">All stock</option><option value="low">At/below minimum</option><option value="expiry">Expired / expiring soon</option></select></label>
          </div>
          {(query || categoryFilter !== 'All categories' || locationFilter !== 'All locations' || stockFilter !== 'all') && <button type="button" onClick={() => { setQuery(''); setCategoryFilter('All categories'); setLocationFilter('All locations'); setStockFilter('all'); }} className="min-h-10 rounded-lg border border-stone-300 px-3 text-sm font-semibold text-stone-700">Clear filters</button>}
        </div>
        {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center"><Boxes className="mx-auto h-9 w-9 text-stone-400" /><h3 className="mt-3 font-bold text-stone-800">{items.length === 0 ? 'No stock items yet' : 'No matching items'}</h3><p className="mt-1 text-sm text-stone-600">{items.length === 0 ? 'Add the first item to start a traceable stock register.' : 'Try changing your search or clearing one or more filters.'}</p></div> : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {filtered.map((item) => {
              const low = item.quantityOnHand <= item.minimumStockLevel;
              return <article key={item.id} className="fx-card rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">{item.stockCode} · {item.category}</p><h3 className="mt-1 break-words text-lg font-bold text-stone-900">{item.name}</h3><p className="mt-1 text-sm text-stone-600">{item.location} · {item.unit}</p>{item.condition && <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${item.condition === 'Damaged' || item.condition === 'Expired' ? 'bg-red-100 text-red-800' : item.condition === 'Fair' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>Condition: {item.condition}</p>}</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${low ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{low ? 'Reorder / check' : 'In stock'}</span></div>
                <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-600">Quantity on hand</p><p className="mt-1 text-xl font-bold">{item.quantityOnHand} <span className="text-xs font-medium text-stone-500">{item.unit}</span></p></div><div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-600">Minimum level</p><p className="mt-1 text-xl font-bold">{item.minimumStockLevel} <span className="text-xs font-medium text-stone-500">{item.unit}</span></p></div></div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600"><span>Supplier: {item.supplier || 'Not recorded'}</span><span>Unit cost: {money(item.unitCostMWK)}</span></div>
                {item.expiryDate && (() => { const expiry = getInventoryExpiryStatus(item.expiryDate); return <p className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold ${expiry.status === 'expired' ? 'bg-red-100 text-red-800' : expiry.status === 'expiring-soon' ? 'bg-amber-100 text-amber-900' : 'bg-stone-50 text-stone-600'}`}>Expiry: {item.expiryDate}{expiry.status === 'expired' ? ' · EXPIRED' : expiry.status === 'expiring-soon' ? ` · Expires in ${expiry.daysRemaining} day${expiry.daysRemaining === 1 ? '' : 's'}` : ''}</p>; })()}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!isViewOnly && <><button type="button" disabled={saving} onClick={() => { setError(''); setStocktakeTarget(item); setStocktake({ countedQuantity: String(item.quantityOnHand), date: getLocalDateInputValue(), reason: '' }); }} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50"><ClipboardCheck className="h-4 w-4" /> Stocktake</button><button type="button" disabled={saving} onClick={() => { setError(''); setMovementTarget(item); setMovement({ type: 'Received', quantity: '', date: getLocalDateInputValue(), destination: '', reference: '', reason: '' }); }} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl bg-teal-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" /> Receive stock</button><button type="button" disabled={saving || item.quantityOnHand <= 0} onClick={() => { setError(''); setMovementTarget(item); setMovement({ type: 'Issued', quantity: '', date: getLocalDateInputValue(), destination: '', reference: '', reason: '' }); }} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-800 disabled:opacity-50"><ArrowUpFromLine className="h-4 w-4" /> Issue stock</button></>}
                  {!isViewOnly && <button type="button" disabled={saving} onClick={() => { setError(''); setEditingTarget(item); setNewItem({ name: item.name, stockCode: item.stockCode, category: item.category, unit: item.unit, quantity: String(item.quantityOnHand), minimum: String(item.minimumStockLevel), location: item.location, supplier: item.supplier || '', unitCost: item.unitCostMWK === undefined ? '' : String(item.unitCostMWK), expiryDate: item.expiryDate || '', condition: item.condition || 'Good', notes: item.notes || '' }); setShowAdd(true); }} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 disabled:opacity-50"><Pencil className="h-4 w-4" /> Edit details</button>}
                  <button type="button" aria-expanded={expandedId === item.id} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} className="fx-press inline-flex min-h-10 items-center rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700">{expandedId === item.id ? 'Hide history' : `Movement history (${item.movements?.length || 0})`}</button>
                </div>
                {expandedId === item.id && <div className="mt-4 border-t border-stone-200 pt-3"><h4 className="mb-2 text-sm font-bold text-stone-800">Stock movement history</h4>{!item.movements?.length ? <p className="text-sm text-stone-500">No movements recorded.</p> : <ol className="space-y-2">{[...item.movements].reverse().map((entry) => <li key={entry.id} className="rounded-xl bg-stone-50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{entry.type} · {entry.quantity} {item.unit}</strong><span className="text-xs text-stone-500">{entry.date}</span></div><p className="mt-1 text-stone-700">{entry.reason}</p><p className="mt-1 text-xs text-stone-500">{entry.recordedBy}{entry.destination ? ` · Destination: ${entry.destination}` : ''}{entry.reference ? ` · Ref: ${entry.reference}` : ''}</p></li>)}</ol>}</div>}
              </article>;
            })}
          </div>
        )}
      </section>

      {showAdd && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}><section role="dialog" aria-modal="true" aria-labelledby="add-inventory-title" className="fx-sheet-enter max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="add-inventory-title" className="text-xl font-bold text-stone-900">{editingTarget ? 'Edit stock item' : 'Register stock item'}</h2><p className="mt-1 text-sm text-stone-600">{editingTarget ? 'Update item details. Use stocktake to change the recorded quantity.' : 'Register new items at zero stock. After the item syncs, use Receive to record opening stock as a server-validated movement.'}</p></div><button type="button" aria-label="Close form" onClick={() => setShowAdd(false)} className="fx-press rounded-xl p-2 hover:bg-stone-100"><X className="h-5 w-5" /></button></div>
        <form onSubmit={submitNewItem} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-stone-700">Item name *<input required value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="text-sm font-semibold text-stone-700">Unique stock code *<input required value={newItem.stockCode} onChange={(e) => setNewItem({ ...newItem, stockCode: e.target.value })} placeholder="e.g. FOOD-001" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <p className="text-xs text-amber-800 sm:col-span-2">Stock-code checks use this device’s current register. If other devices may have been offline, sync and refresh before registering a code that might already exist.</p>
          <label className="text-sm font-semibold text-stone-700">Category<select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 font-normal">{categories.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="text-sm font-semibold text-stone-700">Unit of measure *<select value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 font-normal">{units.map((v) => <option key={v}>{v}</option>)}</select></label>
          {!editingTarget ? <label className="text-sm font-semibold text-stone-700" >Opening quantity (must be zero)<input type="number" min="0" step="0.01" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label> : <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700"><strong>Current balance:</strong> {editingTarget.quantityOnHand} {editingTarget.unit}<p className="mt-1 text-xs">Use Stocktake or Receive/Issue to change quantities with an audit trail.</p></div>}
          <label className="text-sm font-semibold text-stone-700">Minimum stock level<input type="number" min="0" step="0.01" value={newItem.minimum} onChange={(e) => setNewItem({ ...newItem, minimum: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="text-sm font-semibold text-stone-700">Storage location<select value={newItem.location} disabled={Boolean(editingTarget)} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 font-normal disabled:cursor-not-allowed disabled:bg-stone-100">{locations.map((v) => <option key={v}>{v}</option>)}</select>{editingTarget && <span className="mt-1 block text-xs font-normal text-amber-800">Location changes are disabled until SHINE has a traceable stock-transfer workflow. This prevents stock from appearing to move without a transfer record.</span>}</label>
          <label className="text-sm font-semibold text-stone-700">Unit cost (MWK)<input type="number" min="0" step="0.01" value={newItem.unitCost} onChange={(e) => setNewItem({ ...newItem, unitCost: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="text-sm font-semibold text-stone-700">Supplier<input value={newItem.supplier} onChange={(e) => setNewItem({ ...newItem, supplier: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="text-sm font-semibold text-stone-700">Expiry date (if applicable)<input type="date" value={newItem.expiryDate} onChange={(e) => setNewItem({ ...newItem, expiryDate: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="text-sm font-semibold text-stone-700">Condition<select value={newItem.condition} onChange={(e) => setNewItem({ ...newItem, condition: e.target.value as NonNullable<InventoryItem['condition']> })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 font-normal"><option>Good</option><option>Fair</option><option>Damaged</option><option>Expired</option></select></label>
          <label className="text-sm font-semibold text-stone-700 sm:col-span-2">Notes<textarea value={newItem.notes} onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-stone-300 p-3 font-normal" /></label>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:col-span-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setShowAdd(false); setEditingTarget(null); }} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold">Cancel</button><button type="submit" disabled={saving} className="fx-press fx-btn-main min-h-11 rounded-xl px-5 text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : editingTarget ? 'Save changes' : 'Save stock item'}</button></div>
        </form></section></div>}

      {movementTarget && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setMovementTarget(null); }}><section role="dialog" aria-modal="true" aria-labelledby="movement-title" className="fx-sheet-enter max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="movement-title" className="text-xl font-bold">{movement.type === 'Received' ? 'Receive stock' : 'Issue stock'}</h2><p className="mt-1 text-sm text-stone-600">{movementTarget.name} · Balance: {movementTarget.quantityOnHand} {movementTarget.unit}</p></div><button type="button" aria-label="Close movement form" disabled={Boolean(pendingMovementId)} onClick={() => setMovementTarget(null)}><X className="h-5 w-5" /></button></div>
        <form onSubmit={submitMovement} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
          <label className="block text-sm font-semibold text-stone-700">Movement type<select value={movement.type} onChange={(e) => setMovement({ ...movement, type: e.target.value as 'Received' | 'Issued' })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 font-normal"><option value="Received">Received into stock</option><option value="Issued">Issued from stock</option></select></label>
          <label className="block text-sm font-semibold text-stone-700">Quantity *<input autoFocus required type="number" min="0.01" step="0.01" value={movement.quantity} onChange={(e) => setMovement({ ...movement, quantity: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-stone-700">Date *<input required type="date" value={movement.date} onChange={(e) => setMovement({ ...movement, date: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-stone-700">{movement.type === 'Received' ? 'Received from / supplier' : 'Issued to / destination'}<input value={movement.destination} onChange={(e) => setMovement({ ...movement, destination: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-stone-700">Receipt / issue reference<input value={movement.reference} onChange={(e) => setMovement({ ...movement, reference: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-stone-700">Reason / purpose *<textarea required value={movement.reason} onChange={(e) => setMovement({ ...movement, reason: e.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-stone-300 p-3 font-normal" /></label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setMovementTarget(null)} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold">Cancel</button><button type="submit" disabled={saving} className="fx-press fx-btn-main min-h-11 rounded-xl px-5 text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : `Confirm ${movement.type.toLowerCase()}`}</button></div>
        </fieldset></form></section></div>}
      {stocktakeTarget && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setStocktakeTarget(null); }}><section role="dialog" aria-modal="true" aria-labelledby="stocktake-title" className="fx-sheet-enter max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="stocktake-title" className="text-xl font-bold">Physical stocktake</h2><p className="mt-1 text-sm text-stone-600">{stocktakeTarget.name} · System balance: {stocktakeTarget.quantityOnHand} {stocktakeTarget.unit}</p></div><button type="button" aria-label="Close stocktake form" disabled={Boolean(pendingMovementId)} onClick={() => setStocktakeTarget(null)}><X className="h-5 w-5" /></button></div>
        <form onSubmit={submitStocktake} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
          <label className="block text-sm font-semibold text-stone-700">Count date *<input required type="date" value={stocktake.date} onChange={(e) => setStocktake({ ...stocktake, date: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-stone-700">Actual quantity counted *<input autoFocus required type="number" min="0" step="0.01" value={stocktake.countedQuantity} onChange={(e) => setStocktake({ ...stocktake, countedQuantity: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal" /></label>
          {stocktake.countedQuantity !== '' && Number.isFinite(Number(stocktake.countedQuantity)) && Number(stocktake.countedQuantity) >= 0 && <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700">Expected variance: {getInventoryStocktakeAdjustment(stocktakeTarget.quantityOnHand, Number(stocktake.countedQuantity)).variance > 0 ? '+' : ''}{getInventoryStocktakeAdjustment(stocktakeTarget.quantityOnHand, Number(stocktake.countedQuantity)).variance} {stocktakeTarget.unit}</p>}
          <label className="block text-sm font-semibold text-stone-700">Stocktake notes / reason *<textarea required value={stocktake.reason} onChange={(e) => setStocktake({ ...stocktake, reason: e.target.value })} rows={3} placeholder="e.g. Monthly physical count; damaged goods separated" className="mt-1 w-full rounded-xl border border-stone-300 p-3 font-normal" /></label>
          <p className="text-xs leading-5 text-stone-500">Saving records an adjustment in the movement history and sets the balance to the quantity physically counted. The previous balance and variance remain in the audit note.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setStocktakeTarget(null)} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold">Cancel</button><button type="submit" disabled={saving} className="fx-press fx-btn-main min-h-11 rounded-xl px-5 text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save stocktake'}</button></div>
        </fieldset></form></section></div>}

      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Stock changes are recorded in each item’s movement history. This version supports item registration, opening balances, receipts, issues, physical stocktake reconciliation and expiry alerts. Transfers between locations and formal approval workflows remain future enhancements.</p>
    </main>
  );
};
