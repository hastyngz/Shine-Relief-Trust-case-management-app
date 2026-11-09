import React, { FormEvent, useMemo, useRef, useState } from 'react';
import { Archive, AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList, FileSpreadsheet, FileText, FileType, Pencil, Plus, Search, X } from 'lucide-react';
import type { AssetCondition, AssetHistoryEntry, AssetRecord, AssetStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { saveAssetRecord } from '../utils/storage';
import { AssetMaintenanceDialog } from './AssetMaintenanceDialog';
import { AssetVerificationDialog } from './AssetVerificationDialog';
import { getLocalDateInputValue, isValidInventoryDate } from '../utils/inventory';
import { exportAssetRegister, type AssetExportFormat } from '../utils/assetExport';
import { filterAssetRegister, isAssetVerifiedInYear, type AssetFollowUpFilter, type AssetVerificationFilter } from '../utils/assetFiltering';

interface AssetRegisterViewProps {
  assets: AssetRecord[];
  onRefresh: () => void;
}

const categories = ['IT & Electronics', 'Furniture', 'Buildings & Property', 'Tools & Machinery', 'Vehicles', 'Farm Equipment', 'Kitchen & Catering', 'Safety & Security', 'Other'];
const conditions: AssetCondition[] = ['Good', 'Fair', 'Damaged', 'Needs Repair', 'Written Off'];
const statuses: AssetStatus[] = ['In Use', 'In Storage', 'Under Repair', 'Missing', 'Disposed'];
const locations = ['Main Office', 'Shine House', 'Shine Village', 'Early Years Centre', 'Farm', 'Naisi Spur', 'Other'];

type AssetForm = {
  assetTag: string; name: string; category: string; description: string; serialNumber: string;
  acquisitionDate: string; acquisitionCostMWK: string; fundingSource: string; location: string;
  assignedTo: string; condition: AssetCondition; status: AssetStatus; warrantyExpiryDate: string;
  nextServiceDate: string; notes: string; changeReason: string;
};
const blankForm = (): AssetForm => ({
  assetTag: '', name: '', category: categories[0], description: '', serialNumber: '',
  acquisitionDate: '', acquisitionCostMWK: '', fundingSource: '', location: locations[0],
  assignedTo: '', condition: 'Good', status: 'In Use', warrantyExpiryDate: '', nextServiceDate: '',
  notes: '', changeReason: '',
});
const money = (value?: number) => typeof value === 'number' && Number.isFinite(value)
  ? `MWK ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`
  : 'Not recorded';
const makeId = () => `AST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const daysFromToday = (date?: string) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
  return Math.round((timestamp - Date.parse(`${getLocalDateInputValue()}T00:00:00Z`)) / 86400000);
};

export const AssetRegisterView: React.FC<AssetRegisterViewProps> = ({ assets, onRefresh }) => {
  const { currentUser, staffProfile, isViewOnly } = useAuth();
  const actor = staffProfile?.fullName || currentUser?.displayName || currentUser?.email || 'SHINE Staff';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | AssetStatus>('All');
  const [conditionFilter, setConditionFilter] = useState<'All' | AssetCondition>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | string>('All');
  const [locationFilter, setLocationFilter] = useState<'All' | string>('All');
  const [followUpFilter, setFollowUpFilter] = useState<AssetFollowUpFilter>('All');
  const [verificationFilter, setVerificationFilter] = useState<AssetVerificationFilter>('All');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssetRecord | null>(null);
  const [form, setForm] = useState<AssetForm>(blankForm());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [maintenanceTarget, setMaintenanceTarget] = useState<AssetRecord | null>(null);
  const [verificationTarget, setVerificationTarget] = useState<AssetRecord | null>(null);

  const filtered = useMemo(() => filterAssetRegister(assets, {
    search, status: statusFilter, condition: conditionFilter, category: categoryFilter, location: locationFilter,
    followUp: followUpFilter, verification: verificationFilter, today: getLocalDateInputValue(),
  }), [assets, search, statusFilter, conditionFilter, categoryFilter, locationFilter, followUpFilter, verificationFilter]);

  const serviceDue = assets.filter((asset) => {
    const days = daysFromToday(asset.nextServiceDate);
    return days !== null && days <= 30 && asset.status !== 'Disposed';
  });
  const attention = assets.filter((asset) => ['Damaged', 'Needs Repair', 'Missing', 'Written Off'].includes(asset.condition) || asset.status === 'Missing' || asset.status === 'Under Repair');
  const warrantyDue = assets.filter((asset) => { const days = daysFromToday(asset.warrantyExpiryDate); return days !== null && days <= 30 && asset.status !== 'Disposed'; });
  const activeAssets = assets.filter((asset) => asset.status !== 'Disposed');
  const currentYear = getLocalDateInputValue().slice(0, 4);
  const checkedThisYear = activeAssets.filter((asset) => isAssetVerifiedInYear(asset, currentYear));
  const locatedThisYear = checkedThisYear.filter((asset) => asset.verificationOutcome === 'Verified' || asset.verificationOutcome === 'Discrepancy');
  const notCheckedThisYear = activeAssets.length - checkedThisYear.length;
  const activeValue = activeAssets.reduce((sum, asset) => sum + (Number.isFinite(asset.acquisitionCostMWK) ? asset.acquisitionCostMWK || 0 : 0), 0);

  const handleExport = async (format: AssetExportFormat) => {
    if (exporting || filtered.length === 0) return;
    setExporting(true); setError(''); setNotice('');
    try {
      await exportAssetRegister(filtered, format);
      setNotice(`Asset register exported as ${format.toUpperCase()} (${filtered.length} asset${filtered.length === 1 ? '' : 's'}).`);
    } catch {
      setError(`Could not create the ${format.toUpperCase()} asset export. Please try again.`);
    } finally {
      setExporting(false);
    }
  };

  const openNew = () => { setEditing(null); setForm(blankForm()); setError(''); setNotice(''); setShowForm(true); };
  const openEdit = (asset: AssetRecord) => {
    setEditing(asset);
    setForm({
      assetTag: asset.assetTag, name: asset.name, category: asset.category, description: asset.description || '',
      serialNumber: asset.serialNumber || '', acquisitionDate: asset.acquisitionDate || '',
      acquisitionCostMWK: asset.acquisitionCostMWK === undefined ? '' : String(asset.acquisitionCostMWK),
      fundingSource: asset.fundingSource || '', location: asset.location, assignedTo: asset.assignedTo || '',
      condition: asset.condition, status: asset.status, warrantyExpiryDate: asset.warrantyExpiryDate || '',
      nextServiceDate: asset.nextServiceDate || '', notes: asset.notes || '', changeReason: '',
    });
    setError(''); setNotice(''); setShowForm(true);
  };

  const openMaintenance = (asset: AssetRecord) => { setError(''); setNotice(''); setMaintenanceTarget(asset); };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (!form.assetTag.trim() || !form.name.trim() || !form.location.trim()) {
      setError('Enter an asset tag, asset name and location.'); return;
    }
    if (assets.some((asset) => asset.id !== editing?.id && asset.assetTag.trim().toLowerCase() === form.assetTag.trim().toLowerCase())) {
      setError('That asset tag is already in use. Choose a unique tag.'); return;
    }
    const datedFields: Array<{ label: string; value: string }> = [
      { label: 'Acquisition date', value: form.acquisitionDate },
      { label: 'Warranty expiry date', value: form.warrantyExpiryDate },
      { label: 'Next service date', value: form.nextServiceDate },
    ];
    const invalidDate = datedFields.find(({ value }) => value && !isValidInventoryDate(value));
    if (invalidDate) {
      setError(`${invalidDate.label} must be a real calendar date.`); return;
    }
    const cost = form.acquisitionCostMWK.trim() ? Number(form.acquisitionCostMWK) : undefined;
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      setError('Acquisition cost must be a valid amount of zero or more.'); return;
    }
    const now = new Date().toISOString();
    const entry = (action: AssetHistoryEntry['action'], note: string, previousValue?: string, newValue?: string): AssetHistoryEntry => ({
      id: makeId(), date: getLocalDateInputValue(), action, note, previousValue, newValue, recordedBy: actor, recordedAt: now,
    });
    let history = [...(editing?.history || [])];
    if (!editing) {
      history.push(entry('Registered', form.changeReason.trim() || 'Asset registered in the SHINE asset register.'));
    } else {
      const tracked: Array<{ key: 'condition' | 'status' | 'location' | 'assignedTo'; action: AssetHistoryEntry['action']; label: string }> = [
        { key: 'condition', action: 'Condition Changed', label: 'Condition' },
        { key: 'status', action: 'Status Changed', label: 'Status' },
        { key: 'location', action: 'Location Changed', label: 'Location' },
        { key: 'assignedTo', action: 'Assignment Changed', label: 'Assigned to' },
      ];
      tracked.forEach(({ key, action, label }) => {
        const previous = String(editing[key] || 'Not assigned');
        const next = String(form[key] || 'Not assigned');
        if (previous !== next) history.push(entry(action, form.changeReason.trim() || `${label} updated.`, previous, next));
      });
      const otherFieldsChanged = editing.assetTag !== form.assetTag.trim() || editing.name !== form.name.trim()
        || editing.category !== form.category || (editing.description || '') !== form.description.trim()
        || (editing.serialNumber || '') !== form.serialNumber.trim() || (editing.acquisitionDate || '') !== form.acquisitionDate
        || editing.acquisitionCostMWK !== cost || (editing.fundingSource || '') !== form.fundingSource.trim()
        || (editing.warrantyExpiryDate || '') !== form.warrantyExpiryDate
        || (editing.nextServiceDate || '') !== form.nextServiceDate || (editing.notes || '') !== form.notes.trim();
      if (otherFieldsChanged) history.push(entry('Details Updated', form.changeReason.trim() || 'Asset details updated.'));
    }
    const saved: AssetRecord = {
      id: editing?.id || makeId(), assetTag: form.assetTag.trim(), name: form.name.trim(), category: form.category,
      description: form.description.trim() || undefined, serialNumber: form.serialNumber.trim() || undefined,
      acquisitionDate: form.acquisitionDate || undefined, acquisitionCostMWK: cost,
      fundingSource: form.fundingSource.trim() || undefined, location: form.location.trim(),
      assignedTo: form.assignedTo.trim() || undefined, condition: form.condition, status: form.status,
      warrantyExpiryDate: form.warrantyExpiryDate || undefined, nextServiceDate: form.nextServiceDate || undefined,
      notes: form.notes.trim() || undefined,
      verificationDate: editing?.verificationDate, verifiedBy: editing?.verifiedBy,
      verificationOutcome: editing?.verificationOutcome, verificationNote: editing?.verificationNote,
      observedLocation: editing?.observedLocation, observedCondition: editing?.observedCondition,
      history, createdAt: editing?.createdAt || now,
      updatedAt: now, createdBy: editing?.createdBy || actor, updatedBy: actor,
      createdByUid: editing?.createdByUid || currentUser?.uid, updatedByUid: currentUser?.uid,
    };
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      saveAssetRecord(saved);
      setNotice('Asset saved on this device. Cloud sync will follow the app’s normal sync process.');
      setShowForm(false); setEditing(null); setForm(blankForm()); onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this asset.');
    } finally { saveLock.current = false; setSaving(false); }
  };

  const inputClass = 'mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-normal text-stone-900';
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-1 pb-28 sm:pb-8" aria-labelledby="assets-title">
      <header className="fx-card overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <div className="bg-gradient-to-r from-teal-950 via-teal-900 to-emerald-800 px-5 py-6 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><div className="rounded-2xl bg-white/10 p-3"><Archive className="h-7 w-7 text-amber-300" /></div><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Administration &amp; Operations</p><h1 id="assets-title" className="mt-1 text-2xl font-bold sm:text-3xl">Asset Register</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-teal-50">Track equipment and property, who is responsible for it, its condition, service dates and changes over time.</p></div></div>
            {!isViewOnly && <button type="button" onClick={openNew} className="fx-press fx-btn-main inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"><Plus className="h-4 w-4" /> Register asset</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6 sm:p-6">
          <div className="rounded-2xl bg-stone-50 p-4"><Archive className="h-5 w-5 text-teal-800" /><p className="mt-2 text-2xl font-bold">{assets.length}</p><p className="text-xs text-stone-600">Registered assets</p></div>
          <div className="rounded-2xl bg-amber-50 p-4"><AlertTriangle className="h-5 w-5 text-amber-800" /><p className="mt-2 text-2xl font-bold">{attention.length}</p><p className="text-xs text-stone-600">Need attention</p></div>
          <div className="rounded-2xl bg-amber-50 p-4"><CalendarClock className="h-5 w-5 text-amber-800" /><p className="mt-2 text-2xl font-bold">{serviceDue.length}</p><p className="text-xs text-stone-600">Service due / overdue</p></div>
          <div className="rounded-2xl bg-amber-50 p-4"><CalendarClock className="h-5 w-5 text-amber-800" /><p className="mt-2 text-2xl font-bold">{warrantyDue.length}</p><p className="text-xs text-stone-600">Warranty expiring / expired</p></div>
          <div className="rounded-2xl bg-stone-50 p-4"><CheckCircle2 className="h-5 w-5 text-teal-800" /><p className="mt-2 text-lg font-bold">{money(activeValue)}</p><p className="text-xs text-stone-600">Recorded cost (not valuation)</p></div>
          <div className="rounded-2xl bg-emerald-50 p-4"><ClipboardCheck className="h-5 w-5 text-emerald-800" /><p className="mt-2 text-2xl font-bold">{locatedThisYear.length}/{activeAssets.length}</p><p className="text-xs text-stone-600">Located this year · registered active assets</p></div>
          <div className="rounded-2xl bg-amber-50 p-4"><ClipboardList className="h-5 w-5 text-amber-800" /><p className="mt-2 text-2xl font-bold">{notCheckedThisYear}</p><p className="text-xs text-stone-600">Not checked this year</p></div>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
      <section className="fx-card space-y-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5" aria-label="Asset search and filters">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input aria-label="Search assets" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tag, name, serial number, location or assignee…" className="min-h-11 w-full rounded-xl border border-stone-300 pl-10 pr-3 text-sm" /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-bold text-stone-600">Category<select aria-label="Filter assets by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputClass}><option value="All">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="text-xs font-bold text-stone-600">Location<select aria-label="Filter assets by location" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={inputClass}><option value="All">All locations</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
          <label className="text-xs font-bold text-stone-600">Status<select aria-label="Filter assets by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'All' | AssetStatus)} className={inputClass}><option>All</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="text-xs font-bold text-stone-600">Condition<select aria-label="Filter assets by condition" value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value as 'All' | AssetCondition)} className={inputClass}><option>All</option>{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
          <label className="text-xs font-bold text-stone-600">Maintenance &amp; warranty<select aria-label="Filter assets by maintenance and warranty" value={followUpFilter} onChange={(e) => setFollowUpFilter(e.target.value as AssetFollowUpFilter)} className={inputClass}>
            <option value="All">All follow-up</option><option value="Service overdue">Service overdue</option><option value="Service due soon">Service due within 30 days</option><option value="Warranty expired">Warranty expired</option><option value="Warranty expiring soon">Warranty expires within 30 days</option>
          </select></label>
          <label className="text-xs font-bold text-stone-600">Physical verification<select aria-label="Filter assets by physical verification" value={verificationFilter} onChange={(e) => setVerificationFilter(e.target.value as AssetVerificationFilter)} className={inputClass}>
            <option value="All">All verification</option><option value="Not verified this year">Not verified this year</option><option value="Verified this year">Verified this year</option><option value="Latest outcome: discrepancy">Latest outcome: discrepancy</option><option value="Latest outcome: not located">Latest outcome: not located</option>
          </select></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-stone-500" role="status">{filtered.length} of {assets.length} assets shown</p>
          {(search || statusFilter !== 'All' || conditionFilter !== 'All' || categoryFilter !== 'All' || locationFilter !== 'All' || followUpFilter !== 'All' || verificationFilter !== 'All') && <button type="button" onClick={() => { setSearch(''); setStatusFilter('All'); setConditionFilter('All'); setCategoryFilter('All'); setLocationFilter('All'); setFollowUpFilter('All'); setVerificationFilter('All'); }} className="min-h-10 rounded-xl border border-stone-300 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50">Clear all filters</button>}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4" aria-label="Export asset register">
        <div><h2 className="text-sm font-bold text-stone-900">Export asset register</h2><p className="mt-1 text-xs text-stone-600">Exports the current filtered list ({filtered.length} asset{filtered.length === 1 ? '' : 's'}). Word, Excel or PDF only.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={exporting || !filtered.length} onClick={() => void handleExport('docx')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 px-3 text-xs font-bold text-stone-800 disabled:opacity-50"><FileText className="h-4 w-4" /> Word</button>
          <button type="button" disabled={exporting || !filtered.length} onClick={() => void handleExport('xlsx')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 px-3 text-xs font-bold text-stone-800 disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" /> Excel</button>
          <button type="button" disabled={exporting || !filtered.length} onClick={() => void handleExport('pdf')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 px-3 text-xs font-bold text-stone-800 disabled:opacity-50"><FileType className="h-4 w-4" /> PDF</button>
        </div>
      </section>

      {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center"><Archive className="mx-auto h-8 w-8 text-stone-400" /><h2 className="mt-3 font-bold text-stone-800">{assets.length ? 'No matching assets' : 'No assets registered yet'}</h2><p className="mt-1 text-sm text-stone-600">{assets.length ? 'Try a different search or filter.' : 'Register equipment or property to start the asset register.'}</p>{!isViewOnly && !assets.length && <button type="button" onClick={openNew} className="fx-press fx-btn-main mt-4 min-h-11 rounded-xl px-4 text-sm font-bold">Register first asset</button>}</div> : <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {filtered.map((asset) => {
          const serviceDays = daysFromToday(asset.nextServiceDate);
          const expandedNow = expanded === asset.id;
          return <article key={asset.id} className="fx-card rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-teal-800">{asset.assetTag}</p><h2 className="mt-1 break-words text-lg font-bold text-stone-900">{asset.name}</h2><p className="mt-1 text-sm text-stone-600">{asset.category} · {asset.location}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${asset.condition === 'Good' ? 'bg-emerald-100 text-emerald-800' : ['Damaged','Needs Repair','Written Off'].includes(asset.condition) ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>{asset.condition}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-stone-500">Status</p><p className="mt-1 font-semibold">{asset.status}</p></div><div><p className="text-xs text-stone-500">Assigned to</p><p className="mt-1 break-words font-semibold">{asset.assignedTo || 'Not assigned'}</p></div><div><p className="text-xs text-stone-500">Acquisition cost</p><p className="mt-1 font-semibold">{money(asset.acquisitionCostMWK)}</p></div><div><p className="text-xs text-stone-500">Serial number</p><p className="mt-1 break-words font-semibold">{asset.serialNumber || 'Not recorded'}</p></div></div>
            {serviceDays !== null && serviceDays <= 30 && asset.status !== 'Disposed' && <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${serviceDays < 0 ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>Service {serviceDays < 0 ? `overdue by ${Math.abs(serviceDays)} day(s)` : serviceDays === 0 ? 'due today' : `due in ${serviceDays} day(s)`} · {asset.nextServiceDate}</p>}
            {(() => { const warrantyDays = daysFromToday(asset.warrantyExpiryDate); return warrantyDays !== null && warrantyDays <= 30 && asset.status !== 'Disposed' ? <p className={`mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${warrantyDays < 0 ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>Warranty {warrantyDays < 0 ? `expired ${Math.abs(warrantyDays)} day(s) ago` : warrantyDays === 0 ? 'expires today' : `expires in ${warrantyDays} day(s)`} · {asset.warrantyExpiryDate}</p> : null; })()}
            <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">{asset.verificationDate ? "Last physical check: " + asset.verificationDate + " · " + (asset.verificationOutcome || "Outcome not recorded") + " · " + (asset.verifiedBy || "Staff") : "No physical verification recorded yet"}</p>
            <div className="mt-4 flex flex-wrap gap-2">{!isViewOnly && <><button type="button" onClick={() => setVerificationTarget(asset)} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-900"><ClipboardCheck className="h-4 w-4" /> Verify physically</button><button type="button" onClick={() => openEdit(asset)} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 px-3 text-xs font-bold text-stone-700"><Pencil className="h-4 w-4" /> Edit asset</button><button type="button" onClick={() => openMaintenance(asset)} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-900"><CalendarClock className="h-4 w-4" /> Log maintenance</button></>}<button type="button" aria-expanded={expandedNow} onClick={() => setExpanded(expandedNow ? null : asset.id)} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 px-3 text-xs font-bold text-teal-900"><ClipboardList className="h-4 w-4" /> {expandedNow ? 'Hide history' : `History (${asset.history?.length || 0})`}</button></div>
            {expandedNow && <div className="mt-4 border-t border-stone-200 pt-4"><h3 className="text-sm font-bold">Asset history</h3>{asset.history?.length ? <ol className="mt-3 space-y-3">{[...asset.history].reverse().map((entry) => <li key={entry.id} className="rounded-xl bg-stone-50 p-3"><div className="flex flex-wrap justify-between gap-2"><span className="text-sm font-bold">{entry.action}</span><time className="text-xs text-stone-500">{entry.date}</time></div><p className="mt-1 text-sm text-stone-700">{entry.note}</p>{entry.previousValue !== undefined && <p className="mt-1 text-xs text-stone-600">{entry.previousValue} → {entry.newValue}</p>}<p className="mt-1 text-xs text-stone-500">Recorded by {entry.recordedBy}</p></li>)}</ol> : <p className="mt-2 text-sm text-stone-500">No history has been recorded.</p>}</div>}
          </article>;
        })}
      </div>}

      {verificationTarget && <AssetVerificationDialog asset={verificationTarget} actor={actor} onClose={() => setVerificationTarget(null)} onSaved={(updatedAsset) => { saveAssetRecord(updatedAsset); setVerificationTarget(null); setNotice("Physical verification recorded for " + updatedAsset.assetTag + ". Register values were not silently changed."); onRefresh(); }} />}
      {maintenanceTarget && <AssetMaintenanceDialog asset={maintenanceTarget} onClose={() => setMaintenanceTarget(null)} onSaved={() => { setMaintenanceTarget(null); setNotice('Maintenance record saved to the asset history.'); onRefresh(); }} />}
      {showForm && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}><section role="dialog" aria-modal="true" aria-labelledby="asset-form-title" className="fx-sheet-enter max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="asset-form-title" className="text-xl font-bold">{editing ? 'Edit asset' : 'Register asset'}</h2><p className="mt-1 text-sm text-stone-600">Record ownership, location, condition and service information.</p></div><button type="button" aria-label="Close asset form" onClick={() => setShowForm(false)} className="rounded-xl p-2 hover:bg-stone-100"><X className="h-5 w-5" /></button></div>
        <form onSubmit={submit} className="space-y-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-stone-700">Asset tag / register number *<input required value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} className={inputClass} placeholder="e.g. SHINE-AST-001" /></label>
          <label className="text-sm font-semibold text-stone-700">Asset name *<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Office laptop" /></label>
          <label className="text-sm font-semibold text-stone-700">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="text-sm font-semibold text-stone-700">Location<select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass}>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
          <label className="text-sm font-semibold text-stone-700">Serial number<input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold text-stone-700">Assigned to<input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className={inputClass} placeholder="Staff member or responsible person" /></label>
          <label className="text-sm font-semibold text-stone-700">Acquisition date<input type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold text-stone-700">Acquisition cost (MWK)<input type="number" min="0" step="0.01" value={form.acquisitionCostMWK} onChange={(e) => setForm({ ...form, acquisitionCostMWK: e.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold text-stone-700">Funding source / donor<input value={form.fundingSource} onChange={(e) => setForm({ ...form, fundingSource: e.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold text-stone-700">Warranty expiry<input type="date" value={form.warrantyExpiryDate} onChange={(e) => setForm({ ...form, warrantyExpiryDate: e.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold text-stone-700">Next service date<input type="date" value={form.nextServiceDate} onChange={(e) => setForm({ ...form, nextServiceDate: e.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold text-stone-700">Condition<select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as AssetCondition })} className={inputClass}>{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
          <label className="text-sm font-semibold text-stone-700">Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AssetStatus })} className={inputClass}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="text-sm font-semibold text-stone-700 sm:col-span-2">Description<textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border border-stone-300 p-3 font-normal" /></label>
          <label className="text-sm font-semibold text-stone-700 sm:col-span-2">Notes<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 w-full rounded-xl border border-stone-300 p-3 font-normal" /></label>
          <label className="text-sm font-semibold text-stone-700 sm:col-span-2">Reason / audit note{editing ? ' (recommended for changes)' : ' (optional)'}<textarea rows={2} value={form.changeReason} onChange={(e) => setForm({ ...form, changeReason: e.target.value })} className="mt-1 w-full rounded-xl border border-stone-300 p-3 font-normal" placeholder="e.g. Annual inventory check; moved to Early Years Centre" /></label>
        </div><div className="flex flex-col-reverse gap-2 border-t border-stone-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowForm(false)} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold">Cancel</button><button type="submit" disabled={saving} className="fx-press fx-btn-main min-h-11 rounded-xl px-5 text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : editing ? 'Save changes' : 'Register asset'}</button></div></form></section></div>}
    </main>
  );
};
