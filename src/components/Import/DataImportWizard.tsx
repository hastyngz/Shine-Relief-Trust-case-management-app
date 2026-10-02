import React, { useEffect, useState } from 'react';
import {
  AppDatabase,
  ImportPreviewItem,
  ImportAuditRecord,
  StaffUser,
  DocxClassification,
  Girl,
} from '../../types';
import {
  parseExcelFile,
  parseDocxFile,
  analyzeImportRows,
  commitImportBatch,
} from '../../services/importService';
import { ContactCandidate, ConfirmedContactCandidate, listContacts, matchContactCandidate } from '../../services/contactsService';
import { ACTIVITY_CATEGORY_OPTIONS, DueDatePeriodChoice, getDueDateRange, serializeDueDatePeriod } from '../../services/ingestionRules';
import { ReportMetadata } from '../../services/docxParserService';
import { useAuth } from '../../contexts/AuthContext';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  Edit2,
  FileSpreadsheet,
  FileText,
  FileUp,
  History,
  Image as ImageIcon,
  Info,
  ListTodo,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sprout,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

interface DataImportWizardProps {
  db: AppDatabase;
  onImportComplete: () => void;
  onCancel?: () => void;
  initialFile: File | null;
  onInitialFileConsumed: () => void;
  onOpenFilePicker: () => void;
}

type WizardStep = 'upload' | 'review' | 'importing' | 'completed';
type DueDatePeriodDraft = {
  type: 'month' | 'quarter' | 'range';
  month: string;
  year: string;
  quarter: string;
  start: string;
  end: string;
};

interface ContactReviewItem {
  candidate: ContactCandidate;
  status: 'linked' | 'possible' | 'new';
  contactId?: string;
  matches: Array<{ id: string; name: string; category: string }>;
  confirmed: boolean;
}

const PhotoPreview: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={`${alt}. Preview unavailable`}
        className="w-full max-w-[400px] aspect-[4/3] flex items-center justify-center bg-stone-100 text-stone-500 text-xs border border-stone-200 rounded-lg"
      >
        Preview unavailable
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => {
        console.warn('Embedded DOCX photo preview failed to load.', alt);
        setFailed(true);
      }}
      className="w-full max-w-[400px] aspect-[4/3] object-cover rounded-lg border border-indigo-200 shadow-2xs shrink-0"
    />
  );
};

const CLASSIFICATION_OPTIONS: Array<{ value: DocxClassification; label: string }> = [
  { value: 'INDIVIDUAL_GIRL_HISTORICAL', label: 'A. Individual Girl Historical Record' },
  { value: 'HOUSEHOLD_RECORD', label: 'B. Household Record' },
  { value: 'EDUCATIONAL_FOLLOW_UP', label: 'C. Educational Follow-up' },
  { value: 'HEALTH_MEDICAL_FOLLOW_UP', label: 'D. Health / Medical Follow-up' },
  { value: 'FAMILY_GUARDIAN_FOLLOW_UP', label: 'E. Family / Guardian Follow-up' },
  { value: 'GROUP_ACTIVITY', label: 'F. Group Activity' },
  { value: 'PROGRAMME_ACTIVITY', label: 'G. Programme Activity' },
  { value: 'EARLY_YEARS_RECORD', label: 'H. Early Years Programme Record' },
  { value: 'AGRICULTURE_PRACTICAL_SKILLS', label: 'I. Agriculture / Practical Skills' },
  { value: 'WORKPLAN_PRIORITY', label: 'J. Workplan / Priority' },
  { value: 'BUDGET_FINANCIAL', label: 'K. Budget / Financial Information' },
  { value: 'GENERAL_REPORT_INFO', label: 'L. General Report Information' },
  { value: 'PHOTO_HIGHLIGHT', label: 'M. Pictorial Highlight (Photo)' },
  { value: 'UNCLASSIFIED_REVIEW', label: 'N. Unclassified / Requires Review' },
];

export const DataImportWizard: React.FC<DataImportWizardProps> = ({
  db,
  onImportComplete,
  onCancel,
  initialFile,
  onInitialFileConsumed,
  onOpenFilePicker,
}) => {
  const { staffProfile, canEdit } = useAuth();

  const activeStaff: StaffUser = staffProfile || {
    id: 'staff-user',
    uid: 'staff-user',
    email: 'staff@shinerelieftrust.org',
    fullName: 'SHINE Staff Member',
    role: 'Staff',
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const [step, setStep] = useState<WizardStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [diagnosticReason, setDiagnosticReason] = useState<string | null>(null);

  // Extracted Document State
  const [reportMetadata, setReportMetadata] = useState<ReportMetadata | null>(null);
  const [previewItems, setPreviewItems] = useState<ImportPreviewItem[]>([]);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [contactReview, setContactReview] = useState<ContactReviewItem[]>([]);
  const [workplanDueDateItems, setWorkplanDueDateItems] = useState<ImportPreviewItem[]>([]);
  const [workplanDueDateChoices, setWorkplanDueDateChoices] = useState<Record<string, DueDatePeriodDraft>>({});
  const [workplanDueDateError, setWorkplanDueDateError] = useState('');
  const [workplanDueDatePromptOpen, setWorkplanDueDatePromptOpen] = useState(false);
  const [addingActivityCategory, setAddingActivityCategory] = useState<Record<string, boolean>>({});
  const [activityCategoryDrafts, setActivityCategoryDrafts] = useState<Record<string, string>>({});

  // Editing Item Modal State
  const [editingItem, setEditingItem] = useState<ImportPreviewItem | null>(null);

  // Import Execution State
  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [completedAudit, setCompletedAudit] = useState<ImportAuditRecord | null>(null);

  const prepareContactReview = async (candidates: ContactCandidate[]) => {
    const existingContacts = await listContacts().catch(() => db.contacts || []);
    setContactReview(candidates.map((candidate) => {
      const match = matchContactCandidate(candidate, existingContacts);
      return {
        candidate,
        status: match.status,
        contactId: match.contact?.id,
        matches: match.candidates.map(({ id, name, category }) => ({ id, name, category })),
        confirmed: false,
      };
    }));
  };

  // Handle file selection and parsing
  const handleFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'docx'].includes(ext || '')) {
      setParseError('Unsupported file type. Please select a Microsoft Word (.docx) or Excel (.xlsx, .xls) document.');
      setDiagnosticReason('File extension must be .docx, .xlsx, or .xls.');
      return;
    }

    setSelectedFile(file);
    setParseError(null);
    setDiagnosticReason(null);
    setIsParsing(true);

    try {
      if (ext === 'docx') {
        const analysis = await parseDocxFile(file, db, activeStaff);
        if (!analysis.docxResult || analysis.docxResult.items.length === 0) {
          throw new Error('No structured report sections, activities, or records could be detected in this Word document.');
        }

        setReportMetadata(analysis.docxResult.metadata);
        setPreviewItems(analysis.docxResult.items);
        await prepareContactReview(analysis.detectedContacts);
        setStep('review');
      } else {
        // Excel file
        const analysis = await parseExcelFile(file, db.girls.map((girl) => girl.fullName));
        if (analysis.rawRows.length === 0) {
          throw new Error('Spreadsheet contains zero readable data rows or table sheets.');
        }

        const supportedEntities = ['girl', 'person', 'educationalFollowUp', 'healthFollowUp'] as const;
        if (!(supportedEntities as readonly string[]).includes(analysis.suggestedEntity)) {
          throw new Error(`The spreadsheet appears to contain ${analysis.suggestedEntity} records, which are not supported by this import review yet. No data was imported.`);
        }
        const chosenEntity = analysis.suggestedEntity as typeof supportedEntities[number];
        const previews = analyzeImportRows(analysis.rawRows, chosenEntity, db, file.name, activeStaff);
        setPreviewItems(previews);
        await prepareContactReview(analysis.detectedContacts);
        setStep('review');
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setParseError(ext === 'docx'
        ? 'Unable to extract information from this Word document. No data has been imported.'
        : 'Unable to analyze this spreadsheet. No data has been imported.');
      setDiagnosticReason(err.message || 'The parser encountered an unreadable document structure.');
    } finally {
      setIsParsing(false);
    }
  };

  useEffect(() => {
    if (!initialFile) return;
    onInitialFileConsumed();
    void handleFile(initialFile);
  }, [initialFile]);

  // Load sample report for direct browser testing
  const handleLoadSampleReport = async () => {
    setIsParsing(true);
    setParseError(null);
    setDiagnosticReason(null);
    try {
      const response = await fetch('/sample_reports/SHINE_Progress_Report_july to September_2026_Activities_Carried_Out.docx');
      if (!response.ok) {
        throw new Error(`Failed to load test report file: HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const testFile = new File([blob], 'SHINE_Progress_Report_july to September_2026_Activities_Carried_Out.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      setSelectedFile(testFile);
      const analysis = await parseDocxFile(testFile, db, activeStaff);
      if (!analysis.docxResult || analysis.docxResult.items.length === 0) {
        throw new Error('No structured report sections could be detected in this Word document.');
      }
      setReportMetadata(analysis.docxResult.metadata);
      setPreviewItems(analysis.docxResult.items);
      await prepareContactReview(analysis.detectedContacts);
      setStep('review');
    } catch (err: any) {
      console.error('Error loading test docx:', err);
      setParseError('Unable to extract information from this Word document. No data has been imported.');
      setDiagnosticReason(err.message || 'The parser encountered an unreadable document structure.');
    } finally {
      setIsParsing(false);
    }
  };

  // Toggle selection
  const handleToggleSelectAll = (select: boolean) => {
    setPreviewItems((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const handleToggleItem = (tempId: string) => {
    setPreviewItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, selected: !item.selected } : item))
    );
  };

  // Reclassify single item
  const handleReclassifyItem = (tempId: string, newClass: DocxClassification) => {
    const opt = CLASSIFICATION_OPTIONS.find((o) => o.value === newClass);
    setPreviewItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        return {
          ...item,
          classification: newClass,
          classificationLabel: opt?.label.replace(/^[A-N]\.\s*/, '') || item.classificationLabel,
          targetEntity:
            newClass === 'INDIVIDUAL_GIRL_HISTORICAL'
              ? 'girl'
              : newClass === 'GROUP_ACTIVITY' ||
                newClass === 'PROGRAMME_ACTIVITY' ||
                newClass === 'AGRICULTURE_PRACTICAL_SKILLS'
              ? 'activity'
              : newClass === 'EARLY_YEARS_RECORD'
              ? 'earlyYears'
              : newClass === 'WORKPLAN_PRIORITY'
              ? 'workplan'
              : newClass === 'PHOTO_HIGHLIGHT'
              ? 'attachment'
              : 'general',
          actionProposed:
            newClass === 'INDIVIDUAL_GIRL_HISTORICAL'
              ? 'Add Historical Educational Record'
              : newClass === 'GROUP_ACTIVITY'
              ? 'Create Group Activity Record'
              : newClass === 'EARLY_YEARS_RECORD'
              ? 'Record Early Years Programme Metric'
              : newClass === 'WORKPLAN_PRIORITY'
              ? 'Add Workplan Priority Item'
              : newClass === 'PHOTO_HIGHLIGHT'
              ? 'Save Photographic Highlight'
              : 'General Document Record',
          selected: true,
          userNote: `Reclassified by staff to ${opt?.label}`,
        };
      })
    );
  };

  // Reassign matched girl
  const handleReassignGirl = (tempId: string, girlId: string) => {
    const targetGirl = db.girls.find((g) => g.id === girlId);
    if (!targetGirl) return;

    setPreviewItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        return {
          ...item,
          matchedId: targetGirl.id,
          matchedName: targetGirl.fullName,
          matchConfidence: 'exact',
          warningOrConflict: undefined,
          extractedData: {
            ...item.extractedData,
            girlId: targetGirl.id,
            girlName: targetGirl.fullName,
          },
          summary: `${targetGirl.fullName} (${targetGirl.id}): ${item.originalSnippet || item.summary}`,
        };
      })
    );
  };

  // Save changes from Edit Modal
  const handleSaveEditedItem = (updated: ImportPreviewItem) => {
    setPreviewItems((prev) => prev.map((item) => (item.tempId === updated.tempId ? updated : item)));
    setEditingItem(null);
  };

  const handleActivityCategoryChange = (tempId: string, category: string) => {
    if (category === '__add_new__') {
      setAddingActivityCategory((current) => ({ ...current, [tempId]: true }));
      return;
    }
    setPreviewItems((current) => current.map((item) => item.tempId === tempId
      ? { ...item, extractedData: { ...item.extractedData, activityCategory: category } }
      : item));
  };

  const handleAddActivityCategory = (tempId: string) => {
    const category = activityCategoryDrafts[tempId]?.trim();
    if (!category) return;
    setPreviewItems((current) => current.map((item) => item.tempId === tempId
      ? { ...item, extractedData: { ...item.extractedData, activityCategory: category } }
      : item));
    setAddingActivityCategory((current) => ({ ...current, [tempId]: false }));
  };

  const updateDueDateDraft = (tempId: string, updates: Partial<DueDatePeriodDraft>) => {
    setWorkplanDueDateChoices((current) => ({
      ...current,
      [tempId]: { ...current[tempId], ...updates },
    }));
    setWorkplanDueDateError('');
  };

  const handleConfirmWorkplanDueDates = () => {
    const dueDatePeriods: Record<string, string> = {};
    for (const item of workplanDueDateItems) {
      const draft = workplanDueDateChoices[item.tempId];
      if (!draft) {
        setWorkplanDueDateError('Choose a due-date period for every Workplan item.');
        return;
      }
      let choice: DueDatePeriodChoice;
      if (draft.type === 'month') {
        if (!draft.month) {
          setWorkplanDueDateError('Choose a month for every Workplan item.');
          return;
        }
        choice = { type: 'month', value: draft.month };
      } else if (draft.type === 'quarter') {
        if (!draft.year || !draft.quarter) {
          setWorkplanDueDateError('Choose a year and quarter for every Workplan item.');
          return;
        }
        choice = { type: 'quarter', year: draft.year, quarter: draft.quarter };
      } else {
        if (!draft.start || !draft.end) {
          setWorkplanDueDateError('Choose both dates for every Workplan range.');
          return;
        }
        choice = { type: 'range', start: draft.start, end: draft.end };
      }
      const period = serializeDueDatePeriod(choice);
      if (!getDueDateRange(period)) {
        setWorkplanDueDateError('Each due-date range must have a valid start and end date.');
        return;
      }
      dueDatePeriods[item.tempId] = period;
    }
    setWorkplanDueDatePromptOpen(false);
    void handleExecuteImport(dueDatePeriods);
  };

  // Reject an item
  const handleRejectItem = (tempId: string) => {
    setPreviewItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, selected: false, warningOrConflict: 'Rejected by staff' } : item))
    );
  };

  // Run the batch import commit
  const handleExecuteImport = async (confirmedDueDatePeriods: Record<string, string> = {}) => {
    if (!selectedFile) return;

    if (!canEdit) {
      alert('Permission Denied: View Only users do not have permissions to import or modify records.');
      return;
    }

    const selectedItems = previewItems.filter((i) => i.selected);
    const workplanItems = selectedItems.filter((item) =>
      item.classification === 'WORKPLAN_PRIORITY' ||
      item.targetEntity === 'workplan' ||
      item.extractedData.createWorkplan === true
    );
    const missingDueDateItems = workplanItems.filter((item) => {
      const period = confirmedDueDatePeriods[item.tempId];
      return !period || !getDueDateRange(period);
    });
    if (missingDueDateItems.length > 0) {
      setWorkplanDueDateItems(missingDueDateItems);
      setWorkplanDueDateChoices((current) => Object.fromEntries(missingDueDateItems.map((item) => [
        item.tempId,
        current[item.tempId] || { type: 'month', month: '', year: '', quarter: '', start: '', end: '' },
      ])));
      setWorkplanDueDateError('');
      setWorkplanDueDatePromptOpen(true);
      return;
    }
    const approvedContacts: ConfirmedContactCandidate[] = contactReview
      .filter((item) => item.confirmed && (item.status !== 'possible' || item.contactId))
      .map((item) => ({ candidate: item.candidate, contactId: item.contactId }));
    if (selectedItems.length === 0 && approvedContacts.length === 0) {
      alert('Please select at least one record or confirm at least one contact.');
      return;
    }

    setStep('importing');
    setImportProgress({ current: 0, total: selectedItems.length + approvedContacts.length });

    const auditData: Omit<ImportAuditRecord, 'id'> = {
      fileName: selectedFile.name,
      fileType: selectedFile.name.endsWith('.docx')
        ? 'docx'
        : selectedFile.name.endsWith('.xls')
        ? 'xls'
        : 'xlsx',
      importedAt: new Date().toISOString(),
      importedByUid: activeStaff.uid,
      importedByName: activeStaff.fullName,
      reportingPeriod: reportMetadata?.reportingPeriod,
      contactsDetectedCount: contactReview.length,
      newContactsCount: approvedContacts.filter((item) => !item.contactId).length,
      existingContactsLinkedCount: approvedContacts.filter((item) => !!item.contactId).length,
      totalExamined: previewItems.length + contactReview.length,
      newRecordsCount: selectedItems.filter(
        (i) => i.resultType === 'NEW_RECORD' && i.classification !== 'INDIVIDUAL_GIRL_HISTORICAL'
      ).length,
      profileUpdatesCount: selectedItems.filter((i) => i.resultType === 'PROFILE_UPDATE').length,
      historicalRecordsCount: selectedItems.filter(
        (i) => i.resultType === 'HISTORICAL_RECORD' || i.classification === 'INDIVIDUAL_GIRL_HISTORICAL'
      ).length,
      unchangedCount: selectedItems.filter((i) => i.resultType === 'NO_CHANGE').length,
      duplicatesCount: selectedItems.filter((i) => i.resultType === 'POSSIBLE_DUPLICATE').length,
      conflictsCount: selectedItems.filter((i) => i.resultType === 'CONFLICT').length,
      errorsCount: selectedItems.filter((i) => i.resultType === 'IMPORT_ERROR').length,
      status: 'completed',
      summary: `Batch imported ${selectedItems.length} records and ${approvedContacts.length} contacts from ${selectedFile.name} (Reporting period: ${reportMetadata?.reportingPeriod || 'Not provided'})`,
    };

    try {
      const result = await commitImportBatch(selectedItems, auditData, db, (current, total) =>
        setImportProgress({ current, total }), approvedContacts, confirmedDueDatePeriods);

      setCompletedAudit(result.createdAudit);
      setStep('completed');
      onImportComplete();
    } catch (err: any) {
      console.error('Import execution error:', err);
      alert(`Import error: ${err.message || 'Failed to complete import batch'}`);
      setStep('review');
    }
  };

  // Counts for Review Tabs
  const totalCount = previewItems.length;
  const countHistoricalGirls = previewItems.filter(
    (i) => i.classification === 'INDIVIDUAL_GIRL_HISTORICAL' || i.resultType === 'HISTORICAL_RECORD'
  ).length;
  const countActivities = previewItems.filter(
    (i) => i.classification === 'GROUP_ACTIVITY' || i.classification === 'PROGRAMME_ACTIVITY'
  ).length;
  const countEarlyYears = previewItems.filter((i) => i.classification === 'EARLY_YEARS_RECORD').length;
  const countWorkplans = previewItems.filter((i) => i.classification === 'WORKPLAN_PRIORITY').length;
  const countAgriculture = previewItems.filter(
    (i) => i.classification === 'AGRICULTURE_PRACTICAL_SKILLS'
  ).length;
  const countPhotos = previewItems.filter((i) => i.classification === 'PHOTO_HIGHLIGHT').length;
  const countUnclassified = previewItems.filter(
    (i) => i.classification === 'UNCLASSIFIED_REVIEW' || !i.classification
  ).length;
  const countContacts = contactReview.length;

  const selectedCount = previewItems.filter((i) => i.selected).length + contactReview.filter((item) => item.confirmed && (item.status !== 'possible' || item.contactId)).length;

  // Tab Filtering
  const filteredItems = previewItems.filter((item) => {
    // Category Tab
    if (activeTab === 'HISTORICAL' && item.classification !== 'INDIVIDUAL_GIRL_HISTORICAL' && item.resultType !== 'HISTORICAL_RECORD') return false;
    if (activeTab === 'ACTIVITIES' && item.classification !== 'GROUP_ACTIVITY' && item.classification !== 'PROGRAMME_ACTIVITY') return false;
    if (activeTab === 'EARLY_YEARS' && item.classification !== 'EARLY_YEARS_RECORD') return false;
    if (activeTab === 'WORKPLANS' && item.classification !== 'WORKPLAN_PRIORITY') return false;
    if (activeTab === 'AGRICULTURE' && item.classification !== 'AGRICULTURE_PRACTICAL_SKILLS') return false;
    if (activeTab === 'PHOTOS' && item.classification !== 'PHOTO_HIGHLIGHT') return false;
    if (activeTab === 'UNCLASSIFIED' && item.classification !== 'UNCLASSIFIED_REVIEW') return false;

    // Search filter
    if (searchTerm.trim().length > 0) {
      const q = searchTerm.toLowerCase();
      const matchText = (item.summary + ' ' + (item.matchedName || '') + ' ' + (item.originalSnippet || '')).toLowerCase();
      return matchText.includes(q);
    }
    return true;
  });

  return (
    <div className="w-full max-w-full sm:max-w-6xl min-w-0 box-border overflow-x-hidden bg-white rounded-2xl shadow-xl border border-stone-200 mx-auto my-4">
      {/* Header Banner */}
      <div className="bg-teal-900 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="p-2.5 bg-teal-800 rounded-xl border border-teal-700">
            <FileUp className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Document & Spreadsheet Ingestion Wizard</h2>
            <p className="text-xs text-teal-200 mt-0.5">
              Intelligent ingestion for SHINE progress reports (.docx) and rosters (.xlsx) with strict profile protection.
            </p>
          </div>
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-teal-800 rounded-lg text-teal-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Wizard Steps Navigation */}
      <div className="bg-stone-50 px-3 sm:px-6 py-3 border-b border-stone-200 flex flex-wrap items-center justify-between text-xs font-semibold gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
          <span
            className={`flex items-center gap-1.5 ${
              step === 'upload' ? 'text-teal-900 font-bold' : 'text-stone-500'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === 'upload' ? 'bg-teal-800 text-white' : 'bg-stone-200'
              }`}
            >
              1
            </span>
            Upload Document
          </span>
          <span className="text-stone-300">/</span>
          <span
            className={`flex items-center gap-1.5 ${
              step === 'review' ? 'text-teal-900 font-bold' : 'text-stone-500'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === 'review' ? 'bg-teal-800 text-white' : 'bg-stone-200'
              }`}
            >
              2
            </span>
            Review & Historical Protection ({countHistoricalGirls} Girls, {countContacts} Contacts Detected)
          </span>
          <span className="text-stone-300">/</span>
          <span
            className={`flex items-center gap-1.5 ${
              step === 'completed' ? 'text-teal-900 font-bold' : 'text-stone-500'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === 'completed' ? 'bg-teal-800 text-white' : 'bg-stone-200'
              }`}
            >
              3
            </span>
            Audit & Ingestion
          </span>
        </div>

        {selectedFile && (
          <span className="text-[11px] text-stone-500 bg-white px-2.5 py-1 rounded-md border border-stone-200 shadow-2xs flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-teal-800" />
            File: <strong>{selectedFile.name}</strong>
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* STEP 1: UPLOAD */}
      {/* ------------------------------------------------------------------ */}
      {step === 'upload' && (
        <div className="p-8 space-y-6">
          <div className="border-2 border-dashed border-stone-300 hover:border-teal-700 bg-stone-50/50 rounded-2xl p-10 text-center transition-all">
            <button
              type="button"
              onClick={onOpenFilePicker}
              disabled={isParsing}
              aria-label="Browse Word or Excel files"
              title="Browse Word or Excel files"
              className="w-16 h-16 mx-auto bg-teal-50 rounded-full flex items-center justify-center text-teal-800 mb-4 border border-teal-100 cursor-pointer hover:bg-teal-100 disabled:cursor-not-allowed"
            >
              <Upload className="w-8 h-8 text-teal-700" />
            </button>
            <h3 className="text-base font-bold text-stone-900 mb-1">Select Word or Excel File to Ingest</h3>
            <p className="text-xs text-stone-500 max-w-lg mx-auto mb-5">
              Supports real narrative Word reports (<strong>.docx</strong>) including headings, paragraphs, bullet lists, Early Years monitoring, workplans, and embedded photographs, as well as Excel spreadsheets (<strong>.xlsx</strong>).
            </p>

            <button
              onClick={onOpenFilePicker}
              disabled={isParsing}
              className="px-6 py-2.5 bg-teal-800 text-white rounded-xl text-xs font-bold hover:bg-teal-900 transition-all inline-flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {isParsing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  Extracting Word Document Sections, Photos & Entities...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-amber-300" />
                  Browse Word (.docx) or Excel (.xlsx) Document
                </>
              )}
            </button>

            {/* Quick Test Button for Verified Progress Report */}
            <div className="mt-5 pt-4 border-t border-stone-200">
              <p className="text-[11px] text-stone-500 mb-2">Or test directly with the official SHINE Progress Report:</p>
              <button
                onClick={handleLoadSampleReport}
                disabled={isParsing}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold inline-flex items-center gap-2 border border-stone-300 transition-all cursor-pointer shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                Load "SHINE_Progress_Report_july to September_2026_Activities_Carried_Out.docx"
              </button>
            </div>
          </div>

          {parseError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-900 p-4 rounded-xl text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-rose-800">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{parseError}</span>
              </div>
              {diagnosticReason && (
                <p className="text-rose-700 ml-7">
                  <strong>Diagnostic reason:</strong> {diagnosticReason}
                </p>
              )}
            </div>
          )}

          {/* Safety & Integrity Principles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-stone-700 space-y-1">
                <p className="font-bold text-stone-900">Rule 4: Zero Overwrite of Current Active Profiles</p>
                <p>
                  Historical academic or school data mentioned in reports (e.g. past Form levels) will{' '}
                  <strong>never overwrite</strong> a beneficiary's current active profile. They are saved as
                  chronological Historical Records.
                </p>
              </div>
            </div>

            <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
              <Sprout className="w-5 h-5 text-teal-800 shrink-0 mt-0.5" />
              <div className="text-xs text-stone-700 space-y-1">
                <p className="font-bold text-stone-900">Multi-Model Classification</p>
                <p>
                  Information is automatically sorted into Group Activities, Early Years metrics, Workplans,
                  Agriculture, and Photos. General programme data is never wrongly attached to individual girls.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 2: REVIEW & HUMAN-IN-THE-LOOP INSPECTION */}
      {/* ------------------------------------------------------------------ */}
      {step === 'review' && (
        <div className="w-full max-w-full min-w-0 box-border p-4 sm:p-6 space-y-5">
          {/* Metadata Banner */}
          {reportMetadata && (
            <div className="bg-stone-900 text-white p-4 rounded-xl shadow-xs border border-stone-800 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-700 text-teal-100 px-2 py-0.5 rounded-sm">
                    Report Metadata Detected
                  </span>
                  <span className="text-xs text-stone-300 font-semibold">{reportMetadata.organisation}</span>
                </div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  {reportMetadata.reportTitle}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-stone-300">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    Reporting Period: <strong className="text-white">{reportMetadata.reportingPeriod}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    Author: <strong className="text-white">{reportMetadata.author}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>{reportMetadata.location}</span>
                </div>
              </div>
            </div>
          )}

          {/* Category Filter Cards with Real Calculated Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                activeTab === 'ALL'
                  ? 'border-teal-800 bg-teal-50 shadow-xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <p className="text-[10px] font-semibold text-stone-500 uppercase">All Detected</p>
              <p className="text-base font-black text-stone-900 mt-0.5">{totalCount + countContacts}</p>
            </button>

            <button
              onClick={() => setActiveTab('HISTORICAL')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                activeTab === 'HISTORICAL'
                  ? 'border-amber-600 bg-amber-50 shadow-xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <p className="text-[10px] font-semibold text-amber-700 uppercase">Historical Girls</p>
              <p className="text-base font-black text-amber-900 mt-0.5">{countHistoricalGirls}</p>
            </button>

            <button
              onClick={() => setActiveTab('ACTIVITIES')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                activeTab === 'ACTIVITIES'
                  ? 'border-blue-600 bg-blue-50 shadow-xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <p className="text-[10px] font-semibold text-blue-700 uppercase">Activities</p>
              <p className="text-base font-black text-blue-900 mt-0.5">{countActivities}</p>
            </button>

            <button
              onClick={() => setActiveTab('EARLY_YEARS')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                activeTab === 'EARLY_YEARS'
                  ? 'border-emerald-600 bg-emerald-50 shadow-xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <p className="text-[10px] font-semibold text-emerald-700 uppercase">Early Years</p>
              <p className="text-base font-black text-emerald-900 mt-0.5">{countEarlyYears}</p>
            </button>

            <button
              onClick={() => setActiveTab('WORKPLANS')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                activeTab === 'WORKPLANS'
                  ? 'border-purple-600 bg-purple-50 shadow-xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <p className="text-[10px] font-semibold text-purple-700 uppercase">Workplans</p>
              <p className="text-base font-black text-purple-900 mt-0.5">{countWorkplans}</p>
            </button>

            <button
              onClick={() => setActiveTab('AGRICULTURE')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                activeTab === 'AGRICULTURE'
                  ? 'border-lime-600 bg-lime-50 shadow-xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <p className="text-[10px] font-semibold text-lime-800 uppercase">Agriculture</p>
              <p className="text-base font-black text-lime-900 mt-0.5">{countAgriculture}</p>
            </button>

            <button
              onClick={() => setActiveTab('PHOTOS')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                activeTab === 'PHOTOS'
                  ? 'border-indigo-600 bg-indigo-50 shadow-xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <p className="text-[10px] font-semibold text-indigo-700 uppercase">Photos</p>
              <p className="text-base font-black text-indigo-900 mt-0.5">{countPhotos}</p>
            </button>

            <div className="p-2.5 rounded-xl border border-teal-200 bg-teal-50 text-left">
              <p className="text-[10px] font-semibold text-teal-800 uppercase">Contacts detected</p>
              <p className="text-base font-black text-teal-950 mt-0.5">{countContacts}</p>
            </div>
          </div>

          {/* Action Bar & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-stone-200 min-w-0">
            <div className="flex flex-wrap items-center gap-3 text-xs min-w-0 w-full">
              <div className="relative w-full sm:w-64 min-w-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search detected items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-100 border border-stone-200 rounded-lg focus:bg-white focus:outline-teal-800"
                />
              </div>

              <button
                onClick={() => handleToggleSelectAll(true)}
                className="font-semibold text-teal-800 hover:underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-stone-300">|</span>
              <button
                onClick={() => handleToggleSelectAll(false)}
                className="font-semibold text-stone-600 hover:underline cursor-pointer"
              >
                Deselect All
              </button>
              <span className="text-stone-500 font-medium">({selectedCount} approved for ingest)</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setStep('upload');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
              >
                Change File
              </button>

              <button
                onClick={() => void handleExecuteImport()}
                disabled={selectedCount === 0 || !canEdit}
                className={`min-w-0 max-w-full whitespace-normal text-left px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all ${
                  selectedCount > 0 && canEdit
                    ? 'bg-teal-800 text-white hover:bg-teal-900 cursor-pointer'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }`}
              >
                {canEdit ? (
                  <>
                    Confirm & Ingest {selectedCount} Records <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>View Only (Import Restricted)</>
                )}
              </button>
            </div>
          </div>

          {!canEdit && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                <strong>View Only Role:</strong> Your account can review records and contacts but cannot add or link them.
              </span>
            </div>
          )}

          <section className="w-full min-w-0 space-y-3" aria-label="Contacts detected">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2">
              <div><h3 className="text-sm font-bold text-stone-900">Contacts detected</h3><p className="text-xs text-stone-600">Confirm each contact to add it or link it to the directory.</p></div>
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-900">{contactReview.filter((item) => item.confirmed).length} confirmed / {countContacts}</span>
            </div>
            {contactReview.length === 0 ? <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-xs text-stone-600">No contact entities were detected in this file.</p> : contactReview.map((item, index) => {
              const statusText = item.status === 'linked' ? 'Already in contacts, will link' : item.status === 'possible' ? 'Possible match, choose' : 'New';
              return <article key={`${item.candidate.type}-${item.candidate.name}-${index}`} className="flex min-w-0 flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3 sm:flex-row sm:items-start">
                <input
                  type="checkbox"
                  checked={item.confirmed}
                  disabled={!canEdit || (item.status === 'possible' && !item.contactId)}
                  onChange={(event) => setContactReview((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, confirmed: event.target.checked } : entry))}
                  aria-label={`${item.status === 'new' ? 'Add' : 'Confirm'} ${item.candidate.name}`}
                  className="mt-1 h-4 w-4 shrink-0 rounded-sm text-teal-800 focus:ring-teal-700"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h4 className="min-w-0 break-words text-sm font-bold text-stone-900">{item.candidate.name}</h4>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">{item.candidate.type} · {item.candidate.category}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.candidate.confidence >= 0.85 ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{Math.round(item.candidate.confidence * 100)}% confidence</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.status === 'linked' ? 'bg-sky-50 text-sky-900' : item.status === 'possible' ? 'bg-amber-50 text-amber-900' : 'bg-stone-100 text-stone-800'}`}>{statusText}</span>
                  </div>
                  {(item.candidate.roleTitle || item.candidate.affiliation) && <p className="break-words text-xs text-stone-600">{[item.candidate.roleTitle, item.candidate.affiliation].filter(Boolean).join(' · ')}</p>}
                  {(item.candidate.phone.length > 0 || item.candidate.email.length > 0) && <p className="break-all text-xs text-stone-600">{[...item.candidate.phone, ...item.candidate.email].join(' · ')}</p>}
                  <p className="break-words text-xs text-stone-600">{item.candidate.context}</p>
                  {item.status === 'possible' && <label className="block max-w-full text-xs font-semibold text-stone-700">Choose existing contact
                    <select className="field mt-1 w-full" value={item.contactId || ''} onChange={(event) => setContactReview((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, contactId: event.target.value, confirmed: false } : entry))}>
                      <option value="">Select a match</option>{item.matches.map((match) => <option key={match.id} value={match.id}>{match.name} · {match.category}</option>)}
                    </select>
                  </label>}
                  <p className="text-[11px] font-semibold text-teal-900">{item.status === 'new' ? 'Add to contacts' : 'Confirm contact link'}</p>
                </div>
              </article>;
            })}
          </section>

          {/* Detected Item Cards List */}
          <div className="w-full max-w-full min-w-0 space-y-3 max-h-[550px] overflow-y-auto overflow-x-hidden pr-1">
            {filteredItems.length === 0 ? (
              <div className="p-10 text-center text-stone-500 italic bg-stone-50 rounded-xl border border-stone-200">
                No detected items in this category matching your search.
              </div>
            ) : (
              filteredItems.map((item) => {
                const isHist = item.classification === 'INDIVIDUAL_GIRL_HISTORICAL';
                const isAct = item.classification === 'GROUP_ACTIVITY' || item.classification === 'PROGRAMME_ACTIVITY';
                const isEY = item.classification === 'EARLY_YEARS_RECORD';
                const isWP = item.classification === 'WORKPLAN_PRIORITY';
                const isPhoto = item.classification === 'PHOTO_HIGHLIGHT';
                const isAgr = item.classification === 'AGRICULTURE_PRACTICAL_SKILLS';

                return (
                  <div
                    key={item.tempId}
                    className={`w-full max-w-full min-w-0 box-border border rounded-xl p-4 transition-all ${
                      item.selected
                        ? 'border-teal-700/60 bg-teal-50/15 shadow-xs'
                        : 'border-stone-200 bg-white opacity-70'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3 min-w-0">
                      {/* Left: Checkbox + Content */}
                      <div className="flex items-start gap-3 min-w-0 w-full sm:flex-1">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleToggleItem(item.tempId)}
                          className="mt-1 h-4 w-4 rounded-sm text-teal-800 focus:ring-teal-700 cursor-pointer"
                        />

                        <div className="space-y-2 min-w-0 flex-1">
                          {/* Badges row */}
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            {/* Classification Badge */}
                            <span
                              className={`inline-flex max-w-full items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-normal break-words ${
                                isHist
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : isAct
                                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                                  : isEY
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : isWP
                                  ? 'bg-purple-100 text-purple-900 border-purple-300'
                                  : isPhoto
                                  ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                  : isAgr
                                  ? 'bg-lime-100 text-lime-900 border-lime-300'
                                  : 'bg-stone-100 text-stone-700 border-stone-300'
                              }`}
                            >
                              {isHist && <History className="w-3 h-3 text-amber-700" />}
                              {isAct && <Users className="w-3 h-3 text-blue-700" />}
                              {isEY && <Sprout className="w-3 h-3 text-emerald-700" />}
                              {isWP && <ListTodo className="w-3 h-3 text-purple-700" />}
                              {isPhoto && <ImageIcon className="w-3 h-3 text-indigo-700" />}
                              {item.classificationLabel || item.classification}
                            </span>

                            {/* Match Confidence Badge */}
                            {item.matchConfidence && (
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-normal break-words ${
                                  item.matchConfidence === 'exact' || item.matchConfidence === 'high'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : item.matchConfidence === 'none'
                                    ? 'bg-sky-50 text-sky-800 border border-sky-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {item.matchConfidence === 'exact' || item.matchConfidence === 'high'
                                  ? 'Existing Match [High]'
                                  : item.matchConfidence === 'none'
                                  ? 'New Girl [No Existing Match]'
                                  : 'Possible Match [Review Required]'}
                              </span>
                            )}

                            {/* Date / Reporting Period Badge */}
                            <span className="text-[11px] text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200 flex items-center gap-1 whitespace-normal break-words max-w-full">
                              <Calendar className="w-3 h-3 text-stone-500 shrink-0" />
                              {item.reportingPeriod || (item.isDateUnknown ? 'Date Unknown (Period Preserved)' : item.recordDate)}
                            </span>

                            {/* Action Proposed Pill */}
                            {item.actionProposed && (
                              <span className="text-[11px] font-medium text-teal-900 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200 whitespace-normal break-words max-w-full">
                                Action: {item.actionProposed}
                              </span>
                            )}
                          </div>

                          {/* Individual Girl Match Information */}
                          {isHist && (
                            <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2.5 text-xs text-stone-800 space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 font-bold text-amber-950">
                                  <UserCheck className="w-4 h-4 text-amber-700" />
                                  <span>Beneficiary: {item.matchedName || 'Unmatched'}</span>
                                  {item.matchedId && <span className="text-stone-500 font-mono text-[11px]">({item.matchedId})</span>}
                                </div>

                                {/* Reassign girl dropdown if candidate list exists */}
                                {item.candidateGirls && item.candidateGirls.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] text-stone-600 font-semibold">Change Match:</span>
                                    <select
                                      value={item.matchedId || ''}
                                      onChange={(e) => handleReassignGirl(item.tempId, e.target.value)}
                                      className="text-[11px] bg-white border border-amber-300 rounded-md px-2 py-1 focus:ring-teal-700"
                                    >
                                      <option value="">Select Existing Girl...</option>
                                      {item.candidateGirls.map((cand) => (
                                        <option key={cand.id} value={cand.id}>
                                          {cand.fullName} ({cand.id}) - {cand.classLevel || 'Active'}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>

                              <p className="text-xs text-amber-900">
                                <strong>Historical Event:</strong> {item.extractedData.description || item.summary}
                              </p>
                              <p className="text-[11px] text-stone-600 italic">
                                Guaranteed Profile Protection: Active school/class level in profile remains untouched. This transition is archived in Historical Case Records.
                              </p>
                            </div>
                          )}

                          {/* Photo Thumbnail Render */}
                          {isPhoto && item.photoBase64 && (
                            <div className="flex flex-col sm:flex-row items-start gap-3 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-200 min-w-0 w-full">
                              <PhotoPreview src={item.photoBase64} alt={item.photoCaption || 'Report photo'} />
                              <div className="text-xs space-y-1 min-w-0 w-full sm:flex-1 [overflow-wrap:anywhere]">
                                <p className="font-bold text-indigo-950">
                                  {item.photoCaption || item.summary}
                                </p>
                                <p className="text-xs text-stone-600">
                                  Embedded photographic highlight extracted directly from report document.
                                </p>
                                <p className="text-[11px] text-indigo-800 font-semibold">
                                  Target: Linked to Household Activity / Communal Programme Record
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Summary text */}
                          {!isHist && !isPhoto && (
                            <p className="text-xs text-stone-800 font-medium [overflow-wrap:anywhere]">{item.summary}</p>
                          )}

                          {item.targetEntity === 'activity' && (
                            <div className="max-w-sm space-y-2">
                              <label className="block text-[11px] font-semibold text-stone-700">
                                Suggested activity category
                                <select
                                  value={item.extractedData.activityCategory || 'Group Activity'}
                                  onChange={(event) => handleActivityCategoryChange(item.tempId, event.target.value)}
                                  className="field mt-1 w-full"
                                >
                                  {[...new Set([
                                    ...ACTIVITY_CATEGORY_OPTIONS,
                                    ...(db.householdActivities || []).map((activity) => activity.activityCategory).filter((category): category is string => Boolean(category)),
                                    item.extractedData.activityCategory,
                                  ].filter((category): category is string => Boolean(category)))].map((category) => (
                                    <option key={category} value={category}>{category}</option>
                                  ))}
                                  <option value="__add_new__">Add new category...</option>
                                </select>
                              </label>
                              {addingActivityCategory[item.tempId] && (
                                <div className="flex gap-2">
                                  <input
                                    aria-label="New activity category"
                                    value={activityCategoryDrafts[item.tempId] || ''}
                                    onChange={(event) => setActivityCategoryDrafts((current) => ({ ...current, [item.tempId]: event.target.value }))}
                                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddActivityCategory(item.tempId); } }}
                                    placeholder="New category name"
                                    className="field min-w-0 flex-1"
                                  />
                                  <button type="button" onClick={() => handleAddActivityCategory(item.tempId)} className="rounded-md bg-teal-800 px-3 text-xs font-bold text-white hover:bg-teal-900">Add</button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Missing Fields Indicators */}
                          {item.missingFields && item.missingFields.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {item.missingFields.map((mf, mfIdx) => (
                                <span
                                  key={mfIdx}
                                  className="text-[11px] font-bold bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md border border-stone-300 flex items-center gap-1"
                                >
                                  <AlertCircle className="w-3 h-3 text-stone-500" />
                                  {mf}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Original Text Snippet */}
                          {item.originalSnippet && (
                            <p className="text-xs text-stone-500 bg-stone-50 p-2 rounded-md border border-stone-200 font-mono [overflow-wrap:anywhere]">
                              "{item.originalSnippet}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-wrap sm:flex-col items-center sm:items-end justify-start sm:justify-start gap-1.5 min-w-0 w-full sm:w-auto sm:shrink-0">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="px-2.5 py-1 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3 text-stone-500" /> Edit
                        </button>

                        {/* Reclassify Dropdown */}
                        <select
                          value={item.classification || 'UNCLASSIFIED_REVIEW'}
                          onChange={(e) => handleReclassifyItem(item.tempId, e.target.value as DocxClassification)}
                          className="text-[11px] bg-white border border-stone-200 rounded-lg px-2 py-1 text-stone-700 font-medium focus:outline-teal-800 cursor-pointer max-w-full w-full sm:w-auto"
                        >
                          {CLASSIFICATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        {item.selected ? (
                          <button
                            onClick={() => handleRejectItem(item.tempId)}
                            className="text-[10px] text-rose-700 hover:underline font-semibold cursor-pointer"
                          >
                            Reject Record
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleItem(item.tempId)}
                            className="text-[10px] text-teal-800 hover:underline font-semibold cursor-pointer"
                          >
                            Accept Record
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* REQUIRED WORKPLAN DUE-PERIOD CONFIRMATION */}
      {/* ------------------------------------------------------------------ */}
      {workplanDueDatePromptOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/50 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="workplan-due-date-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
          >
            <header className="border-b border-stone-200 px-5 py-4">
              <h3 id="workplan-due-date-title" className="text-base font-bold text-stone-900">Set Workplan due dates</h3>
              <p className="mt-1 text-xs text-stone-600">Choose a month, quarter, or date range for each selected Workplan item before ingestion.</p>
            </header>
            <div className="space-y-4 p-5">
              {workplanDueDateItems.map((item) => {
                const draft = workplanDueDateChoices[item.tempId] || { type: 'month', month: '', year: '', quarter: '', start: '', end: '' };
                return (
                  <fieldset key={item.tempId} className="space-y-3 border-b border-stone-200 pb-4 last:border-0">
                    <legend className="max-w-full text-xs font-bold text-stone-900">{item.title || item.summary}</legend>
                    <label className="block text-xs font-semibold text-stone-700">
                      Period type
                      <select
                        value={draft.type}
                        onChange={(event) => updateDueDateDraft(item.tempId, { type: event.target.value as DueDatePeriodDraft['type'] })}
                        className="field mt-1 w-full"
                      >
                        <option value="month">Month</option>
                        <option value="quarter">Quarter</option>
                        <option value="range">Date range</option>
                      </select>
                    </label>
                    {draft.type === 'month' && (
                      <label className="block text-xs font-semibold text-stone-700">
                        Due month
                        <input type="month" required value={draft.month} onChange={(event) => updateDueDateDraft(item.tempId, { month: event.target.value })} className="field mt-1 w-full" />
                      </label>
                    )}
                    {draft.type === 'quarter' && (
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-semibold text-stone-700">
                          Year
                          <input type="number" min="2000" max="2100" required value={draft.year} onChange={(event) => updateDueDateDraft(item.tempId, { year: event.target.value })} className="field mt-1 w-full" />
                        </label>
                        <label className="block text-xs font-semibold text-stone-700">
                          Quarter
                          <select required value={draft.quarter} onChange={(event) => updateDueDateDraft(item.tempId, { quarter: event.target.value })} className="field mt-1 w-full">
                            <option value="">Choose quarter</option>
                            <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>
                          </select>
                        </label>
                      </div>
                    )}
                    {draft.type === 'range' && (
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-semibold text-stone-700">
                          Start date
                          <input type="date" required value={draft.start} onChange={(event) => updateDueDateDraft(item.tempId, { start: event.target.value })} className="field mt-1 w-full" />
                        </label>
                        <label className="block text-xs font-semibold text-stone-700">
                          End date
                          <input type="date" required min={draft.start || undefined} value={draft.end} onChange={(event) => updateDueDateDraft(item.tempId, { end: event.target.value })} className="field mt-1 w-full" />
                        </label>
                      </div>
                    )}
                  </fieldset>
                );
              })}
              {workplanDueDateError && <p role="alert" className="text-xs font-semibold text-rose-700">{workplanDueDateError}</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
              <button type="button" onClick={() => setWorkplanDueDatePromptOpen(false)} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50">Cancel</button>
              <button type="button" onClick={handleConfirmWorkplanDueDates} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white hover:bg-teal-900">Confirm due dates</button>
            </footer>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 3: EXECUTING IMPORT */}
      {/* ------------------------------------------------------------------ */}
      {step === 'importing' && (
        <div className="p-12 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-teal-50 rounded-full flex items-center justify-center text-teal-800 border border-teal-100">
            <RefreshCw className="w-8 h-8 animate-spin text-teal-700" />
          </div>
          <h3 className="text-lg font-bold text-stone-900">Ingesting & Persisting to Cloud Firestore</h3>
          <p className="text-xs text-stone-600 max-w-md mx-auto">
            Writing validated historical cases, early years metrics, workplan priorities, and activities while strictly protecting active beneficiary profiles...
          </p>
          <div className="max-w-md mx-auto bg-stone-200 rounded-full h-3 overflow-hidden mt-4">
            <div
              className="bg-teal-700 h-3 rounded-full transition-all duration-300"
              style={{
                width: `${
                  importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0
                }%`,
              }}
            />
          </div>
          <p className="text-xs font-semibold text-teal-900">
            Processed {importProgress.current} of {importProgress.total} records
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 4: COMPLETED AUDIT RECEIPT */}
      {/* ------------------------------------------------------------------ */}
      {step === 'completed' && completedAudit && (
        <div className="p-8 space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 mx-auto bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-extrabold text-stone-900">Ingestion Audit Successfully Logged</h3>
            <p className="text-xs text-stone-600 mt-1">
              All approved report sections have been committed to the SHINE database with full cryptographic audit traceability.
            </p>
          </div>

          <div className="bg-stone-50 p-6 rounded-2xl border border-stone-200 max-w-xl mx-auto space-y-3 text-xs">
            <div className="flex justify-between border-b border-stone-200 pb-2">
              <span className="text-stone-500">Source Document:</span>
              <strong className="text-stone-900 font-mono text-[11px]">{completedAudit.fileName}</strong>
            </div>
            <div className="flex justify-between border-b border-stone-200 pb-2">
              <span className="text-stone-500">Staff Ingestion Officer:</span>
              <strong className="text-stone-900">{completedAudit.importedByName}</strong>
            </div>
            <div className="flex justify-between border-b border-stone-200 pb-2">
              <span className="text-stone-500">Historical Girl Records (Preserved):</span>
              <strong className="text-amber-800 font-bold">{completedAudit.historicalRecordsCount}</strong>
            </div>
            <div className="flex justify-between border-b border-stone-200 pb-2">
              <span className="text-stone-500">Programme / Group Activities:</span>
              <strong className="text-blue-800 font-bold">{countActivities}</strong>
            </div>
            <div className="flex justify-between border-b border-stone-200 pb-2">
              <span className="text-stone-500">Early Years Programme Records:</span>
              <strong className="text-emerald-800 font-bold">{countEarlyYears}</strong>
            </div>
            <div className="flex justify-between border-b border-stone-200 pb-2">
              <span className="text-stone-500">Workplan Priorities:</span>
              <strong className="text-purple-800 font-bold">{countWorkplans}</strong>
            </div>
            <div className="flex justify-between border-b border-stone-200 pb-2">
              <span className="text-stone-500">Photographic Highlights:</span>
              <strong className="text-indigo-800 font-bold">{countPhotos}</strong>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-stone-500">Audit Reference Code:</span>
              <strong className="text-stone-600 font-mono text-[11px]">{completedAudit.id}</strong>
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setSelectedFile(null);
                setPreviewItems([]);
                setReportMetadata(null);
                setStep('upload');
              }}
              className="px-4 py-2 border border-stone-300 rounded-xl text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Ingest Another Report
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-5 py-2 bg-teal-800 text-white rounded-xl text-xs font-bold hover:bg-teal-900 shadow-xs cursor-pointer"
              >
                Return to Caseload Overview
              </button>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* EDIT ITEM MODAL */}
      {/* ------------------------------------------------------------------ */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-teal-800" />
                Edit Detected Item Details
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Classification:</label>
                <select
                  value={editingItem.classification || 'UNCLASSIFIED_REVIEW'}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      classification: e.target.value as DocxClassification,
                      targetEntity: e.target.value === 'WORKPLAN_PRIORITY'
                        ? 'workplan'
                        : e.target.value === 'EARLY_YEARS_RECORD'
                        ? 'earlyYears'
                        : ['GROUP_ACTIVITY', 'PROGRAMME_ACTIVITY', 'AGRICULTURE_PRACTICAL_SKILLS'].includes(e.target.value)
                        ? 'activity'
                        : e.target.value === 'PHOTO_HIGHLIGHT'
                        ? 'attachment'
                        : e.target.value === 'INDIVIDUAL_GIRL_HISTORICAL'
                        ? 'girl'
                        : 'general',
                      classificationLabel: CLASSIFICATION_OPTIONS.find((o) => o.value === e.target.value)?.label,
                    })
                  }
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-xs focus:bg-white focus:outline-teal-800"
                >
                  {CLASSIFICATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Summary / Title:</label>
                <input
                  type="text"
                  value={editingItem.summary}
                  onChange={(e) => setEditingItem({ ...editingItem, summary: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-xs focus:bg-white focus:outline-teal-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Reporting Period / Date:</label>
                <input
                  type="text"
                  value={editingItem.reportingPeriod || editingItem.recordDate || ''}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      reportingPeriod: e.target.value,
                      recordDate: e.target.value,
                    })
                  }
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-xs focus:bg-white focus:outline-teal-800"
                />
              </div>

              {editingItem.classification === 'WORKPLAN_PRIORITY' && (
                <>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Responsible Staff Member:</label>
                    <input
                      type="text"
                      placeholder="e.g. Suzen Zidana or Case Worker"
                      value={editingItem.extractedData.responsibleStaffName || ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          extractedData: {
                            ...editingItem.extractedData,
                            responsibleStaffName: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-xs focus:bg-white focus:outline-teal-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Estimated Budget (MWK):</label>
                    <input
                      type="number"
                      placeholder="e.g. 500000"
                      value={editingItem.extractedData.budget || ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          extractedData: {
                            ...editingItem.extractedData,
                            budget: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-xs focus:bg-white focus:outline-teal-800"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Original Text Excerpt:</label>
                <textarea
                  rows={3}
                  value={editingItem.originalSnippet || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, originalSnippet: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-xs focus:bg-white focus:outline-teal-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <button
                onClick={() => setEditingItem(null)}
                className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-lg font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveEditedItem(editingItem)}
                className="px-4 py-1.5 bg-teal-800 text-white rounded-lg text-xs font-bold hover:bg-teal-900 cursor-pointer shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
