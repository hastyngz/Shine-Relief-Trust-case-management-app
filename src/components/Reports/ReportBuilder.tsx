import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import type { AppDatabase } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessManagementDashboard } from '../../services/managementAnalytics';
import { assembleSponsorReport, type SponsorReportAudience } from '../../services/sponsorReport';
import { generateReportNarrative } from '../../services/reportNarrative';
import { PROGRAMMES, type ProgrammeId } from '../../data/programmes';
import { generateWordReport, type ReportConfig } from '../../services/reportGenerators';
import { downloadCSV, formatMWK } from '../../utils/export';

interface ReportBuilderProps {
  db: AppDatabase;
  onClose: () => void;
}

const emptyReportDatabase: AppDatabase = {
  girls: [],
  households: [],
  educationalFollowUps: [],
  healthFollowUps: [],
  familyFollowUps: [],
  rentPayments: [],
  expenses: [],
  householdActivities: [],
};

export const ReportBuilder: React.FC<ReportBuilderProps> = ({ db, onClose }) => {
  const { isAdmin, role } = useAuth();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [programmeId, setProgrammeId] = useState<'ALL' | ProgrammeId>('ALL');
  const [audience, setAudience] = useState<SponsorReportAudience>('Sponsor');
  const [hideIdentifyingDetails, setHideIdentifyingDetails] = useState(true);
  const [narrative, setNarrative] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

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

  const exportWord = async () => {
    setExportError('');
    setExporting(true);
    try {
      const config: ReportConfig = {
        title: 'Sponsor and Donor Programme Report',
        subtitle: `${audience} audience · ${periodLabel}`,
        periodLabel,
        generatedBy: 'SHINE Relief Trust',
        executiveSummary: narrative,
        structuredTables: tables,
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
      const blob = await generateWordReport(emptyReportDatabase, config);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SHINE_${audience}_Report_${new Date().toISOString().slice(0, 10)}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The report could not be exported.');
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = () => {
    const rows: Array<Array<string | number>> = [
      ['SHINE Relief Trust', `${audience} report`, periodLabel],
      ['Narrative', narrative],
      [],
      ...tables.flatMap((table) => [[table.title], table.headers, ...table.rows]),
    ];
    downloadCSV(`SHINE_${audience}_Report_${new Date().toISOString().slice(0, 10)}.csv`, rows);
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
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 px-3 text-xs font-bold">
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
