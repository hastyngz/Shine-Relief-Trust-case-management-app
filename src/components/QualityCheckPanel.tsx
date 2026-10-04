import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { QualityIssue } from '../services/qualityRules';

export interface QualityIssueResolution {
  status: 'resolved' | 'overridden' | 'pending-approval';
  note: string;
  value?: unknown;
  before?: unknown;
  after?: unknown;
}

interface QualityCheckPanelProps {
  issues: QualityIssue[];
  scores: { quantification: number; impact: number; dataQuality: number };
  onApplyFix?: (issue: QualityIssue) => void;
  onOpenIssue?: (issue: QualityIssue) => void;
  canOpenIssue?: (issue: QualityIssue) => boolean;
  onResolveIssue?: (issue: QualityIssue, resolution: QualityIssueResolution) => boolean;
  onUndoFix?: (issue: QualityIssue) => void;
  currentUserName?: string;
  canApproveNarrativeOnly?: boolean;
  className?: string;
  linkNarrative?: boolean;
}

const severityOrder: QualityIssue['severity'][] = ['blocker', 'warning', 'info'];
const severityLabel: Record<QualityIssue['severity'], string> = {
  blocker: 'Blockers',
  warning: 'Warnings',
  info: 'Information',
};
const PAGE_SIZE = 25;

function issueKey(issue: QualityIssue): string {
  return `${issue.rule}|${issue.message}`;
}

export const QualityCheckPanel: React.FC<QualityCheckPanelProps> = ({
  issues,
  scores,
  onApplyFix,
  onOpenIssue,
  canOpenIssue,
  onResolveIssue,
  onUndoFix,
  currentUserName = 'Current user',
  canApproveNarrativeOnly = false,
  className = '',
}) => {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [ruleFilter, setRuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [selectedIssue, setSelectedIssue] = useState<QualityIssue | null>(null);
  const [resolved, setResolved] = useState<Array<{ issue: QualityIssue; resolution: QualityIssueResolution; by: string; at: string }>>([]);
  const [formValue, setFormValue] = useState('');
  const [note, setNote] = useState('');
  const [period, setPeriod] = useState('');
  const [who, setWho] = useState('');
  const [count, setCount] = useState('');
  const [activityCount, setActivityCount] = useState('');
  const [activityType, setActivityType] = useState('');
  const [place, setPlace] = useState('');
  const [validitySource, setValiditySource] = useState('');
  const [validityReference, setValidityReference] = useState('');
  const [validitySecondSource, setValiditySecondSource] = useState('');
  const [validityDefinitionMatched, setValidityDefinitionMatched] = useState(false);
  const [validityCheckedBy, setValidityCheckedBy] = useState('');
  const [applyValidityToAll, setApplyValidityToAll] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [lastBatch, setLastBatch] = useState<QualityIssue[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const resolvedIds = useMemo(() => new Set(resolved.map(({ issue }) => issue.id)), [resolved]);
  const allOpen = issues.filter((issue) => (issue.status || 'open') === 'open' && !resolvedIds.has(issue.id));
  const resolvedItems = resolved.filter(({ resolution }) => resolution.status === 'resolved' || resolution.status === 'overridden');
  const pendingItems = resolved.filter(({ resolution }) => resolution.status === 'pending-approval');
  const baseItems = statusFilter === 'open'
    ? allOpen
    : statusFilter === 'pending-approval'
      ? pendingItems.map(({ issue }) => ({ ...issue, status: 'pending-approval' as const }))
      : [
        ...issues.filter((issue) => (issue.status === 'resolved' || issue.status === 'overridden') && !resolvedIds.has(issue.id)),
        ...resolvedItems.map(({ issue, resolution }) => ({ ...issue, status: resolution.status })),
      ];
  const filteredIssues = baseItems.filter((issue) =>
    (severityFilter === 'all' || issue.severity === severityFilter)
    && (ruleFilter === 'all' || issue.rule === ruleFilter));
  const grouped = useMemo(() => {
    const groups = new Map<string, QualityIssue[]>();
    filteredIssues.forEach((issue) => {
      const key = issueKey(issue);
      groups.set(key, [...(groups.get(key) || []), issue]);
    });
    return Array.from(groups.entries()).map(([key, groupedIssues]) => ({
      key,
      issues: groupedIssues,
      severity: severityOrder.find((severity) => groupedIssues.some((issue) => issue.severity === severity)) || 'info',
      safeFixes: groupedIssues.filter((issue) => issue.fix?.safe && onApplyFix),
    }));
  }, [filteredIssues, onApplyFix]);
  const selectedGroup = grouped.find((group) => group.key === expandedGroup);
  const visibleGroupIssues = selectedGroup?.issues.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) || [];
  const rules = Array.from(new Set(issues.map((issue) => issue.rule))).sort();

  useEffect(() => {
    if (!selectedIssue) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea');
      first?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedIssue(null);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [selectedIssue]);

  const openDialog = (issue: QualityIssue) => {
    setSelectedIssue(issue);
    setFormValue(typeof issue.fix?.suggestedValue === 'string' ? issue.fix.suggestedValue : '');
    setNote('');
    setPeriod('');
    setWho('');
    setCount('');
    setActivityCount('');
    setActivityType('');
    setPlace('');
    setValiditySource('');
    setValidityReference('');
    setValiditySecondSource('');
    setValidityDefinitionMatched(false);
    setValidityCheckedBy('');
    setApplyValidityToAll(false);
    setDialogError('');
  };

  const complete = (status: QualityIssueResolution['status'], value?: unknown) => {
    if (!selectedIssue) return;
    if ((status === 'overridden' || (status === 'pending-approval' && selectedIssue.severity === 'blocker')) && note.trim().length < 10) {
      setDialogError('Enter a written reason of at least 10 characters.');
      return;
    }
    const resolution: QualityIssueResolution = {
      status,
      note: note.trim(),
      ...(value !== undefined ? { value } : {}),
    };
    const stoppedFiring = onResolveIssue?.(selectedIssue, resolution) === true;
    if (!stoppedFiring && status === 'resolved') {
      setDialogError('The rule still applies. The issue remains open; review the saved value and try again.');
      return;
    }
    setResolved((current) => [
      ...current.filter((item) => item.issue.id !== selectedIssue.id),
      { issue: selectedIssue, resolution, by: currentUserName, at: new Date().toISOString() },
    ]);
    const queue = selectedGroup?.issues || filteredIssues;
    const next = queue[queue.findIndex((issue) => issue.id === selectedIssue.id) + 1];
    setSelectedIssue(next || null);
  };

  const submitForm = () => {
    if (!selectedIssue) return;
    if (selectedIssue.rule === 'DQ-VALIDITY') {
      if ((!validitySource.trim() || !validityReference.trim()) && !validitySecondSource.trim()) {
        setDialogError('Name and reference/date for a source, or choose a second source.');
        return;
      }
      if (!validityDefinitionMatched) {
        setDialogError('Confirm that the value matches the indicator definition, unit, period, and group.');
        return;
      }
      if (!validityCheckedBy.trim() || !note.trim()) {
        setDialogError('Enter the second checker and a validation note.');
        return;
      }
      complete('resolved', {
        checks: [
          ...((validitySource.trim() && validityReference.trim()) ? ['source-seen'] : []),
          ...(validitySecondSource.trim() ? ['cross-checked'] : []),
          'definition-match',
        ],
        source: validitySource.trim() && validityReference.trim()
          ? { name: validitySource.trim(), reference: validityReference.trim() }
          : undefined,
        secondSource: validitySecondSource.trim() || undefined,
        checkedBy: validityCheckedBy.trim(),
        checkedAt: new Date().toISOString(),
        note: note.trim(),
        applyToAll: applyValidityToAll,
      });
      return;
    }
    if (selectedIssue.rule === 'QUANT-03' && formValue === 'narrative-only') {
      if (note.trim().length < 10) {
        setDialogError('A narrative-only reason must be at least 10 characters.');
        return;
      }
      complete(canApproveNarrativeOnly ? 'resolved' : 'pending-approval', {
        narrativeOnly: true,
        narrativeOnlyReason: note.trim(),
        managerApproved: canApproveNarrativeOnly,
      });
      return;
    }
    if (selectedIssue.rule === 'QUANT-03' && formValue) {
      complete('resolved', { indicatorId: formValue });
      return;
    }
    if (selectedIssue.rule === 'IDENTITY-FUZZY-01' && formValue) {
      complete('resolved', { candidateId: formValue });
      return;
    }
    if (selectedIssue.rule === 'FIN-TOTAL-DISAGREEMENT-01' && formValue === 'keep-stated') {
      if (note.trim().length < 10) {
        setDialogError('Explain why the stated total is retained (at least 10 characters).');
        return;
      }
      complete('overridden', { decision: 'keep-stated' });
      return;
    }
    if (selectedIssue.rule === 'FIN-TOTAL-DISAGREEMENT-01' && formValue) {
      complete('resolved', Number(formValue));
      return;
    }
    if (selectedIssue.rule === 'QUANT-02') {
      if (!period.trim() || !who.trim() || !count.trim() || !activityCount.trim() || !activityType.trim() || !place.trim()) {
        setDialogError('Complete each field to rebuild the quantified sentence.');
        return;
      }
      complete('resolved', `In ${period.trim()}, ${count.trim()} ${who.trim()} took part in ${activityCount.trim()} ${activityType.trim()} at ${place.trim()}.`);
      return;
    }
    if (selectedIssue.severity !== 'blocker' && !formValue.trim() && !note.trim()) {
      setDialogError('Enter a corrected value or a review note.');
      return;
    }
    complete('resolved', formValue || undefined);
  };

  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-4 ${className}`} aria-label="Quality check">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-stone-900">Quality check</h2>
          <p className="mt-1 text-xs text-stone-600" aria-live="polite">
            {allOpen.length ? `${allOpen.length} open issue(s) need review.` : 'No open quality issues detected.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="text-xs text-stone-700">Severity
              <select className="ml-1 rounded border border-stone-300 p-1" value={severityFilter} onChange={(event) => { setSeverityFilter(event.target.value); setPage(0); }}>
                <option value="all">All</option><option value="blocker">Blocker</option><option value="warning">Warning</option><option value="info">Info</option>
              </select>
            </label>
            <label className="text-xs text-stone-700">Rule
              <select className="ml-1 max-w-40 rounded border border-stone-300 p-1" value={ruleFilter} onChange={(event) => { setRuleFilter(event.target.value); setPage(0); }}>
                <option value="all">All rules</option>{rules.map((rule) => <option key={rule} value={rule}>{rule}</option>)}
              </select>
            </label>
            <label className="text-xs text-stone-700">Status
              <select className="ml-1 rounded border border-stone-300 p-1" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}>
                <option value="open">Open</option><option value="pending-approval">Pending approval</option><option value="resolved">Resolved / overridden</option>
              </select>
            </label>
          </div>
          {lastBatch.length > 0 && onUndoFix && (
            <button type="button" className="mt-3 rounded border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-900" onClick={() => {
              lastBatch.forEach((issue) => onUndoFix(issue));
              setResolved((current) => current.filter((entry) => !lastBatch.some((issue) => issue.id === entry.issue.id)));
              setLastBatch([]);
            }}>Undo last safe batch ({lastBatch.length})</button>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {([
            ['Quantification', scores.quantification],
            ['Impact evidence', scores.impact],
            ['Data quality', scores.dataQuality],
          ] as Array<[string, number]>).map(([label, score]) => (
            <div key={label} className="min-w-20 rounded-lg bg-stone-50 px-2 py-1">
              <dt className="text-[10px] font-semibold text-stone-600">{label}</dt>
              <dd className="text-sm font-black text-stone-900">{score}/100</dd>
            </div>
          ))}
        </dl>
      </div>

      {grouped.map((group) => (
        <article key={group.key} className="mt-3 rounded-lg border border-stone-200 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-stone-900">{group.issues[0].rule}: {group.issues[0].message}</p>
              <p className="mt-1 text-[11px] text-stone-600">{severityLabel[group.severity]} · {group.issues.length} record(s)</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded border border-stone-400 px-2 py-1 text-xs font-semibold" onClick={() => { setExpandedGroup(group.key); setPage(0); }}>
                Review one by one
              </button>
              {group.safeFixes.length > 0 && (
                <button type="button" className="rounded border border-teal-700 px-2 py-1 text-xs font-bold text-teal-900" onClick={() => { setExpandedGroup(group.key); setConfirmBatch(true); }}>
                  Fix all safe ({group.safeFixes.length})
                </button>
              )}
            </div>
          </div>
          {expandedGroup === group.key && (
            <div className="mt-3 space-y-2">
              {visibleGroupIssues.map((issue) => (
                <div key={issue.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2 text-xs">
                  <div className="min-w-0">
                    <p className="break-words text-stone-800">{issue.context || issue.location}</p>
                    {issue.suggestedFix && <p className="mt-1 text-stone-500">{issue.suggestedFix}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {issue.target && onOpenIssue && canOpenIssue?.(issue) !== false && <button type="button" className="underline" onClick={() => onOpenIssue(issue)}>Go to record</button>}
                    <button type="button" className="rounded bg-teal-800 px-2 py-1 font-semibold text-white" onClick={() => openDialog(issue)}>Review / fix</button>
                  </div>
                </div>
              ))}
              {group.issues.length > PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2 text-xs">
                  <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded border px-2 py-1 disabled:opacity-40">Previous page</button>
                  <span>Page {page + 1} of {Math.ceil(group.issues.length / PAGE_SIZE)}</span>
                  <button type="button" disabled={(page + 1) * PAGE_SIZE >= group.issues.length} onClick={() => setPage((value) => value + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next page</button>
                </div>
              )}
            </div>
          )}
        </article>
      ))}

      {statusFilter === 'resolved' && resolvedItems.map(({ issue, resolution, by, at }) => (
        <article key={issue.id} className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
          <p className="font-semibold">{issue.rule}: {issue.message}</p>
          <p className="mt-1">Reviewed by {by} at {new Date(at).toLocaleString()}. {resolution.note}</p>
          {onUndoFix && <button type="button" className="mt-2 underline" onClick={() => { onUndoFix(issue); setResolved((items) => items.filter((item) => item.issue.id !== issue.id)); }}>Undo</button>}
        </article>
      ))}
      {statusFilter === 'pending-approval' && pendingItems.map(({ issue, resolution, by, at }) => (
        <article key={issue.id} className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
          <p className="font-semibold">Pending manager approval · {issue.rule}</p>
          <p className="mt-1">{resolution.note} · submitted by {by} at {new Date(at).toLocaleString()}.</p>
          {onUndoFix && <button type="button" className="mt-2 underline" onClick={() => { onUndoFix(issue); setResolved((items) => items.filter((item) => item.issue.id !== issue.id)); }}>Undo request</button>}
        </article>
      ))}

      {confirmBatch && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation">
          <section className="max-h-[95dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 text-stone-900 shadow-xl sm:max-w-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="quality-batch-title">
            <h3 id="quality-batch-title" className="text-base font-bold">Review safe changes</h3>
            <p className="mt-2 text-sm">Only fixes marked safe and reversible will be applied.</p>
            <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto text-xs">{(selectedGroup?.safeFixes || []).map((issue) => <li key={issue.id} className="rounded border p-2"><strong>{issue.rule}</strong> · {issue.context || issue.location} → {String(issue.fix?.suggestedValue)}<span className="block text-stone-500">{issue.suggestedFix}</span></li>)}</ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setConfirmBatch(false)}>Cancel</button>
              <button type="button" className="rounded bg-teal-800 px-3 py-2 text-sm font-bold text-white" onClick={() => {
                const batch = selectedGroup?.safeFixes || [];
                batch.forEach((issue) => onApplyFix?.(issue));
                setLastBatch(batch);
                setResolved((current) => [
                  ...current.filter((item) => !batch.some((issue) => issue.id === item.issue.id)),
                  ...batch.map((issue) => ({ issue, resolution: { status: 'resolved' as const, note: 'Applied deterministic reversible safe fix.' }, by: currentUserName, at: new Date().toISOString() })),
                ]);
                setConfirmBatch(false);
              }}>Apply listed safe fixes</button>
            </div>
          </section>
        </div>
      )}

      {selectedIssue && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div ref={dialogRef} className="max-h-[100dvh] min-h-[70dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 text-stone-900 shadow-xl sm:min-h-0 sm:max-w-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="quality-dialog-title" aria-describedby="quality-dialog-description" tabIndex={-1}>
            <h3 id="quality-dialog-title" className="text-base font-bold">{selectedIssue.rule} · Review quality issue</h3>
            <p id="quality-dialog-description" className="mt-2 text-sm">{selectedIssue.message}</p>
            {selectedIssue.context && <blockquote className="mt-3 rounded border-l-4 border-amber-500 bg-amber-50 p-3 text-sm">{selectedIssue.context}</blockquote>}
            <p className="mt-2 text-xs text-stone-600">{selectedIssue.whyMatters || selectedIssue.suggestedFix || 'Review the source record and correct or document the result.'}</p>
            {selectedIssue.rule === 'DQ-VALIDITY' ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold">Source document
                  <select className="mt-1 w-full rounded border p-2" value={validitySource} onChange={(event) => setValiditySource(event.target.value)}>
                    <option value="">Choose source</option><option>Attendance register</option><option>Receipt</option><option>School report</option><option>Bank record</option><option>Other</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold">Document reference or date<input className="mt-1 w-full rounded border p-2" value={validityReference} onChange={(event) => setValidityReference(event.target.value)} /></label>
                <label className="block text-xs font-semibold">Cross-check against a second source
                  <select className="mt-1 w-full rounded border p-2" value={validitySecondSource} onChange={(event) => setValiditySecondSource(event.target.value)}>
                    <option value="">No second source</option><option>Attendance register</option><option>Receipt</option><option>School report</option><option>Bank record</option><option>Observation</option>
                  </select>
                </label>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={validityDefinitionMatched} onChange={(event) => setValidityDefinitionMatched(event.target.checked)} />The result measures the same unit, period, and group as the indicator definition.</label>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={selectedIssue.context?.includes('plausible-range check passed') || false} readOnly />Plausible range check (computed from the result and shown above).</label>
                <label className="block text-xs font-semibold">Second checker name / role<input className="mt-1 w-full rounded border p-2" value={validityCheckedBy} onChange={(event) => setValidityCheckedBy(event.target.value)} /></label>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={applyValidityToAll} onChange={(event) => setApplyValidityToAll(event.target.checked)} />Apply this check to all results from this source/import.</label>
              </div>
            ) : selectedIssue.rule === 'QUANT-02' ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold">Period<input className="mt-1 w-full rounded border p-2" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
                <label className="text-xs font-semibold">Number of people<input className="mt-1 w-full rounded border p-2" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} /></label>
                <label className="text-xs font-semibold">Who / unit<input className="mt-1 w-full rounded border p-2" value={who} onChange={(event) => setWho(event.target.value)} /></label>
                <label className="text-xs font-semibold">Number of activities<input className="mt-1 w-full rounded border p-2" inputMode="numeric" value={activityCount} onChange={(event) => setActivityCount(event.target.value)} /></label>
                <label className="text-xs font-semibold">Activity type<input className="mt-1 w-full rounded border p-2" value={activityType} onChange={(event) => setActivityType(event.target.value)} /></label>
                <label className="text-xs font-semibold">Place<input className="mt-1 w-full rounded border p-2" value={place} onChange={(event) => setPlace(event.target.value)} /></label>
              </div>
            ) : selectedIssue.fix?.options ? (
              <label className="mt-4 block text-xs font-semibold">Correct value
                <select className="mt-1 w-full rounded border p-2" value={formValue} onChange={(event) => setFormValue(event.target.value)}>
                  <option value="">Choose an option</option>{selectedIssue.fix.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            ) : selectedIssue.fix?.type === 'text-input' || selectedIssue.severity !== 'blocker' ? (
              <label className="mt-4 block text-xs font-semibold">Corrected value / review note
                <textarea className="mt-1 w-full rounded border p-2" rows={3} value={formValue} onChange={(event) => setFormValue(event.target.value)} />
              </label>
            ) : null}
            <label className="mt-3 block text-xs font-semibold">Note or reason
              <textarea className="mt-1 w-full rounded border p-2" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            {dialogError && <p className="mt-2 text-sm font-semibold text-rose-800" role="alert">{dialogError}</p>}
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => { const list = selectedGroup?.issues || filteredIssues; const index = list.findIndex((issue) => issue.id === selectedIssue.id); setSelectedIssue(list[Math.max(index - 1, 0)] || null); }}>Previous</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => { const list = selectedGroup?.issues || filteredIssues; const index = list.findIndex((issue) => issue.id === selectedIssue.id); setSelectedIssue(list[index + 1] || null); }}>Next</button>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => setSelectedIssue(null)}>Skip</button>
                {selectedIssue.severity !== 'blocker' && <button type="button" className="rounded border border-amber-700 px-3 py-2 text-xs font-semibold text-amber-900" onClick={() => complete('overridden', formValue || undefined)}>Override with reason</button>}
                <button type="button" className="rounded bg-teal-800 px-3 py-2 text-xs font-bold text-white" onClick={submitForm}>{selectedIssue.fix?.safe ? 'Save fix' : 'Save fix / reviewed'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
