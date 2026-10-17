import React, { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import type { AssetCondition, AssetRecord } from '../types';
import { getLocalDateInputValue } from '../utils/inventory';
import { recordAssetVerification, type AssetVerificationOutcome } from '../utils/assetVerification';

interface AssetVerificationDialogProps {
  asset: AssetRecord;
  actor: string;
  onClose: () => void;
  onSaved: (asset: AssetRecord) => void;
}

const conditions: AssetCondition[] = ['Good', 'Fair', 'Damaged', 'Needs Repair', 'Written Off'];

export const AssetVerificationDialog: React.FC<AssetVerificationDialogProps> = ({ asset, actor, onClose, onSaved }) => {
  const [date, setDate] = useState(getLocalDateInputValue());
  const [outcome, setOutcome] = useState<AssetVerificationOutcome>('Verified');
  const [observedLocation, setObservedLocation] = useState(asset.location);
  const [observedCondition, setObservedCondition] = useState<AssetCondition | ''>(asset.condition);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const inputClass = 'mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-normal text-stone-900';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const updated = recordAssetVerification(asset, {
        date,
        verifiedBy: actor,
        outcome,
        observedLocation,
        observedCondition: observedCondition || undefined,
        note,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record this physical verification.');
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-stone-950/50 p-0 sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="asset-verification-title" className="fx-sheet-enter max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 id="asset-verification-title" className="text-xl font-bold">Physical asset verification</h2><p className="mt-1 text-sm text-stone-600">{asset.assetTag} · {asset.name}</p></div>
          <button type="button" aria-label="Close physical verification" onClick={onClose} className="rounded-xl p-2 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">Record what was physically observed. SHINE preserves the register's current location, condition and status; use Edit asset afterwards if an authorised correction is needed.</p>
        {error && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold text-stone-700">Verification date *<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-semibold text-stone-700">Outcome *<select value={outcome} onChange={(event) => { const nextOutcome = event.target.value as AssetVerificationOutcome; setOutcome(nextOutcome); if (nextOutcome === 'Not Located') { setObservedLocation(''); setObservedCondition(''); } else if (!observedLocation) { setObservedLocation(asset.location); } }} className={inputClass}><option value="Verified">Found as recorded</option><option value="Discrepancy">Found, but a discrepancy exists</option><option value="Not Located">Could not locate asset</option></select></label>
          <label className="block text-sm font-semibold text-stone-700">Observed location<input value={observedLocation} onChange={(event) => setObservedLocation(event.target.value)} className={inputClass} placeholder="Where you physically found it" /></label>
          <label className="block text-sm font-semibold text-stone-700">Observed condition<select value={observedCondition} onChange={(event) => setObservedCondition(event.target.value as AssetCondition | '')} className={inputClass}><option value="">Not assessed</option>{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
          <label className="block text-sm font-semibold text-stone-700">Notes {outcome !== 'Verified' ? '*' : '(optional)'}<textarea rows={3} required={outcome !== 'Verified'} value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 p-3 font-normal" placeholder="Record discrepancy, missing asset details, or verification notes" /></label>
          <div className="flex flex-col-reverse gap-2 border-t border-stone-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold">Cancel</button><button type="submit" className="fx-press fx-btn-main min-h-11 rounded-xl px-5 text-sm font-bold">Save verification</button></div>
        </form>
      </section>
    </div>
  );
};
