import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import type { AppDatabase } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessManagementDashboard } from '../../services/managementAnalytics';
import { assembleSponsorReport, type SponsorReportAudience } from '../../services/sponsorReport';
import { generateReportNarrative } from '../../services/reportNarrative';
import { PROGRAMMES, type ProgrammeId } from '../../data/programmes';
import { generateWordReport, reviewReportQuality, type ReportConfig } from '../../services/reportGenerators';
import { downloadCSV, formatMWK } from '../../utils/export';
import { qualityScores } from '../../services/qualityRules';
import { qualityMessage } from '../../services/qualityMessages';
import { QualityCheckPanel } from '../QualityCheckPanel';
import type { QualityIssueResolution } from '../QualityCheckPanel';
import { appendReportExport, appendReportHistory } from '../../services/firestoreSync';
import { createFixedReport, fixedReportFileName, nextReportExportVersion, sha256Blob, type FixedReportFormat } from '../../services/qualityFixedReport';
import type { QualityIssue } from '../../services/qualityRules';

interface ReportBuilderProps {
  db: AppDatabase;
  onClose: () => void;
  onOpenQualityRecord: (issue: QualityIssue) => void;
}

export const ReportBuilder: React.FC<ReportBuilderProps> = ({ db, onClose, onOpenQualityRecord }) => {
  const { isAdmin, role, currentUser, staffProfile } = useAuth();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [programmeId, setProgrammeId] = useState<'ALL' | ProgrammeId>('ALL');
  const [audience, setAudience] = useState<SponsorReportAudience>('Sponsor');
  const [hideIdentifyingDetails, setHideIdentifyingDetails] = useState(true);
  const [narrative, setNarrative] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [blockerOverrideReason, setBlockerOverrideReason] = useState('');
  const [qualityResolutions, setQualityResolutions] = useState<Array<{ issueId: string; status: 'resolved' | 'overridden' | 'pending-approval'; note: string; by: string; at: string; before?: unknown; after?: unknown }>>([]);
  const [fixedReportVersion, setFixedReportVersion] = useState(0);

  const report = useMemo(() => assembleSponsorReport(db, {
    fromDate,
    toDate,
    programmeId,
    audience,
    hideIdentifyingDetails,
  }), [db, fromDate, toDate, programmeId, audience, hideIdentifyingDetails]);

  useEffect(() => {
    setNarrative(report.narrative);
  }, [report.narrative]);

  useEffect(() => {
    setHideIdentifyingDetails(audience !== 'Trustee');
  }, [audience]);

  if (!canAccessManagementDashboard(isAdmin, role)) {
    return (
      <section className="rounded-xl border border-rose-200 bg-white p-6 text-sm text-rose-900">
        <h1 className="font-bold">Report builder access restricted</h1>
        <p className="mt-2">Only Administrators and Managers can build sponsor reports.</p>
        <p className="mt-1 text-xs">TODO: Add read-only Trustee access if a Trustee role is introduced in the existing role model.</p>
      </section>
    );
  }

  const periodLabel = fromDate || toDate ? `${fromDate || 'Beginning'} to ${toDate || 'Present'}` : 'All available dates';
  const tables: NonNullable<ReportConfig['structuredTables']> = [
    {
      title: 'Headline figures',
      headers: ['Measure', 'Value'],
      rows: [
        ['Girls currently supported', report.girlsSupported],
        ['Programmes included', report.programmeCount],
        ['Budgeted (MWK)', report.budgeted],
        ['Actual (MWK)', report.actual],
        ['Workplan completion', `${report.workplanCompletionPercent}%`],
        ['Open workplan items', report.openWorkplans],
      ],
    },
    {
      title: 'Programme summaries',
      headers: ['Programme', 'Headline figure', 'Since', 'Budget (MWK)', 'Actual (MWK)', 'Workplans completed'],
      rows: report.programmes.map((item) => [
        item.name,
        `${item.headline} ${item.label}`,
        item.since,
        item.budgeted,
        item.actual,
        `${item.workplansCompleted}/${item.workplansTotal}`,
      ]),
    },
  ];
  const qualityConfig: ReportConfig = {
    title: 'Sponsor and Donor Programme Report',
    subtitle: `${audience} audience · ${periodLabel}`,
    periodLabel,
    generatedBy: 'SHINE Relief Trust',
    executiveSummary: narrative,
    structuredTables: tables,
    donorFacing: audience !== 'Trustee',
    includeSections: {
      executiveSummary: true,
      statistics: false,
      girlsList: false,
      householdsList: false,
      educationalFollowUps: false,
      healthFollowUps: false,
      familyFollowUps: false,
      householdActivities: false,
      expenditure: false,
      rentPayments: false,
      budgets: false,
      workplans: false,
      schedules: false,
      photoGallery: false,
    },
  };
  const reportQualityIssues = reviewReportQuality(db, qualityConfig);
  const reportQualityScores = qualityScores(reportQualityIssues);
  const auditedQualityIssues = reportQualityIssues.map((issue) => ({
    ...issue,
    status: qualityResolutions.find((entry) => entry.issueId === issue.id)?.status || issue.status,
    ...(qualityResolutions.find((entry) => entry.issueId === issue.id)
      ? { resolution: qualityResolutions.find((entry) => entry.issueId === issue.id) }
      : {}),
  }));
  const persistQualityAudit = async (format: 'docx' | 'xlsx' | 'pdf' | 'csv') => {
    if (!currentUser) throw new Error('Sign in is required to record report quality history.');
    const timestamp = new Date().toISOString();
    await appendReportHistory({
      id: `quality_report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      reportType: 'sponsor-donor',
      title: qualityConfig.title,
      reportingPeriod: periodLabel,
      filters: { audience, programme: programmeId },
      generatedBy: staffProfile?.fullName || currentUser.email || 'Management user',
      generatedByUid: currentUser.uid,
      generatedAt: timestamp,
      fileType: format,
      fileName: `SHINE_${audience}_Report_${timestamp.slice(0, 10)}.${format}`,
      dataSourceReferences: ['sponsorReport', 'programmeLogs', 'workplans', 'budgets'],
      recordCount: report.programmeCount,
      photoCount: 0,
      tableCount: tables.length + 1,
      status: 'Generated',
      qualityIssues: auditedQualityIssues,
      qualityScores: reportQualityScores,
      qualityResolutions,
      blockerOverrideReason: reportQualityIssues.some((issue) => issue.severity === 'blocker') ? blockerOverrideReason.trim() : undefined,
    });
  };
  const hasQualityBlockers = reportQualityIssues.some((issue) => issue.severity === 'blocker');
  const ensureQualityOverride = (): boolean => {
    if (!hasQualityBlockers || blockerOverrideReason.trim().length >= 10) return true;
    setExportError('Resolve quality blockers or provide a written override reason of at least 10 characters.');
    return false;
  };

  const exportWord = async () => {
    if (!ensureQualityOverride()) return;
    setExportError('');
    setExporting(true);
    try {
      const config: ReportConfig = { ...qualityConfig, qualityIssues: auditedQualityIssues, qualityScores: reportQualityScores, blockerOverrideReason };
      const blob = await generateWordReport(db, config);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SHINE_${audience}_Report_${new Date().toISOString().slice(0, 10)}.docx`;
      link.click();
      URL.revokeObjectURL(url);
      await persistQualityAudit('docx');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The report could not be exported.');
    } finally {
      setExporting(false);
    }
  };

  const downloadFixedReport = async (format: FixedReportFormat, draft: boolean) => {
    if (!currentUser || !canAccessManagementDashboard(isAdmin, role)) throw new Error('You do not have permission to download this report.');
    const openProblems = auditedQualityIssues
      .filter((issue) => issue.status !== 'resolved' && issue.status !== 'overridden')
      .map((issue) => ({ severity: issue.severity, text: qualityMessage(issue).title }));
    const changes = (hideIdentifyingDetails ? [] : qualityResolutions)
      .filter((entry) => entry.status === 'resolved' && entry.before !== undefined && entry.after !== undefined).map((entry) => {
      const issue = auditedQualityIssues.find((candidate) => candidate.id === entry.issueId);
      return {
        section: issue?.target?.id || issue?.context || 'Report',
        originalText: String(entry.before),
        newText: String(entry.after),
        by: entry.by,
        at: entry.at,
        reason: entry.note || 'Reviewed and corrected.',
      };
    });
    const sections = [
      ...(!hideIdentifyingDetails ? [{ title: 'Executive summary', text: narrative }] : []),
      ...tables.map((table) => ({
        title: table.title,
        text: [table.headers.join(' | '), ...table.rows.map((row) => row.map(String).join(' | '))].join('\n'),
      })),
    ];
    const blob = await createFixedReport({
      title: qualityConfig.title,
      sections,
      changes,
      openProblems,
      format,
      draft,
    });
    const timestamp = new Date().toISOString();
    const extension = format === 'marked-docx' ? 'docx' : format;
    const fileName = `${fixedReportFileName('SHINE Sponsor and Donor Programme Report')}.${extension}`;
    const hash = await sha256Blob(blob);
    const by = staffProfile?.fullName || currentUser.email || 'Management user';
    const version = Math.max(fixedReportVersion + 1, nextReportExportVersion('sponsor-donor'));
    await appendReportExport({
      id: `fixed_report_${currentUser.uid}_${Date.now()}`,
      reportType: 'sponsor-donor',
      title: qualityConfig.title,
      fileName,
      format,
      version,
      hash,
      openProblems,
      overrides: qualityResolutions.filter((entry) => entry.status === 'overridden').map((entry) => ({
        issueId: entry.issueId, reason: entry.note, by: entry.by, at: entry.at,
      })),
      generatedBy: by,
      generatedByUid: currentUser.uid,
      generatedAt: timestamp,
      draft,
      finalLocked: !draft,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    setFixedReportVersion(version);
  };

  const exportCsv = () => {
    if (!ensureQualityOverride()) return;
    const rows: Array<Array<string | number>> = [
      ['SHINE Relief Trust', `${audience} report`, periodLabel],
      ['Narrative', narrative],
      [],
      ...tables.flatMap((table) => [[table.title], table.headers, ...table.rows]),
      ['Quality Issues'],
      ['Severity / score', 'Rule', 'Location', 'Finding', 'Suggested action'],
      ['SCORE', 'Quantification', '', `${reportQualityScores.quantification}/100`, ''],
      ['SCORE', 'Impact evidence', '', `${reportQualityScores.impact}/100`, ''],
      ['SCORE', 'Data quality', '', `${reportQualityScores.dataQuality}/100`, ''],
      ...reportQualityIssues.map((issue) => [issue.severity, issue.rule, issue.location, issue.message, issue.suggestedFix || '']),
    ];
    downloadCSV(`SHINE_${audience}_Report_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    void persistQualityAudit('csv').catch((error) => setExportError(error instanceof Error ? error.message : 'Report audit could not be recorded.'));
  };
  const printReport = () => {
    if (!ensureQualityOverride()) return;
    void persistQualityAudit('pdf').then(() => window.print()).catch((error) => setExportError(error instanceof Error ? error.message : 'Report audit could not be recorded.'));
  };

  const generatedNarrative = generateReportNarrative({
    audience,
    periodLabel: report.periodLabel,
    girlsSupported: report.girlsSupported,
    programmeCount: report.programmeCount,
    budgeted: report.budgeted,
    actual: report.actual,
    workplanCompletionPercent: report.workplanCompletionPercent,
    openWorkplans: report.openWorkplans,
  });

  return (
    <div id="report-builder-view" className="mx-auto max-w-5xl space-y-5 pb-12">
      <div className="report-builder-actions flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 px-3 text-xs font-bold">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button type="button" onClick={printReport} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 px-3 text-xs font-bold">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
          <button type="button" disabled={exporting} onClick={() => void exportWord()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-teal-900 px-3 text-xs font-bold text-white disabled:opacity-60">
            <Download className="h-4 w-4" /> {exporting ? 'Preparing…' : 'Export Word'}
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-black text-stone-900">Sponsor and donor report builder</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-stone-600">From
            <input className="field mt-1 w-full" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-stone-600">To
            <input className="field mt-1 w-full" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-stone-600">Programme
            <select className="field mt-1 w-full" value={programmeId} onChange={(event) => setProgrammeId(event.target.value as 'ALL' | ProgrammeId)}>
              <option value="ALL">All programmes</option>
              {PROGRAMMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-600">Audience
            <select className="field mt-1 w-full" value={audience} onChange={(event) => setAudience(event.target.value as SponsorReportAudience)}>
              <option value="Trustee">Trustee</option>
              <option value="Donor">Donor</option>
              <option value="Sponsor">Sponsor</option>
            </select>
          </label>
        </div>
        <label className="mt-4 flex min-h-11 items-center gap-2 text-xs font-semibold text-stone-700">
          <input type="checkbox" checked={hideIdentifyingDetails} onChange={(event) => setHideIdentifyingDetails(event.target.checked)} />
          Hide identifying details
        </label>
        <p className="text-[11px] text-stone-500">This builder exports aggregate programme, budget, and workplan measures only. It never includes names, photos, health, family, or safeguarding records.</p>
      </section>

      <QualityCheckPanel
        issues={auditedQualityIssues}
        scores={reportQualityScores}
        onDownloadFixedReport={downloadFixedReport}
        canApproveNarrativeOnly={isAdmin || role === 'Manager'}
        currentUserName={staffProfile?.fullName || currentUser?.email || 'Management user'}
        canOpenIssue={(issue) => ['narrative-section', 'report-section', 'budget-item', 'workplan-item', 'indicator-result'].includes(issue.target?.kind || '')}
        onOpenIssue={(issue) => {
          if (issue.target?.kind === 'budget-item' || issue.target?.kind === 'workplan-item' || issue.target?.kind === 'indicator-result') {
            onOpenQualityRecord(issue);
            return;
          }
          if (issue.target?.kind !== 'narrative-section' && issue.target?.kind !== 'report-section') return;
          const editor = document.getElementById('report-narrative');
          editor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          editor?.focus({ preventScroll: true });
        }}
        onResolveIssue={(issue, resolution: QualityIssueResolution) => {
          if (resolution.status !== 'overridden' || resolution.note.trim().length < 10) return false;
          setQualityResolutions((current) => [
            ...current.filter((entry) => entry.issueId !== issue.id),
            { issueId: issue.id, status: resolution.status, note: resolution.note, by: staffProfile?.fullName || currentUser?.email || 'Management user', at: new Date().toISOString() },
          ]);
          return true;
        }}
        onUndoFix={(issue) => setQualityResolutions((current) => current.filter((entry) => entry.issueId !== issue.id))}
      />
      {hasQualityBlockers && (
        <label className="block rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs font-semibold text-rose-950">
          Written reason for overriding report blockers
          <textarea value={blockerOverrideReason} onChange={(event) => setBlockerOverrideReason(event.target.value)} minLength={10} className="field mt-2 min-h-20 w-full bg-white" />
        </label>
      )}

      <article className="report-builder-document rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-800">SHINE Relief Trust · {audience}</p>
        <h2 className="mt-2 text-2xl font-black text-stone-900">Programme progress report</h2>
        <p className="mt-1 text-xs text-stone-500">{periodLabel}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Girls supported', report.girlsSupported],
            ['Programmes', report.programmeCount],
            ['Budget vs actual', `${formatMWK(report.budgeted)} / ${formatMWK(report.actual)}`],
            ['Workplans complete', `${report.workplanCompletionPercent}%`],
          ].map(([label, value]) => <div key={label} className="border-b border-stone-200 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{label}</p><p className="mt-1 text-lg font-black text-stone-900">{value}</p></div>)}
        </div>
        <h3 className="mt-6 text-sm font-bold text-stone-900">Programme summaries</h3>
        <div className="mt-2 divide-y divide-stone-200 border-y border-stone-200">
          {report.programmes.map((item) => (
            <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
              <div><strong className="text-sm">{item.name}</strong><p className="text-xs text-stone-600">{item.headline} {item.label} · {item.since}</p></div>
              <div className="text-left text-xs sm:text-right">{formatMWK(item.budgeted)} budget · {formatMWK(item.actual)} actual<p className="text-stone-500">{item.workplansCompleted}/{item.workplansTotal} workplans complete</p></div>
            </div>
          ))}
          {!report.programmes.length && <p className="py-4 text-xs text-stone-500">No programmes are available for this selection.</p>}
        </div>
        <label className="mt-6 block text-xs font-bold text-stone-700" htmlFor="report-narrative">Narrative summary</label>
        <textarea id="report-narrative" className="report-builder-actions field mt-2 min-h-32 w-full" value={narrative} onChange={(event) => setNarrative(event.target.value)} />
        <p className="report-builder-print-narrative mt-2 hidden whitespace-pre-wrap text-sm">{narrative || generatedNarrative}</p>
        <p className="report-builder-screen-narrative mt-3 text-sm leading-relaxed text-stone-700">{narrative}</p>
      </article>
      {exportError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{exportError}</p>}
    </div>
  );
};
