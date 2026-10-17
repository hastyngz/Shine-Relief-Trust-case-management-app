import React, { FormEvent, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import type { AssetHistoryEntry, AssetRecord } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { saveAssetRecord } from '../utils/storage';
import { getLocalDateInputValue } from '../utils/inventory';

interface AssetMaintenanceDialogProps {
  asset: AssetRecord;
  onClose: () => void;
  onSaved: () => void;
}

const makeId = () => `AST-HIST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const AssetMaintenanceDialog: React.FC<AssetMaintenanceDialogProps> = ({ asset, onClose, onSaved }) => {
  const { currentUser, staffProfile } = useAuth();
  const actor = staffProfile?.fullName || currentUser?.displayName || currentUser?.email || 'SHINE Staff';
  const [date, setDate] = useState(getLocalDateInputValue());
  const [workDone, setWorkDone] = useState('');
  const [cost, setCost] = useState('');
  const [nextServiceDate, setNextServiceDate] = useState(asset.nextServiceDate || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!workDone.trim()) { setError('Describe the maintenance or repair work completed.'); return; }
    const amount = cost.trim() ? Number(cost) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      setError('Maintenance cost must be a valid amount of zero or more.');
      return;
    }
    const now = new Date().toISOString();
    const historyEntry: AssetHistoryEntry = {
      id: makeId(),
      date,
      action: 'Maintenance',
      note: `${workDone.trim()}${amount === undefined ? '' : ` · Cost recorded: MWK ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)}`}${nextServiceDate ? ` · Next service: ${nextServiceDate}` : ''}`,
      recordedBy: actor,
      recordedAt: now,
    };
    setSaving(true);
    setError('');
    try {
      saveAssetRecord({
        ...asset,
        nextServiceDate: nextServiceDate || undefined,
        history: [...(asset.history || []), historyEntry],
        updatedAt: now,
        updatedBy: actor,
        updatedByUid: currentUser?.uid,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the maintenance record.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-normal text-stone-900';
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-stone-950/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="asset-maintenance-title" className="fx-sheet-enter max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-teal-800" /><h2 id="asset-maintenance-title" className="text-xl font-bold">Log maintenance</h2></div><p className="mt-1 text-sm text-stone-600">{asset.assetTag} · {asset.name}</p></div>
          <button type="button" aria-label="Close maintenance form" onClick={onClose} className="rounded-xl p-2 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold text-stone-700">Service / repair date *<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-semibold text-stone-700">Work completed *<textarea required rows={3} value={workDone} onChange={(event) => setWorkDone(event.target.value)} placeholder="Describe the repair, inspection or service" className="mt-1 w-full rounded-xl border border-stone-300 p-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-stone-700">Maintenance cost (MWK, optional)<input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-semibold text-stone-700">Next service date (optional)<input type="date" value={nextServiceDate} onChange={(event) => setNextServiceDate(event.target.value)} className={inputClass} /></label>
          <p className="text-xs leading-5 text-stone-500">This records the work in asset history. The optional cost is retained in the note; it does not create a finance expense or payment.</p>
          <div className="flex flex-col-reverse gap-2 border-t border-stone-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold">Cancel</button><button type="submit" disabled={saving} className="fx-press fx-btn-main min-h-11 rounded-xl px-5 text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save maintenance record'}</button></div>
        </form>
      </section>
    </div>
  );
};
