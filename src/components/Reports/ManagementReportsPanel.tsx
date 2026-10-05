import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import type { AppDatabase, ReportHistoryRecord, SalaryHistoryRecord, StaffUser } from '../../types';
import { MANAGEMENT_REPORTS, ManagementReportId, buildManagementReportRows, generateManagementReportWorkbook } from '../../services/managementReports';
import { ManagementFilters, canAccessManagementDashboard, projectManagementDatabase } from '../../services/managementAnalytics';
import { appendEmployeeAuditLog, appendReportExport, appendReportHistory, getEmployeeSalaryHistoryForStaff } from '../../services/firestoreSync';
import { archiveGeneratedReport } from '../../services/attachmentService';
import { ReportConfig, generateWordReport, reviewReportQuality } from '../../services/reportGenerators';
import { qualityScores } from '../../services/qualityRules';
import { QualityCheckPanel } from '../QualityCheckPanel';
import type { QualityIssueResolution } from '../QualityCheckPanel';
import { useAuth } from '../../contexts/AuthContext';
import type { QualityIssue } from '../../services/qualityRules';
import { qualityMessage } from '../../services/qualityMessages';
import { createFixedReport, createReportExportRecord, fixedReportFileName, nextReportExportVersion, sha256Blob, type FixedReportFormat } from '../../services/qualityFixedReport';

interface ManagementReportsPanelProps {
  db: AppDatabase;
  staff: StaffUser[];
  onOpenQualityRecord: (issue: QualityIssue) => void;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const ManagementReportsPanel: React.FC<ManagementReportsPanelProps> = ({ db, staff, onOpenQualityRecord }) => {
  const { isAdmin, role, canViewHealthRecords, canViewSafeguarding, canViewCaseReviews, currentUser, staffProfile } = useAuth();
  const [reportId, setReportId] = useState<ManagementReportId>('management-summary');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [financialYear, setFinancialYear] = useState('ALL');
  const [month, setMonth] = useState('ALL');
  const [programme, setProgramme] = useState('ALL');
  const [householdId, setHouseholdId] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [staffId, setStaffId] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [school, setSchool] = useState('ALL');
  const [classLevel, setClassLevel] = useState('ALL');
  const [quarter, setQuarter] = useState(1);
  const [quarterYear, setQuarterYear] = useState(new Date().getFullYear());
  const [monthlyYear, setMonthlyYear] = useState(new Date().getFullYear());
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistoryRecord[] | undefined>();
  const [salaryLoadFailed, setSalaryLoadFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [blockerOverrideReason, setBlockerOverrideReason] = useState('');
  const [qualityResolutions, setQualityResolutions] = useState<Array<{ issueId: string; status: 'resolved' | 'overridden' | 'pending-approval'; note: string; by: string; at: string; before?: unknown; after?: unknown }>>([]);
  const [fixedReportVersion, setFixedReportVersion] = useState(0);

  useEffect(() => {
    if (!canAccessManagementDashboard(isAdmin, role)) return;
    let mounted = true;
    getEmployeeSalaryHistoryForStaff(staff.map((person) => person.uid || person.id))
      .then((records) => { if (mounted) setSalaryHistory(records); })
      .catch(() => { if (mounted) setSalaryLoadFailed(true); });
    return () => { mounted = false; };
  }, [isAdmin, role, staff]);

  useEffect(() => {
    if (reportId !== 'quarterly-management') return;
    const startMonth = (quarter - 1) * 3;
    setStartDate(new Date(Date.UTC(quarterYear, startMonth, 1)).toISOString().slice(0, 10));
    setEndDate(new Date(Date.UTC(quarterYear, startMonth + 3, 0)).toISOString().slice(0, 10));
  }, [reportId, quarter, quarterYear]);

  useEffect(() => {
    if (reportId !== 'monthly-management' || month === 'ALL') return;
    const year = monthlyYear;
    const monthNumber = Number(month);
    setStartDate(new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString().slice(0, 10));
    setEndDate(new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10));
  }, [reportId, monthlyYear, month]);

  const programmes = useMemo(() => Array.from(new Set([
    ...(db.budgets || []).map((item) => item.programme),
    ...(db.annualBudgets || []).map((item) => item.programme),
    ...(db.expenses || []).map((item) => item.programme),
    ...(db.payrollRecords || []).map((item) => item.departmentOrProgramme),
  ].filter((value): value is string => !!value))).sort(), [db]);
  const years = useMemo(() => Array.from(new Set([
    ...(db.annualBudgets || []).map((item) => item.financialYear),
    ...(db.budgets || []).map((item) => item.financialYear).filter((value): value is string => !!value),
    ...(db.payrollRecords || []).map((item) => item.payPeriodStartDate.slice(0, 4)),
  ])).sort().reverse(), [db]);
  const categories = useMemo(() => Array.from(new Set([
    ...(db.budgets || []).map((item) => item.category),
    ...(db.expenses || []).map((item) => item.category),
    ...(db.expenses || []).map((item) => item.budgetCategory).filter((value): value is string => !!value),
  ])).sort(), [db]);
  const selectManagementReport = (value: string) => {
    const nextReport = value as ManagementReportId;
    setReportId(nextReport);
    setMessage('');
    const today = new Date();
    if (nextReport === 'monthly-management') {
      setFinancialYear('ALL');
      setMonthlyYear(today.getFullYear());
      setMonth(String(today.getMonth() + 1));
    } else if (nextReport === 'quarterly-management') {
      setFinancialYear('ALL');
      setMonth('ALL');
      setQuarterYear(today.getFullYear());
      setQuarter(Math.floor(today.getMonth() / 3) + 1);
    } else if (nextReport === 'annual-management') {
      setStartDate('');
      setEndDate('');
    }
  };
  const filters: ManagementFilters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    financialYear: financialYear === 'ALL' ? undefined : financialYear,
    month: month === 'ALL' ? undefined : Number(month),
    programme: programme === 'ALL' ? undefined : programme,
    householdId: householdId === 'ALL' ? undefined : householdId,
    category: category === 'ALL' ? undefined : category,
    staffId: staffId === 'ALL' ? undefined : staffId,
    status: status === 'ALL' ? undefined : status,
    priority: priority === 'ALL' ? undefined : priority,
    school: school === 'ALL' ? undefined : school,
    classLevel: classLevel === 'ALL' ? undefined : classLevel,
  };
  const permittedDb: AppDatabase = projectManagementDatabase(db, { canViewHealthRecords, canViewSafeguarding, canViewCaseReviews });
  if (!canAccessManagementDashboard(isAdmin, role)) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">Management reports are restricted to Administrators and Managers.</div>;
  }
  if (reportId === 'health' && !canViewHealthRecords) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">Health reports are restricted for your account.</div>;
  }
  if (reportId === 'case-reviews' && !canViewCaseReviews) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">Case review reports are restricted for your account.</div>;
  }
  if (reportId === 'annual-management' && (!filters.startDate || !filters.endDate)) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Select the configured financial-year start and end dates before generating the annual management report. SHINE has no global financial-year start setting, so calendar-year dates are not assumed.</div>;
  }

  const report = buildManagementReportRows(reportId, permittedDb, filters, staff, salaryHistory);
  const rows = report;
  const reportQualityConfig: ReportConfig = {
    title: MANAGEMENT_REPORTS.find((item) => item.id === reportId)?.label || reportId,
    periodLabel: `${filters.startDate || filters.financialYear || 'All available dates'} to ${filters.endDate || 'present'}`,
    generatedBy: staffProfile?.fullName || currentUser?.email || 'Management user',
    structuredTables: [{ title: reportId, headers: rows.headers, rows: rows.rows }],
    executiveSummary: rows.rows.map((row) => row.map(String).join(': ')).join('\n'),
    includeSections: {
      executiveSummary: true, statistics: false, girlsList: false, householdsList: false,
      educationalFollowUps: false, healthFollowUps: false, familyFollowUps: false,
      householdActivities: false, expenditure: false, rentPayments: false, budgets: false,
      workplans: false, schedules: false, photoGallery: false,
    },
  };
  const reportQualityIssues = reviewReportQuality(permittedDb, reportQualityConfig);
  const reportQualityScores = qualityScores(reportQualityIssues);
  const auditedQualityIssues = reportQualityIssues.map((issue) => ({
    ...issue,
    status: qualityResolutions.find((entry) => entry.issueId === issue.id)?.status || issue.status,
    ...(qualityResolutions.find((entry) => entry.issueId === issue.id)
      ? { resolution: qualityResolutions.find((entry) => entry.issueId === issue.id) }
      : {}),
  }));
  const qualityAnnexRows = [
    ['SCORE', 'Quantification', '', `${reportQualityScores.quantification}/100`, ''],
    ['SCORE', 'Impact evidence', '', `${reportQualityScores.impact}/100`, ''],
    ['SCORE', 'Data quality', '', `${reportQualityScores.dataQuality}/100`, ''],
    ...reportQualityIssues.map((issue) => [issue.severity.toUpperCase(), issue.rule, issue.location, issue.message, issue.suggestedFix || '']),
  ];
  const ensureQualityOverride = (): boolean => {
    if (!reportQualityIssues.some((issue) => issue.severity === 'blocker') || blockerOverrideReason.trim().length >= 10) return true;
    setMessage('Resolve quality blockers or provide a written override reason of at least 10 characters.');
    return false;
  };
  const downloadFixedReport = async (format: FixedReportFormat, draft: boolean) => {
    if (!currentUser || !canAccessManagementDashboard(isAdmin, role)) throw new Error('Your account cannot download this report.');
    const openIssues = auditedQualityIssues.filter((issue) => issue.status !== 'resolved' && issue.status !== 'overridden');
    const openProblems = openIssues.map((issue) => ({ severity: issue.severity, text: qualityMessage(issue).title }));
    const sections = [
      { title: 'Report overview', text: `${MANAGEMENT_REPORTS.find((item) => item.id === reportId)?.label || reportId}\n${reportQualityConfig.periodLabel}` },
      { title: 'Records', text: '', table: { headers: rows.headers, rows: rows.rows } },
    ];
    const changes = qualityResolutions.filter((entry) => entry.before !== undefined && entry.after !== undefined).map((entry) => ({
      section: entry.issueId,
      originalText: String(entry.before),
      newText: String(entry.after),
      by: entry.by,
      at: entry.at,
      reason: entry.note,
    }));
    const blob = await createFixedReport({ title: reportQualityConfig.title, sections, changes, openProblems, format, draft });
    const generatedAt = new Date().toISOString();
    const extension = format === 'marked-docx' ? 'docx' : format;
    const fileName = `${fixedReportFileName(reportQualityConfig.title)}.${extension}`;
    const hash = await sha256Blob(blob);
    const version = Math.max(fixedReportVersion + 1, nextReportExportVersion(reportId));
    await appendReportExport({
      id: `fixed_report_${currentUser.uid}_${Date.now()}`,
      reportType: reportId,
      title: reportQualityConfig.title,
      fileName,
      format,
      version,
      hash,
      openProblems,
      overrides: qualityResolutions.filter((entry) => entry.status === 'overridden').map((entry) => ({
        issueId: entry.issueId, reason: entry.note, by: entry.by, at: entry.at,
      })),
      generatedBy: staffProfile?.fullName || currentUser.email || 'Management user',
      generatedByUid: currentUser.uid,
      generatedAt,
      draft,
      finalLocked: !draft,
    });
    saveBlob(blob, fileName);
    setFixedReportVersion(version);
  };

  const recordReportHistory = async (fileType: ReportHistoryRecord['fileType'], fileName: string, title: string, blob: Blob): Promise<boolean> => {
    if (!currentUser) return false;
    const generatedAt = new Date().toISOString();
    const id = `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let storagePath: string | undefined;
    try {
      storagePath = await archiveGeneratedReport(blob, currentUser.uid, id, fileName, fileType);
    } catch (error) {
      console.warn('Management report archive failed:', error);
    }
    const record: ReportHistoryRecord = {
      id,
      reportType: reportId,
      title,
      reportingPeriod: `${filters.startDate || filters.financialYear || 'All available dates'} to ${filters.endDate || 'present'}`,
      dateRange: filters.startDate || filters.endDate ? { start: filters.startDate, end: filters.endDate } : undefined,
      filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])),
      generatedBy: staffProfile?.fullName || currentUser.email || 'Management user',
      generatedByUid: currentUser.uid,
      generatedAt,
      fileType,
      fileName,
      storagePath,
      dataSourceReferences: ['managementReports', reportId],
      recordCount: rows.rows.length,
      photoCount: 0,
      tableCount: 1,
      status: 'Generated',
      qualityIssues: auditedQualityIssues,
      qualityScores: reportQualityScores,
      qualityResolutions,
      blockerOverrideReason: reportQualityIssues.some((issue) => issue.severity === 'blocker') ? blockerOverrideReason.trim() : undefined,
    };
    await appendReportHistory(record);
    return !!storagePath;
  };

  const recordReportExport = async (format: 'docx' | 'xlsx' | 'csv', fileName: string, title: string, blob: Blob) => {
    if (!currentUser) throw new Error('Sign in is required to record this report download.');
    await appendReportExport(await createReportExportRecord(blob, {
      reportType: reportId,
      title,
      fileName,
      format,
      openProblems: auditedQualityIssues
        .filter((issue) => issue.status !== 'resolved' && issue.status !== 'overridden')
        .map((issue) => ({ severity: issue.severity, text: qualityMessage(issue).title })),
      overrides: qualityResolutions.filter((entry) => entry.status === 'overridden').map((entry) => ({
        issueId: entry.issueId, reason: entry.note, by: entry.by, at: entry.at,
      })),
      generatedBy: staffProfile?.fullName || currentUser.email || 'Management user',
      generatedByUid: currentUser.uid,
      draft: false,
      finalLocked: true,
    }));
  };

  const handleCsvExport = async () => {
    if (!ensureQualityOverride()) return;
    try {
      const fileName = `SHINE_${reportId}_${new Date().toISOString().slice(0, 10)}.csv`;
      const csvRows = [rows.headers, ...rows.rows, [''], ['Quality Issues'], ['Severity / score', 'Rule', 'Location', 'Finding', 'Suggested action'], ...qualityAnnexRows];
      const csvContent = '\uFEFF' + csvRows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const title = MANAGEMENT_REPORTS.find((item) => item.id === reportId)?.label || reportId;
      await recordReportExport('csv', fileName, title, blob);
      saveBlob(blob, fileName);
      const archived = await recordReportHistory('csv', fileName, title, blob);
      if (currentUser) appendEmployeeAuditLog({ employeeId: 'management-report', action: 'report_export', actorUid: currentUser.uid, actorName: staffProfile?.fullName || currentUser.email || 'Management user', reportId, format: 'csv', filters, changedAt: new Date().toISOString() }).catch((error) => console.warn('Management report export audit failed:', error));
      setMessage(`${rows.rows.length} record(s) exported${archived ? ' and securely archived' : '; secure archiving was unavailable'}.`);
    } catch (error) {
      console.error('Management CSV export failed:', error);
      setMessage(error instanceof Error ? error.message : 'The spreadsheet could not be downloaded.');
    }
  };

  const handleExcelExport = async () => {
    if (!ensureQualityOverride()) return;
    try {
      const bytes = generateManagementReportWorkbook(reportId, rows, filters, staffProfile?.fullName || currentUser?.email || 'Management user', new Date().toISOString(), qualityAnnexRows);
      const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `SHINE_${reportId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const title = MANAGEMENT_REPORTS.find((item) => item.id === reportId)?.label || reportId;
      await recordReportExport('xlsx', fileName, title, blob);
      saveBlob(blob, fileName);
      const archived = await recordReportHistory('xlsx', fileName, title, blob);
      if (currentUser) appendEmployeeAuditLog({ employeeId: 'management-report', action: 'report_export', actorUid: currentUser.uid, actorName: staffProfile?.fullName || currentUser.email || 'Management user', reportId, format: 'xlsx', filters, changedAt: new Date().toISOString() }).catch((error) => console.warn('Management report export audit failed:', error));
      setMessage(`${rows.rows.length} record(s) exported to Excel${archived ? ' and securely archived' : '; secure archiving was unavailable'}.`);
    } catch (error) {
      console.error('Management spreadsheet export failed:', error);
      setMessage(error instanceof Error ? error.message : 'The spreadsheet could not be downloaded.');
    }
  };

  const handleWordSummary = async () => {
    if (!ensureQualityOverride()) return;
    setMessage('');
    const summary = buildManagementReportRows('management-summary', permittedDb, filters, staff, salaryHistory);
    const narrative = [
      `Reporting period: ${startDate || 'All available dates'} to ${endDate || 'present'}`,
      ...summary.rows.map(([label, value]) => `${label}: ${value}`),
      `Programme filter: ${filters.programme || 'All stored programme attributions'}`,
      `Household filter: ${filters.householdId || 'All households'}`,
    ].join('\n');
    const openActions = summary.rows.find(([label]) => label === 'Open case actions')?.[1] || 0;
    const educationFollowUps = summary.rows.find(([label]) => label === 'Education follow-ups')?.[1] || 0;
    const followUpNotes = `Recorded follow-up indicators: ${openActions} open case actions and ${educationFollowUps} outstanding education follow-ups. No additional narrative claims are generated.`;
    const householdGirlIds = new Set((permittedDb.girls || []).filter((girl) => !filters.householdId || girl.householdId === filters.householdId).map((girl) => girl.id));
    const attachments = (permittedDb.attachments || []).filter((attachment) => {
      if ((filters.startDate && attachment.date < filters.startDate) || (filters.endDate && attachment.date > filters.endDate)) return false;
      if (filters.category && attachment.category !== filters.category) return false;
      if (filters.programme) {
        const expense = (permittedDb.expenses || []).find((item) => item.id === attachment.targetId);
        const programmeLinked = expense?.programme === filters.programme || (permittedDb.budgets || []).some((line) =>
          line.programme === filters.programme && (line.activityId === attachment.targetId || line.id === expense?.budgetLineId)
        );
        if (!programmeLinked) return false;
      }
      if (!filters.householdId) return true;
      if (attachment.targetType === 'household') return attachment.targetId === filters.householdId;
      if (attachment.targetType === 'girl') return householdGirlIds.has(attachment.targetId);
      const education = (permittedDb.educationalFollowUps || []).find((item) => item.id === attachment.targetId);
      const health = (permittedDb.healthFollowUps || []).find((item) => item.id === attachment.targetId);
      const family = (permittedDb.familyFollowUps || []).find((item) => item.id === attachment.targetId);
      const activity = (permittedDb.householdActivities || []).find((item) => item.id === attachment.targetId);
      const rent = (permittedDb.rentPayments || []).find((item) => item.id === attachment.targetId);
      const expense = (permittedDb.expenses || []).find((item) => item.id === attachment.targetId);
      return [education?.girlId, health?.girlId, family?.girlId].some((girlId) => !!girlId && householdGirlIds.has(girlId)) ||
        activity?.householdId === filters.householdId || rent?.householdId === filters.householdId || expense?.householdId === filters.householdId;
    });
    const reportTitle = MANAGEMENT_REPORTS.find((item) => item.id === reportId)?.label || reportId;
    const config: ReportConfig = {
      reportType: reportId,
      title: `SHINE ${reportTitle}`,
      subtitle: 'Management reporting based on recorded operational and financial data',
      periodLabel: `${startDate || 'All available dates'} to ${endDate || 'present'}`,
      generatedBy: 'SHINE Management',
      structuredTables: [{ title: reportTitle, headers: rows.headers, rows: rows.rows }],
      dateRange: startDate || endDate ? { start: startDate || undefined, end: endDate || undefined } : undefined,
      selectedHouseholdId: filters.householdId,
      executiveSummary: narrative,
      qualityIssues: auditedQualityIssues,
      qualityScores: reportQualityScores,
      blockerOverrideReason,
      recommendationsNotes: followUpNotes,
      selectedPhotoIds: attachments.map((attachment) => attachment.id),
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
        photoGallery: attachments.length > 0,
      },
    };
    try {
      const blob = await generateWordReport(permittedDb, config);
      const fileName = `SHINE_Management_Summary_${new Date().toISOString().slice(0, 10)}.docx`;
      await recordReportExport('docx', fileName, `SHINE ${reportTitle}`, blob);
      saveBlob(blob, fileName);
      const archived = await recordReportHistory('docx', fileName, `SHINE ${reportTitle}`, blob);
      if (currentUser) appendEmployeeAuditLog({ employeeId: 'management-report', action: 'report_export', actorUid: currentUser.uid, actorName: staffProfile?.fullName || currentUser.email || 'Management user', reportId, format: 'docx', filters, changedAt: new Date().toISOString() }).catch((error) => console.warn('Management report export audit failed:', error));
      setMessage(`Word ${reportTitle.toLowerCase()} generated${archived ? ' and securely archived' : '; secure archiving was unavailable'}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The Word report could not be generated.');
    }
  };

  return (
    <section className="space-y-4" aria-label="Management reports">
      <div>
        <h3 className="text-base font-black text-stone-900">Management reports</h3>
        <p className="text-xs text-stone-500">Exports contain filtered records and figures already stored in SHINE. No values are estimated or generated from mock data.</p>
      </div>
      <QualityCheckPanel
        issues={auditedQualityIssues}
        scores={reportQualityScores}
        onDownloadFixedReport={downloadFixedReport}
        canApproveNarrativeOnly
        currentUserName={staffProfile?.fullName || currentUser?.email || 'Management user'}
        onOpenIssue={(issue) => {
          if (!issue.target) return;
          if (issue.target.kind === 'budget-item' || issue.target.kind === 'workplan-item' || issue.target.kind === 'indicator-result') {
            onOpenQualityRecord(issue);
            return;
          }
          const record = Array.from(document.querySelectorAll<HTMLElement>('[data-quality-record-id]'))
            .find((element) => element.dataset.qualityRecordId === issue.target?.id);
          const table = record || document.getElementById('management-report-table');
          table?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          table?.focus({ preventScroll: true });
        }}
        onResolveIssue={(issue, resolution: QualityIssueResolution) => {
          if (issue.rule === 'IDENTITY-FUZZY-01' && resolution.status === 'resolved') {
            setQualityResolutions((current) => [
              ...current.filter((entry) => entry.issueId !== issue.id),
              { issueId: issue.id, status: resolution.status, note: resolution.note, by: staffProfile?.fullName || currentUser?.email || 'Management user', at: new Date().toISOString() },
            ]);
            return true;
          }
          if (resolution.status !== 'overridden' || resolution.note.trim().length < 10) return false;
          setQualityResolutions((current) => [
            ...current.filter((entry) => entry.issueId !== issue.id),
            { issueId: issue.id, status: resolution.status, note: resolution.note, by: staffProfile?.fullName || currentUser?.email || 'Management user', at: new Date().toISOString() },
          ]);
          return true;
        }}
        onUndoFix={(issue) => setQualityResolutions((current) => current.filter((entry) => entry.issueId !== issue.id))}
      />
      {reportQualityIssues.some((issue) => issue.severity === 'blocker') && (
        <label className="block rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs font-semibold text-rose-950">
          Written reason for overriding report blockers
          <textarea value={blockerOverrideReason} onChange={(event) => setBlockerOverrideReason(event.target.value)} minLength={10} className="field mt-2 min-h-20 w-full bg-white" />
        </label>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="text-[11px] text-stone-600">Report<select className="field mt-1 w-full" value={reportId} onChange={(event) => selectManagementReport(event.target.value)}>
          {MANAGEMENT_REPORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label className="text-[11px] text-stone-600">From<input className="field mt-1 w-full" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="text-[11px] text-stone-600">To<input className="field mt-1 w-full" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        {!['monthly-management', 'quarterly-management'].includes(reportId) && <label className="text-[11px] text-stone-600">Financial year<select className="field mt-1 w-full" value={financialYear} onChange={(event) => setFinancialYear(event.target.value)}><option value="ALL">All years</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>}
        {reportId !== 'quarterly-management' && <label className="text-[11px] text-stone-600">Month<select className="field mt-1 w-full" value={month} onChange={(event) => setMonth(event.target.value)}><option value="ALL">All months</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleString('en', { month: 'long' })}</option>)}</select></label>}
        <label className="text-[11px] text-stone-600">Programme<select className="field mt-1 w-full" value={programme} onChange={(event) => setProgramme(event.target.value)}><option value="ALL">All programmes</option>{programmes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-[11px] text-stone-600">Household<select className="field mt-1 w-full" value={householdId} onChange={(event) => setHouseholdId(event.target.value)}><option value="ALL">All households</option>{(db.households || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {['case-management', 'girl-history', 'education', 'attendance', 'case-reviews'].includes(reportId) && <label className="text-[11px] text-stone-600">School<select className="field mt-1 w-full" value={school} onChange={(event) => setSchool(event.target.value)}><option value="ALL">All schools</option>{Array.from(new Set((db.girls || []).map((girl) => girl.school).filter(Boolean))).sort().map((item) => <option key={item}>{item}</option>)}</select></label>}
        {['case-management', 'girl-history', 'education', 'attendance'].includes(reportId) && <label className="text-[11px] text-stone-600">Class / form<select className="field mt-1 w-full" value={classLevel} onChange={(event) => setClassLevel(event.target.value)}><option value="ALL">All classes</option>{Array.from(new Set((db.girls || []).map((girl) => girl.classLevel).filter(Boolean))).sort().map((item) => <option key={item}>{item}</option>)}</select></label>}
        <label className="text-[11px] text-stone-600">Category<select className="field mt-1 w-full" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {reportId === 'quarterly-management' && <div className="grid max-w-md grid-cols-2 gap-2"><label className="text-[11px] text-stone-600">Quarter<select className="field mt-1 w-full" value={quarter} onChange={(event) => setQuarter(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>Q{value} · {['January–March', 'April–June', 'July–September', 'October–December'][value - 1]}</option>)}</select></label><label className="text-[11px] text-stone-600">Year<input className="field mt-1 w-full" type="number" min="2000" max="2100" value={quarterYear} onChange={(event) => setQuarterYear(Number(event.target.value))} /></label></div>}
      {reportId === 'monthly-management' && <label className="block max-w-xs text-[11px] text-stone-600">Calendar year<input className="field mt-1 w-full" type="number" min="2000" max="2100" value={monthlyYear} onChange={(event) => setMonthlyYear(Number(event.target.value))} /></label>}
      {reportId === 'annual-management' && <p className="text-[11px] text-stone-500">Use From and To to enter your configured financial-year boundaries; the calendar year is not substituted.</p>}
      {['payroll', 'salary-history', 'staff-workload', 'gratuity', 'contract-expiry', 'outstanding-actions', 'workplan-progress', 'programme-activity'].includes(reportId) ? <label className="block max-w-sm text-[11px] text-stone-600">Staff member<select className="field mt-1 w-full" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="ALL">All staff</option>{staff.map((person) => <option key={person.uid || person.id} value={person.uid || person.id}>{person.fullName}</option>)}</select></label> : null}
      {['outstanding-actions', 'workplan-progress', 'programme-activity', 'staff-workload'].includes(reportId) && <div className="grid grid-cols-2 gap-2 max-w-md"><label className="text-[11px] text-stone-600">Status<select className="field mt-1 w-full" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option>{['Open', 'In Progress', 'Overdue', 'Planned', 'Completed', 'Delayed', 'Cancelled', 'Upcoming', 'Scheduled'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-[11px] text-stone-600">Priority<select className="field mt-1 w-full" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="ALL">All priorities</option>{['Low', 'Medium', 'High', 'Urgent'].map((item) => <option key={item}>{item}</option>)}</select></label></div>}
      {salaryLoadFailed && reportId === 'gratuity' && <p className="text-xs text-amber-800">Salary history is unavailable, so gratuity liability cannot be calculated.</p>}
      {programme !== 'ALL' && <p className="text-[11px] text-amber-800">Programme filtering uses stored programme attribution only. Records without a programme are not assigned one.</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={handleCsvExport} disabled={reportId === 'gratuity' && !salaryHistory} className="inline-flex items-center gap-2 rounded-md bg-teal-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button>
        <button onClick={handleExcelExport} disabled={reportId === 'gratuity' && !salaryHistory} className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-white px-3 py-2 text-xs font-bold text-emerald-900 disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" />Export Excel workbook</button>
        <button onClick={handleWordSummary} className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-800"><FileText className="h-4 w-4" />Export Word report</button>
      </div>
      {message && <p role="status" className="text-xs text-teal-800">{message}</p>}
      <div id="management-report-table" tabIndex={-1} className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="min-w-full text-left text-xs"><thead className="bg-stone-50"><tr>{rows.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 font-bold text-stone-600">{header}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{rows.rows.slice(0, 20).map((row, index) => <tr key={`${reportId}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-3 py-2 text-stone-700">{cell}</td>)}</tr>)}</tbody></table>
        {rows.rows.length === 0 && <p className="p-4 text-center text-xs text-stone-500">No records match these filters.</p>}
        {rows.rows.length > 20 && <p className="border-t border-stone-200 p-2 text-[11px] text-stone-500">Showing first 20 of {rows.rows.length} rows. CSV includes every matching row.</p>}
      </div>
    </section>
  );
};
