import React, { useState } from 'react';
import { AppDatabase, Girl, Household } from '../../types';
import {
  ReportConfig,
  generateWordReport,
  generateExcelWorkbook,
  generatePdfReport,
} from '../../services/reportGenerators';
import { useAuth } from '../../contexts/AuthContext';
import {
  FileDown,
  FileSpreadsheet,
  FileText,
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
  const { staffProfile } = useAuth();
  const authorName = staffProfile?.fullName || 'SHINE Relief Trust Malawi';

  const [format, setFormat] = useState<'docx' | 'xlsx' | 'pdf'>('docx');
  const [reportTitle, setReportTitle] = useState<string>(
    'SHINE Relief Trust Case Management & Programme Progress Report'
  );
  const [reportSubtitle, setReportSubtitle] = useState<string>(
    'Zomba District, Malawi • Comprehensive Caseload & Financial Accountability'
  );

  const [dateRangePreset, setDateRangePreset] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string>(preselectedHouseholdId || 'ALL');
  const [selectedGirlId, setSelectedGirlId] = useState<string>(preselectedGirlId || 'ALL');

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
  const [includePhotos, setIncludePhotos] = useState<boolean>(true);

  const [executiveNotes, setExecutiveNotes] = useState<string>(
    'During this reporting period, SHINE Relief Trust continued holistic case management, education bursaries, residential sustenance, and guardian empowerment across Zomba District. All interventions remain anchored in child protection and sustainable community development.'
  );

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const handleDatePresetChange = (preset: string) => {
    setDateRangePreset(preset);
    const today = new Date();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'year') {
      setStartDate(`${today.getFullYear()}-01-01`);
      setEndDate(today.toISOString().slice(0, 10));
    } else if (preset === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      setStartDate(firstDay);
      setEndDate(today.toISOString().slice(0, 10));
    } else if (preset === '90days') {
      const prior = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setStartDate(prior);
      setEndDate(today.toISOString().slice(0, 10));
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setDownloadSuccess(null);

    const safePeriodLabel =
      startDate && endDate
        ? `${startDate} to ${endDate}`
        : dateRangePreset === 'all'
        ? 'Comprehensive All-Time Cumulative'
        : 'Reporting Period';

    const config: ReportConfig = {
      title: reportTitle,
      subtitle: reportSubtitle,
      periodLabel: safePeriodLabel,
      generatedBy: authorName,
      dateRange: startDate || endDate ? { start: startDate, end: endDate } : undefined,
      selectedHouseholdId: selectedHouseholdId !== 'ALL' ? selectedHouseholdId : undefined,
      selectedGirlId: selectedGirlId !== 'ALL' ? selectedGirlId : undefined,
      executiveSummary: includeExecutiveSummary ? executiveNotes : undefined,
      includeSections: {
        executiveSummary: includeExecutiveSummary,
        statistics: includeStatistics,
        girlsList: includeGirlsCaseload,
        householdsList: includeGirlsCaseload,
        educationalFollowUps: includeEducation,
        healthFollowUps: includeHealth,
        familyFollowUps: includeFamily,
        householdActivities: includeEducation,
        expenditure: includeFinances,
        rentPayments: includeFinances,
        budgets: includeBudgets,
        workplans: includeWorkplans,
        schedules: includeWorkplans,
        photoGallery: includePhotos,
      },
    };

    const dateStamp = new Date().toISOString().slice(0, 10);

    try {
      if (format === 'docx') {
        const blob = await generateWordReport(db, config);
        triggerFileDownload(blob, `SHINE_Relief_Report_${dateStamp}.docx`);
        setDownloadSuccess('Word document (.docx) generated and downloaded successfully!');
      } else if (format === 'xlsx') {
        const bytes = generateExcelWorkbook(db, config);
        const blob = new Blob([bytes as any], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        triggerFileDownload(blob, `SHINE_Relief_Report_${dateStamp}.xlsx`);
        setDownloadSuccess('Multi-sheet Excel workbook (.xlsx) downloaded successfully!');
      } else if (format === 'pdf') {
        const blob = generatePdfReport(db, config);
        triggerFileDownload(blob, `SHINE_Relief_Report_${dateStamp}.pdf`);
        setDownloadSuccess('Executive PDF report generated and downloaded successfully!');
      }
    } catch (err: any) {
      console.error('Report export failure:', err);
      alert(`Export error: ${err.message || 'Failed to generate report'}`);
    } finally {
      setIsGenerating(false);
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <option value="month">Current Month</option>
                  <option value="90days">Past 90 Days</option>
                  <option value="year">Current Year</option>
                </select>
              </div>

              <div>
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

              <div>
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
                { label: 'Health & Medical', checked: includeHealth, set: setIncludeHealth },
                { label: 'Family Check-ins', checked: includeFamily, set: setIncludeFamily },
                { label: 'Household & Rent Costs', checked: includeFinances, set: setIncludeFinances },
                { label: 'Budgets & Variance', checked: includeBudgets, set: setIncludeBudgets },
                { label: 'Workplans & Targets', checked: includeWorkplans, set: setIncludeWorkplans },
                { label: 'Photos & Attachments', checked: includePhotos, set: setIncludePhotos },
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

          {/* Executive Notes */}
          {includeExecutiveSummary && (
            <div>
              <label className="block font-bold text-stone-900 mb-1">5. Executive Narrative & Remarks</label>
              <textarea
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
            disabled={isGenerating}
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
                Download {format.toUpperCase()} Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
