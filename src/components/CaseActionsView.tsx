import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDot, Plus, RefreshCw } from 'lucide-react';
import { AppDatabase, CaseAction, CaseActionPriority, CaseActionStatus, CaseActionSourceType } from '../types';
import { addCaseAction, updateCaseAction } from '../utils/storage';
import { persistPhase2Record } from '../services/firestoreSync';
import { useAuth } from '../contexts/AuthContext';

interface CaseActionsViewProps {
  db: AppDatabase;
  onRefresh: () => void;
  onOpenGirl?: (girlId: string) => void;
  onOpenHousehold?: (householdId: string) => void;
}

type ActionFilter = 'All' | 'Mine' | 'Open' | 'Due Today' | 'Due This Week' | 'Overdue' | 'High Priority' | 'Completed';

const priorities: CaseActionPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
const statuses: CaseActionStatus[] = ['Open', 'In Progress', 'Completed', 'Overdue', 'Cancelled'];

function effectiveStatus(action: CaseAction, today: string): CaseActionStatus {
  if (action.status === 'Completed' || action.status === 'Cancelled') return action.status;
  return action.dueDate < today ? 'Overdue' : action.status;
}

export const CaseActionsView: React.FC<CaseActionsViewProps> = ({ db, onRefresh, onOpenGirl, onOpenHousehold }) => {
  const { currentUser, staffProfile, allStaff, role, isAdmin } = useAuth();
  const [filter, setFilter] = useState<ActionFilter>('Mine');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [girlId, setGirlId] = useState('');
  const [householdId, setHouseholdId] = useState('');
  const [personId, setPersonId] = useState('');
  const [assignedStaffId, setAssignedStaffId] = useState(currentUser?.uid || '');
  const [source, setSource] = useState('manual');
  const [priority, setPriority] = useState<CaseActionPriority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActionFilter>('Mine');
  const [error, setError] = useState('');

  const actor = {
    uid: currentUser?.uid || '',
    name: staffProfile?.fullName || currentUser?.displayName || currentUser?.email || 'SHINE Staff',
  };
  const canAssignTeamTasks = isAdmin || role === 'Manager';
  const actions = db.caseActions || [];
  const today = new Date().toISOString().slice(0, 10);
  const endOfWeek = new Date();
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const weekLimit = endOfWeek.toISOString().slice(0, 10);
  const activeActions = actions.filter((action) => !['Completed', 'Cancelled'].includes(action.status));
  const openMine = actions.filter((action) => action.assignedStaffId === actor.uid && !['Completed', 'Cancelled'].includes(action.status));
  const dueToday = activeActions.filter((action) => action.dueDate === today);
  const dueThisWeek = activeActions.filter((action) => action.dueDate >= today && action.dueDate <= weekLimit);
  const overdue = activeActions.filter((action) => action.dueDate < today);
  const highPriority = activeActions.filter((action) => action.priority === 'High' || action.priority === 'Urgent');
  const completed = actions.filter((action) => action.status === 'Completed');

  const sourceOptions = useMemo(() => [
    ...db.educationalFollowUps.map((record) => ({ id: record.id, type: 'educationalFollowUp' as const, title: `Education: ${record.academicIssue}` })),
    ...db.healthFollowUps.map((record) => ({ id: record.id, type: 'healthFollowUp' as const, title: `Health: ${record.reasonForVisit}` })),
    ...db.familyFollowUps.map((record) => ({ id: record.id, type: 'familyFollowUp' as const, title: `Family: ${record.contactType}` })),
    ...(db.householdActivities || []).map((record) => ({ id: record.id, type: 'householdActivity' as const, title: `Activity: ${record.activityName}` })),
    ...db.rentPayments.map((record) => ({ id: record.id, type: 'rentPayment' as const, title: `Rent: ${record.monthCovered}` })),
    ...db.expenses.map((record) => ({ id: record.id, type: 'expense' as const, title: `Expense: ${record.itemDescription}` })),
  ], [db]);

  useEffect(() => {
    if (!currentUser) return;
    currentUser.getIdToken().then((token) => fetch('/api/case-actions/check-reminders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })).catch((err) => console.warn('Case action reminder check failed:', err));
  }, [currentUser?.uid]);

  const visibleActions = actions.filter((action) => {
    const actionStatus = effectiveStatus(action, today);
    switch (filter) {
      case 'Mine': return action.assignedStaffId === actor.uid && !['Completed', 'Cancelled'].includes(action.status);
      case 'Open': return ['Open', 'In Progress'].includes(action.status);
      case 'Due Today': return action.dueDate === today && !['Completed', 'Cancelled'].includes(action.status);
      case 'Due This Week': return action.dueDate >= today && action.dueDate <= weekLimit && !['Completed', 'Cancelled'].includes(action.status);
      case 'Overdue': return actionStatus === 'Overdue';
      case 'High Priority': return ['High', 'Urgent'].includes(action.priority) && !['Completed', 'Cancelled'].includes(action.status);
      case 'Completed': return action.status === 'Completed';
      default: return true;
    }
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!actor.uid || !title.trim() || !dueDate || !assignedStaffId) {
      setError('Title, assigned staff member, and due date are required.');
      return;
    }
    if (!canAssignTeamTasks && assignedStaffId !== actor.uid) {
      setError('Staff can assign actions only to themselves.');
      return;
    }
    const selectedSource = sourceOptions.find((option) => `${option.type}|${option.id}` === source);
    const action = addCaseAction({
      title: title.trim(),
      description: description.trim(),
      girlId: girlId || undefined,
      householdId: householdId || undefined,
      personId: personId || undefined,
      assignedStaffId,
      assignedStaffName: allStaff.find((staff) => staff.uid === assignedStaffId)?.fullName || actor.name,
      sourceType: (selectedSource?.type || 'manual') as CaseActionSourceType,
      sourceId: selectedSource?.id,
      priority,
      status: 'Open',
      dueDate,
    }, actor);

    try {
      await persistPhase2Record('caseActions', action);
      const token = await currentUser!.getIdToken();
      await fetch('/api/case-actions/notify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: action.id, kind: 'assigned' }),
      });
    } catch (err) {
      console.warn('Case action notification failed:', err);
    }
    setTitle('');
    setDescription('');
    setGirlId('');
    setHouseholdId('');
    setPersonId('');
    setSource('manual');
    setDueDate('');
    setShowForm(false);
    onRefresh();
  };

  const changeStatus = (action: CaseAction, nextStatus: CaseActionStatus) => {
    const completionNotes = nextStatus === 'Completed'
      ? window.prompt('Completion notes (optional):', action.completionNotes || '') ?? undefined
      : undefined;
    if (nextStatus === 'Completed' && completionNotes === undefined) return;
    updateCaseAction(action.id, { status: nextStatus, ...(completionNotes !== undefined ? { completionNotes } : {}) }, actor);
    onRefresh();
  };

  const reassign = async (action: CaseAction, nextStaffId: string) => {
    const assignee = allStaff.find((staff) => staff.uid === nextStaffId);
    if (!assignee || nextStaffId === action.assignedStaffId) return;
    const updatedAction = updateCaseAction(action.id, { assignedStaffId: assignee.uid, assignedStaffName: assignee.fullName }, actor);
    try {
      if (updatedAction) await persistPhase2Record('caseActions', updatedAction);
      const token = await currentUser!.getIdToken();
      await fetch('/api/case-actions/notify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: action.id, kind: 'reassigned' }),
      });
    } catch (err) {
      console.warn('Case action reassignment notification failed:', err);
    }
    onRefresh();
  };

  const metric = (label: string, count: number, value: ActionFilter, color: string) => (
    <button key={label} onClick={() => setFilter(value)} className={`text-left p-3 border rounded-lg ${color} hover:brightness-[0.98]`}>
      <span className="block text-[10px] uppercase font-bold">{label}</span>
      <span className="block text-xl font-black mt-0.5">{count}</span>
    </button>
  );

  return (
    <section className="space-y-4" aria-label="Case actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900">Case Actions</h2>
          <p className="text-xs text-stone-500">Assigned follow-up work across girls and households</p>
        </div>
        <button onClick={() => setShowForm((shown) => !shown)} className="inline-flex items-center gap-2 bg-teal-900 text-white px-3 py-2 rounded-lg text-xs font-bold">
          <Plus className="w-4 h-4" /> New action
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {metric('My open tasks', openMine.length, 'Mine', 'bg-white border-stone-200 text-stone-900')}
        {metric('Due today', dueToday.length, 'Due Today', 'bg-amber-50 border-amber-200 text-amber-950')}
        {metric('Due this week', dueThisWeek.length, 'Due This Week', 'bg-sky-50 border-sky-200 text-sky-950')}
        {metric('Overdue', overdue.length, 'Overdue', 'bg-rose-50 border-rose-200 text-rose-950')}
        {metric('High priority', highPriority.length, 'High Priority', 'bg-orange-50 border-orange-200 text-orange-950')}
        {metric('Completed', completed.length, 'Completed', 'bg-emerald-50 border-emerald-200 text-emerald-950')}
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white border border-stone-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-stone-700">Action title *
            <input value={title} onChange={(event) => setTitle(event.target.value)} required className="mt-1 w-full border border-stone-300 rounded-md px-2.5 py-2" />
          </label>
          <label className="text-xs font-semibold text-stone-700">Due date *
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required className="mt-1 w-full border border-stone-300 rounded-md px-2.5 py-2" />
          </label>
          <label className="text-xs font-semibold text-stone-700">Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full border border-stone-300 rounded-md px-2.5 py-2" />
          </label>
          <label className="text-xs font-semibold text-stone-700">Source follow-up or activity
            <select value={source} onChange={(event) => {
              const value = event.target.value;
              setSource(value);
              const [type, id] = value.split('|');
              if (!id) return;
              if (type === 'educationalFollowUp' || type === 'healthFollowUp' || type === 'familyFollowUp') setGirlId(db.girls.find((girl) => (type === 'educationalFollowUp' ? db.educationalFollowUps : type === 'healthFollowUp' ? db.healthFollowUps : db.familyFollowUps).some((record) => record.id === id && record.girlId === girl.id))?.id || '');
              if (type === 'householdActivity') setHouseholdId(db.householdActivities.find((record) => record.id === id)?.householdId || '');
              if (type === 'rentPayment') setHouseholdId(db.rentPayments.find((record) => record.id === id)?.householdId || '');
              if (type === 'expense') setHouseholdId(db.expenses.find((record) => record.id === id)?.householdId || '');
            }} className="mt-1 w-full border border-stone-300 rounded-md px-2.5 py-2">
              <option value="manual">Manual action</option>
              {sourceOptions.map((option) => <option key={`${option.type}-${option.id}`} value={`${option.type}|${option.id}`}>{option.title}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-700">Related girl
            <select value={girlId} onChange={(event) => setGirlId(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md px-2.5 py-2">
              <option value="">None</option>{db.girls.map((girl) => <option key={girl.id} value={girl.id}>{girl.fullName} ({girl.id})</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-700">Related household
            <select value={householdId} onChange={(event) => setHouseholdId(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md px-2.5 py-2">
              <option value="">None</option>{db.households.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-700">Related contact
            <select value={personId} onChange={(event) => setPersonId(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md px-2.5 py-2">
              <option value="">None</option>{(db.people || []).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-700">Assigned staff member *
            <select value={assignedStaffId} onChange={(event) => setAssignedStaffId(event.target.value)} disabled={!canAssignTeamTasks} className="mt-1 w-full border border-stone-300 rounded-md px-2.5 py-2 disabled:bg-stone-100">
              {allStaff.filter((staff) => staff.status === 'Active').map((staff) => <option key={staff.uid} value={staff.uid}>{staff.fullName} · {staff.role}</option>)}
              {!allStaff.some((staff) => staff.uid === actor.uid) && <option value={actor.uid}>{actor.name}</option>}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-700">Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value as CaseActionPriority)} className="mt-1 w-full border border-stone-300 rounded-md px-2.5 py-2">
              {priorities.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          {error && <p role="alert" className="md:col-span-2 text-xs text-rose-700">{error}</p>}
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 text-xs font-semibold text-stone-700">Cancel</button>
            <button type="submit" className="bg-teal-900 text-white px-4 py-2 rounded-md text-xs font-bold">Create action</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="case-action-filter" className="text-xs text-stone-600">Show</label>
        <select id="case-action-filter" value={filter} onChange={(event) => setFilter(event.target.value as ActionFilter)} className="border border-stone-300 rounded-md px-2.5 py-2 text-xs">
          {(canAssignTeamTasks ? ['All', 'Mine', 'Open', 'Due Today', 'Due This Week', 'Overdue', 'High Priority', 'Completed'] : ['Mine', 'Due Today', 'Due This Week', 'Overdue', 'High Priority', 'Completed']).map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>

      <div className="divide-y divide-stone-200 border-y border-stone-200">
        {visibleActions.map((action) => {
          const currentStatus = effectiveStatus(action, today);
          const assignee = allStaff.find((staff) => staff.uid === action.assignedStaffId);
          const canUpdate = canAssignTeamTasks || action.assignedStaffId === actor.uid;
          return (
            <article key={action.id} className="py-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-stone-900">{action.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${currentStatus === 'Overdue' ? 'bg-rose-100 text-rose-800' : currentStatus === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-700'}`}>{currentStatus}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-900">{action.priority}</span>
                  </div>
                  {action.description && <p className="mt-1 text-xs text-stone-600 whitespace-pre-line">{action.description}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500">
                    <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />Due {action.dueDate}</span>
                    <span>Assigned: {assignee?.fullName || action.assignedStaffName}</span>
                    {action.girlId && <button className="text-teal-800 underline" onClick={() => onOpenGirl?.(action.girlId!)}>{db.girls.find((girl) => girl.id === action.girlId)?.fullName || action.girlId}</button>}
                    {action.householdId && <button className="text-teal-800 underline" onClick={() => onOpenHousehold?.(action.householdId!)}>{db.households.find((house) => house.id === action.householdId)?.name || action.householdId}</button>}
                    {action.sourceId && <span>Source: {action.sourceType}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {canAssignTeamTasks && action.status !== 'Completed' && action.status !== 'Cancelled' && (
                    <select aria-label={`Reassign ${action.title}`} value={action.assignedStaffId} onChange={(event) => reassign(action, event.target.value)} className="border border-stone-300 rounded-md px-2 py-1.5 text-[11px]">
                      {allStaff.filter((staff) => staff.status === 'Active').map((staff) => <option key={staff.uid} value={staff.uid}>{staff.fullName}</option>)}
                    </select>
                  )}
                  {canUpdate && ['Open', 'Overdue'].includes(currentStatus) && <button onClick={() => changeStatus(action, 'In Progress')} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-sky-50 text-sky-900 text-[11px] font-bold"><CircleDot className="w-3 h-3" />Start</button>}
                  {canUpdate && !['Completed', 'Cancelled'].includes(action.status) && <button onClick={() => changeStatus(action, 'Completed')} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-emerald-50 text-emerald-900 text-[11px] font-bold"><CheckCircle2 className="w-3 h-3" />Complete</button>}
                  {canAssignTeamTasks && !['Completed', 'Cancelled'].includes(action.status) && <button onClick={() => changeStatus(action, 'Cancelled')} className="px-2 py-1.5 rounded-md bg-stone-100 text-stone-700 text-[11px] font-bold">Cancel</button>}
                </div>
              </div>
              {action.completionNotes && <p className="text-xs text-emerald-900 bg-emerald-50 rounded-md p-2">Completion notes: {action.completionNotes}</p>}
            </article>
          );
        })}
        {visibleActions.length === 0 && <div className="py-10 text-center text-xs text-stone-500"><AlertTriangle className="w-5 h-5 mx-auto mb-2 text-stone-400" />No case actions match this filter.</div>}
      </div>
      <p className="inline-flex items-center gap-1 text-[10px] text-stone-500"><RefreshCw className="w-3 h-3" />Due and overdue states are calculated from the due date. Tasks are never completed automatically.</p>
    </section>
  );
};