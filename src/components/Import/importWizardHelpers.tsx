import React, { useState } from 'react';
import {
  AppDatabase,
  ImportPreviewItem,
  DocxClassification,
} from '../../types';
import { ContactCandidate } from '../../services/contactsService';
import { ImportedSpreadsheetLine } from '../../services/spreadsheetImport/importers';
import { spreadsheetEmployeeLineToPreview } from '../../services/spreadsheetImport/employeePreview';

/**
 * Pure helpers, small presentational pieces and shared option lists used by the
 * Data Import Wizard. Extracted from DataImportWizard.tsx with no logic changes.
 */

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

export function spreadsheetLineToPreview(
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
  if (line.kind === 'employee') {
    return spreadsheetEmployeeLineToPreview(line);
  }
  if (line.kind === 'payroll') {
    return {
      tempId: id,
      resultType: line.status === 'matched' ? 'NEW_RECORD' : 'POSSIBLE_DUPLICATE_PERSON',
      targetEntity: 'payroll',
      classification: 'STAFF_PAYROLL_RECORD',
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

export const PhotoPreview: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
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

export const CLASSIFICATION_OPTIONS: Array<{ value: DocxClassification; label: string }> = [
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
  { value: 'STAFF_PAYROLL_RECORD', label: 'O. Staff Payroll / Salary Record' },
];
