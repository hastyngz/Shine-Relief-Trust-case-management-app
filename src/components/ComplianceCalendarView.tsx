import React, { FormEvent, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Clock3, Plus } from 'lucide-react';
import type { ScheduleItem } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { addScheduleItem, updateScheduleItem } from '../utils/storage';
import { getLocalDateInputValue } from '../utils/inventory';
import { isComplianceDueSoon, isComplianceOverdue } from '../utils/compliance';

interface ComplianceCalendarViewProps {
  schedules: ScheduleItem[];
  onRefresh: () => void;
}

const categories = ['Employment & contracts', 'Staff training & policies', 'Organisational renewal', 'Reporting deadline', 'Asset servicing', 'Stocktaking', 'Finance documentation', 'Procurement', 'Health & safety', 'Safeguarding administration', 'Other'] as const;
const recurrences = ['One-off', 'Monthly', 'Quarterly', 'Every 6 months', 'Annually'] as const;
const priorities = ['Low', 'Medium', 'High', 'Urgent'] as const;
const makeId = () => `CMP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

type ComplianceForm = {
  title: string; category: string; description: string; dueDate: string; priority: typeof priorities[number];
  recurrence: typeof recurrences[number]; assignedStaffId: string; evidenceReference: string;
};
const blankForm = (uid: string): ComplianceForm => ({
  title: '', category: categories[0], description: '', dueDate: getLocalDateInputValue(), priority: 'Medium',
  recurrence: 'One-off', assignedStaffId: uid, evidenceReference: '',
});

export const ComplianceCalendarView: React.FC<ComplianceCalendarViewProps> = ({ schedules, onRefresh }) => {
  const { currentUser, staffProfile, allStaff, canEdit, isViewOnly } = useAuth();
  const today = getLocalDateInputValue();
  const actor = staffProfile?.fullName || currentUser?.displayName || currentUser?.email || 'SHINE Staff';
  const staff = (allStaff || []).filter((person) => person.status === 'Active');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ComplianceForm>(() => blankForm(currentUser?.uid || ''));
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Open' | 'Overdue' | 'Completed'>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [completionTarget, setCompletionTarget] = useState<ScheduleItem | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [completionEvidence, setCompletionEvidence] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const records = useMemo(() => schedules.filter((item) => item.complianceCategory), [schedules]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...records].filter((item) => {
      const textMatches = !term || [item.title, item.description, item.assignedStaffName, item.notes, item.evidenceReference]
        .some((value) => value?.toLowerCase().includes(term));
      const statusMatches = statusFilter === 'All'
        || (statusFilter === 'Completed' ? item.status === 'Completed'
          : statusFilter === 'Overdue' ? isComplianceOverdue(item, today)
            : item.status !== 'Completed' && item.status !== 'Cancelled');
      return textMatches && statusMatches && (categoryFilter === 'All' || item.complianceCategory === categoryFilter);
    }).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.title.localeCompare(b.title));
  }, [records, query, statusFilter, categoryFilter, today]);

  const overdue = records.filter((item) => isComplianceOverdue(item, today)).length;
  const dueSoon = records.filter((item) => isComplianceDueSoon(item, today)).length;
  const completed = records.filter((item) => item.status === 'Completed').length;
  const appendHistory = (item: ScheduleItem, action: NonNullable<ScheduleItem['complianceHistory']>[number]['action'], note?: string) => [
    ...(item.complianceHistory || []),
    { id: makeId(), action, actor, at: new Date().toISOString(), note: note?.trim() || undefined },
  ];

  const saveNew = (event: FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (!form.title.trim() || !form.dueDate || !form.assignedStaffId) {
      setError('Enter an obligation title, due date and responsible person.');
      return;
    }
    const owner = staff.find((person) => person.uid === form.assignedStaffId);
    if (!owner && form.assignedStaffId !== currentUser?.uid) {
      setError('Choose an active staff member responsible for this obligation.');
      return;
    }
    const created = addScheduleItem({
      type: 'other',
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      scheduledDate: form.dueDate,
      targetType: 'general',
      assignedStaffId: owner?.uid || currentUser?.uid || form.assignedStaffId,
      assignedStaffName: owner?.fullName || actor,
      status: 'Scheduled',
      notes: form.description.trim() || undefined,
      createdBy: actor,
      complianceCategory: form.category,
      compliancePriority: form.priority,
      complianceRecurrence: form.recurrence,
      evidenceReference: form.evidenceReference.trim() || undefined,
      complianceHistory: [{ id: makeId(), action: 'Created', actor, at: new Date().toISOString(), note: 'Compliance obligation registered.' }],
    }, actor);
    if (!created.id) {
      setError('SHINE could not create this compliance record.');
      return;
    }
    setForm(blankForm(currentUser?.uid || ''));
    setShowForm(false);
    setNotice('Compliance obligation saved on this device. Cloud sync follows SHINE’s normal sync process.');
    onRefresh();
  };

  const updateStatus = (item: ScheduleItem, status: ScheduleItem['status']) => {
    setError(''); setNotice('');
    const updates: Partial<ScheduleItem> = {
      status,
      completedAt: status === 'Completed' ? new Date().toISOString() : undefined,
      completionNote: undefined,
      complianceHistory: appendHistory(item, status === 'Completed' ? 'Completed' : status === 'In Progress' ? 'Started' : 'Reopened'),
    };
    const updated = updateScheduleItem(item.id, updates, actor);
    if (!updated) { setError('This compliance record could not be found. Refresh and try again.'); return; }
    setNotice(`“${item.title}” updated. The change is saved locally and will sync through SHINE.`);
    onRefresh();
  };

  const complete = () => {
    if (!completionTarget) return;
    if (!completionNote.trim()) { setError('Add a short completion note before closing this obligation.'); return; }
    const target = completionTarget;
    const updated = updateScheduleItem(target.id, {
      status: 'Completed',
      completedAt: new Date().toISOString(),
      completionNote: completionNote.trim(),
      evidenceReference: completionEvidence.trim() || target.evidenceReference,
      complianceHistory: appendHistory(target, 'Completed', completionNote.trim()),
    }, actor);
    if (!updated) { setError('This compliance record could not be found. Refresh and try again.'); return; }
    setCompletionTarget(null); setCompletionNote(''); setCompletionEvidence('');
    setError(''); setNotice(`“${target.title}” marked complete. This records completion; it does not imply external approval.`);
    onRefresh();
  };



  return <section className="mx-auto max-w-7xl space-y-5 pb-8" aria-labelledby="compliance-title">
    <header className="rounded-3xl bg-teal-950 p-5 text-white sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Administration &amp; Operations</p>
      <h1 id="compliance-title" className="mt-1 text-2xl font-black sm:text-3xl">Compliance &amp; Deadlines</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-teal-50">Track administrative obligations, assigned owners, deadlines and supporting evidence. A reminder is not an approval or a management decision.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric icon={<ClipboardCheck className="h-5 w-5" />} label="Registered obligations" value={records.length} />
        <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Overdue" value={overdue} />
        <Metric icon={<CalendarClock className="h-5 w-5" />} label="Due within 30 days" value={dueSoon} />
        <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={completed} />
      </div>
    </header>

    <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950">Management verification is not enabled yet. The existing shared schedule permissions do not enforce manager-only verification at the database boundary, so this phase records completion evidence and history without claiming an independently secured approval.</p>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">Privacy reminder: use this register for administrative obligations and training/policy completion only. Do not enter child-identifying details, safeguarding allegations, health information or confidential case notes here; use the restricted SHINE records and reporting pathway.</p>

    {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-lg font-bold text-stone-900">Obligation register</h2><p className="text-sm text-stone-600">Only records explicitly registered as compliance obligations appear here.</p></div>
      {canEdit && !isViewOnly && <button type="button" onClick={() => { setError(''); setNotice(''); setForm(blankForm(currentUser?.uid || '')); setShowForm(true); }} className="button-primary min-h-11"><Plus className="h-4 w-4" />Add obligation</button>}
    </div>

    <div className="grid gap-2 sm:grid-cols-3">
      <input aria-label="Search compliance obligations" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, owner or evidence" className="field" />
      <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="field">
        <option>All</option><option>Open</option><option>Overdue</option><option>Completed</option>
      </select>
      <select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="field">
        <option>All</option>{categories.map((category) => <option key={category}>{category}</option>)}
      </select>
    </div>

    <div className="space-y-3">
      {filtered.map((item) => {
        const overdueItem = isDueOverdue(item, today);
        const dueSoonItem = isComplianceDueSoon(item, today);
        return <article key={item.id} className="fx-card rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-stone-900">{item.title}</h3>
                <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-700">{item.complianceCategory}</span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${overdueItem ? 'bg-rose-100 text-rose-800' : dueSoonItem ? 'bg-amber-100 text-amber-900' : item.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-700'}`}>{overdueItem ? 'Overdue' : item.status}</span>
              </div>
              {item.description && <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{item.description}</p>}
              <div className="mt-3 grid gap-2 text-xs text-stone-600 sm:grid-cols-2 lg:grid-cols-4">
                <span><strong>Due:</strong> {item.scheduledDate}</span>
                <span><strong>Owner:</strong> {item.assignedStaffName || 'Not assigned'}</span>
                <span><strong>Priority:</strong> {item.compliancePriority || 'Medium'}</span>
                <span><strong>Recurrence:</strong> {item.complianceRecurrence || 'One-off'} (next occurrence is not auto-created)</span>
              </div>
              {item.evidenceReference && <p className="mt-2 break-words text-xs text-stone-600"><strong>Evidence/reference:</strong> {item.evidenceReference}</p>}
              {item.completionNote && <p className="mt-2 text-xs text-stone-700"><strong>Completion note:</strong> {item.completionNote}</p>}
              {(item.complianceHistory || []).length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-teal-900">History ({item.complianceHistory?.length})</summary><ol className="mt-2 space-y-1 border-l-2 border-stone-200 pl-3 text-xs text-stone-600">{[...(item.complianceHistory || [])].reverse().map((entry) => <li key={entry.id}><strong>{entry.action}</strong> · {entry.actor} · {entry.at.slice(0, 16).replace('T', ' ')}{entry.note ? ` — ${entry.note}` : ''}</li>)}</ol></details>}
            </div>
            {canEdit && !isViewOnly && <div className="flex flex-wrap gap-2 sm:max-w-48 sm:justify-end">
              {item.status !== 'Completed' && item.status !== 'Cancelled' && item.status !== 'In Progress' && <button type="button" onClick={() => updateStatus(item, 'In Progress')} className="min-h-10 rounded-lg border border-stone-300 px-3 text-xs font-semibold">Start</button>}
              {item.status !== 'Completed' && item.status !== 'Cancelled' && <button type="button" onClick={() => { setCompletionTarget(item); setCompletionNote(item.completionNote || ''); setCompletionEvidence(item.evidenceReference || ''); setError(''); }} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">Complete</button>}
              {item.status === 'Completed' && <button type="button" onClick={() => updateStatus(item, 'Scheduled')} className="min-h-10 rounded-lg border border-stone-300 px-3 text-xs font-semibold">Reopen</button>}
            </div>}
          </div>
        </article>;
      })}
      {!filtered.length && <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center"><CalendarClock className="mx-auto h-8 w-8 text-stone-400" /><p className="mt-2 font-semibold text-stone-800">No matching compliance obligations</p><p className="mt-1 text-sm text-stone-600">Add an obligation or change the filters. No example records have been added.</p></div>}
    </div>

    {showForm && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="compliance-form-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"><h2 id="compliance-form-title" className="text-xl font-bold">Register compliance obligation</h2><form onSubmit={saveNew} className="mt-4 space-y-3">
      <label className="block text-sm font-medium text-stone-700">Obligation title<input className="field mt-1 w-full" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required maxLength={160} /></label>
      <label className="block text-sm font-medium text-stone-700">Category<select className="field mt-1 w-full" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="block text-sm font-medium text-stone-700">Details<textarea className="field mt-1 w-full" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={4000} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-stone-700">Due date<input type="date" className="field mt-1 w-full" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} required /></label>
        <label className="block text-sm font-medium text-stone-700">Priority<select className="field mt-1 w-full" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as ComplianceForm['priority'] })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
        <label className="block text-sm font-medium text-stone-700">Recurrence<select className="field mt-1 w-full" value={form.recurrence} onChange={(event) => setForm({ ...form, recurrence: event.target.value as ComplianceForm['recurrence'] })}>{recurrences.map((recurrence) => <option key={recurrence}>{recurrence}</option>)}</select></label>
        <label className="block text-sm font-medium text-stone-700">Responsible person<select className="field mt-1 w-full" value={form.assignedStaffId} onChange={(event) => setForm({ ...form, assignedStaffId: event.target.value })} required><option value="">Select staff member</option>{staff.map((person) => <option key={person.uid} value={person.uid}>{person.fullName} · {person.role}</option>)}</select></label>
      </div>
      <label className="block text-sm font-medium text-stone-700">Existing evidence/document reference (optional)<input className="field mt-1 w-full" value={form.evidenceReference} onChange={(event) => setForm({ ...form, evidenceReference: event.target.value })} maxLength={500} /></label>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowForm(false)} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold">Cancel</button><button type="submit" className="button-primary min-h-11">Save obligation</button></div>
    </form></div></div>}

    {completionTarget && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"><div role="dialog" aria-modal="true" aria-labelledby="complete-compliance-title" className="w-full max-w-xl rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"><h2 id="complete-compliance-title" className="text-xl font-bold">Complete obligation</h2><p className="mt-1 text-sm text-stone-600">{completionTarget.title}</p><label className="mt-4 block text-sm font-medium text-stone-700">Completion note<textarea className="field mt-1 w-full" rows={3} value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} required maxLength={4000} /></label><label className="mt-3 block text-sm font-medium text-stone-700">Evidence/document reference (optional)<input className="field mt-1 w-full" value={completionEvidence} onChange={(event) => setCompletionEvidence(event.target.value)} maxLength={500} /></label>{error && <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p>}<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCompletionTarget(null)} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold">Cancel</button><button type="button" onClick={complete} className="button-primary min-h-11">Confirm completion</button></div></div></div>}
  </section>;
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10"><div className="text-amber-300">{icon}</div><p className="mt-2 text-2xl font-black">{value}</p><p className="text-xs text-teal-50">{label}</p></div>;
