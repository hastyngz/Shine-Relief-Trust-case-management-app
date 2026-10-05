import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { QualityIssue } from '../services/qualityRules';
import { qualityMessage } from '../services/qualityMessages';
import type { FixedReportFormat } from '../services/qualityFixedReport';

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
  onApprovePendingIssue?: (issue: QualityIssue) => boolean;
  currentUserName?: string;
  canApproveNarrativeOnly?: boolean;
  className?: string;
  linkNarrative?: boolean;
  onDownloadFixedReport?: (format: FixedReportFormat, draft: boolean) => void | Promise<void>;
  onDownloadOriginal?: () => void;
}

const severityOrder: QualityIssue['severity'][] = ['blocker', 'warning', 'info'];
const severityLabel: Record<QualityIssue['severity'], string> = {
  blocker: 'Blockers',
  warning: 'Warnings',
  info: 'Information',
};
const PAGE_SIZE = 25;

export function toggleQualityGroup(current: string | null, groupKey: string): string | null {
  return current === groupKey ? null : groupKey;
}

function issueKey(issue: QualityIssue): string {
  return issue.rule;
}

function renderIssueQuote(issue: QualityIssue): React.ReactNode {
  const quote = qualityMessage(issue).quote;
  if (issue.rule !== 'QUANT-02') return quote;
  const match = /\b(?:various|several|many|some|regularly|the girls participated)\b/i.exec(quote);
  if (!match || match.index === undefined) return quote;
  return <>
    {quote.slice(0, match.index)}
    <mark className="rounded bg-amber-200 px-0.5">{match[0]}</mark>
    {quote.slice(match.index + match[0].length)}
  </>;
}

function renderIdentityPrompt(issue: QualityIssue): React.ReactNode {
  if (issue.rule !== 'IDENTITY-FUZZY-01' || !issue.candidateA || !issue.candidateB) return null;
  return (
    <p className="mt-2 text-xs font-medium text-stone-800">
      Are Candidate A <strong>{issue.candidateA.name}</strong> and Candidate B <strong>{issue.candidateB.name}</strong> the same person?
    </p>
  );
}

function canDecideIdentity(issue: QualityIssue): boolean {
  return issue.rule === 'IDENTITY-FUZZY-01'
    && issue.target?.kind === 'preview-item'
    && Boolean(issue.candidateA && issue.candidateB);
}

function groupCountLabel(issue: QualityIssue, count: number): string {
  if (issue.rule === 'QUANT-03') return `${count} activit${count === 1 ? 'y has' : 'ies have'} no number`;
  if (issue.rule === 'QUANT-02') return `${count} sentence${count === 1 ? '' : 's'} say a vague word`;
  if (issue.rule === 'QUANT-01') return `${count} section${count === 1 ? '' : 's'} need a number`;
  return `${count} item${count === 1 ? '' : 's'}`;
}

export const QualityCheckPanel: React.FC<QualityCheckPanelProps> = ({
  issues,
  scores,
  onApplyFix,
  onOpenIssue,
  canOpenIssue,
  onResolveIssue,
  onUndoFix,
  onApprovePendingIssue,
  currentUserName = 'Current user',
  canApproveNarrativeOnly = false,
  className = '',
  onDownloadFixedReport,
  onDownloadOriginal,
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
  const [quant03KeepOriginal, setQuant03KeepOriginal] = useState(false);
  const [quantKeepOriginal, setQuantKeepOriginal] = useState(false);
  const [validitySource, setValiditySource] = useState('');
  const [validityReference, setValidityReference] = useState('');
  const [validitySecondSource, setValiditySecondSource] = useState('');
  const [validityDefinitionMatched, setValidityDefinitionMatched] = useState(false);
  const [validityCheckedBy, setValidityCheckedBy] = useState('');
  const [applyValidityToAll, setApplyValidityToAll] = useState(false);
  const [reliabilityMethod, setReliabilityMethod] = useState('');
  const [applyReliabilityToAll, setApplyReliabilityToAll] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [identityDecisionError, setIdentityDecisionError] = useState('');
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [showSmallSuggestions, setShowSmallSuggestions] = useState(false);
  const [exportFormat, setExportFormat] = useState<FixedReportFormat>('docx');
  const [draftExport, setDraftExport] = useState(false);
  const [exportError, setExportError] = useState('');
  const [lastBatch, setLastBatch] = useState<QualityIssue[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const batchDialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const resolvedIds = useMemo(() => new Set(resolved.map(({ issue }) => issue.id)), [resolved]);
  const allOpen = issues.filter((issue) => (issue.status || 'open') === 'open' && !resolvedIds.has(issue.id));
  const persistedResolved = issues
    .filter((issue) => issue.status === 'resolved' || issue.status === 'overridden')
    .map((issue) => ({
      issue,
      resolution: {
        status: issue.status as 'resolved' | 'overridden',
        note: issue.resolution?.note || '',
        before: issue.resolution?.before,
        after: issue.resolution?.after,
      },
      by: issue.resolution?.by || 'Recorded user',
      at: issue.resolution?.at || '',
    }));
  const resolvedItems = [
    ...persistedResolved,
    ...resolved.filter(({ resolution, issue }) =>
      (resolution.status === 'resolved' || resolution.status === 'overridden')
      && !persistedResolved.some((entry) => entry.issue.id === issue.id)),
  ];
  const persistedPending = issues.filter((issue) => issue.status === 'pending-approval').map((issue) => ({
    issue,
    resolution: { status: 'pending-approval' as const, note: issue.resolution?.note || '' },
    by: issue.resolution?.by || 'Recorded user',
    at: issue.resolution?.at || '',
  }));
  const pendingItems = [
    ...persistedPending,
    ...resolved.filter(({ resolution, issue }) =>
      resolution.status === 'pending-approval'
      && !persistedPending.some((entry) => entry.issue.id === issue.id)),
  ];
  const baseItems = statusFilter === 'open'
    ? allOpen
    : [];
  const filteredIssues = baseItems.filter((issue) =>
    issue.rule !== 'STYLE-SENTENCE-LENGTH-01'
    &&
    (showSmallSuggestions || issue.severity !== 'info')
    &&
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
  const rules = Array.from(new Map(issues.map((issue) => [issue.rule, qualityMessage(issue).title])).entries());
  const numberIssues = allOpen.filter((issue) => ['QUANT-01', 'QUANT-02', 'QUANT-03'].includes(issue.rule)).length;
  const openProblemCount = allOpen.length;

  useEffect(() => {
    if (!selectedIssue && !confirmBatch) return undefined;
    const activeDialog = selectedIssue ? dialogRef : batchDialogRef;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const first = activeDialog.current?.querySelector<HTMLElement>('button, input, select, textarea');
      first?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedIssue) setSelectedIssue(null);
        else setConfirmBatch(false);
        return;
      }
      if (event.key !== 'Tab' || !activeDialog.current) return;
      const focusable = Array.from(activeDialog.current.querySelectorAll<HTMLElement>(
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
  }, [selectedIssue, confirmBatch]);

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
    setQuant03KeepOriginal(false);
    setQuantKeepOriginal(false);
    setValiditySource('');
    setValidityReference('');
    setValiditySecondSource('');
    setValidityDefinitionMatched(false);
    setValidityCheckedBy('');
    setApplyValidityToAll(false);
    setReliabilityMethod('');
    setApplyReliabilityToAll(false);
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
      setDialogError('This still needs attention. Check the saved change and try again.');
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

  const decideIdentity = (issue: QualityIssue, samePerson: boolean) => {
    setIdentityDecisionError('');
    const resolution: QualityIssueResolution = {
      status: 'resolved',
      note: samePerson ? 'Confirmed as the same person; use Candidate B as the canonical record.' : 'Confirmed as different people; keep Candidate A separate.',
      value: {
        decision: samePerson ? 'same-person' : 'different-people',
        ...(samePerson && issue.candidateB ? { candidateId: issue.candidateB.id } : {}),
      },
    };
    if (onResolveIssue?.(issue, resolution) !== true) {
      setIdentityDecisionError('The decision could not be saved. Check your permissions and try again.');
      return;
    }
    setResolved((current) => [
      ...current.filter((item) => item.issue.id !== issue.id),
      { issue, resolution, by: currentUserName, at: new Date().toISOString() },
    ]);
  };

  const submitForm = () => {
    if (!selectedIssue) return;
    if (selectedIssue.rule === 'DQ-RELIABILITY') {
      const method = reliabilityMethod === 'other' ? formValue.trim() : reliabilityMethod;
      if (!method) {
        setDialogError(reliabilityMethod === 'other' ? 'Describe the counting method.' : 'Choose how this number was counted.');
        return;
      }
      complete('resolved', { method, applyToAll: applyReliabilityToAll });
      return;
    }
    if (selectedIssue.rule === 'DQ-VALIDITY') {
      if ((!validitySource.trim() || !validityReference.trim()) && !validitySecondSource.trim()) {
        setDialogError('Name and reference/date for a source, or choose a second source.');
        return;
      }
      if (!validityDefinitionMatched) {
        setDialogError('Confirm that the value matches what this activity counts, including its unit, period, and group.');
        return;
      }
      const enteredBy = selectedIssue.enteredBy || currentUserName;
      if (validityCheckedBy.trim()
        && validityCheckedBy.trim().toLocaleLowerCase() === enteredBy.trim().toLocaleLowerCase()) {
        setDialogError('The checker must be a different person from the person entering this check.');
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
        setDialogError('Explain why no number can be recorded (at least 10 characters).');
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
      if (formValue !== 'narrative-only' && (!count.trim() || !Number.isFinite(Number(count)) || Number(count) < 0)) {
        setDialogError('Enter the checked number before saving.');
        return;
      }
      if (formValue !== 'narrative-only' && !who.trim()) {
        setDialogError('Say what the number counts.');
        return;
      }
      if (formValue !== 'narrative-only' && !quant03KeepOriginal && (!period.trim() || !activityType.trim())) {
        setDialogError('Enter the reporting period and activity for the corrected sentence, or keep the original wording.');
        return;
      }
      const sentence = formValue !== 'narrative-only' && !quant03KeepOriginal
        ? activityCount.trim()
          ? `In ${period.trim()}, ${activityCount.trim()} ${activityType.trim()} took place, with ${count.trim()} ${who.trim()} attending${place.trim() ? ` at ${place.trim()}` : ''}.`
          : `In ${period.trim()}, ${count.trim()} ${who.trim()} took part in ${activityType.trim()}${place.trim() ? ` at ${place.trim()}` : ''}.`
        : undefined;
      complete('resolved', {
        indicatorId: formValue === 'narrative-only' ? undefined : formValue,
        actual: formValue === 'narrative-only' ? undefined : Number(count),
        unit: who.trim() || undefined,
        sentence,
        period: period.trim() || undefined,
        activityCount: activityCount.trim() ? Number(activityCount) : undefined,
        activity: activityType.trim() || undefined,
        place: place.trim() || undefined,
      });
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
    if (selectedIssue.rule === 'QUANT-01' || selectedIssue.rule === 'QUANT-02') {
      if (!period.trim() || !who.trim() || !count.trim() || !activityType.trim()
        || !Number.isFinite(Number(count)) || Number(count) < 0
        || (activityCount.trim() && (!Number.isFinite(Number(activityCount)) || Number(activityCount) < 0))) {
        setDialogError('Enter a period, a valid count, who or what it counts, and the activity.');
        return;
      }
      const sentence = quantKeepOriginal ? undefined : activityCount.trim()
        ? `In ${period.trim()}, ${activityCount.trim()} ${activityType.trim()} took place, with ${count.trim()} ${who.trim()} attending${place.trim() ? ` at ${place.trim()}` : ''}.`
        : `In ${period.trim()}, ${count.trim()} ${who.trim()} took part in ${activityType.trim()}${place.trim() ? ` at ${place.trim()}` : ''}.`;
      complete('resolved', {
        sentence,
        keepOriginal: quantKeepOriginal,
        actual: Number(count),
        activityCount: activityCount.trim() ? Number(activityCount) : undefined,
        who: who.trim(),
        period: period.trim(),
        activity: activityType.trim(),
        place: place.trim(),
      });
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
            {numberIssues ? `${numberIssues} activities still need a number.` : allOpen.length ? `${allOpen.length} items still need a check.` : 'No open items need a check.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="flex items-center gap-1 text-xs text-stone-700">
              <input type="checkbox" checked={showSmallSuggestions} onChange={(event) => { setShowSmallSuggestions(event.target.checked); setPage(0); }} />
              Show small suggestions
            </label>
            <label className="text-xs text-stone-700">Severity
              <select className="ml-1 rounded border border-stone-300 p-1" value={severityFilter} onChange={(event) => { setSeverityFilter(event.target.value); setPage(0); }}>
                <option value="all">All</option><option value="blocker">Blocker</option><option value="warning">Warning</option><option value="info">Info</option>
              </select>
            </label>
            <label className="text-xs text-stone-700">Rule
              <select className="ml-1 max-w-40 rounded border border-stone-300 p-1" value={ruleFilter} onChange={(event) => { setRuleFilter(event.target.value); setPage(0); }}>
                <option value="all">All issue types</option>{rules.map(([rule, title]) => <option key={rule} value={rule}>{title}</option>)}
              </select>
            </label>
            <label className="text-xs text-stone-700">Status
              <select className="ml-1 rounded border border-stone-300 p-1" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}>
                <option value="open">Open</option><option value="pending-approval">Needs manager approval</option><option value="resolved">Fixed</option>
              </select>
            </label>
          </div>
          {onDownloadFixedReport && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
              <label className="text-xs font-semibold text-stone-800">Download fixed report
                <select className="mt-1 block rounded border border-stone-300 bg-white p-2" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as FixedReportFormat)}>
                  <option value="docx">Word (.docx)</option>
                  <option value="pdf">PDF</option>
                  <option value="marked-docx">Word with changes marked</option>
                  <option value="xlsx">Changes list (.xlsx)</option>
                </select>
              </label>
              {openProblemCount > 0 && (
                <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-amber-900">
                  <input type="checkbox" checked={draftExport} onChange={(event) => setDraftExport(event.target.checked)} />
                  Download DRAFT with {openProblemCount} open {openProblemCount === 1 ? 'problem' : 'problems'}
                </label>
              )}
              <button type="button" className="rounded bg-teal-800 px-3 py-2 text-xs font-bold text-white" onClick={async () => {
                setExportError('');
                try {
                  await onDownloadFixedReport(exportFormat, draftExport);
                } catch (error) {
                  setExportError(error instanceof Error ? error.message : 'The report could not be downloaded.');
                }
              }}>Download fixed report</button>
              {onDownloadOriginal && <button type="button" className="rounded border border-stone-400 px-3 py-2 text-xs font-semibold" onClick={onDownloadOriginal}>Download original</button>}
              {exportError && <p className="w-full text-xs font-semibold text-rose-800" role="alert">{exportError}</p>}
            </div>
          )}
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
              <p className="text-xs font-semibold text-stone-900">{qualityMessage(group.issues[0]).title}</p>
              <p className="mt-1 text-[11px] text-stone-600">{groupCountLabel(group.issues[0], group.issues.length)} · {severityLabel[group.severity]} <span className="ml-1 text-stone-400">Ref: {group.issues[0].rule}</span></p>
              {group.issues[0].rule === 'IDENTITY-FUZZY-01'
                ? renderIdentityPrompt(group.issues[0])
                : <p className="mt-1 break-words text-[11px] text-stone-600">“{renderIssueQuote(group.issues[0])}”</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {canDecideIdentity(group.issues[0]) && onResolveIssue && (
                <>
                  <button type="button" className="rounded bg-teal-800 px-3 py-1.5 text-xs font-bold text-white" onClick={() => decideIdentity(group.issues[0], true)}>Yes (Merge Records)</button>
                  <button type="button" className="rounded border border-stone-500 px-3 py-1.5 text-xs font-bold text-stone-800" onClick={() => decideIdentity(group.issues[0], false)}>No (Different People)</button>
                </>
              )}
              {canDecideIdentity(group.issues[0]) && identityDecisionError && (
                <p role="alert" className="w-full text-xs font-semibold text-rose-800">{identityDecisionError}</p>
              )}
              {group.issues[0].rule === 'IDENTITY-FUZZY-01' && !canDecideIdentity(group.issues[0]) && (
                <p className="w-full text-xs text-stone-600">Resolve this match in Import review so the selected records can be merged safely.</p>
              )}
              <button type="button" className="rounded border border-stone-400 px-2 py-1 text-xs font-semibold" aria-expanded={expandedGroup === group.key} onClick={() => { setExpandedGroup((current) => toggleQualityGroup(current, group.key)); setPage(0); }}>
                Fix these one by one
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
                    {issue.rule === 'IDENTITY-FUZZY-01'
                      ? renderIdentityPrompt(issue)
                      : <p className="break-words text-stone-800">“{renderIssueQuote(issue)}”</p>}
                    {issue.target && onOpenIssue && canOpenIssue?.(issue) !== false && <button type="button" className="mt-1 text-[11px] text-teal-800 underline" onClick={() => onOpenIssue(issue)}>Show in document</button>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {canDecideIdentity(issue) && onResolveIssue ? (
                      <>
                        <button type="button" className="rounded bg-teal-800 px-3 py-1.5 font-bold text-white" onClick={() => decideIdentity(issue, true)}>Yes (Merge Records)</button>
                        <button type="button" className="rounded border border-stone-500 px-3 py-1.5 font-bold text-stone-800" onClick={() => decideIdentity(issue, false)}>No (Different People)</button>
                      </>
                    ) : issue.rule !== 'IDENTITY-FUZZY-01' ? (
                      <button type="button" className="rounded bg-teal-800 px-2 py-1 font-semibold text-white" onClick={() => openDialog(issue)}>{qualityMessage(issue).buttonLabel}</button>
                    ) : null}
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

      {statusFilter === 'resolved' && resolvedItems.filter(({ issue }) =>
        (severityFilter === 'all' || issue.severity === severityFilter)
        && (ruleFilter === 'all' || issue.rule === ruleFilter)).map(({ issue, resolution, by, at }) => (
        <article key={issue.id} className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
          <p className="font-semibold">{qualityMessage(issue).title} <span className="text-[10px] font-normal text-stone-400">Ref: {issue.rule}</span></p>
          <p className="mt-1">{/^Automatic safe fix|Applied deterministic reversible safe fix/.test(resolution.note) ? 'Fixed automatically' : 'Fixed manually'} by {by}{at ? ` at ${new Date(at).toLocaleString()}` : ''}. {resolution.note}</p>
          {resolution.before !== undefined && <p className="mt-1">Before: {String(resolution.before)} · after: {String(resolution.after)}</p>}
          {onUndoFix && <button type="button" className="mt-2 underline" onClick={() => { onUndoFix(issue); setResolved((items) => items.filter((item) => item.issue.id !== issue.id)); }}>Undo</button>}
        </article>
      ))}
      {statusFilter === 'pending-approval' && pendingItems.filter(({ issue }) =>
        (severityFilter === 'all' || issue.severity === severityFilter)
        && (ruleFilter === 'all' || issue.rule === ruleFilter)).map(({ issue, resolution, by, at }) => (
        <article key={issue.id} className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
          <p className="font-semibold">Pending manager approval · {qualityMessage(issue).title}</p>
          <p className="mt-1">{resolution.note} · submitted by {by}{at ? ` at ${new Date(at).toLocaleString()}` : ''}.</p>
          {onUndoFix && <button type="button" className="mt-2 underline" onClick={() => { onUndoFix(issue); setResolved((items) => items.filter((item) => item.issue.id !== issue.id)); }}>Undo request</button>}
          {canApproveNarrativeOnly && onApprovePendingIssue && <button type="button" className="ml-3 mt-2 font-semibold text-teal-900 underline" onClick={() => {
            if (!onApprovePendingIssue(issue)) return;
            setResolved((items) => items.map((item) => item.issue.id === issue.id
              ? { ...item, resolution: { ...item.resolution, status: 'resolved' }, by: currentUserName, at: new Date().toISOString() }
              : item));
          }}>Approve as manager</button>}
        </article>
      ))}

      {confirmBatch && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation">
          <section ref={batchDialogRef} className="max-h-[95dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 text-stone-900 shadow-xl sm:max-w-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="quality-batch-title" tabIndex={-1}>
            <h3 id="quality-batch-title" className="text-base font-bold">Review safe changes</h3>
            <p className="mt-2 text-sm">Only fixes marked safe and reversible will be applied.</p>
            <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto text-xs">{(selectedGroup?.safeFixes || []).map((issue) => <li key={issue.id} className="rounded border p-2">            <span className="text-[10px] text-stone-400">Ref: {issue.rule}</span> · {qualityMessage(issue).quote} → {String(issue.fix?.suggestedValue)}<span className="block text-stone-500">{issue.suggestedFix}</span></li>)}</ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setConfirmBatch(false)}>Cancel</button>
              <button type="button" className="rounded bg-teal-800 px-3 py-2 text-sm font-bold text-white" onClick={() => {
                const batch = selectedGroup?.safeFixes || [];
                batch.forEach((issue) => onApplyFix?.(issue));
                setLastBatch(batch);
                setResolved((current) => [
                  ...current.filter((item) => !batch.some((issue) => issue.id === item.issue.id)),
                  ...batch.map((issue) => ({ issue, resolution: { status: 'resolved' as const, note: 'Automatic safe fix applied.' }, by: currentUserName, at: new Date().toISOString() })),
                ]);
                setConfirmBatch(false);
              }}>Apply listed safe fixes</button>
            </div>
          </section>
        </div>
      )}

      {selectedIssue && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div ref={dialogRef} className="max-h-[100dvh] min-h-[100dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 text-stone-900 shadow-xl sm:min-h-0 sm:max-w-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="quality-dialog-title" aria-describedby="quality-dialog-description" tabIndex={-1}>
            <h3 id="quality-dialog-title" className="text-base font-bold">{qualityMessage(selectedIssue).title}</h3>
            <p className="mt-1 text-[10px] text-stone-400">Ref: {selectedIssue.rule}</p>
            <p id="quality-dialog-description" className="mt-2 text-sm">{qualityMessage(selectedIssue).why}</p>
            <blockquote className="mt-3 rounded border-l-4 border-amber-500 bg-amber-50 p-3 text-sm">{renderIssueQuote(selectedIssue)}</blockquote>
            {renderIdentityPrompt(selectedIssue)}
            {selectedIssue.rule === 'NARRATIVE-TENSE-01' && typeof selectedIssue.fix?.suggestedValue === 'string' && (
              <p className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-950">Suggested correction: {selectedIssue.fix.suggestedValue}</p>
            )}
            {selectedIssue.rule === 'NARRATIVE-PROGRAMME-01' && typeof selectedIssue.fix?.suggestedValue === 'string' && (
              <p className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-950">Found: {selectedIssue.context}. Approved name: {selectedIssue.fix.suggestedValue}.</p>
            )}
            {selectedIssue.target && onOpenIssue && canOpenIssue?.(selectedIssue) !== false && <button type="button" className="mt-2 text-xs text-teal-800 underline" onClick={() => onOpenIssue(selectedIssue)}>Show in document</button>}
            <p className="mt-3 text-sm font-semibold">{qualityMessage(selectedIssue).question}</p>
            <ul className="mt-1 list-inside list-disc text-xs text-stone-600">{qualityMessage(selectedIssue).examples.map((example) => <li key={example}>{example}</li>)}</ul>
            {selectedIssue.rule === 'DQ-VALIDITY' ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold">Where did this number come from?
                  <select className="mt-1 w-full rounded border p-2" value={validitySource} onChange={(event) => setValiditySource(event.target.value)}>
                    <option value="">Choose source</option><option>Attendance register</option><option>Receipt</option><option>School report</option><option>Bank record</option><option>A photo or signed list</option><option>Other</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold">Document reference or date<input className="mt-1 w-full rounded border p-2" value={validityReference} onChange={(event) => setValidityReference(event.target.value)} /></label>
                <label className="block text-xs font-semibold">Cross-check against a second source
                  <select className="mt-1 w-full rounded border p-2" value={validitySecondSource} onChange={(event) => setValiditySecondSource(event.target.value)}>
                    <option value="">No second source</option><option>Attendance register</option><option>Receipt</option><option>School report</option><option>Bank record</option><option>Observation</option>
                  </select>
                </label>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={validityDefinitionMatched} onChange={(event) => setValidityDefinitionMatched(event.target.checked)} />This number counts what the activity says: {qualityMessage(selectedIssue).quote}</label>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={selectedIssue.context?.includes('plausible-range check passed') || false} readOnly />Plausible range check (computed from the result and shown above).</label>
                <label className="block text-xs font-semibold">Did someone else check it? Enter their name<input className="mt-1 w-full rounded border p-2" value={validityCheckedBy} onChange={(event) => setValidityCheckedBy(event.target.value)} /></label>
                <p className="text-[11px] text-stone-500">Entered by: {selectedIssue.enteredBy || currentUserName}. The checker must be someone else.</p>
                <label className="block text-xs font-semibold">Optional note about this check<textarea className="mt-1 w-full rounded border p-2" rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></label>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={applyValidityToAll} onChange={(event) => setApplyValidityToAll(event.target.checked)} />Apply this check to all results from this source/import.</label>
              </div>
            ) : selectedIssue.rule === 'QUANT-03' ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold">Choose the matching activity or result
                  <select className="mt-1 w-full rounded border p-2" value={formValue} onChange={(event) => setFormValue(event.target.value)}>
                    <option value="">Choose one</option>{selectedIssue.fix?.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {formValue && formValue !== 'narrative-only' && (
                  <>
                    <label className="block text-xs font-semibold">Checked number<input className="mt-1 w-full rounded border p-2" type="number" min="0" step="1" value={count} onChange={(event) => setCount(event.target.value)} /></label>
                    <label className="block text-xs font-semibold">What does it count?<input className="mt-1 w-full rounded border p-2" value={who} onChange={(event) => setWho(event.target.value)} placeholder="girls, sessions, visits" /></label>
                    <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={quant03KeepOriginal} onChange={(event) => setQuant03KeepOriginal(event.target.checked)} />Keep the original wording and store the checked number in the linked result.</label>
                    {!quant03KeepOriginal && <>
                      <label className="block text-xs font-semibold">Reporting period<input className="mt-1 w-full rounded border p-2" value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="September 2026" /></label>
                      <label className="block text-xs font-semibold">Activity<input className="mt-1 w-full rounded border p-2" value={activityType} onChange={(event) => setActivityType(event.target.value)} placeholder="guest speaker visits" /></label>
                      <label className="block text-xs font-semibold">How many activities? (if different)<input className="mt-1 w-full rounded border p-2" type="number" min="0" step="1" value={activityCount} onChange={(event) => setActivityCount(event.target.value)} /></label>
                      <label className="block text-xs font-semibold">Place (optional)<input className="mt-1 w-full rounded border p-2" value={place} onChange={(event) => setPlace(event.target.value)} /></label>
                      <p className="rounded bg-stone-50 p-2 text-xs" aria-live="polite">Preview: {period && count && who && activityType
                        ? activityCount
                          ? `In ${period}, ${activityCount} ${activityType} took place, with ${count} ${who} attending${place ? ` at ${place}` : ''}.`
                          : `In ${period}, ${count} ${who} took part in ${activityType}${place ? ` at ${place}` : ''}.`
                        : 'Add the missing details to see the corrected sentence.'}</p>
                    </>}
                  </>
                )}
              </div>
            ) : selectedIssue.rule === 'DQ-RELIABILITY' ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold">How was it counted?
                  <select className="mt-1 w-full rounded border p-2" value={reliabilityMethod} onChange={(event) => setReliabilityMethod(event.target.value)}>
                    <option value="">Choose one</option>
                    <option>Daily register</option><option>Attendance register</option><option>Receipts</option>
                    <option>School report</option><option>Bank record</option><option>I counted them myself</option><option value="other">Other</option>
                  </select>
                </label>
                {reliabilityMethod === 'other' && <label className="block text-xs font-semibold">Describe how it was counted<textarea className="mt-1 w-full rounded border p-2" rows={2} value={formValue} onChange={(event) => setFormValue(event.target.value)} /></label>}
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={applyReliabilityToAll} onChange={(event) => setApplyReliabilityToAll(event.target.checked)} />Apply to all results from this source</label>
              </div>
            ) : selectedIssue.rule === 'QUANT-01' || selectedIssue.rule === 'QUANT-02' ? (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold">Period<input className="mt-1 w-full rounded border p-2" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
                  <label className="text-xs font-semibold">How many people?<input className="mt-1 w-full rounded border p-2" type="number" min="0" step="1" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} /></label>
                  <label className="text-xs font-semibold">Who or what does the number count?<input className="mt-1 w-full rounded border p-2" value={who} onChange={(event) => setWho(event.target.value)} /></label>
                  <label className="text-xs font-semibold">Activity<input className="mt-1 w-full rounded border p-2" value={activityType} onChange={(event) => setActivityType(event.target.value)} /></label>
                  <label className="text-xs font-semibold">How many sessions / activities? (optional)<input className="mt-1 w-full rounded border p-2" type="number" min="0" step="1" inputMode="numeric" value={activityCount} onChange={(event) => setActivityCount(event.target.value)} /></label>
                  <label className="text-xs font-semibold">Place (optional)<input className="mt-1 w-full rounded border p-2" value={place} onChange={(event) => setPlace(event.target.value)} /></label>
                </div>
                <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={quantKeepOriginal} onChange={(event) => setQuantKeepOriginal(event.target.checked)} />Keep the original wording and store the checked number in the linked result.</label>
                {!quantKeepOriginal && <p className="mt-2 rounded bg-stone-50 p-2 text-xs text-stone-600" aria-live="polite">Preview: {period && count && who && activityType
                  ? activityCount
                    ? `In ${period}, ${activityCount} ${activityType} took place, with ${count} ${who} attending${place ? ` at ${place}` : ''}.`
                    : `In ${period}, ${count} ${who} took part in ${activityType}${place ? ` at ${place}` : ''}.`
                  : 'Add the missing details to see the corrected sentence.'}</p>}
              </>
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
            {selectedIssue.fix?.field === 'text' && formValue.trim() && !['QUANT-01', 'QUANT-02'].includes(selectedIssue.rule) && (
              <p className="mt-2 rounded bg-stone-50 p-2 text-xs text-stone-700" aria-live="polite">Preview: {formValue}</p>
            )}
            {selectedIssue.rule === 'NARRATIVE-PROGRAMME-01' && typeof selectedIssue.fix?.suggestedValue === 'string' && (
              <button type="button" className="mt-2 rounded bg-teal-800 px-3 py-2 text-xs font-bold text-white" onClick={() => complete('resolved', selectedIssue.fix?.suggestedValue)}>Use the approved name</button>
            )}
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
                {selectedIssue.severity !== 'blocker' && selectedIssue.rule !== 'QUANT-03' && <button type="button" className="rounded border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-900" onClick={() => complete('overridden', { decision: 'reviewed' })}>Reviewed (with reason)</button>}
                {selectedIssue.severity !== 'blocker' && selectedIssue.rule !== 'QUANT-03' && <button type="button" className="rounded border border-amber-700 px-3 py-2 text-xs font-semibold text-amber-900" onClick={() => complete('overridden', { decision: 'override' })}>Override with reason</button>}
                <button type="button" className="rounded bg-teal-800 px-3 py-2 text-xs font-bold text-white" onClick={submitForm}>{selectedIssue.fix?.safe ? 'Save fix' : 'Save fix / reviewed'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
