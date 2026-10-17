import React, { useEffect, useState } from 'react';
import { CaseGoal, CaseGoalStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface CaseGoalsPanelProps {
  girlId: string;
  goals: CaseGoal[];
  canEdit: boolean;
  onSave: (goal: CaseGoal) => Promise<void>;
}

const goalStatuses: CaseGoalStatus[] = ['Not started', 'In progress', 'Achieved', 'Not achieved', 'On hold'];
const emptyDraft = { title: '', baseline: '', targetOutcome: '', measureOfSuccess: '', targetDate: '' };

function getGoalDraftKey(uid: string, girlId: string): string {
  return `shine_case_goal_draft_v1_${uid}_${girlId}`;
}

export const CaseGoalsPanel: React.FC<CaseGoalsPanelProps> = ({ girlId, goals, canEdit, onSave }) => {
  const { currentUser, staffProfile } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const draftKey = currentUser ? getGoalDraftKey(currentUser.uid, girlId) : '';
  const [hydratedDraftKey, setHydratedDraftKey] = useState('');
  const [progressDrafts, setProgressDrafts] = useState<Record<string, { note: string; status: CaseGoalStatus; outcome: string }>>({});

  useEffect(() => {
    if (!draftKey) return;
    setHydratedDraftKey('');
    let restored = emptyDraft;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) restored = { ...emptyDraft, ...JSON.parse(raw) };
    } catch (draftError) {
      console.warn('Could not restore case goal draft:', draftError);
    }
    setDraft(restored);
    setShowForm(Boolean(restored.title || restored.baseline || restored.targetOutcome || restored.measureOfSuccess || restored.targetDate));
    setHydratedDraftKey(draftKey);
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || hydratedDraftKey !== draftKey) return;
    const hasContent = Object.values(draft).some(Boolean);
    if (!hasContent) {
      window.localStorage.removeItem(draftKey);
      return;
    }
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft, draftKey, hydratedDraftKey]);

  const save = async (goal: CaseGoal): Promise<boolean> => {
    setSavingId(goal.id);
    setError('');
    try {
      await onSave(goal);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the goal. It remains on this device.');
      return false;
    } finally {
      setSavingId('');
    }
  };

  const createGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser || !draft.title.trim() || !draft.targetOutcome.trim() || !draft.measureOfSuccess.trim()) return;
    const now = new Date().toISOString();
    const actor = staffProfile?.fullName || currentUser.displayName || currentUser.email || 'SHINE Staff';
    const goal: CaseGoal = {
      id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      girlId,
      title: draft.title.trim(),
      baseline: draft.baseline.trim(),
      targetOutcome: draft.targetOutcome.trim(),
      measureOfSuccess: draft.measureOfSuccess.trim(),
      targetDate: draft.targetDate || undefined,
      status: 'Not started',
      progressNotes: [],
      createdByUid: currentUser.uid,
      createdBy: actor,
      createdAt: now,
      updatedByUid: currentUser.uid,
      updatedBy: actor,
      updatedAt: now,
    };
    if (await save(goal)) {
      setDraft({ title: '', baseline: '', targetOutcome: '', measureOfSuccess: '', targetDate: '' });
      setShowForm(false);
    }
  };

  const recordProgress = async (goal: CaseGoal) => {
    if (!currentUser) return;
    const entry = progressDrafts[goal.id] || { note: '', status: goal.status, outcome: goal.outcome || '' };
    if (!entry.note.trim() && entry.status === goal.status && entry.outcome === (goal.outcome || '')) return;
    if (['Achieved', 'Not achieved'].includes(entry.status) && !entry.outcome.trim()) {
      setError('Record outcome evidence before closing a goal.');
      return;
    }
    const now = new Date().toISOString();
    const actor = staffProfile?.fullName || currentUser.displayName || currentUser.email || 'SHINE Staff';
    const saved = await save({
      ...goal,
      status: entry.status,
      progressNotes: entry.note.trim()
        ? [...goal.progressNotes, { id: `progress_${Date.now()}`, date: now, note: entry.note.trim(), recordedBy: actor }]
        : goal.progressNotes,
      outcome: entry.outcome.trim() || undefined,
      outcomeRecordedAt: entry.outcome.trim() ? now : goal.outcomeRecordedAt,
      updatedByUid: currentUser.uid,
      updatedBy: actor,
      updatedAt: now,
    });
    if (saved) setProgressDrafts((current) => ({ ...current, [goal.id]: { note: '', status: entry.status, outcome: entry.outcome } }));
  };

  return (
    <section className="space-y-3" aria-label="Case goals and outcomes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-teal-950">Case goals & outcomes</h2>
          <p className="text-xs text-stone-500">Track a baseline, measurable target, progress, and verified outcome.</p>
        </div>
        {canEdit && <button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-md bg-teal-900 px-3 py-2 text-xs font-bold text-white">{showForm ? 'Close' : 'Add goal'}</button>}
      </div>

      {showForm && (
        <form onSubmit={createGoal} className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-2">
          <label className="text-xs font-semibold text-stone-700">Goal title *<input required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full rounded-md border border-stone-300 px-2.5 py-2" /></label>
          <label className="text-xs font-semibold text-stone-700">Target date<input type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} className="mt-1 w-full rounded-md border border-stone-300 px-2.5 py-2" /></label>
          <label className="text-xs font-semibold text-stone-700">Baseline / current situation<textarea maxLength={1200} rows={2} value={draft.baseline} onChange={(event) => setDraft({ ...draft, baseline: event.target.value })} className="mt-1 w-full rounded-md border border-stone-300 px-2.5 py-2" /></label>
          <label className="text-xs font-semibold text-stone-700">Desired outcome *<textarea required maxLength={1200} rows={2} value={draft.targetOutcome} onChange={(event) => setDraft({ ...draft, targetOutcome: event.target.value })} className="mt-1 w-full rounded-md border border-stone-300 px-2.5 py-2" /></label>
          <label className="text-xs font-semibold text-stone-700 md:col-span-2">How success will be measured *<textarea required maxLength={600} rows={2} value={draft.measureOfSuccess} onChange={(event) => setDraft({ ...draft, measureOfSuccess: event.target.value })} className="mt-1 w-full rounded-md border border-stone-300 px-2.5 py-2" /></label>
          <div className="md:col-span-2 flex justify-end"><button disabled={Boolean(savingId)} className="rounded-md bg-teal-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Save goal</button></div>
        </form>
      )}

      {error && <p role="alert" className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">{error}</p>}
      {goals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 px-4 py-5 text-center text-xs text-stone-500">No goals recorded for this case.</p>
      ) : goals.map((goal) => {
        const progress = progressDrafts[goal.id] || { note: '', status: goal.status, outcome: goal.outcome || '' };
        return (
          <article key={goal.id} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="text-sm font-bold text-stone-900">{goal.title}</h3><p className="mt-1 text-xs text-stone-600">{goal.status}{goal.targetDate ? ` · Target ${goal.targetDate}` : ''}</p></div>
              {canEdit && <label className="sr-only" htmlFor={`goal-status-${goal.id}`}>Goal status</label>}
            </div>
            <dl className="grid gap-2 text-xs sm:grid-cols-3">
              <div><dt className="font-semibold text-stone-500">Baseline</dt><dd className="mt-0.5 text-stone-800">{goal.baseline || 'Not recorded'}</dd></div>
              <div><dt className="font-semibold text-stone-500">Target outcome</dt><dd className="mt-0.5 text-stone-800">{goal.targetOutcome}</dd></div>
              <div><dt className="font-semibold text-stone-500">Measure</dt><dd className="mt-0.5 text-stone-800">{goal.measureOfSuccess}</dd></div>
            </dl>
            {goal.progressNotes.length > 0 && <ol className="space-y-1 border-l-2 border-teal-200 pl-3">{goal.progressNotes.map((note) => <li key={note.id} className="text-xs text-stone-700"><span className="font-semibold">{note.date.slice(0, 10)} · {note.recordedBy}:</span> {note.note}</li>)}</ol>}
            {goal.outcome && <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-950"><strong>Recorded outcome:</strong> {goal.outcome}{goal.outcomeRecordedAt ? ` · ${goal.outcomeRecordedAt.slice(0, 10)}` : ''}</p>}
            {canEdit && (
              <div className="grid gap-2 border-t border-stone-100 pt-3 sm:grid-cols-[auto_1fr_1fr_auto]">
                <select id={`goal-status-${goal.id}`} aria-label={`Status for ${goal.title}`} value={progress.status} onChange={(event) => setProgressDrafts({ ...progressDrafts, [goal.id]: { ...progress, status: event.target.value as CaseGoalStatus } })} className="rounded-md border border-stone-300 px-2 py-2 text-xs">{goalStatuses.map((status) => <option key={status}>{status}</option>)}</select>
                <input maxLength={800} aria-label={`Progress note for ${goal.title}`} placeholder="Progress note" value={progress.note} onChange={(event) => setProgressDrafts({ ...progressDrafts, [goal.id]: { ...progress, note: event.target.value } })} className="rounded-md border border-stone-300 px-2 py-2 text-xs" />
                <input maxLength={800} aria-label={`Outcome for ${goal.title}`} placeholder="Outcome / evidence" value={progress.outcome} onChange={(event) => setProgressDrafts({ ...progressDrafts, [goal.id]: { ...progress, outcome: event.target.value } })} className="rounded-md border border-stone-300 px-2 py-2 text-xs" />
                <button type="button" disabled={savingId === goal.id} onClick={() => void recordProgress(goal)} className="rounded-md bg-stone-100 px-3 py-2 text-xs font-bold text-stone-800 disabled:opacity-50">Save update</button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
};