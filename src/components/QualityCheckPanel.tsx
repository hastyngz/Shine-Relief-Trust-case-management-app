import React from 'react';
import type { QualityIssue } from '../services/qualityRules';

interface QualityCheckPanelProps {
  issues: QualityIssue[];
  scores: { quantification: number; impact: number; dataQuality: number };
  onApplyFix?: (issue: QualityIssue) => void;
  className?: string;
  linkNarrative?: boolean;
}

const severityOrder: QualityIssue['severity'][] = ['blocker', 'warning', 'info'];
const severityLabel: Record<QualityIssue['severity'], string> = {
  blocker: 'Blockers',
  warning: 'Warnings',
  info: 'Information',
};

function issueAnchor(location: string, linkNarrative: boolean): string | undefined {
  if (linkNarrative && /narrativeSections|section/i.test(location)) return 'report-narrative';
  const match = location.match(/\b(activities|budgets|results|indicators|expenses)\[(\d+)\]/);
  return match ? `quality-${match[1]}-${match[2]}` : undefined;
}

export const QualityCheckPanel: React.FC<QualityCheckPanelProps> = ({ issues, scores, onApplyFix, className = '', linkNarrative = true }) => (
  <section className={`rounded-xl border border-stone-200 bg-white p-4 ${className}`} aria-label="Quality check">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-stone-900">Quality check</h2>
        <p className="mt-1 text-xs text-stone-600">{issues.length ? `${issues.length} issue(s) need review.` : 'No quality issues detected.'}</p>
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
    {severityOrder.map((severity) => {
      const group = issues.filter((issue) => issue.severity === severity);
      if (!group.length) return null;
      return (
        <div key={severity} className="mt-3">
          <h3 className={`text-xs font-bold ${severity === 'blocker' ? 'text-rose-800' : severity === 'warning' ? 'text-amber-800' : 'text-sky-800'}`}>
            {severityLabel[severity]} ({group.length})
          </h3>
          <ul className="mt-1 space-y-2">
            {group.map((issue) => {
              const anchor = issueAnchor(issue.location, linkNarrative);
              return (
                <li key={issue.id} className="rounded-lg border border-stone-200 p-2 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-stone-900">{issue.rule}: {issue.message}</p>
                      <p className="mt-0.5 text-[11px] text-stone-500">
                        {anchor ? <a className="underline" href={`#${anchor}`}>Go to record</a> : `Location: ${issue.location}`}
                      </p>
                      {issue.suggestedFix && <p className="mt-1 text-stone-700">Suggested fix: {issue.suggestedFix}</p>}
                    </div>
                    {onApplyFix && issue.rule === 'STYLE-UK-01' && (
                      <button type="button" onClick={() => onApplyFix(issue)} className="rounded-md border border-teal-700 px-2 py-1 font-bold text-teal-900">
                        Apply fix
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      );
    })}
  </section>
);
