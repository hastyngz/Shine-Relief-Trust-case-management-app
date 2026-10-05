import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
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
import { SpreadsheetAnalysis, SpreadsheetKind } from '../../services/spreadsheetImport/detector';
import {
  createSpreadsheetImportPreview,
  ImportedSpreadsheetLine,
  SpreadsheetImportPreview,
} from '../../services/spreadsheetImport/importers';
import { PROGRAMMES } from '../../data/programmes';
import { useAuth } from '../../contexts/AuthContext';
import { QualityCheckPanel } from '../QualityCheckPanel';
import type { QualityIssueResolution } from '../QualityCheckPanel';
import { qualityScores, runQualityRules } from '../../services/qualityRules';
import type { QualityIssue } from '../../services/qualityRules';
import { qualityMessage } from '../../services/qualityMessages';
import { appendReportExport } from '../../services/firestoreSync';
import { createFixedReport, fixedReportFileName, nextReportExportVersion, sha256Blob, type FixedReportFormat } from '../../services/qualityFixedReport';
import { correctImportPreviewText, exactPreviewDuplicateKey, type SafeTextChange } from '../../services/safeTextCorrections';
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

function spreadsheetLineToPreview(
  line: ImportedSpreadsheetLine,
  existingWorkplans: AppDatabase['workplans'] = [],
): ImportPreviewItem {
  const id = `spreadsheet_${line.sheet}_${line.row}`;
  if (line.kind === 'budget') {
    return {
      tempId: id,
      resultType: 'NEW_RECORD',
      targetEntity: 'budget',
      classification: 'BUDGET_FINANCIAL',
      classificationLabel: 'Budget line',
      isDateUnknown: false,
      title: line.itemDescription,
      summary: `${line.period} · ${line.quantity} ${line.unit} × MWK ${line.unitCost.toLocaleString()} = MWK ${line.budgetAmount.toLocaleString()}`,
      originalSnippet: `${line.sheet}!row ${line.row} · ${line.notes}`,
      extractedData: {
        ...line,
        spreadsheetKind: 'budget-monthly',
        financialYear: line.period.match(/20\d{2}/)?.[0],
      },
      isHistorical: false,
      selected: true,
      warningOrConflict: line.programmeId ? undefined : 'Select the programme before importing this budget line.',
      missingFields: line.programmeId ? [] : ['Programme'],
    };
  }
  if (line.kind === 'workplan') {
    const comparablePeriod = line.period.match(/^\d{4}-\d{2}$/)?.[0];
    const existingMatch = existingWorkplans.find((candidate) =>
      candidate.programmeId === line.programmeId &&
      candidate.activity.trim().toLowerCase() === line.activity.trim().toLowerCase() &&
      (
        candidate.period === line.period ||
        (comparablePeriod && (
          candidate.period.includes(comparablePeriod) ||
          candidate.startDate?.startsWith(comparablePeriod) ||
          candidate.endDate?.startsWith(comparablePeriod)
        ))
      )
    );
    const differences = existingMatch ? [
      ...(existingMatch.targetCount !== line.targetCount
        ? [{ field: 'targetCount', currentVal: existingMatch.targetCount, importedVal: line.targetCount }]
        : []),
      ...((existingMatch.completedCount || 0) !== (line.completedCount || 0)
        ? [{ field: 'completedCount', currentVal: existingMatch.completedCount || 0, importedVal: line.completedCount || 0 }]
        : []),
      ...((existingMatch.budget || 0) !== (line.budget || 0)
        ? [{ field: 'budget', currentVal: existingMatch.budget || 0, importedVal: line.budget || 0 }]
        : []),
      ...(existingMatch.description !== line.description
        ? [{ field: 'description', currentVal: existingMatch.description, importedVal: line.description }]
        : []),
    ] : undefined;
    return {
      tempId: id,
      resultType: existingMatch ? 'CONFLICT' : 'NEW_RECORD',
      targetEntity: 'workplan',
      classification: 'WORKPLAN_PRIORITY',
      classificationLabel: 'Workplan activity',
      isDateUnknown: false,
      title: line.activity,
      summary: `${line.period} · target ${line.targetCount} ${line.unit}${line.completedCount === undefined ? '' : ` · progress ${line.completedCount}`}${existingMatch ? ` · possible existing item ${existingMatch.id}` : ''}`,
      originalSnippet: `${line.sheet}!row ${line.row} · ${line.domain}${line.costLevel === 'group' ? ' · grouped Cost belongs to Main Activity' : ''}`,
      extractedData: {
        ...line,
        spreadsheetKind: 'workplan-matrix',
        workplanDomain: `${line.domain}${line.mainActivity ? ` / ${line.mainActivity}` : ''}`,
      },
      matchedId: existingMatch?.id,
      currentData: existingMatch ? {
        period: existingMatch.period,
        targetCount: existingMatch.targetCount,
        completedCount: existingMatch.completedCount,
        budget: existingMatch.budget,
        description: existingMatch.description,
      } : undefined,
      differences,
      isHistorical: false,
      selected: !existingMatch,
      warningOrConflict: !line.programmeId
        ? 'Programme is unclear; select a programme in the imported workplan before confirming.'
        : existingMatch
          ? 'Possible duplicate/version: compare the row-level values, then accept this version or reject it.'
          : undefined,
      missingFields: [
        ...(!line.programmeId ? ['Programme'] : []),
        ...(line.targetCount <= 0 ? ['Numeric monthly target'] : []),
        ...(!line.indicator ? ['Indicator'] : []),
      ],
    };
  }
  if (line.kind === 'procurement') {
    const unclearCount = line.items.filter((item) => item.priceStatus === 'unclear').length;
    const missingCount = line.items.filter((item) => item.priceStatus === 'missing').length;
    return {
      tempId: id,
      resultType: 'NEW_RECORD',
      targetEntity: 'procurementList',
      classification: 'BUDGET_FINANCIAL',
      classificationLabel: 'Procurement list',
      isDateUnknown: true,
      title: line.title,
      summary: `${line.items.length} items · ${missingCount} missing prices · ${unclearCount} unclear prices`,
      originalSnippet: JSON.stringify(line.items),
      extractedData: { ...line, spreadsheetKind: 'item-list' },
      isHistorical: false,
      selected: true,
    };
  }
  if (line.kind === 'projection') {
    const unpricedCount = line.costLines.filter((cost) => cost.status === 'unpriced').length;
    return {
      tempId: id,
      resultType: 'NEW_RECORD',
      targetEntity: 'projectProjection',
      classification: 'BUDGET_FINANCIAL',
      classificationLabel: 'Income-project projection',
      isDateUnknown: false,
      title: `${line.programmeId} · ${line.period}`,
      summary: `Revenue MWK ${line.revenueMWK.toLocaleString()} · ${unpricedCount} unpriced lines`,
      originalSnippet: JSON.stringify(line.costLines),
      extractedData: { ...line, spreadsheetKind: 'profit-loss' },
      isHistorical: false,
      selected: true,
    };
  }
  if (line.kind === 'payroll') {
    return {
      tempId: id,
      resultType: line.status === 'matched' ? 'NEW_RECORD' : 'POSSIBLE_DUPLICATE_PERSON',
      targetEntity: 'payroll',
      classification: 'BUDGET_FINANCIAL',
      classificationLabel: line.specialType ? `${line.specialType} payment · review required` : 'Payroll payment',
      matchedId: line.employeeId,
      matchedName: line.employeeName,
      isDateUnknown: false,
      title: line.employeeName,
      summary: `${line.payPeriod} · ${line.department || 'Department not supplied'} · MWK ${line.amount.toLocaleString()}`,
      originalSnippet: `${line.sheet}!row ${line.row}${line.notes ? ` · ${line.notes}` : ''}`,
      extractedData: { ...line, spreadsheetKind: 'payroll-grid' },
      isHistorical: false,
      selected: line.status === 'matched' && !line.specialType,
      warningOrConflict: line.status === 'matched'
        ? (line.specialType ? 'Separate flagged record requires payroll review.' : undefined)
        : 'Select the correct existing staff member; no staff account will be created.',
      missingFields: line.status === 'matched' && !line.specialType ? [] : ['Existing staff match', 'Payroll review'],
    };
  }
  return {
    tempId: id,
    resultType: 'NO_CHANGE',
    targetEntity: 'general',
    classification: 'UNCLASSIFIED_REVIEW',
    classificationLabel: 'Unmapped spreadsheet row',
    isDateUnknown: true,
    title: `${line.sheet} row ${line.row}`,
    summary: line.reason,
    originalSnippet: JSON.stringify(line.values),
    extractedData: { sourceSheet: line.sheet, sourceRow: line.row, sourceValues: line.values },
    isHistorical: false,
    selected: false,
    warningOrConflict: 'Not imported; retained in sourceData on the audit record.',
  };
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
  const { staffProfile, canEdit, isAdmin, role, allStaff } = useAuth();

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
  const previewCardRefs = useRef(new Map<string, HTMLDivElement>());
  const automaticChangeKeys = useRef(new Set<string>());
  const automaticDuplicateKeys = useRef(new Set<string>());
  const [highlightedPreviewId, setHighlightedPreviewId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [contactReview, setContactReview] = useState<ContactReviewItem[]>([]);
  const [workplanDueDateItems, setWorkplanDueDateItems] = useState<ImportPreviewItem[]>([]);
  const [workplanDueDateChoices, setWorkplanDueDateChoices] = useState<Record<string, DueDatePeriodDraft>>({});
  const [workplanDueDateError, setWorkplanDueDateError] = useState('');
  const [workplanDueDatePromptOpen, setWorkplanDueDatePromptOpen] = useState(false);
  const [addingActivityCategory, setAddingActivityCategory] = useState<Record<string, boolean>>({});
  const [activityCategoryDrafts, setActivityCategoryDrafts] = useState<Record<string, string>>({});
  const [spreadsheetAnalysis, setSpreadsheetAnalysis] = useState<SpreadsheetAnalysis | null>(null);
  const [spreadsheetKindOverride, setSpreadsheetKindOverride] = useState<SpreadsheetKind | null>(null);
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<SpreadsheetImportPreview | null>(null);
  const [blockerOverrideReason, setBlockerOverrideReason] = useState('');
  const [qualityDataSource, setQualityDataSource] = useState('');
  const [qualityCollectionMethod, setQualityCollectionMethod] = useState('');
  const [qualityCollectionMethodOther, setQualityCollectionMethodOther] = useState('');
  const [qualityResolutions, setQualityResolutions] = useState<NonNullable<ImportAuditRecord['qualityResolutions']>>([]);
  const [automaticChanges, setAutomaticChanges] = useState<Array<SafeTextChange & { id: string; tempId: string; by: 'automatic'; at: string }>>([]);
  const [automaticDuplicateRemovals, setAutomaticDuplicateRemovals] = useState<Array<{ id: string; removed: ImportPreviewItem; keptTempId: string; restoreBeforeId?: string; by: 'automatic'; at: string }>>([]);

  // Editing Item Modal State
  const [editingItem, setEditingItem] = useState<ImportPreviewItem | null>(null);

  // Import Execution State
  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [completedAudit, setCompletedAudit] = useState<ImportAuditRecord | null>(null);

  useEffect(() => {
    setPreviewItems((current) => {
      let changed = false;
      const next = current.map((item) => {
        if (!item.selected || !['activity', 'workplan'].includes(item.targetEntity) || item.extractedData.indicatorId) return item;
        const title = String(item.title || '').trim().toLowerCase();
        const programmeId = item.extractedData.programmeId;
        if (!title || !programmeId) return item;
        const matches = (db.workplans || []).filter((workplan) =>
          workplan.indicatorId && workplan.programmeId === programmeId
          && workplan.activity.trim().toLowerCase() === title);
        if (matches.length !== 1) return item;
        changed = true;
        return {
          ...item,
          extractedData: {
            ...item.extractedData,
            indicatorId: matches[0].indicatorId,
            autoLinkedIndicatorId: matches[0].indicatorId,
            autoLinkedWorkplanId: matches[0].id,
          },
        };
      });
      return changed ? next : current;
    });
  }, [db.workplans, previewItems]);

  useEffect(() => {
    const changes: Array<SafeTextChange & { id: string; tempId: string; by: 'automatic'; at: string }> = [];
    const next = previewItems.map((item) => {
      if (!item.selected) return item;
      const itemChanges = correctImportPreviewText(item);
      const unapplied = itemChanges.filter((change) => {
        const key = `${item.tempId}|${change.field}|${change.before}|${change.after}`;
        if (automaticChangeKeys.current.has(key)) return false;
        automaticChangeKeys.current.add(key);
        changes.push({
          ...change,
          id: `auto:${key}`,
          tempId: item.tempId,
          by: 'automatic',
          at: new Date().toISOString(),
        });
        return true;
      });
      if (!unapplied.length) return item;
      return unapplied.reduce((updated, change) => ({ ...updated, [change.field]: change.after }), item);
    });
    const firstByFingerprint = new Map<string, ImportPreviewItem>();
    const duplicateIds = new Set<string>();
    const removals: Array<{ id: string; removed: ImportPreviewItem; keptTempId: string; restoreBeforeId?: string; by: 'automatic'; at: string }> = [];
    for (const [index, item] of next.entries()) {
      if (!item.selected) continue;
      const fingerprint = exactPreviewDuplicateKey(item);
      const first = firstByFingerprint.get(fingerprint);
      if (!first) {
        firstByFingerprint.set(fingerprint, item);
        continue;
      }
      const key = `${item.tempId}|${fingerprint}`;
      if (automaticDuplicateKeys.current.has(key)) continue;
      automaticDuplicateKeys.current.add(key);
      duplicateIds.add(item.tempId);
      removals.push({
        id: `auto-duplicate:${key}`,
        removed: item,
        keptTempId: first.tempId,
        restoreBeforeId: next.slice(index + 1).find((candidate) => !duplicateIds.has(candidate.tempId))?.tempId,
        by: 'automatic',
        at: new Date().toISOString(),
      });
    }
    if (changes.length || removals.length) {
      setPreviewItems(next.filter((item) => !duplicateIds.has(item.tempId)));
    }
    if (changes.length) {
      setAutomaticChanges((current) => [...current, ...changes]);
    }
    if (removals.length) setAutomaticDuplicateRemovals((current) => [...current, ...removals]);
  }, [previewItems]);

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
    automaticChangeKeys.current.clear();
    automaticDuplicateKeys.current.clear();
    setAutomaticChanges([]);
    setAutomaticDuplicateRemovals([]);
    setQualityResolutions([]);
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
        setSpreadsheetAnalysis(null);
        setSpreadsheetKindOverride(null);
        setSpreadsheetPreview(null);
        setPreviewItems(analysis.docxResult.items);
        await prepareContactReview(analysis.detectedContacts);
        setStep('review');
      } else {
        // Excel file
        const analysis = await parseExcelFile(file, db.girls.map((girl) => girl.fullName), allStaff);
        setSpreadsheetAnalysis(analysis.spreadsheetAnalysis || null);
        setSpreadsheetKindOverride(null);
        if (
          analysis.spreadsheetImportPreview &&
          analysis.spreadsheetAnalysis &&
          analysis.spreadsheetAnalysis.detectedKind !== 'unknown'
        ) {
          if (analysis.spreadsheetAnalysis.sheets.every((sheet) => sheet.rowsRead === 0)) {
            throw new Error('Spreadsheet contains zero readable data rows or table sheets.');
          }
          if (analysis.spreadsheetAnalysis?.detectedKind === 'payroll-grid' && !(isAdmin || role === 'Manager')) {
            throw new Error('Payroll spreadsheet imports are restricted to Administrators and Managers.');
          }
          setSpreadsheetPreview(analysis.spreadsheetImportPreview);
          setPreviewItems(analysis.spreadsheetImportPreview.          lines.map((line) =>
            spreadsheetLineToPreview(line, db.workplans || [])
          ));
          await prepareContactReview([]);
          setStep('review');
          return;
        }
        if (analysis.rawRows.length === 0) {
          throw new Error('Spreadsheet contains zero readable data rows or table sheets.');
        }
        setSpreadsheetPreview(analysis.spreadsheetImportPreview || null);
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
    automaticChangeKeys.current.clear();
    automaticDuplicateKeys.current.clear();
    setAutomaticChanges([]);
    setAutomaticDuplicateRemovals([]);
    setQualityResolutions([]);
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
      setSpreadsheetAnalysis(null);
      setSpreadsheetKindOverride(null);
      setSpreadsheetPreview(null);
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

    const selectedItems = previewItems.filter((i) => i.selected).map((item) => {
      if (!['activity', 'workplan'].includes(item.targetEntity)) return item;
      return {
        ...item,
        extractedData: {
          ...item.extractedData,
          ...(qualityDataSource.trim() ? { dataSource: qualityDataSource.trim(), source: qualityDataSource.trim() } : {}),
          ...((qualityCollectionMethod === 'Other' ? qualityCollectionMethodOther : qualityCollectionMethod).trim()
            ? { measurementMethod: (qualityCollectionMethod === 'Other' ? qualityCollectionMethodOther : qualityCollectionMethod).trim(), method: (qualityCollectionMethod === 'Other' ? qualityCollectionMethodOther : qualityCollectionMethod).trim() }
            : {}),
        },
      };
    });
    const selectedPayroll = selectedItems.filter((item) => item.targetEntity === 'payroll');
    if (selectedPayroll.length > 0 && !(isAdmin || role === 'Manager')) {
      alert('Payroll spreadsheet imports are restricted to Administrators and Managers.');
      return;
    }
    const unmatchedPayroll = selectedPayroll.filter((item) => !item.extractedData.employeeId);
    if (unmatchedPayroll.length > 0) {
      alert(`Match each selected payroll row to an existing staff member (${unmatchedPayroll.length} unmatched).`);
      return;
    }
    const unresolvedProgrammes = selectedItems.filter(
      (item) => (item.targetEntity === 'budget' || item.targetEntity === 'workplan') &&
        item.extractedData.spreadsheetKind && !item.extractedData.programmeId
    );
    if (unresolvedProgrammes.length > 0) {
      alert(`Select a programme for each selected spreadsheet row (${unresolvedProgrammes.length} unresolved).`);
      return;
    }
    const unapprovedNarrativeOnly = selectedItems.filter((item) =>
      item.extractedData.narrativeOnly === true && item.extractedData.managerApproved !== true);
    if (unapprovedNarrativeOnly.length > 0) {
      alert('Narrative-only activities require approval by an Administrator or Manager before they can be imported.');
      return;
    }
    const resolvedQualityIssueIds = new Set(qualityResolutions.map((resolution) => resolution.issueId));
    const importBlockers = importQualityIssues.filter((issue) =>
      issue.severity === 'blocker' && !resolvedQualityIssueIds.has(issue.id));
    if (importBlockers.length && blockerOverrideReason.trim().length < 10) {
      alert('Resolve quality blockers or enter a written override reason of at least 10 characters.');
      return;
    }
    const workplanItems = selectedItems.filter((item) =>
      item.classification === 'WORKPLAN_PRIORITY' ||
      item.targetEntity === 'workplan' ||
      item.extractedData.createWorkplan === true
    );
    const missingDueDateItems = workplanItems.filter((item) => {
      if (item.extractedData.spreadsheetKind === 'workplan-matrix') return false;
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
      qualityIssues: importQualityIssues,
      qualityScores: importQualityScores,
      qualityResolutions: [
        ...qualityResolutions,
        ...automaticChanges.map((change) => ({
          issueId: change.id,
          status: 'resolved' as const,
          note: change.reason,
          by: change.by,
          at: change.at,
          field: change.field,
          before: change.before,
          after: change.after,
        })),
        ...automaticDuplicateRemovals.map((change) => ({
          issueId: change.id,
          status: 'resolved' as const,
          note: 'Removed an exact duplicate preview row and kept the first copy.',
          by: change.by,
          at: change.at,
          field: '__remove',
          before: `${change.removed.title}: ${change.removed.summary}`,
          after: `Duplicate of ${change.keptTempId}; first copy retained.`,
        })),
      ],
      blockerOverrideReason: importBlockers.length ? blockerOverrideReason.trim() : undefined,
      sourceData: spreadsheetPreview?.sourceData,
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

  const handleSpreadsheetKindChange = async (kind: SpreadsheetKind) => {
    setSpreadsheetKindOverride(kind);
    if (!selectedFile || !spreadsheetAnalysis) return;
    const workbook = XLSX.read(await selectedFile.arrayBuffer(), {
      type: 'array',
      cellFormula: true,
      cellNF: true,
      cellText: true,
    });
    if (kind === 'payroll-grid' && !(isAdmin || role === 'Manager')) {
      setParseError('Payroll spreadsheet imports are restricted to Administrators and Managers.');
      return;
    }
    const parsed = createSpreadsheetImportPreview(workbook, spreadsheetAnalysis, kind, allStaff);
    setSpreadsheetPreview(parsed);
    setPreviewItems(parsed.lines.map((line) =>
      spreadsheetLineToPreview(line, db.workplans || [])
    ));
  };

  const handleSpreadsheetProgrammeChange = (tempId: string, programmeId: string) => {
    const programme = PROGRAMMES.find((item) => item.id === programmeId);
    if (!programme) return;
    setPreviewItems((current) => current.map((item) => item.tempId !== tempId ? item : {
      ...item,
      extractedData: { ...item.extractedData, programmeId: programme.id, programme: programme.name },
      warningOrConflict: undefined,
      missingFields: (item.missingFields || []).filter((field) => field !== 'Programme'),
    }));
  };

  const handlePayrollStaffMatch = (tempId: string, employeeId: string) => {
    const staffMember = allStaff.find((candidate) => candidate.id === employeeId || candidate.uid === employeeId);
    if (!staffMember) return;
    setPreviewItems((current) => current.map((item) => item.tempId !== tempId ? item : {
      ...item,
      matchedId: staffMember.id,
      matchedName: staffMember.fullName,
      extractedData: { ...item.extractedData, employeeId: staffMember.id, employeeName: staffMember.fullName },
      warningOrConflict: 'Staff match selected. Review the payroll amount and explicitly accept this row.',
      missingFields: ['Review payroll amount'],
    }));
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

  const importQualityIssues = useMemo(() => runQualityRules({
    finalReport: false,
    filePeriod: reportMetadata?.reportingPeriod,
    importPreviewRows: previewItems.filter((item) => item.selected).map((item) => ({
      id: item.tempId,
      targetEntity: item.targetEntity,
      title: item.title,
      summary: item.summary,
      extractedData: item.extractedData,
    })),
    previewQualityText: previewItems.filter((item) => item.selected).map((item) => ({
      id: item.tempId,
      title: item.title,
      summary: item.summary,
      text: item.originalSnippet,
    })),
    narrativeSections: previewItems.filter((item) => item.selected).map((item) => ({
      id: item.tempId,
      title: item.title,
      text: item.originalSnippet || item.summary,
      headingAfterContent: item.extractedData.headingAfterContent,
      sectionNumber: item.extractedData.sectionNumber,
      expectedSectionNumber: item.extractedData.expectedSectionNumber,
    })),
    activities: previewItems.filter((item) => item.selected && (item.targetEntity === 'activity' || item.targetEntity === 'workplan')).map((item) => ({
      ...item.extractedData,
      id: item.tempId,
      title: item.title,
      description: item.originalSnippet || item.summary,
      source: qualityDataSource || item.extractedData.source,
      method: (qualityCollectionMethod === 'Other' ? qualityCollectionMethodOther : qualityCollectionMethod) || item.extractedData.method,
      indicatorId: item.extractedData.indicatorId,
      target: item.extractedData.targetCount,
      actual: item.extractedData.completedCount,
    })),
    budgets: previewItems.filter((item) => item.selected && item.targetEntity === 'budget').map((item) => ({
      ...item.extractedData,
      id: item.tempId,
      title: item.title,
      description: item.extractedData.itemDescription || item.summary,
      quantity: item.extractedData.quantity,
      unitCost: item.extractedData.unitCost,
      amount: item.extractedData.budgetAmount,
      formula: item.extractedData.formula,
    })),
    results: previewItems.filter((item) => item.selected && ['activity', 'workplan'].includes(item.targetEntity || '')).map((item) => ({
      ...item.extractedData,
      id: item.tempId,
      title: item.title,
      actual: item.extractedData.completedCount,
      target: item.extractedData.targetCount,
      source: qualityDataSource || item.extractedData.source,
      method: (qualityCollectionMethod === 'Other' ? qualityCollectionMethodOther : qualityCollectionMethod) || item.extractedData.method,
    })),
    indicators: previewItems.filter((item) => item.selected && item.targetEntity === 'workplan').map((item) => ({
      id: item.extractedData.indicatorId || item.tempId,
      indicatorId: item.extractedData.indicatorId || item.tempId,
      name: item.extractedData.indicator || item.title,
      programmeId: item.extractedData.programmeId,
    })),
    identityNames: previewItems.filter((item) => item.selected).flatMap((item) => [
      item.matchedName,
      item.extractedData.employeeName,
      item.extractedData.personName,
      item.extractedData.beneficiaryName,
      ...(item.candidateGirls || []).map((girl) => girl.fullName),
    ]).filter((name): name is string => typeof name === 'string' && !!name.trim()),
    identityReviews: previewItems.filter((item) => item.selected).flatMap((item) => {
      if (item.identityResolution) return [];
      const name = item.matchedName
        || item.extractedData.employeeName
        || item.extractedData.personName
        || item.extractedData.beneficiaryName;
      if (typeof name !== 'string' || !name.trim()) return [];
      const candidateLists = [
        ...(item.candidateGirls || []).map((candidate) => ({ id: candidate.id, name: candidate.fullName })),
        ...(item.candidatePeople || []).map((candidate) => ({ id: candidate.id, name: candidate.fullName })),
        ...(Array.isArray(item.extractedData.matchCandidates) ? item.extractedData.matchCandidates : [])
          .filter((candidate: unknown): candidate is { id: string; name: string } =>
            typeof candidate === 'object' && candidate !== null
            && typeof (candidate as { id?: unknown }).id === 'string'
            && typeof (candidate as { name?: unknown }).name === 'string'),
      ];
      const candidates = Array.from(new Map(candidateLists.map((candidate) => [candidate.id, candidate])).values());
      return candidates.length ? [{ id: item.tempId, name, candidates }] : [];
    }),
    options: {
      now: new Date().toISOString(),
      ukSpelling: true,
      maxReadingGrade: 8,
      maxSentenceWords: 35,
      programmeNames: PROGRAMMES.map((programme) => programme.name),
    },
  }), [previewItems, reportMetadata, qualityDataSource, qualityCollectionMethod, qualityCollectionMethodOther]);
  const importQualityScores = useMemo(() => qualityScores(importQualityIssues), [importQualityIssues]);

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

  const openImportQualityIssue = (issue: QualityIssue) => {
    if (issue.target?.kind !== 'preview-item' && issue.target?.kind !== 'narrative-section'
      && issue.target?.kind !== 'budget-item' && issue.target?.kind !== 'workplan-item'
      && issue.target?.kind !== 'indicator-result') return;
    setActiveTab('ALL');
    setSearchTerm('');
    window.requestAnimationFrame(() => {
      const card = previewCardRefs.current.get(issue.target!.id);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.focus({ preventScroll: true });
      setHighlightedPreviewId(issue.target!.id);
      window.setTimeout(() => setHighlightedPreviewId((current) => current === issue.target!.id ? null : current), 2000);
    });
  };

  const resolveImportQualityIssue = (issue: QualityIssue, resolution: QualityIssueResolution): boolean => {
    if (resolution.status === 'overridden') {
      setQualityResolutions((current) => [
        ...current.filter((entry) => entry.issueId !== issue.id),
        { issueId: issue.id, status: resolution.status, note: resolution.note, by: activeStaff.fullName, at: new Date().toISOString() },
      ]);
      return true;
    }
    if (issue.rule === 'IDENTITY-FUZZY-01' && issue.target?.id && resolution.value && typeof resolution.value === 'object') {
      const value = resolution.value as { candidateId?: unknown };
      const target = previewItems.find((item) => item.tempId === issue.target?.id);
      if (!target || typeof value.candidateId !== 'string') return false;
      const candidateList = [
        ...(target.candidateGirls || []).map((candidate) => ({ id: candidate.id, name: candidate.fullName })),
        ...(target.candidatePeople || []).map((candidate) => ({ id: candidate.id, name: candidate.fullName })),
        ...(Array.isArray(target.extractedData.matchCandidates) ? target.extractedData.matchCandidates : [])
          .filter((candidate: unknown): candidate is { id: string; name: string } =>
            typeof candidate === 'object' && candidate !== null
            && typeof (candidate as { id?: unknown }).id === 'string'
            && typeof (candidate as { name?: unknown }).name === 'string'),
      ];
      const isNewPerson = value.candidateId === 'new-person';
      const candidate = isNewPerson ? undefined : candidateList.find((person) => person.id === value.candidateId);
      if (!isNewPerson && !candidate) return false;
      const identityDecision = isNewPerson ? 'new-person' : 'existing-person';
      const stillFires = runQualityRules({
        identityReviews: [{
          id: target.tempId,
          name: target.matchedName || target.extractedData.employeeName || target.extractedData.personName || target.extractedData.beneficiaryName,
          candidates: candidateList,
          decision: identityDecision,
        }],
      }).some((candidateIssue) => candidateIssue.rule === issue.rule);
      if (stillFires) return false;
      const updated: ImportPreviewItem = {
        ...target,
        matchedId: candidate?.id,
        matchedName: candidate?.name ?? target.matchedName,
        identityResolution: identityDecision,
        ...(target.targetEntity === 'payroll' && candidate ? {
          extractedData: { ...target.extractedData, employeeId: candidate.id, employeeName: candidate.name },
        } : {}),
      };
      setPreviewItems((current) => current.map((item) => item.tempId === target.tempId ? updated : item));
      setQualityResolutions((current) => [
        ...current.filter((entry) => entry.issueId !== issue.id),
        { issueId: issue.id, status: 'resolved', note: resolution.note, by: activeStaff.fullName, at: new Date().toISOString(), field: 'matchedId', before: target.matchedId, after: candidate?.id || 'new-person' },
      ]);
      return true;
    }
    if (issue.rule === 'DQ-RELIABILITY' && issue.target?.id && resolution.value && typeof resolution.value === 'object') {
      const value = resolution.value as { method?: unknown; applyToAll?: unknown };
      if (typeof value.method !== 'string' || !value.method.trim()) return false;
      const target = previewItems.find((item) => item.tempId === issue.target?.id);
      if (!target) return false;
      const resultItems = previewItems.filter((item) => item.selected
        && ['activity', 'workplan'].includes(item.targetEntity)
        && (item.extractedData.actual !== undefined || item.extractedData.completedCount !== undefined));
      const affectedIds = value.applyToAll === true ? resultItems.map((item) => item.tempId) : [target.tempId];
      const stillFires = runQualityRules({
        results: [{
          ...target.extractedData,
          id: target.tempId,
          method: value.method,
          actual: target.extractedData.actual ?? target.extractedData.completedCount,
        }],
      }).some((candidate) => candidate.rule === issue.rule);
      if (stillFires) return false;
      setPreviewItems((current) => current.map((item) => affectedIds.includes(item.tempId)
        ? { ...item, extractedData: { ...item.extractedData, method: value.method } }
        : item));
      setQualityResolutions((current) => [
        ...current.filter((entry) => entry.issueId !== issue.id),
        {
          issueId: issue.id,
          status: 'resolved',
          note: resolution.note,
          by: activeStaff.fullName,
          at: new Date().toISOString(),
          field: 'method',
          before: Object.fromEntries(affectedIds.map((id) => [id, previewItems.find((item) => item.tempId === id)?.extractedData.method])),
          after: { method: value.method, applyToAll: value.applyToAll === true, affectedIds },
        },
      ]);
      return true;
    }
    if (['QUANT-01', 'QUANT-02'].includes(issue.rule) && issue.target?.id && resolution.value && typeof resolution.value === 'object') {
      const value = resolution.value as { sentence?: unknown; actual?: unknown; activityCount?: unknown; period?: unknown; who?: unknown; activity?: unknown; place?: unknown };
      if ((value.sentence !== undefined && typeof value.sentence !== 'string')
        || typeof value.actual !== 'number' || !Number.isFinite(value.actual)) return false;
      const target = previewItems.find((item) => item.tempId === issue.target?.id);
      if (!target) return false;
      const sentence = typeof value.sentence === 'string' ? value.sentence : target.originalSnippet || target.summary;
      const extractedData: ImportPreviewItem['extractedData'] = {
        ...target.extractedData,
        actual: value.actual,
        completedCount: value.actual,
        countUnit: typeof value.who === 'string' ? value.who : 'people',
        activityCount: value.activityCount,
        reportingPeriod: value.period,
        activityDescription: value.activity,
        place: value.place,
      };
      const result = {
        ...extractedData,
        id: target.tempId,
        actual: value.actual,
        target: Number(target.extractedData.target ?? target.extractedData.targetCount) || undefined,
      };
      const stillFires = runQualityRules({
        finalReport: false,
        narrativeSections: [{ id: target.tempId, title: target.title, text: sentence, results: [result] }],
        activities: [{ ...extractedData, id: target.tempId, title: target.title, description: sentence }],
        results: [result],
      }).some((candidate) => candidate.rule === issue.rule);
      if (stillFires) return false;
      const before = target.originalSnippet || target.summary;
      setPreviewItems((current) => current.map((item) => item.tempId === target.tempId
        ? {
          ...item,
          ...(typeof value.sentence === 'string' ? { summary: sentence, originalSnippet: sentence } : {}),
          extractedData,
        }
        : item));
      setQualityResolutions((current) => [
        ...current.filter((entry) => entry.issueId !== issue.id),
        {
          issueId: issue.id,
          status: 'resolved',
          note: resolution.note,
          by: activeStaff.fullName,
          at: new Date().toISOString(),
          field: 'quantifiedActivity',
          before: { text: before, extractedData: target.extractedData },
          after: { text: sentence, extractedData },
        },
      ]);
      return true;
    }
    if (issue.rule === 'DQ-VALIDITY' && issue.target?.id && resolution.value && typeof resolution.value === 'object') {
      const validity = resolution.value as Record<string, unknown>;
      const target = previewItems.find((item) => item.tempId === issue.target?.id);
      if (!target) return false;
      const patch = (item: ImportPreviewItem) => ({ ...item, extractedData: { ...item.extractedData, validity } });
      const resultItems = previewItems.filter((item) => item.selected
        && ['activity', 'workplan'].includes(item.targetEntity)
        && (item.extractedData.actual !== undefined || item.extractedData.completedCount !== undefined));
      const affectedIds = validity.applyToAll === true ? resultItems.map((item) => item.tempId) : [target.tempId];
      const stillFires = runQualityRules({
        results: [{
          ...target.extractedData,
          id: target.tempId,
          actual: target.extractedData.actual ?? target.extractedData.completedCount,
          target: target.extractedData.target ?? target.extractedData.targetCount,
          validity,
          enteredBy: activeStaff.fullName,
        }],
      }).some((candidate) => candidate.rule === 'DQ-VALIDITY');
      if (stillFires) return false;
      setPreviewItems((current) => current.map((item) => {
        if (item.tempId === issue.target?.id) return patch(item);
        const hasResult = item.selected && ['activity', 'workplan'].includes(item.targetEntity)
          && (item.extractedData.actual !== undefined || item.extractedData.completedCount !== undefined);
        return validity.applyToAll === true && hasResult ? patch(item) : item;
      }));
      setQualityResolutions((current) => [
        ...current.filter((entry) => entry.issueId !== issue.id),
        {
          issueId: issue.id,
          status: 'resolved',
          note: resolution.note,
          by: activeStaff.fullName,
          at: new Date().toISOString(),
          field: 'validity',
          before: Object.fromEntries(affectedIds.map((id) => [id, previewItems.find((item) => item.tempId === id)?.extractedData.validity])),
          after: { validity, applyToAll: validity.applyToAll === true, affectedIds },
        },
      ]);
      return true;
    }
    if (issue.rule === 'QUANT-03' && issue.target?.id && resolution.value && typeof resolution.value === 'object') {
      const value = resolution.value as Record<string, unknown>;
      const managerApproved = isAdmin || role === 'Manager';
      const pendingApproval = value.narrativeOnly === true && !managerApproved;
      const target = previewItems.find((item) => item.tempId === issue.target?.id);
      if (!target) return false;
      const collectedMethod = (qualityCollectionMethod === 'Other' ? qualityCollectionMethodOther : qualityCollectionMethod).trim();
      const extractedData: ImportPreviewItem['extractedData'] = typeof value.indicatorId === 'string' && value.indicatorId
        ? {
          ...target.extractedData,
          indicatorId: value.indicatorId,
          ...(typeof value.actual === 'number' && Number.isFinite(value.actual) ? { actual: value.actual, completedCount: value.actual } : {}),
          ...(typeof value.unit === 'string' && value.unit.trim() ? { countUnit: value.unit.trim() } : {}),
          ...(typeof value.period === 'string' && value.period.trim() ? { reportingPeriod: value.period.trim() } : {}),
          ...(typeof value.activityCount === 'number' && Number.isFinite(value.activityCount) ? { activityCount: value.activityCount } : {}),
          ...(typeof value.activity === 'string' && value.activity.trim() ? { activityDescription: value.activity.trim() } : {}),
          ...(typeof value.place === 'string' && value.place.trim() ? { place: value.place.trim() } : {}),
          ...(qualityDataSource.trim() ? { dataSource: qualityDataSource.trim(), source: qualityDataSource.trim() } : {}),
          ...(collectedMethod ? { measurementMethod: collectedMethod, method: collectedMethod } : {}),
        }
        : { ...target.extractedData, narrativeOnly: true, narrativeOnlyReason: value.narrativeOnlyReason, managerApproved };
      const sentence = typeof value.sentence === 'string' && value.sentence.trim() ? value.sentence.trim() : undefined;
      const updatedTarget = {
        ...target,
        ...(sentence ? { summary: sentence, originalSnippet: sentence } : {}),
        extractedData,
      };
      const testActivity = { ...extractedData, id: target.tempId };
      const stillFires = runQualityRules({ activities: [testActivity] }).some((candidate) => candidate.rule === issue.rule);
      setPreviewItems((current) => current.map((item) => item.tempId === issue.target?.id ? updatedTarget : item));
      if (pendingApproval) {
        setQualityResolutions((current) => [
          ...current.filter((entry) => entry.issueId !== issue.id),
          { issueId: issue.id, status: 'pending-approval', note: resolution.note, by: activeStaff.fullName, at: new Date().toISOString() },
        ]);
        return false;
      }
      if (stillFires) return false;
      setQualityResolutions((current) => [
        ...current.filter((entry) => entry.issueId !== issue.id),
        {
          issueId: issue.id,
          status: 'resolved',
          note: resolution.note,
          by: activeStaff.fullName,
          at: new Date().toISOString(),
          field: 'quantifiedActivity',
          before: { text: target.originalSnippet || target.summary, extractedData: target.extractedData },
          after: { text: sentence || target.originalSnippet || target.summary, extractedData },
        },
      ]);
      return true;
    }
    if (issue.rule === 'FIN-TOTAL-DISAGREEMENT-01' && issue.target?.id && typeof resolution.value === 'number') {
      const target = previewItems.find((item) => item.tempId === issue.target?.id);
      if (!target) return false;
      const before = target.extractedData.budgetAmount ?? target.extractedData.statedAmount ?? target.extractedData.amount;
      const extractedData = {
        ...target.extractedData,
        budgetAmount: resolution.value,
        amount: resolution.value,
        statedAmount: resolution.value,
        typedAmount: resolution.value,
      };
      const stillFires = runQualityRules({ budgets: [{ ...extractedData, id: target.tempId }] })
        .some((candidate) => candidate.rule === issue.rule);
      if (stillFires) return false;
      setPreviewItems((current) => current.map((item) => item.tempId === issue.target?.id ? { ...item, extractedData } : item));
      setQualityResolutions((current) => [
        ...current.filter((entry) => entry.issueId !== issue.id),
        { issueId: issue.id, status: 'resolved', note: resolution.note, by: activeStaff.fullName, at: new Date().toISOString(), field: 'budgetAmount', before, after: resolution.value },
      ]);
      return true;
    }
    if (!['QUANT-02', 'NARRATIVE-PROGRAMME-01', 'NARRATIVE-TRUNCATED-01', 'NARRATIVE-TENSE-01'].includes(issue.rule)
      || typeof resolution.value !== 'string' || !issue.target?.id) return false;
    const target = previewItems.find((item) => item.tempId === issue.target?.id);
    if (!target) return false;
    const sourceText = target.originalSnippet || target.summary;
    const replacement = issue.rule === 'QUANT-02'
      ? resolution.value
      : sourceText.replace(new RegExp(String(issue.context || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), resolution.value);
    const stillFires = runQualityRules({
      narrativeSections: [{ id: issue.target.id, text: replacement }],
      options: { ukSpelling: true, programmeNames: PROGRAMMES.map((programme) => programme.name) },
    }).some((candidate) => candidate.rule === issue.rule);
    if (stillFires) return false;
    setPreviewItems((current) => current.map((item) => item.tempId !== issue.target?.id ? item : {
      ...item,
      summary: replacement,
      originalSnippet: replacement,
      userNote: resolution.note || item.userNote,
    }));
    setQualityResolutions((current) => [
      ...current.filter((entry) => entry.issueId !== issue.id),
      { issueId: issue.id, status: resolution.status, note: resolution.note, by: activeStaff.fullName, at: new Date().toISOString(), field: 'text', before: sourceText, after: replacement },
    ]);
    return true;
  };

  const applySafeImportFix = (issue: QualityIssue) => {
    if (!issue.fix?.safe || issue.fix.reversible !== true || !issue.target?.id || issue.fix.suggestedValue === undefined) return;
    const field = issue.fix.field || issue.target.field;
    if (!field) return;
    const item = previewItems.find((entry) => entry.tempId === issue.target?.id);
    if (!item) return;
    if (field === '__remove') {
      setPreviewItems((current) => current.filter((entry) => entry.tempId !== issue.target?.id));
      setQualityResolutions((current) => [
        ...current.filter((entry) => entry.issueId !== issue.id),
        { issueId: issue.id, status: 'resolved', note: 'Removed an exact duplicate preview row; the first matching row remains.', by: activeStaff.fullName, at: new Date().toISOString(), field, before: item },
      ]);
      return;
    }
    const before = field === 'text' ? item.originalSnippet : field === 'title' ? item.title : field === 'summary' ? item.summary : item.extractedData[field];
    const after = issue.fix.suggestedValue;
    setPreviewItems((current) => current.map((entry) => {
      if (entry.tempId !== issue.target?.id) return entry;
      if (field === 'text') return { ...entry, originalSnippet: String(after) };
      if (field === 'title') return { ...entry, title: String(after) };
      if (field === 'summary') return { ...entry, summary: String(after) };
      return { ...entry, extractedData: { ...entry.extractedData, [field]: after } };
    }));
    setQualityResolutions((current) => [
      ...current.filter((entry) => entry.issueId !== issue.id),
      { issueId: issue.id, status: 'resolved', note: 'Applied deterministic reversible text normalisation.', by: activeStaff.fullName, at: new Date().toISOString(), field, before, after },
    ]);
  };

  const approveNarrativeOnlyIssue = (issue: QualityIssue): boolean => {
    if (!(isAdmin || role === 'Manager') || issue.rule !== 'QUANT-03' || !issue.target?.id) return false;
    const target = previewItems.find((item) => item.tempId === issue.target?.id);
    if (!target || target.extractedData.narrativeOnly !== true
      || typeof target.extractedData.narrativeOnlyReason !== 'string'
      || target.extractedData.narrativeOnlyReason.trim().length < 10) return false;
    const extractedData = { ...target.extractedData, managerApproved: true };
    if (runQualityRules({ activities: [{ ...extractedData, id: target.tempId }] }).some((entry) => entry.rule === issue.rule)) return false;
    setPreviewItems((current) => current.map((item) => item.tempId === target.tempId ? { ...item, extractedData } : item));
    setQualityResolutions((current) => [
      ...current.filter((entry) => entry.issueId !== issue.id),
      {
        issueId: issue.id,
        status: 'resolved',
        note: target.extractedData.narrativeOnlyReason as string,
        by: activeStaff.fullName,
        at: new Date().toISOString(),
        field: 'managerApproved',
        before: target.extractedData.managerApproved,
        after: true,
      },
    ]);
    return true;
  };

  const downloadFixedImportReport = async (format: FixedReportFormat, draft: boolean) => {
    if (!selectedFile || !canEdit) throw new Error('Choose a file and check your access before downloading a fixed copy.');
    const openIssues = importQualityIssues.filter((issue) => {
      const resolution = qualityResolutions.find((entry) => entry.issueId === issue.id);
      return !resolution || !['resolved', 'overridden'].includes(resolution.status);
    });
    const openProblems = openIssues.map((issue) => ({
      severity: issue.severity,
      text: qualityMessage(issue).title,
    }));
    const changeValueText = (value: unknown, field?: string): string => {
      if (field === 'quantifiedActivity' && value && typeof value === 'object' && 'text' in value) {
        return String((value as { text: unknown }).text);
      }
      if (field === 'method') {
        if (value && typeof value === 'object' && 'method' in value) return String((value as { method: unknown }).method);
        if (value && typeof value === 'object') return Object.values(value).map((entry) => String(entry || 'No method recorded')).join('; ');
      }
      if (field === 'validity' && value && typeof value === 'object') {
        if ('validity' in value) {
          const validity = (value as { validity: Record<string, unknown> }).validity;
          const source = validity.source && typeof validity.source === 'object' ? validity.source as Record<string, unknown> : {};
          return [source.name, source.reference, validity.secondSource, validity.checkedAt].filter(Boolean).map(String).join(' · ');
        }
        return Object.values(value).map((entry) => {
          if (!entry || typeof entry !== 'object') return 'No source recorded';
          const record = entry as Record<string, unknown>;
          const source = record.source && typeof record.source === 'object' ? record.source as Record<string, unknown> : {};
          return [source.name, source.reference, record.secondSource].filter(Boolean).map(String).join(' · ') || 'No source recorded';
        }).join('; ');
      }
      return String(value);
    };
    const changes = [
      ...automaticChanges.map((change) => ({
        section: previewItems.find((item) => item.tempId === change.tempId)?.title || 'Imported section',
        originalText: change.before,
        newText: change.after,
        by: change.by,
        at: change.at,
        reason: change.reason,
      })),
      ...qualityResolutions.filter((entry) => entry.before !== undefined && entry.after !== undefined).map((entry) => ({
        section: previewItems.find((item) => item.tempId === importQualityIssues.find((issue) => issue.id === entry.issueId)?.target?.id)?.title || 'Imported section',
        originalText: changeValueText(entry.before, entry.field),
        newText: changeValueText(entry.after, entry.field),
        by: entry.by,
        at: entry.at,
        reason: entry.note || 'Reviewed and corrected.',
      })),
      ...automaticDuplicateRemovals.map((change) => ({
        section: change.removed.title || 'Imported row',
        originalText: `${change.removed.title}: ${change.removed.summary}`,
        newText: `Duplicate removed; first copy (${change.keptTempId}) retained.`,
        by: change.by,
        at: change.at,
        reason: 'Removed an exact duplicate row.',
      })),
    ];
    const sections = previewItems.filter((item) => item.selected).map((item) => {
      const text = item.originalSnippet || item.summary || '';
      return {
        title: item.title || 'Imported section',
        text,
        paragraphs: text.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean),
      };
    });
    const blob = await createFixedReport({
      title: `${selectedFile.name.replace(/\.[^.]+$/, '')} - fixed copy`,
      sections,
      changes,
      openProblems,
      format,
      draft,
    });
    const timestamp = new Date().toISOString();
    const extension = format === 'marked-docx' ? 'docx' : format;
    const fileName = `${fixedReportFileName(selectedFile.name)}.${extension}`;
    const hash = await sha256Blob(blob);
    await appendReportExport({
      id: `fixed_import_${activeStaff.uid}_${Date.now()}`,
      reportType: 'import-fixed',
      title: selectedFile.name,
      fileName,
      format,
      version: nextReportExportVersion('import-fixed'),
      hash,
      openProblems,
      overrides: qualityResolutions.filter((entry) => entry.status === 'overridden').map((entry) => ({
        issueId: entry.issueId, reason: entry.note, by: entry.by, at: entry.at,
      })),
      generatedBy: activeStaff.fullName,
      generatedByUid: activeStaff.uid,
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
  };

  const downloadOriginalImport = () => {
    if (!selectedFile) return;
    const url = URL.createObjectURL(selectedFile);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedFile.name;
    link.click();
    URL.revokeObjectURL(url);
  };

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
          {spreadsheetAnalysis && (
            <section className="rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="Spreadsheet detection">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-sky-950">Spreadsheet structure</h3>
                  <p className="mt-1 text-xs text-sky-900">
                    Detected from worksheet headers and layout. Formula cells retain both the formula and cached value.
                  </p>
                </div>
                <label className="text-xs font-semibold text-sky-950">
                  Detected kind / manual override
                  <select
                    value={spreadsheetKindOverride || spreadsheetAnalysis.detectedKind}
                    onChange={(event) => void handleSpreadsheetKindChange(event.target.value as SpreadsheetKind)}
                    className="field mt-1 min-w-52"
                  >
                    {([
                      ['budget-monthly', 'Monthly budget'],
                      ['workplan-matrix', 'Workplan matrix'],
                      ['payroll-grid', 'Payroll grid'],
                      ['back-to-school', 'Back-to-school list'],
                      ['item-list', 'Item list'],
                      ['profit-loss', 'Profit & loss'],
                      ['unknown', 'Unknown / general spreadsheet'],
                    ] as Array<[SpreadsheetKind, string]>).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {spreadsheetAnalysis.sheets.map((sheet) => {
                  const formulaCells = sheet.cells.filter((cell) => cell.formula);
                  return (
                    <details key={sheet.name} className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-stone-800">
                        {sheet.name}: {sheet.rowsRead} rows · {formulaCells.length} formula cells
                      </summary>
                      {formulaCells.length > 0 && (
                        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[11px] text-stone-700">
                          {formulaCells.map((cell) => (
                            <li key={cell.address} className="break-all font-mono">
                              {cell.address}: ={cell.formula} · cached value: {String(cell.cachedValue ?? '(empty)')}
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                  );
                })}
              </div>
              {spreadsheetPreview && previewItems.some((item) => item.selected && ['activity', 'workplan'].includes(item.targetEntity)) && (
                <div className="mt-3 space-y-2">
                  {spreadsheetPreview.sheetStats.map((sheet) => (
                    <p key={sheet.sheet} className="text-xs text-stone-800">
                      <strong>{sheet.sheet}:</strong> {sheet.rowsRead} rows read, {sheet.imported} imported, {sheet.skipped} skipped
                    </p>
                  ))}
                  {spreadsheetPreview.formulaDisagreements.length > 0 && (
                    <details className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <summary className="cursor-pointer text-xs font-bold text-amber-950">
                        {spreadsheetPreview.formulaDisagreements.length} formula cells need review
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs text-amber-950">
                        {spreadsheetPreview.formulaDisagreements.map((cell) => (
                          <li key={`${cell.sheet}-${cell.address}`} className="font-mono">
                            {cell.sheet}!{cell.address}: ={cell.formula} · cached {String(cell.cachedValue)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </section>
          )}

          {previewItems.some((item) => item.selected && ['activity', 'workplan'].includes(item.targetEntity)) && (
            <section className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
              <h3 className="text-sm font-bold text-stone-900">File-wide result defaults</h3>
              <p className="mt-1 text-xs text-stone-700">Set the source and collection method once for this import. These are applied to every imported result; only enter details supported by the file.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-stone-800">Where did these numbers come from?
                  <input className="field mt-1 w-full bg-white" value={qualityDataSource} onChange={(event) => setQualityDataSource(event.target.value)} placeholder="e.g. attendance register, school report" />
                </label>
                <label className="text-xs font-semibold text-stone-800">How were they counted?
                  <select className="field mt-1 w-full bg-white" value={qualityCollectionMethod} onChange={(event) => setQualityCollectionMethod(event.target.value)}>
                    <option value="">Choose a method</option>
                    <option>Daily register headcount</option><option>Attendance register</option><option>Receipts</option>
                    <option>School report</option><option>Bank record</option><option>I counted them myself</option><option>Other</option>
                  </select>
                </label>
                {qualityCollectionMethod === 'Other' && <label className="text-xs font-semibold text-stone-800">Describe the method
                  <input className="field mt-1 w-full bg-white" value={qualityCollectionMethodOther} onChange={(event) => setQualityCollectionMethodOther(event.target.value)} />
                </label>}
              </div>
            </section>
          )}
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4" aria-label="Automatic text changes">
            <h3 className="text-sm font-bold text-emerald-950">{automaticChanges.length + automaticDuplicateRemovals.length} automatic changes made - review</h3>
            {automaticChanges.length + automaticDuplicateRemovals.length === 0 ? (
              <p className="mt-1 text-xs text-emerald-900">No automatic changes were needed.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {automaticChanges.map((change) => (
                  <li key={change.id} className="rounded border border-emerald-200 bg-white p-2 text-xs">
                    <p className="font-semibold">{change.reason}</p>
                    <p className="mt-1 break-words text-stone-700">Before: {change.before}</p>
                    <p className="break-words text-stone-700">After: {change.after}</p>
                    <button type="button" className="mt-1 font-semibold text-teal-800 underline" onClick={() => {
                      setPreviewItems((current) => current.map((item) => item.tempId === change.tempId
                        ? { ...item, [change.field]: change.before }
                        : item));
                      setAutomaticChanges((current) => current.filter((entry) => entry.id !== change.id));
                    }}>Undo</button>
                  </li>
                ))}
                {automaticDuplicateRemovals.map((change) => (
                  <li key={change.id} className="rounded border border-emerald-200 bg-white p-2 text-xs">
                    <p className="font-semibold">Removed an exact duplicate row · kept the first matching row</p>
                    <p className="mt-1 break-words text-stone-700">Before: {change.removed.title} · {change.removed.summary}</p>
                    <p className="break-words text-stone-700">After: one copy remains ({change.keptTempId})</p>
                    <button type="button" className="mt-1 font-semibold text-teal-800 underline" onClick={() => {
                      setPreviewItems((current) => {
                        if (current.some((item) => item.tempId === change.removed.tempId)) return current;
                        const insertAt = change.restoreBeforeId ? current.findIndex((item) => item.tempId === change.restoreBeforeId) : -1;
                        if (insertAt < 0) return [...current, change.removed];
                        return [...current.slice(0, insertAt), change.removed, ...current.slice(insertAt)];
                      });
                      setAutomaticDuplicateRemovals((current) => current.filter((entry) => entry.id !== change.id));
                    }}>Undo</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <QualityCheckPanel
            issues={importQualityIssues.map((issue) => {
              const resolution = qualityResolutions.find((entry) => entry.issueId === issue.id);
              return {
                ...issue,
                ...(resolution ? {
                  status: resolution.status,
                  resolution: { note: resolution.note, by: resolution.by, at: resolution.at, before: resolution.before, after: resolution.after },
                } : {}),
              };
            })}
            scores={importQualityScores}
            currentUserName={activeStaff.fullName}
            onDownloadFixedReport={canEdit ? downloadFixedImportReport : undefined}
            onDownloadOriginal={canEdit ? downloadOriginalImport : undefined}
            onApplyFix={canEdit ? applySafeImportFix : undefined}
            onOpenIssue={openImportQualityIssue}
            onResolveIssue={canEdit ? resolveImportQualityIssue : undefined}
            onApprovePendingIssue={canEdit && (isAdmin || role === 'Manager') ? approveNarrativeOnlyIssue : undefined}
            canApproveNarrativeOnly={isAdmin || role === 'Manager'}
            onUndoFix={canEdit ? (issue) => {
              const resolution = qualityResolutions.find((entry) => entry.issueId === issue.id);
              if (resolution?.field === '__remove' && resolution.before && typeof resolution.before === 'object'
                && 'tempId' in resolution.before && typeof resolution.before.tempId === 'string') {
                const restoredItem = resolution.before as ImportPreviewItem;
                setPreviewItems((current) => current.some((item) => item.tempId === restoredItem.tempId) ? current : [...current, restoredItem]);
              }
              if (resolution?.field === 'quantifiedActivity' && resolution.before && typeof resolution.before === 'object'
                && 'text' in resolution.before && 'extractedData' in resolution.before && issue.target?.id) {
                const before = resolution.before as { text: string; extractedData: ImportPreviewItem['extractedData'] };
                setPreviewItems((current) => current.map((item) => item.tempId === issue.target?.id
                  ? { ...item, summary: before.text, originalSnippet: before.text, extractedData: before.extractedData }
                  : item));
              }
              if ((resolution?.field === 'method' || resolution?.field === 'validity')
                && resolution.before && typeof resolution.before === 'object'
                && resolution.after && typeof resolution.after === 'object'
                && 'affectedIds' in resolution.after) {
                const affectedIds = (resolution.after as { affectedIds: unknown }).affectedIds;
                if (Array.isArray(affectedIds) && affectedIds.every((id): id is string => typeof id === 'string')) {
                  const before = resolution.before as Record<string, unknown>;
                  const field = resolution.field;
                  setPreviewItems((current) => current.map((item) => {
                    if (!affectedIds.includes(item.tempId)) return item;
                    const extractedData = { ...item.extractedData };
                    if (before[item.tempId] === undefined) delete extractedData[field];
                    else extractedData[field] = before[item.tempId];
                    return { ...item, extractedData };
                  }));
                }
              }
              if (resolution && resolution.field && resolution.field !== '__remove' && issue.target?.id) {
                const field = resolution.field;
                setPreviewItems((current) => current.map((item) => {
                  if (field === 'quantifiedActivity' || field === 'method' || field === 'validity') return item;
                  if (item.tempId !== issue.target?.id) return item;
                  if (field === 'text') return { ...item, originalSnippet: resolution.before === undefined ? undefined : String(resolution.before) };
                  if (field === 'title') return { ...item, title: resolution.before === undefined ? undefined : String(resolution.before) };
                  if (field === 'summary') return { ...item, summary: resolution.before === undefined ? '' : String(resolution.before) };
                  const extractedData = { ...item.extractedData };
                  if (resolution.before === undefined) delete extractedData[field];
                  else extractedData[field] = resolution.before;
                  if (field === 'indicatorId') {
                    delete extractedData.narrativeOnly;
                    delete extractedData.narrativeOnlyReason;
                    delete extractedData.managerApproved;
                    delete extractedData.autoLinkedIndicatorId;
                    delete extractedData.autoLinkedWorkplanId;
                  }
                  return { ...item, extractedData };
                }));
              }
              setQualityResolutions((current) => current.filter((entry) => entry.issueId !== issue.id));
            } : undefined}
          />
          {importQualityIssues.some((issue) => issue.severity === 'blocker') && (
            <label className="block rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs font-semibold text-rose-950">
              Written reason for overriding unresolved blockers
              <textarea
                value={blockerOverrideReason}
                onChange={(event) => setBlockerOverrideReason(event.target.value)}
                minLength={10}
                className="field mt-2 min-h-20 w-full bg-white"
                placeholder="Explain why this import should proceed despite the listed blockers."
              />
            </label>
          )}

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
                    ref={(element) => {
                      if (element) previewCardRefs.current.set(item.tempId, element);
                      else previewCardRefs.current.delete(item.tempId);
                    }}
                    data-preview-id={item.tempId}
                    tabIndex={-1}
                    className={`w-full max-w-full min-w-0 box-border border rounded-xl p-4 transition-all ${
                      highlightedPreviewId === item.tempId ? 'ring-4 ring-amber-400 ring-offset-2' :
                      item.selected
                        ? 'border-teal-700/60 bg-teal-50/15 shadow-xs'
                        : 'border-stone-200 bg-white opacity-70'
                    }`}
                  >
                    {item.extractedData.autoLinkedIndicatorId && (
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                        <span>Exact match linked to indicator {String(item.extractedData.autoLinkedIndicatorId)}.</span>
                        <button type="button" className="font-bold underline" onClick={() => setPreviewItems((current) => current.map((entry) => {
                          if (entry.tempId !== item.tempId) return entry;
                          const extractedData = { ...entry.extractedData };
                          delete extractedData.indicatorId;
                          delete extractedData.autoLinkedIndicatorId;
                          delete extractedData.autoLinkedWorkplanId;
                          return { ...entry, extractedData };
                        }))}>Undo link</button>
                      </div>
                    )}
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

                          {item.proposedGrouping && (
                            <div className="rounded-lg border border-violet-300 bg-violet-50 p-3 text-xs text-violet-950">
                              <strong>Proposed grouping — confirmation required:</strong> {item.proposedGrouping}
                            </div>
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

                          {(item.targetEntity === 'budget' || item.targetEntity === 'workplan') &&
                            item.extractedData.spreadsheetKind !== undefined && (
                              <label className="block max-w-sm text-[11px] font-semibold text-stone-700">
                                Programme
                                <select
                                  value={item.extractedData.programmeId || ''}
                                  onChange={(event) => handleSpreadsheetProgrammeChange(item.tempId, event.target.value)}
                                  className="field mt-1 w-full"
                                >
                                  <option value="">Select programme</option>
                                  {PROGRAMMES.map((programme) => (
                                    <option key={programme.id} value={programme.id}>{programme.name}</option>
                                  ))}
                                </select>
                              </label>
                            )}

                          {item.targetEntity === 'payroll' && (
                            <label className="block max-w-sm text-[11px] font-semibold text-stone-700">
                              Match existing staff member
                              <select
                                value={item.extractedData.employeeId || ''}
                                onChange={(event) => handlePayrollStaffMatch(item.tempId, event.target.value)}
                                className="field mt-1 w-full"
                              >
                                <option value="">Select staff member (required)</option>
                                {allStaff.map((member) => (
                                  <option key={member.id} value={member.id}>{member.fullName}</option>
                                ))}
                              </select>
                            </label>
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

                          {item.differences && item.differences.length > 0 && (
                            <details className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                              <summary className="cursor-pointer text-xs font-bold text-amber-950">
                                Compare with existing workplan item
                              </summary>
                              <div className="mt-2 grid gap-1 text-xs text-amber-950">
                                {item.differences.map((difference) => (
                                  <p key={difference.field}>
                                    <strong>{difference.field}:</strong> current “{String(difference.currentVal)}” · imported “{String(difference.importedVal)}”
                                  </p>
                                ))}
                              </div>
                            </details>
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
