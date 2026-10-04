import React, { useEffect, useState } from 'react';
import { AppDatabase, PhotoAttachment, ReportHistoryRecord } from '../../types';
import {
  ReportConfig,
  filterDataForReport,
  generateWordReport,
  generateExcelWorkbook,
  generatePdfReport,
  reviewReportQuality,
} from '../../services/reportGenerators';
import { qualityScores } from '../../services/qualityRules';
import { QualityCheckPanel } from '../QualityCheckPanel';
import type { QualityIssueResolution } from '../QualityCheckPanel';
import { useAuth } from '../../contexts/AuthContext';
import { archiveGeneratedReport, getArchivedReport, getAuthorizedReportImage, getReportAttachmentMetadata } from '../../services/attachmentService';
import { appendReportHistory, getReportHistory } from '../../services/firestoreSync';
import {
  FileDown,
  FileSpreadsheet,
  FileText,
  Download,
  CheckCircle2,
  Calendar,
  Filter,
  Layers,
  Settings2,
  X,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface ComprehensiveReportModalProps {
  db: AppDatabase;
  onClose: () => void;
  preselectedGirlId?: string;
  preselectedHouseholdId?: string;
}

function triggerFileDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const ComprehensiveReportModal: React.FC<ComprehensiveReportModalProps> = ({
  db,
  onClose,
  preselectedGirlId,
  preselectedHouseholdId,
}) => {
  const { staffProfile, canViewHealthRecords, canViewCaseReviews, canViewSafeguarding, currentUser, isAdmin, role, allStaff } = useAuth();
  const canGenerateReports = isAdmin || role === 'Manager' || role === 'Staff';
  const authorName = staffProfile?.fullName || 'SHINE Relief Trust Malawi';
  const [attachments, setAttachments] = useState<PhotoAttachment[]>([]);
  const [brandLogoData, setBrandLogoData] = useState<Uint8Array>();
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [reportHistory, setReportHistory] = useState<ReportHistoryRecord[]>([]);

  const [format, setFormat] = useState<'docx' | 'xlsx' | 'pdf'>('docx');
  const [reportType, setReportType] = useState('comprehensive');
  const [reportTitle, setReportTitle] = useState<string>(
    'SHINE Relief Trust Case Management & Programme Progress Report'
  );
  const [reportSubtitle, setReportSubtitle] = useState<string>(
    'Zomba District, Malawi • Comprehensive Caseload & Financial Accountability'
  );

  const now = new Date();
  const [dateRangePreset, setDateRangePreset] = useState<string>('all');
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [periodQuarter, setPeriodQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string>(preselectedHouseholdId || 'ALL');
  const [selectedGirlId, setSelectedGirlId] = useState<string>(preselectedGirlId || 'ALL');
  const [reportFilters, setReportFilters] = useState<NonNullable<ReportConfig['filters']>>({});

  // Section Toggles
  const [includeExecutiveSummary, setIncludeExecutiveSummary] = useState<boolean>(true);
  const [includeStatistics, setIncludeStatistics] = useState<boolean>(true);
  const [includeGirlsCaseload, setIncludeGirlsCaseload] = useState<boolean>(true);
  const [includeEducation, setIncludeEducation] = useState<boolean>(true);
  const [includeHealth, setIncludeHealth] = useState<boolean>(true);
  const [includeFamily, setIncludeFamily] = useState<boolean>(true);
  const [includeFinances, setIncludeFinances] = useState<boolean>(true);
  const [includeBudgets, setIncludeBudgets] = useState<boolean>(true);
  const [includeWorkplans, setIncludeWorkplans] = useState<boolean>(true);
  const [includeCaseActions, setIncludeCaseActions] = useState(true);
  const [includeCaseReviews, setIncludeCaseReviews] = useState(false);
  const [includePhotos, setIncludePhotos] = useState<boolean>(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [maxPhotos, setMaxPhotos] = useState(10);
  const [confirmedPreview, setConfirmedPreview] = useState('');

  const [executiveNotes, setExecutiveNotes] = useState<string>('');
  const [blockerOverrideReason, setBlockerOverrideReason] = useState('');
  const [qualityResolutions, setQualityResolutions] = useState<Array<{ issueId: string; status: 'resolved' | 'overridden' | 'pending-approval'; note: string; by: string; at: string }>>([]);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setAttachmentsLoading(true);
    getReportAttachmentMetadata(canViewHealthRecords)
      .then((items) => { if (active) setAttachments(items); })
      .catch((error) => { if (active) setDownloadSuccess(error instanceof Error ? error.message : 'Attachments could not be loaded.'); })
      .finally(() => { if (active) setAttachmentsLoading(false); });
    return () => { active = false; };
  }, [canViewHealthRecords]);

  useEffect(() => {
    let active = true;
    fetch('/logo.png')
      .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error('Logo unavailable')))
      .then((bytes) => { if (active) setBrandLogoData(new Uint8Array(bytes)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    getReportHistory(currentUser.uid, isAdmin || role === 'Manager')
      .then(setReportHistory)
      .catch((error) => console.warn('Report history could not be loaded:', error));
  }, [currentUser?.uid, isAdmin, role]);

  const scopedAttachments = attachments.filter((attachment) => {
    if (startDate && attachment.date < startDate) return false;
    if (endDate && attachment.date > endDate) return false;
    if (reportFilters.category && attachment.category !== reportFilters.category) return false;
    if (reportFilters.activityId && attachment.targetId !== reportFilters.activityId) return false;
    const linkedGirlId = attachment.targetType === 'girl'
      ? attachment.targetId
      : attachment.targetType === 'educationalFollowUp'
        ? db.educationalFollowUps.find((item) => item.id === attachment.targetId)?.girlId
        : attachment.targetType === 'healthFollowUp'
          ? db.healthFollowUps.find((item) => item.id === attachment.targetId)?.girlId
          : attachment.targetType === 'familyFollowUp'
            ? db.familyFollowUps.find((item) => item.id === attachment.targetId)?.girlId
            : undefined;
    const linkedHouseholdId = attachment.targetType === 'household'
      ? attachment.targetId
      : attachment.targetType === 'householdActivity'
        ? db.householdActivities.find((item) => item.id === attachment.targetId)?.householdId
        : attachment.targetType === 'rentPayment'
          ? db.rentPayments.find((item) => item.id === attachment.targetId)?.householdId
          : attachment.targetType === 'expense'
            ? db.expenses.find((item) => item.id === attachment.targetId)?.householdId
            : linkedGirlId
              ? db.girls.find((girl) => girl.id === linkedGirlId)?.householdId
              : undefined;
    if (selectedGirlId !== 'ALL' && linkedGirlId !== selectedGirlId) return false;
    if (selectedHouseholdId !== 'ALL' && linkedHouseholdId !== selectedHouseholdId) return false;
    return true;
  }).filter((attachment) => /^image\/(jpeg|png)$/i.test(attachment.contentType));

  const programmeOptions = Array.from(new Set([
    ...(db.budgets || []).map((item) => item.programme),
    ...(db.annualBudgets || []).map((item) => item.programme),
    ...(db.expenses || []).map((item) => item.programme),
  ].filter((value): value is string => !!value))).sort();
  const schoolOptions = Array.from(new Set(db.girls.map((girl) => girl.school).filter(Boolean))).sort();
  const classOptions = Array.from(new Set(db.girls.map((girl) => girl.classLevel).filter(Boolean))).sort();
  const categoryOptions = Array.from(new Set([
    ...(db.budgets || []).map((item) => item.category),
    ...(db.expenses || []).map((item) => item.category),
    ...(db.householdActivities || []).map((item) => item.activityType),
  ])).sort();
  const activityOptions = [
    ...(db.householdActivities || []).map((item) => ({ id: item.id, label: item.activityName })),
    ...(db.workplans || []).map((item) => ({ id: item.id, label: item.activity })),
  ];
  const setReportFilter = (key: keyof NonNullable<ReportConfig['filters']>, value: string) => {
    setReportFilters((current) => ({ ...current, [key]: value || undefined } as NonNullable<ReportConfig['filters']>));
  };
  const reportDatabase: AppDatabase = {
    ...db,
    attachments,
    healthFollowUps: canViewHealthRecords ? db.healthFollowUps : [],
    caseActions: (db.caseActions || []).filter((action) => canViewSafeguarding || action.sourceType !== 'safeguarding'),
    caseReviews: !canViewCaseReviews ? [] : canViewHealthRecords
      ? db.caseReviews || []
      : (db.caseReviews || []).map(({ health: _health, ...review }) => review),
  };
  const reportQualityConfig: ReportConfig = {
    reportType,
    title: reportTitle,
    periodLabel: startDate && endDate ? `${startDate} to ${endDate}` : 'Selected reporting period',
    generatedBy: authorName,
    executiveSummary: includeExecutiveSummary ? executiveNotes : undefined,
    includeSections: {
      executiveSummary: includeExecutiveSummary,
      statistics: includeStatistics,
      girlsList: includeGirlsCaseload,
      householdsList: includeGirlsCaseload,
      educationalFollowUps: includeEducation,
      healthFollowUps: canViewHealthRecords && includeHealth,
      familyFollowUps: includeFamily,
      householdActivities: includeEducation,
      expenditure: includeFinances,
      rentPayments: includeFinances,
      budgets: includeBudgets,
      workplans: includeWorkplans,
      schedules: includeWorkplans,
      photoGallery: includePhotos && format !== 'xlsx',
      caseActions: includeCaseActions,
      caseReviews: canViewCaseReviews && includeCaseReviews,
    },
  };
  const reportQualityIssues = reviewReportQuality(reportDatabase, reportQualityConfig);
  const reportQualityScores = qualityScores(reportQualityIssues);
  const auditedQualityIssues = reportQualityIssues.map((issue) => ({
    ...issue,
    status: qualityResolutions.find((entry) => entry.issueId === issue.id)?.status || issue.status,
    ...(qualityResolutions.find((entry) => entry.issueId === issue.id)
      ? { resolution: qualityResolutions.find((entry) => entry.issueId === issue.id) }
      : {}),
  }));

  const applyCalendarPeriod = (preset: string, year: number, month: number, quarter: number) => {
    const startMonth = preset === 'month' ? month : preset === 'quarter' ? (quarter - 1) * 3 + 1 : 1;
    const endMonth = preset === 'month' ? month : preset === 'quarter' ? startMonth + 2 : 12;
    const start = new Date(Date.UTC(year, startMonth - 1, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(year, endMonth, 0)).toISOString().slice(0, 10);
    setStartDate(start);
    setEndDate(end);
  };

  const updateCalendarPeriod = (preset: string, year = periodYear, month = periodMonth, quarter = periodQuarter) => {
    if (preset === 'month' || preset === 'quarter' || preset === 'year') {
      applyCalendarPeriod(preset, year, month, quarter);
    }
  };

  const handleDatePresetChange = (preset: string) => {
    setDateRangePreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'month' || preset === 'quarter' || preset === 'year') {
      updateCalendarPeriod(preset);
    } else if (preset === '90days') {
      const today = new Date();
      const prior = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setStartDate(prior);
      setEndDate(today.toISOString().slice(0, 10));
    }
  };

  const handleReportTypeChange = (type: string) => {
    setReportType(type);
    const title = {
      comprehensive: 'SHINE Relief Trust Case Management & Programme Progress Report',
      girl: 'Individual Girl Case Report',
      household: 'Household Profile Report',
      monthly: 'Monthly SHINE Report',
      quarterly: 'Quarterly SHINE Report',
      annual: 'Annual SHINE Report',
    }[type];
    if (title) setReportTitle(title);
    if (type === 'monthly') handleDatePresetChange('month');
    if (type === 'quarterly') handleDatePresetChange('quarter');
    if (type === 'annual') {
      setDateRangePreset('custom');
      setStartDate('');
      setEndDate('');
    }
  };

  const handleGenerate = async () => {
    if (!canGenerateReports) {
      setDownloadSuccess('Your account can view permitted reports but cannot generate or archive reports.');
      return;
    }
    if (reportType === 'girl' && selectedGirlId === 'ALL') {
      setDownloadSuccess('Select a girl before generating an individual case report.');
      return;
    }
    if (reportType === 'household' && selectedHouseholdId === 'ALL') {
      setDownloadSuccess('Select a household before generating a household profile report.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setDownloadSuccess('The start date must be on or before the end date.');
      return;
    }
    if (reportType === 'annual' && (!startDate || !endDate)) {
      setDownloadSuccess('Select the financial-year start and end dates before generating this annual report.');
      return;
    }
    if (reportQualityIssues.some((issue) => issue.severity === 'blocker') && blockerOverrideReason.trim().length < 10) {
      setDownloadSuccess('Resolve quality blockers or provide a written override reason of at least 10 characters.');
      return;
    }
    if (confirmedPreview !== previewFingerprint) {
      setConfirmedPreview(previewFingerprint);
      return;
    }
    setIsGenerating(true);
    setDownloadSuccess(null);

    const safePeriodLabel =
      startDate && endDate
        ? `${startDate} to ${endDate}`
        : dateRangePreset === 'all'
        ? 'Comprehensive All-Time Cumulative'
        : 'Reporting Period';

    const reportDb = reportDatabase;
    const chosenPhotos = includePhotos && format !== 'xlsx'
      ? scopedAttachments.filter((attachment) => selectedPhotoIds.includes(attachment.id)).slice(0, maxPhotos)
      : [];
    const config: ReportConfig = {
      reportType,
      title: reportTitle,
      brandLogoData,
      subtitle: reportSubtitle,
      periodLabel: safePeriodLabel,
      generatedBy: authorName,
      dateRange: startDate || endDate ? { start: startDate, end: endDate } : undefined,
      selectedHouseholdId: selectedHouseholdId !== 'ALL' ? selectedHouseholdId : undefined,
      selectedGirlId: selectedGirlId !== 'ALL' ? selectedGirlId : undefined,
      filters: reportFilters,
      selectedPhotoIds: chosenPhotos.map((attachment) => attachment.id),
      maxPhotos: includePhotos && format !== 'xlsx' ? maxPhotos : 0,
      executiveSummary: includeExecutiveSummary ? executiveNotes : undefined,
      qualityIssues: auditedQualityIssues,
      qualityScores: reportQualityScores,
      blockerOverrideReason,
      includeSections: {
        executiveSummary: includeExecutiveSummary,
        statistics: includeStatistics,
        girlsList: includeGirlsCaseload,
        householdsList: includeGirlsCaseload,
        educationalFollowUps: includeEducation,
        healthFollowUps: canViewHealthRecords && includeHealth,
        familyFollowUps: includeFamily,
        householdActivities: includeEducation,
        expenditure: includeFinances,
        rentPayments: includeFinances,
        budgets: includeBudgets,
        workplans: includeWorkplans,
        schedules: includeWorkplans,
        photoGallery: includePhotos && format !== 'xlsx',
        caseActions: includeCaseActions,
        caseReviews: canViewCaseReviews && includeCaseReviews,
      },
    };

    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `SHINE_Relief_Report_${dateStamp}.${format}`;

    try {
      const imageData: Record<string, Uint8Array> = {};
      if (format !== 'xlsx') {
        for (const attachment of chosenPhotos) {
          imageData[attachment.id] = await getAuthorizedReportImage(attachment, canViewHealthRecords);
        }
      }
      if (format === 'docx') {
        const blob = await generateWordReport(reportDb, { ...config, photoImageData: imageData });
        const archived = await persistReportHistory('docx', fileName, chosenPhotos.length, blob);
        triggerFileDownload(blob, fileName);
        setDownloadSuccess(archived ? 'Word document securely archived and downloaded.' : 'Word document downloaded; secure archiving was unavailable.');
      } else if (format === 'xlsx') {
        const bytes = generateExcelWorkbook(reportDb, config);
        const blob = new Blob([bytes as any], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const archived = await persistReportHistory('xlsx', fileName, 0, blob);
        triggerFileDownload(blob, fileName);
        setDownloadSuccess(archived ? 'Excel workbook securely archived and downloaded.' : 'Excel workbook downloaded; secure archiving was unavailable.');
      } else {
        const blob = generatePdfReport(reportDb, { ...config, photoImageData: imageData });
        const archived = await persistReportHistory('pdf', fileName, chosenPhotos.length, blob);
        triggerFileDownload(blob, fileName);
        setDownloadSuccess(archived ? 'PDF report securely archived and downloaded.' : 'PDF report downloaded; secure archiving was unavailable.');
      }
    } catch (err) {
      console.error('Report export failure:', err);
      setDownloadSuccess(err instanceof Error ? err.message : 'Failed to generate report.');
    } finally {
      setIsGenerating(false);
    }
  };

  const previewConfig: ReportConfig = {
    reportType,
    title: reportTitle,
    periodLabel: startDate && endDate ? `${startDate} to ${endDate}` : reportType === 'annual' ? 'Financial-year dates required' : 'All available dates',
    generatedBy: authorName,
    dateRange: startDate || endDate ? { start: startDate, end: endDate } : undefined,
    selectedHouseholdId: selectedHouseholdId !== 'ALL' ? selectedHouseholdId : undefined,
    selectedGirlId: selectedGirlId !== 'ALL' ? selectedGirlId : undefined,
    filters: reportFilters,
    selectedPhotoIds: includePhotos && format !== 'xlsx'
      ? scopedAttachments.filter((attachment) => selectedPhotoIds.includes(attachment.id)).slice(0, maxPhotos).map((attachment) => attachment.id)
      : [],
    maxPhotos: includePhotos && format !== 'xlsx' ? maxPhotos : 0,
    includeSections: {
      executiveSummary: includeExecutiveSummary,
      statistics: includeStatistics,
      girlsList: includeGirlsCaseload,
      householdsList: includeGirlsCaseload,
      educationalFollowUps: includeEducation,
      healthFollowUps: canViewHealthRecords && includeHealth,
      familyFollowUps: includeFamily,
      householdActivities: includeEducation,
      expenditure: includeFinances,
      rentPayments: includeFinances,
      budgets: includeBudgets,
      workplans: includeWorkplans,
      schedules: includeWorkplans,
      photoGallery: includePhotos && format !== 'xlsx',
      caseActions: includeCaseActions,
      caseReviews: canViewCaseReviews && includeCaseReviews,
    },
  };
  const previewDb = reportDatabase;
  const previewData = filterDataForReport(previewDb, previewConfig);
  const previewRecords =
    (includeGirlsCaseload ? previewData.girls.length + previewData.households.length : 0) +
    (includeEducation ? previewData.edu.length + previewData.activities.length : 0) +
    (canViewHealthRecords && includeHealth ? previewData.health.length : 0) +
    (includeFamily ? previewData.family.length : 0) +
    (includeFinances ? previewData.expenses.length + previewData.rent.length : 0) +
    (includeBudgets ? previewData.budgets.length : 0) +
    (includeWorkplans ? previewData.workplans.length + previewData.schedules.length : 0) +
    (includeCaseActions ? previewData.caseActions.length : 0) +
    (canViewCaseReviews && includeCaseReviews ? previewData.caseReviews.length : 0);
  const previewTables = [
    includeStatistics, includeGirlsCaseload && previewData.girls.length > 0,
    includeEducation && previewData.edu.length > 0, canViewHealthRecords && includeHealth && previewData.health.length > 0,
    includeFamily && previewData.family.length > 0, includeBudgets && previewData.budgets.length > 0,
    includeWorkplans && previewData.workplans.length > 0,
    includeCaseActions && previewData.caseActions.length > 0,
    canViewCaseReviews && includeCaseReviews && previewData.caseReviews.length > 0,
  ].filter(Boolean).length;
  const previewFingerprint = JSON.stringify({ format, previewConfig, executiveNotes });
  const selectedFilterLabels = [
    selectedHouseholdId !== 'ALL' ? `Household: ${db.households.find((item) => item.id === selectedHouseholdId)?.name || selectedHouseholdId}` : '',
    selectedGirlId !== 'ALL' ? `Girl: ${db.girls.find((item) => item.id === selectedGirlId)?.fullName || selectedGirlId}` : '',
    ...Object.entries(reportFilters).filter(([, value]) => !!value).map(([key, value]) => `${key}: ${value}`),
    startDate || endDate ? `Dates: ${startDate || 'any'} to ${endDate || 'any'}` : reportType === 'annual' ? 'Financial-year dates required' : 'Dates: all available',
  ].filter(Boolean);
  const persistReportHistory = async (fileType: 'docx' | 'xlsx' | 'pdf', fileName: string, photoCount: number, blob: Blob): Promise<boolean> => {
    if (!currentUser) throw new Error('Sign in is required to record report history.');
    const id = `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let storagePath: string | undefined;
    try {
      storagePath = await archiveGeneratedReport(blob, currentUser.uid, id, fileName, fileType);
    } catch (error) {
      console.warn('Report archive upload failed:', error);
    }
    const record: ReportHistoryRecord = {
      id,
      reportType,
      title: reportTitle,
      reportingPeriod: previewConfig.periodLabel,
      dateRange: previewConfig.dateRange,
      filters: {
        ...(selectedHouseholdId !== 'ALL' ? { householdId: selectedHouseholdId } : {}),
        ...(selectedGirlId !== 'ALL' ? { girlId: selectedGirlId } : {}),
        ...Object.fromEntries(Object.entries(reportFilters).filter(([, value]) => !!value)),
      },
      generatedBy: authorName,
      generatedByUid: currentUser.uid,
      generatedAt: new Date().toISOString(),
      fileType,
      fileName,
      storagePath,
      dataSourceReferences: ['girls', 'households', 'follow-ups', 'activities', 'finance', 'workplans', 'attachments'],
      recordCount: previewRecords,
      photoCount,
      tableCount: previewTables,
      status: 'Generated',
      qualityIssues: auditedQualityIssues,
      qualityScores: reportQualityScores,
      qualityResolutions,
      blockerOverrideReason: reportQualityIssues.some((issue) => issue.severity === 'blocker') ? blockerOverrideReason.trim() : undefined,
    };
    await appendReportHistory(record);
    setReportHistory((current) => [record, ...current].slice(0, 100));
    return !!storagePath;
  };

  const downloadArchivedReport = async (record: ReportHistoryRecord) => {
    if (!record.storagePath) {
      setDownloadSuccess('This older history entry has no archived file.');
      return;
    }
    try {
      triggerFileDownload(await getArchivedReport(record.storagePath), record.fileName);
    } catch (error) {
      setDownloadSuccess(error instanceof Error ? error.message : 'This archived report is not available to your account.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="bg-teal-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-800 rounded-xl border border-teal-700">
              <FileDown className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-bold">Custom Report & Export Generator</h3>
              <p className="text-xs text-teal-200 mt-0.5">
                Generate professional Word, Excel or PDF reports tailored for trustees and stakeholders.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-teal-800 rounded-lg text-teal-200 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-stone-800">
          {/* Format Selector */}
          <div>
            <label className="block font-bold text-stone-900 mb-2">1. Select Document Export Format</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormat('docx')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  format === 'docx'
                    ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-600'
                    : 'border-stone-200 bg-stone-50 hover:bg-white'
                }`}
              >
                <FileText className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-stone-900">Word (.docx)</strong>
                  <span className="text-[11px] text-stone-500 leading-snug block mt-0.5">
                    Full narrative dossier with branded styling, tables, and photo logs.
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  format === 'xlsx'
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-600'
                    : 'border-stone-200 bg-stone-50 hover:bg-white'
                }`}
              >
                <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-stone-900">Excel (.xlsx)</strong>
                  <span className="text-[11px] text-stone-500 leading-snug block mt-0.5">
                    Multi-tab workbook with budgets, follow-ups, and raw data.
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  format === 'pdf'
                    ? 'border-rose-600 bg-rose-50/70 shadow-xs ring-1 ring-rose-600'
                    : 'border-stone-200 bg-stone-50 hover:bg-white'
                }`}
              >
                <FileText className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-stone-900">PDF (.pdf)</strong>
                  <span className="text-[11px] text-stone-500 leading-snug block mt-0.5">
                    Formatted layout ready for trustee circulation and printing.
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Report Metadata */}
          <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-3">
            <h4 className="font-bold text-stone-900 flex items-center gap-1.5">
              <Settings2 className="w-4 h-4 text-teal-800" /> 2. Report Titles & Subtitles
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Report type</label>
                <select value={reportType} onChange={(event) => handleReportTypeChange(event.target.value)} className="w-full rounded-lg border border-stone-300 bg-white p-2">
                  <option value="comprehensive">Comprehensive report</option>
                  <option value="girl">Individual girl case report</option>
                  <option value="household">Household profile report</option>
                  <option value="monthly">Monthly SHINE report</option>
                  <option value="quarterly">Quarterly SHINE report</option>
                  <option value="annual">Annual SHINE report</option>
                </select>
              </div>
              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Report Main Title</label>
                <input
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg p-2 focus:ring-1 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Subheading / Context</label>
                <input
                  value={reportSubtitle}
                  onChange={(e) => setReportSubtitle(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg p-2 focus:ring-1 focus:ring-teal-700"
                />
              </div>
            </div>
          </div>

          {/* Filtering Scope */}
          <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-3">
            <h4 className="font-bold text-stone-900 flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-teal-800" /> 3. Target Scope & Date Filters
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Date Range</label>
                <select
                  value={dateRangePreset}
                  onChange={(e) => handleDatePresetChange(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg p-2"
                >
                  <option value="all">All Available Records</option>
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                  <option value="90days">Past 90 Days</option>
                  <option value="year">Calendar Year</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              <div className={reportType === 'girl' ? 'hidden' : ''}>
                <label className="block text-stone-600 mb-1 font-semibold">Filter Household</label>
                <select
                  value={selectedHouseholdId}
                  onChange={(e) => setSelectedHouseholdId(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg p-2"
                >
                  <option value="ALL">All Households ({db.households.length})</option>
                  {db.households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className={reportType === 'household' ? 'hidden' : ''}>
                <label className="block text-stone-600 mb-1 font-semibold">Filter Beneficiary</label>
                <select
                  value={selectedGirlId}
                  onChange={(e) => setSelectedGirlId(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg p-2"
                >
                  <option value="ALL">All Beneficiaries ({db.girls.length})</option>
                  {db.girls.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.fullName} ({g.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {programmeOptions.length > 0 && <label className="text-stone-600">Programme<select value={reportFilters.programme || 'ALL'} onChange={(event) => setReportFilter('programme', event.target.value === 'ALL' ? '' : event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2"><option value="ALL">All programmes</option>{programmeOptions.map((programme) => <option key={programme}>{programme}</option>)}</select></label>}
              {(includeEducation || reportType === 'girl') && <label className="text-stone-600">School<select value={reportFilters.school || 'ALL'} onChange={(event) => setReportFilter('school', event.target.value === 'ALL' ? '' : event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2"><option value="ALL">All schools</option>{schoolOptions.map((school) => <option key={school}>{school}</option>)}</select></label>}
              {(includeEducation || reportType === 'girl') && <label className="text-stone-600">Class / form<select value={reportFilters.classLevel || 'ALL'} onChange={(event) => setReportFilter('classLevel', event.target.value === 'ALL' ? '' : event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2"><option value="ALL">All classes</option>{classOptions.map((classLevel) => <option key={classLevel}>{classLevel}</option>)}</select></label>}
              {includeWorkplans && <label className="text-stone-600">Staff member<select value={reportFilters.staffId || 'ALL'} onChange={(event) => setReportFilter('staffId', event.target.value === 'ALL' ? '' : event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2"><option value="ALL">All staff</option>{allStaff.map((staff) => <option key={staff.uid || staff.id} value={staff.uid || staff.id}>{staff.fullName}</option>)}</select></label>}
              {(includeWorkplans || includeEducation) && <label className="text-stone-600">Activity<select value={reportFilters.activityId || 'ALL'} onChange={(event) => setReportFilter('activityId', event.target.value === 'ALL' ? '' : event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2"><option value="ALL">All activities</option>{activityOptions.map((activity) => <option key={activity.id} value={activity.id}>{activity.label}</option>)}</select></label>}
              {(includeGirlsCaseload || includeWorkplans) && <label className="text-stone-600">Status<select value={reportFilters.status || 'ALL'} onChange={(event) => setReportFilter('status', event.target.value === 'ALL' ? '' : event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2"><option value="ALL">All statuses</option>{['Active', 'On Holiday', 'Completed', 'Left SHINE', 'Planned', 'In Progress', 'Delayed', 'Cancelled', 'Upcoming', 'Scheduled'].map((status) => <option key={status}>{status}</option>)}</select></label>}
              {(includeFinances || includeBudgets) && <label className="text-stone-600">Category<select value={reportFilters.category || 'ALL'} onChange={(event) => setReportFilter('category', event.target.value === 'ALL' ? '' : event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2"><option value="ALL">All categories</option>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select></label>}
              {(includeEducation || (canViewHealthRecords && includeHealth) || includeFamily) && <label className="text-stone-600">Follow-up type<select value={reportFilters.followUpType || 'ALL'} onChange={(event) => setReportFilter('followUpType', event.target.value === 'ALL' ? '' : event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2"><option value="ALL">All follow-ups</option>{includeEducation && <option value="education">Education</option>}{canViewHealthRecords && includeHealth && <option value="health">Health</option>}{includeFamily && <option value="family">Family</option>}</select></label>}
            </div>
            {dateRangePreset === 'month' && (
              <div className="grid max-w-md grid-cols-2 gap-3">
                <label className="text-stone-600">Month<select value={periodMonth} onChange={(event) => { const month = Number(event.target.value); setPeriodMonth(month); updateCalendarPeriod('month', periodYear, month); }} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleString('en', { month: 'long' })}</option>)}</select></label>
                <label className="text-stone-600">Year<input type="number" min="2000" max="2100" value={periodYear} onChange={(event) => { const year = Number(event.target.value); setPeriodYear(year); updateCalendarPeriod('month', year); }} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2" /></label>
              </div>
            )}
            {dateRangePreset === 'quarter' && (
              <div className="grid max-w-md grid-cols-2 gap-3">
                <label className="text-stone-600">Quarter<select value={periodQuarter} onChange={(event) => { const quarter = Number(event.target.value); setPeriodQuarter(quarter); updateCalendarPeriod('quarter', periodYear, periodMonth, quarter); }} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2">{[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter} · {['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][quarter - 1]}</option>)}</select></label>
                <label className="text-stone-600">Year<input type="number" min="2000" max="2100" value={periodYear} onChange={(event) => { const year = Number(event.target.value); setPeriodYear(year); updateCalendarPeriod('quarter', year); }} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2" /></label>
              </div>
            )}
            {dateRangePreset === 'year' && <label className="block max-w-xs text-stone-600">Calendar year<input type="number" min="2000" max="2100" value={periodYear} onChange={(event) => { const year = Number(event.target.value); setPeriodYear(year); updateCalendarPeriod('year', year); }} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2" /></label>}
            {dateRangePreset === 'custom' && <div className="grid max-w-md grid-cols-2 gap-3"><label className="text-stone-600">{reportType === 'annual' ? 'Financial-year start' : 'From'}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2" /></label><label className="text-stone-600">{reportType === 'annual' ? 'Financial-year end' : 'To'}<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2" /></label></div>}
          </div>

          {/* Section Inclusion Checkboxes */}
          <div>
            <label className="block font-bold text-stone-900 mb-2">4. Sections to Include</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { label: 'Executive Summary', checked: includeExecutiveSummary, set: setIncludeExecutiveSummary },
                { label: 'Caseload Demographics', checked: includeStatistics, set: setIncludeStatistics },
                { label: 'Girls Profiles', checked: includeGirlsCaseload, set: setIncludeGirlsCaseload },
                { label: 'Education Monitoring', checked: includeEducation, set: setIncludeEducation },
                ...(canViewHealthRecords ? [{ label: 'Health & Medical', checked: includeHealth, set: setIncludeHealth }] : []),
                { label: 'Family Check-ins', checked: includeFamily, set: setIncludeFamily },
                { label: 'Household & Rent Costs', checked: includeFinances, set: setIncludeFinances },
                { label: 'Budgets & Variance', checked: includeBudgets, set: setIncludeBudgets },
                { label: 'Workplans & Targets', checked: includeWorkplans, set: setIncludeWorkplans },
                { label: 'Case Actions', checked: includeCaseActions, set: setIncludeCaseActions },
                ...(canViewCaseReviews ? [{ label: 'Case Reviews', checked: includeCaseReviews, set: setIncludeCaseReviews }] : []),
                { label: 'Case Actions', checked: includeCaseActions, set: setIncludeCaseActions },
                ...(canViewCaseReviews ? [{ label: 'Case Reviews', checked: includeCaseReviews, set: setIncludeCaseReviews }] : []),
                { label: 'Photos & Attachments', checked: includePhotos, set: (checked: boolean) => {
                  setIncludePhotos(checked);
                  if (checked && selectedPhotoIds.length === 0) {
                    setSelectedPhotoIds(scopedAttachments.slice(0, maxPhotos).map((attachment) => attachment.id));
                  }
                } },
              ].map((item, idx) => (
                <label
                  key={idx}
                  className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg border border-stone-200 cursor-pointer hover:bg-stone-100"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.set(e.target.checked)}
                    className="rounded-sm text-teal-800 focus:ring-teal-700"
                  />
                  <span className="font-semibold text-stone-700">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {includePhotos && format !== 'xlsx' && (
            <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h4 className="font-bold text-stone-900">Authorized report photos</h4>
                  <p className="text-[11px] text-stone-500">Only selected JPEG and PNG images are loaded through Firebase Storage access rules.</p>
                </div>
                <label className="text-[11px] font-semibold text-stone-600">Maximum photos
                  <input type="number" min={0} max={50} value={maxPhotos} onChange={(event) => setMaxPhotos(Math.max(0, Math.min(50, Number(event.target.value) || 0)))} className="field mt-1 block w-24" />
                </label>
              </div>
              {attachmentsLoading ? <p className="text-stone-500">Loading authorized attachments…</p> : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {scopedAttachments.length === 0 ? <p className="text-stone-500">No authorized photos match these filters.</p> : scopedAttachments.map((attachment) => (
                    <label key={attachment.id} className="flex items-start gap-2 border-b border-stone-100 py-2">
                      <input type="checkbox" checked={selectedPhotoIds.includes(attachment.id)} onChange={() => setSelectedPhotoIds((current) => current.includes(attachment.id) ? current.filter((id) => id !== attachment.id) : [...current, attachment.id])} />
                      <span className="min-w-0"><span className="block truncate font-semibold">{attachment.caption || `${attachment.category} photo`}</span><span className="text-stone-500">{attachment.date} · {attachment.fileName}</span></span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-stone-600">Selected: {previewData.photos.length} of {maxPhotos} maximum</p>
            </div>
          )}

          <section className="space-y-2 border-t border-stone-200 pt-4" aria-label="Report preview">
            <h4 className="font-bold text-stone-900">Report preview</h4>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><dt className="text-stone-500">Report</dt><dd className="font-semibold">{reportTitle}</dd></div>
              <div><dt className="text-stone-500">Period</dt><dd className="font-semibold">{previewConfig.periodLabel}</dd></div>
              <div><dt className="text-stone-500">Records</dt><dd className="font-semibold">{previewRecords}</dd></div>
              <div><dt className="text-stone-500">Photos / tables</dt><dd className="font-semibold">{previewData.photos.length} / {previewTables}</dd></div>
            </dl>
            <p><span className="font-semibold">Filters:</span> {selectedFilterLabels.join(' · ')}</p>
            <p><span className="font-semibold">Sections:</span> {[includeExecutiveSummary && 'Summary', includeStatistics && 'Statistics', includeGirlsCaseload && 'Girls and households', includeEducation && 'Education and household activities', canViewHealthRecords && includeHealth && 'Health', includeFamily && 'Family', includeFinances && 'Expenses and rent', includeBudgets && 'Budgets', includeWorkplans && 'Workplans and schedules', includeCaseActions && 'Case actions', canViewCaseReviews && includeCaseReviews && 'Case reviews', includePhotos && format !== 'xlsx' && 'Photos'].filter(Boolean).join(', ') || 'None selected'}</p>
            <p className="text-[11px] text-stone-500">Prepared by {authorName} · generated {new Date().toLocaleDateString('en-GB')}</p>
          </section>

          <QualityCheckPanel
            issues={auditedQualityIssues}
            scores={reportQualityScores}
            canApproveNarrativeOnly={isAdmin || role === 'Manager'}
            currentUserName={staffProfile?.fullName || currentUser?.email || authorName}
            canOpenIssue={(issue) => issue.target?.kind === 'narrative-section' || issue.target?.kind === 'report-section'}
            onOpenIssue={(issue) => {
              if (issue.target?.kind !== 'narrative-section' && issue.target?.kind !== 'report-section') return;
              const editor = document.getElementById('report-narrative');
              editor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              editor?.focus({ preventScroll: true });
            }}
            onResolveIssue={(issue, resolution: QualityIssueResolution) => {
              if (resolution.status !== 'overridden' || resolution.note.trim().length < 10) return false;
              setQualityResolutions((current) => [
                ...current.filter((entry) => entry.issueId !== issue.id),
                { issueId: issue.id, status: resolution.status, note: resolution.note, by: staffProfile?.fullName || currentUser?.email || authorName, at: new Date().toISOString() },
              ]);
              return true;
            }}
            onUndoFix={(issue) => setQualityResolutions((current) => current.filter((entry) => entry.issueId !== issue.id))}
          />
          {reportQualityIssues.some((issue) => issue.severity === 'blocker') && (
            <label className="block rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs font-semibold text-rose-950">
              Written reason for overriding report blockers
              <textarea value={blockerOverrideReason} onChange={(event) => setBlockerOverrideReason(event.target.value)} minLength={10} className="mt-2 w-full rounded-lg border border-rose-300 bg-white p-2.5" />
            </label>
          )}

          <section className="space-y-2 border-t border-stone-200 pt-4" aria-label="Recent report history">
            <h4 className="font-bold text-stone-900">Recent report history</h4>
            {reportHistory.length === 0 ? <p className="text-stone-500">No generated reports recorded for this account.</p> : reportHistory.slice(0, 5).map((record) => (
              <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-2">
                <span className="font-semibold">{record.title} <span className="font-normal text-stone-500">({record.fileType.toUpperCase()})</span></span>
                <div className="flex items-center gap-3"><span className="text-stone-500">{record.reportingPeriod} · {new Date(record.generatedAt).toLocaleDateString('en-GB')}</span>{record.storagePath && <button type="button" title="Download archived report" aria-label={`Download ${record.title}`} onClick={() => downloadArchivedReport(record)} className="rounded p-1 text-teal-800 hover:bg-teal-50"><Download className="h-4 w-4" /></button>}</div>
              </div>
            ))}
          </section>

          {/* Executive Notes */}
          {includeExecutiveSummary && (
            <div>
              <label className="block font-bold text-stone-900 mb-1">5. Executive Narrative & Remarks</label>
              <textarea
                id="report-narrative"
                rows={3}
                value={executiveNotes}
                onChange={(e) => setExecutiveNotes(e.target.value)}
                placeholder="Staff remarks, donor highlights, or summary notes..."
                className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-1 focus:ring-teal-700"
              />
            </div>
          )}

          {downloadSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{downloadSuccess}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-stone-100 p-4 border-t border-stone-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !canGenerateReports}
            className="px-5 py-2.5 bg-teal-800 text-white rounded-xl text-xs font-bold hover:bg-teal-900 transition-all flex items-center gap-2 shadow-xs disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                Compiling {format.toUpperCase()} Document...
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4 text-amber-300" />
                {confirmedPreview === previewFingerprint ? `Confirm & download ${format.toUpperCase()}` : 'Review preview'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
