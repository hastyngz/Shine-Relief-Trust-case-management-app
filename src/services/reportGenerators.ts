import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
  BorderStyle,
  ShadingType,
  ImageRun,
} from 'docx';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AppDatabase,
  Girl,
  Household,
  EducationalFollowUp,
  HealthFollowUp,
  FamilyFollowUp,
  HouseholdRentPayment,
  HouseholdExpense,
  HouseholdActivity,
  BudgetItem,
  WorkplanItem,
  ScheduleItem,
  PhotoAttachment,
} from '../types';
import { formatMWK, formatDate } from '../utils/export';
import { calculateBudgetVariance } from './financialCalculations';
import { matchesManagementProgramme } from './managementAnalytics';
import { PROGRAMMES } from '../data/programmes';
import type { QualityIssue } from './qualityRules';
import { qualityScores, runQualityRules } from './qualityRules';

// Color Palette for SHINE Relief Trust Malawi
const SHINE_COLORS = {
  primaryDark: '0F4C3A', // Forest Teal
  primaryMedium: '1A6B53',
  primaryLight: 'E6F3EF',
  accentGold: 'D97706',
  accentLight: 'FEF3C7',
  grayText: '374151',
  grayLight: 'F3F4F6',
  grayBorder: 'D1D5DB',
  white: 'FFFFFF',
};

export interface ReportConfig {
  reportType?: string;
  title: string;
  brandLogoData?: Uint8Array;
  structuredTables?: Array<{ title: string; headers: string[]; rows: Array<Array<string | number>> }>;
  subtitle?: string;
  periodLabel: string;
  generatedBy: string;
  dateRange?: { start?: string; end?: string };
  filters?: {
    programme?: string;
    school?: string;
    classLevel?: string;
    staffId?: string;
    activityId?: string;
    followUpType?: 'education' | 'health' | 'family';
    status?: string;
    category?: string;
  };
  selectedHouseholdId?: string;
  selectedGirlId?: string;
  executiveSummary?: string;
  donorFacing?: boolean;
  qualityIssues?: QualityIssue[];
  qualityScores?: { quantification: number; impact: number; dataQuality: number };
  blockerOverrideReason?: string;
  recommendationsNotes?: string;
  includeSections: {
    executiveSummary: boolean;
    statistics: boolean;
    girlsList: boolean;
    householdsList: boolean;
    educationalFollowUps: boolean;
    healthFollowUps: boolean;
    familyFollowUps: boolean;
    householdActivities: boolean;
    expenditure: boolean;
    rentPayments: boolean;
    budgets: boolean;
    workplans: boolean;
    schedules: boolean;
    photoGallery: boolean;
    caseActions?: boolean;
    caseReviews?: boolean;
  };
  selectedPhotoIds?: string[];
  maxPhotos?: number;
  photoImageData?: Record<string, Uint8Array>;
}

export function reviewReportQuality(db: AppDatabase, config: ReportConfig): QualityIssue[] {
  const reportData = filterDataForReport(db, config);
  const workplanResults = reportData.workplans.map((item) => ({
    id: item.id,
    title: item.activity,
    description: item.objective,
    indicatorId: item.indicatorId,
    target: item.targetCount,
    actual: item.completedCount,
    evidenceNote: item.notes,
    evidenceDate: item.updatedAt,
    verificationStatus: item.status === 'Completed' ? 'verified' : 'unverified',
    method: item.measurementMethod || (item.indicatorId ? 'workplan indicator' : undefined),
    source: item.dataSource,
    validity: item.validity,
  }));
  const summaryText = config.executiveSummary || (config.includeSections.executiveSummary ? buildFactualReportNarrative(db, config) : '');
  const narrativeSections = [
    ...(summaryText ? [{ id: 'report-executive-summary', title: 'Executive summary', text: summaryText, results: workplanResults }] : []),
    ...(config.structuredTables || []).map((table) => ({
      id: `report-table-${table.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: table.title,
      text: table.rows.map((row) => row.map(String).join(' ')).join('. '),
      results: workplanResults,
    })),
  ];
  return runQualityRules({
    finalReport: true,
    donorFacing: config.donorFacing === true,
    title: config.title,
    donorReport: { donorFacing: config.donorFacing === true, description: summaryText },
    narrativeSections,
    activities: [
      ...reportData.activities.map((item) => ({ title: item.activityName, description: item.description })),
      ...workplanResults,
    ],
    indicators: workplanResults,
    results: workplanResults,
    budgets: reportData.budgets,
    options: { now: new Date().toISOString(), ukSpelling: true, programmeNames: PROGRAMMES.map((programme) => programme.name), maxSentenceWords: 35 },
  });
}

function qualityAnnexRows(issues: QualityIssue[], scores: { quantification: number; impact: number; dataQuality: number }): Array<Array<string | number>> {
  return [
    ['SCORE', 'Quantification', '', `${scores.quantification}/100`, ''],
    ['SCORE', 'Impact evidence', '', `${scores.impact}/100`, ''],
    ['SCORE', 'Data quality', '', `${scores.dataQuality}/100`, ''],
    ...issues.map((issue) => [issue.severity.toUpperCase(), issue.rule, issue.location, issue.message, issue.suggestedFix || '']),
  ];
}

function assertQualityOverride(issues: QualityIssue[], reason?: string): void {
  if (issues.some((issue) => issue.severity === 'blocker') && (!reason || reason.trim().length < 10)) {
    throw new Error('Report quality blockers must be resolved or overridden with a written reason of at least 10 characters.');
  }
}

/**
 * Filter database records according to the selected report configuration
 */
export function filterDataForReport(db: AppDatabase, config: ReportConfig) {
  let girls = [...db.girls];
  let households = [...db.households];
  let edu = [...db.educationalFollowUps];
  let health = [...db.healthFollowUps];
  let family = [...db.familyFollowUps];
  let activities = [...db.householdActivities];
  let expenses = [...db.expenses];
  let rent = [...db.rentPayments];
  let budgets = [...(db.budgets || [])];
  let annualBudgets = [...(db.annualBudgets || [])];
  let payroll = [...(db.payrollRecords || [])];
  let workplans = [...(db.workplans || [])];
  let schedules = [...(db.schedules || [])];
  let photos = [...(db.attachments || [])];
  let caseActions = [...(db.caseActions || [])];
  let caseReviews = [...(db.caseReviews || [])];
  let attendance = [...(db.attendanceRecords || [])];
  let educationHistory = [...(db.educationHistory || [])];
  let examinations = [...(db.examinationRecords || [])];
  let girlLeaves = [...(db.girlLeaves || [])];

  // Filter by Household if selected
  if (config.selectedHouseholdId && config.selectedHouseholdId !== 'ALL') {
    households = households.filter((h) => h.id === config.selectedHouseholdId);
    girls = girls.filter((g) => g.householdId === config.selectedHouseholdId);
    activities = activities.filter((a) => a.householdId === config.selectedHouseholdId);
    expenses = expenses.filter((e) => e.householdId === config.selectedHouseholdId);
    rent = rent.filter((r) => r.householdId === config.selectedHouseholdId);
    const householdGirlIds = new Set(girls.map((girl) => girl.id));
    caseActions = caseActions.filter((item) => item.householdId === config.selectedHouseholdId || (!!item.girlId && householdGirlIds.has(item.girlId)));
    caseReviews = caseReviews.filter((item) => householdGirlIds.has(item.girlId));
    attendance = attendance.filter((item) => householdGirlIds.has(item.girlId));
    educationHistory = educationHistory.filter((item) => householdGirlIds.has(item.girlId));
    examinations = examinations.filter((item) => householdGirlIds.has(item.girlId));
    girlLeaves = girlLeaves.filter((item) => householdGirlIds.has(item.girlId));
  }

  // Filter by Girl if selected
  if (config.selectedGirlId && config.selectedGirlId !== 'ALL') {
    girls = girls.filter((g) => g.id === config.selectedGirlId);
    edu = edu.filter((e) => e.girlId === config.selectedGirlId);
    health = health.filter((h) => h.girlId === config.selectedGirlId);
    family = family.filter((f) => f.girlId === config.selectedGirlId);
    caseActions = caseActions.filter((item) => item.girlId === config.selectedGirlId);
    caseReviews = caseReviews.filter((item) => item.girlId === config.selectedGirlId);
    attendance = attendance.filter((item) => item.girlId === config.selectedGirlId);
    educationHistory = educationHistory.filter((item) => item.girlId === config.selectedGirlId);
    examinations = examinations.filter((item) => item.girlId === config.selectedGirlId);
    girlLeaves = girlLeaves.filter((item) => item.girlId === config.selectedGirlId);
  }

  // Filter by Date Range
  const start = config.dateRange?.start;
  const end = config.dateRange?.end;
  const inRange = (dStr?: string) => {
    if (!dStr) return true;
    if (start && dStr < start) return false;
    if (end && dStr > end) return false;
    return true;
  };

  edu = edu.filter((e) => inRange(e.date));
  health = health.filter((h) => inRange(h.date));
  family = family.filter((f) => inRange(f.date));
  activities = activities.filter((a) => inRange(a.date));
  expenses = expenses.filter((e) => inRange(e.date));
  rent = rent.filter((r) => inRange(r.datePaid));
  schedules = schedules.filter((s) => inRange(s.scheduledDate));
  caseActions = caseActions.filter((item) => inRange(item.dueDate));
  caseReviews = caseReviews.filter((item) => inRange(item.reviewDate));
  attendance = attendance.filter((item) => inRange(item.date));
  educationHistory = educationHistory.filter((item) => inRange(item.startDate || `${item.academicYear}-01-01`));
  examinations = examinations.filter((item) => inRange(`${item.examinationYear}-01-01`));
  girlLeaves = girlLeaves.filter((item) => inRange(item.startDate));

  const filters = config.filters || {};
  if (filters.school || filters.classLevel) {
    girls = girls.filter((girl) => (!filters.school || girl.school === filters.school) && (!filters.classLevel || girl.classLevel === filters.classLevel));
    const matchingGirls = new Set(girls.map((girl) => girl.id));
    edu = edu.filter((item) => matchingGirls.has(item.girlId) && (!filters.school || item.school === filters.school) && (!filters.classLevel || item.classLevel === filters.classLevel));
    health = health.filter((item) => matchingGirls.has(item.girlId));
    family = family.filter((item) => matchingGirls.has(item.girlId));
    const householdIds = new Set(girls.map((girl) => girl.householdId));
    caseActions = caseActions.filter((item) => (!!item.girlId && matchingGirls.has(item.girlId)) || (!!item.householdId && householdIds.has(item.householdId)));
    caseReviews = caseReviews.filter((item) => matchingGirls.has(item.girlId));
    attendance = attendance.filter((item) => matchingGirls.has(item.girlId));
    educationHistory = educationHistory.filter((item) => matchingGirls.has(item.girlId));
    examinations = examinations.filter((item) => matchingGirls.has(item.girlId));
    girlLeaves = girlLeaves.filter((item) => matchingGirls.has(item.girlId));
    households = households.filter((household) => householdIds.has(household.id));
    activities = activities.filter((item) => householdIds.has(item.householdId));
    expenses = expenses.filter((item) => householdIds.has(item.householdId));
    rent = rent.filter((item) => householdIds.has(item.householdId));
  }
  if (filters.programme) {
    girls = girls.filter((girl) => matchesManagementProgramme(db, filters.programme, { id: girl.id, girlId: girl.id, householdId: girl.householdId }));
    households = households.filter((household) => matchesManagementProgramme(db, filters.programme, { id: household.id, householdId: household.id }));
    edu = edu.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId }));
    health = health.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId }));
    family = family.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId }));
    activities = activities.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, householdId: item.householdId }));
    expenses = expenses.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, householdId: item.householdId, programme: item.programme, budgetLineId: item.budgetLineId }));
    rent = rent.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, householdId: item.householdId, programme: item.programme, budgetLineId: item.budgetLineId }));
    workplans = workplans.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, activityIds: item.linkedActivityIds }));
    schedules = schedules.filter((item) => matchesManagementProgramme(db, filters.programme, {
      id: item.id,
      activityId: item.targetType === 'workplan' ? item.targetId : undefined,
      girlId: item.targetType === 'girl' ? item.targetId : undefined,
      householdId: item.targetType === 'household' ? item.targetId : undefined,
    }));
    caseActions = caseActions.filter((item) => matchesManagementProgramme(db, filters.programme, {
      id: item.id, girlId: item.girlId, householdId: item.householdId, sourceId: item.sourceId,
    }));
    caseReviews = caseReviews.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId }));
    attendance = attendance.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId, activityId: item.activityId }));
    educationHistory = educationHistory.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId }));
    examinations = examinations.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId }));
    girlLeaves = girlLeaves.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId }));
    budgets = budgets.filter((item) => matchesManagementProgramme(db, filters.programme, { id: item.id, programme: item.programme, householdId: item.householdId, girlId: item.girlId, activityId: item.activityId }));
    annualBudgets = annualBudgets.filter((item) => item.programme === filters.programme);
    payroll = payroll.filter((item) => item.departmentOrProgramme === filters.programme);
  }
  if (filters.followUpType === 'education') { health = []; family = []; }
  if (filters.followUpType === 'health') { edu = []; family = []; }
  if (filters.followUpType === 'family') { edu = []; health = []; }
  if (filters.category) {
    expenses = expenses.filter((item) => item.category === filters.category || item.budgetCategory === filters.category);
    budgets = budgets.filter((item) => item.category === filters.category);
    activities = activities.filter((item) => item.activityType === filters.category);
  }
  if (filters.status) {
    girls = girls.filter((item) => item.status === filters.status);
    households = households.filter((item) => item.status === filters.status);
    workplans = workplans.filter((item) => item.status === filters.status);
    schedules = schedules.filter((item) => item.status === filters.status);
    caseActions = caseActions.filter((item) => item.status === filters.status);
    annualBudgets = annualBudgets.filter((item) => item.status === filters.status);
    payroll = payroll.filter((item) => item.paymentStatus === filters.status);
  }
  if (filters.staffId) {
    workplans = workplans.filter((item) => item.responsibleStaffId === filters.staffId);
    schedules = schedules.filter((item) => item.assignedStaffId === filters.staffId);
    caseActions = caseActions.filter((item) => item.assignedStaffId === filters.staffId);
    payroll = payroll.filter((item) => item.employeeId === filters.staffId);
  }
  if (filters.activityId) {
    activities = activities.filter((item) => item.id === filters.activityId);
    expenses = expenses.filter((item) => item.activityId === filters.activityId);
    budgets = budgets.filter((item) => item.activityId === filters.activityId);
    workplans = workplans.filter((item) => item.id === filters.activityId || item.linkedActivityIds?.includes(filters.activityId || '') === true);
    schedules = schedules.filter((item) => item.targetId === filters.activityId);
    caseActions = caseActions.filter((item) => item.sourceId === filters.activityId);
  }
  if (filters.category) photos = photos.filter((item) => item.category === filters.category);

  // Selected Photos
  if (config.selectedPhotoIds) {
    const idSet = new Set(config.selectedPhotoIds);
    photos = photos.filter((p) => idSet.has(p.id));
  }
  if (config.maxPhotos !== undefined) {
    photos = photos.slice(0, Math.max(0, config.maxPhotos));
  }
  if (config.filters?.category) photos = photos.filter((photo) => photo.category === config.filters?.category);
  if (config.filters?.activityId) photos = photos.filter((photo) => photo.targetId === config.filters?.activityId);

  return {
    girls,
    households,
    edu,
    health,
    family,
    activities,
    expenses,
    rent,
    budgets,
    workplans,
    schedules,
    photos,
    caseActions,
    caseReviews,
    attendance,
    educationHistory,
    examinations,
    girlLeaves,
  };
}

export function buildFactualReportNarrative(db: AppDatabase, config: ReportConfig): string {
  const data = filterDataForReport(db, config);
  const expenseTotal = data.expenses.reduce((sum, expense) => sum + (expense.totalCost || 0), 0);
  const rentTotal = data.rent.reduce((sum, payment) => sum + (payment.amountPaid || 0), 0);

  return [
    `For ${config.periodLabel}, the selected records contain ${data.girls.length} girl profile(s), ${data.households.length} household profile(s), ${data.edu.length} education follow-up(s), ${data.health.length} health follow-up(s), ${data.family.length} family follow-up(s), and ${data.activities.length} household activit(y/ies).`,
    `Recorded household expenses total ${formatMWK(expenseTotal)} and recorded rent payments total ${formatMWK(rentTotal)}.`,
  ].join(' ');
}

export function buildRecordedRecommendations(db: AppDatabase, config: ReportConfig): string {
  const data = filterDataForReport(db, config);
  const recommendations = [
    ...data.edu.map((item) => item.recommendations),
    ...data.health.map((item) => item.recommendations),
    ...data.family.map((item) => item.recommendations),
    ...data.activities.map((item) => item.recommendations),
  ].filter((value): value is string => !!value?.trim());
  const uniqueRecommendations = [...new Set(recommendations.map((value) => value.trim()))];

  return uniqueRecommendations.length
    ? uniqueRecommendations.map((recommendation) => `• ${recommendation}`).join('\n')
    : 'No recommendations were recorded in the selected records.';
}

// ============================================================================
// 1. PROFESSIONAL WORD (.DOCX) GENERATOR
// ============================================================================
export async function generateWordReport(db: AppDatabase, config: ReportConfig): Promise<Blob> {
  const qualityIssues = reviewReportQuality(db, config);
  const reportScores = qualityScores(qualityIssues);
  assertQualityOverride(qualityIssues, config.blockerOverrideReason);
  const data = filterDataForReport(db, config);
  const houseMap = new Map(db.households.map((h) => [h.id, h.name]));
  const girlMap = new Map(db.girls.map((g) => [g.id, g.fullName]));

  // Calculate high level numbers
  const totalExp = data.expenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
  const totalRent = data.rent.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  const totalBudget = data.budgets.reduce((sum, b) => sum + (b.budgetAmount || 0), 0);

  const sections: any[] = [];

  // Helper for Section Headings
  const createSectionHeading = (title: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 140 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 26,
          color: SHINE_COLORS.primaryDark,
        }),
      ],
    });

  // Table cell helper
  const tableCell = (
    text: string,
    isHeader = false,
    options: { width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bg?: string } = {}
  ) =>
    new TableCell({
      width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
      shading: {
        fill: options.bg || (isHeader ? SHINE_COLORS.primaryDark : SHINE_COLORS.white),
        type: ShadingType.CLEAR,
      },
      margins: { top: 120, bottom: 120, left: 140, right: 140 },
      children: [
        new Paragraph({
          alignment: options.align || AlignmentType.LEFT,
          children: [
            new TextRun({
              text,
              bold: isHeader,
              size: isHeader ? 19 : 18,
              color: isHeader ? SHINE_COLORS.white : SHINE_COLORS.grayText,
            }),
          ],
        }),
      ],
    });

  if (config.brandLogoData) {
    sections.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      children: [new ImageRun({ data: config.brandLogoData, type: 'png', transformation: { width: 72, height: 72 } })],
    }));
  }

  // Document Title and Organization Header
  sections.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'SHINE RELIEF TRUST MALAWI',
          bold: true,
          size: 32,
          color: SHINE_COLORS.primaryDark,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: 'Zomba District, Malawi • Charity Registration: TR/INC 5995 (Malawi) | UK 1139433',
          italics: true,
          size: 18,
          color: '4B5563',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 150 },
      children: [
        new TextRun({
          text: config.title.toUpperCase(),
          bold: true,
          size: 26,
          color: SHINE_COLORS.accentGold,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: `Reporting Period: ${config.periodLabel}  |  Generated on: ${new Date().toLocaleDateString('en-GB')}  |  Author: ${config.generatedBy}`,
          size: 18,
          color: '6B7280',
        }),
      ],
    })
  );

  // Executive Summary Box
  if (config.includeSections.executiveSummary) {
    sections.push(
      createSectionHeading('1. Executive Summary & Programme Overview'),
      new Paragraph({
        spacing: { after: 180 },
        children: [
          new TextRun({
            text:
              config.executiveSummary ||
              buildFactualReportNarrative(db, config),
            size: 20,
            color: SHINE_COLORS.grayText,
          }),
        ],
      })
    );
  }

  // Statistical Overview Table
  if (config.includeSections.statistics) {
    sections.push(
      createSectionHeading('2. Key Performance Indicators & Summary Metrics'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              tableCell('Programme Indicator', true, { width: 60 }),
              tableCell('Recorded Count / Total', true, { width: 40, align: AlignmentType.RIGHT }),
            ],
          }),
          new TableRow({
            children: [
              tableCell('Active Supported Girls in Programme', false),
              tableCell(`${data.girls.length} girls`, false, { align: AlignmentType.RIGHT }),
            ],
          }),
          new TableRow({
            children: [
              tableCell('Active Households / Residential Units', false),
              tableCell(`${data.households.length} homes`, false, { align: AlignmentType.RIGHT }),
            ],
          }),
          new TableRow({
            children: [
              tableCell('Educational Monitoring Sessions Conducted', false),
              tableCell(`${data.edu.length} visits`, false, { align: AlignmentType.RIGHT }),
            ],
          }),
          new TableRow({
            children: [
              tableCell('Medical & Healthcare Follow-ups', false),
              tableCell(`${data.health.length} consultations`, false, { align: AlignmentType.RIGHT }),
            ],
          }),
          new TableRow({
            children: [
              tableCell('Family & Home Reintegration Visits', false),
              tableCell(`${data.family.length} visits`, false, { align: AlignmentType.RIGHT }),
            ],
          }),
          new TableRow({
            children: [
              tableCell('Household Group Activities Completed', false),
              tableCell(`${data.activities.length} sessions`, false, { align: AlignmentType.RIGHT }),
            ],
          }),
          new TableRow({
            children: [
              tableCell('Total Household Operational Expenses', false),
              tableCell(formatMWK(totalExp), false, { align: AlignmentType.RIGHT }),
            ],
          }),
          new TableRow({
            children: [
              tableCell('Total Rent Disbursed to Landlords', false),
              tableCell(formatMWK(totalRent), false, { align: AlignmentType.RIGHT }),
            ],
          }),
          new TableRow({
            children: [
              tableCell('Total Operational Outlay (Expenses + Rent)', false, { bg: SHINE_COLORS.accentLight }),
              tableCell(formatMWK(totalExp + totalRent), false, {
                align: AlignmentType.RIGHT,
                bg: SHINE_COLORS.accentLight,
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  }

  // Girls Roster
  if (config.includeSections.girlsList && data.girls.length > 0) {
    sections.push(
      createSectionHeading('3. Supported Girls Caseload'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              tableCell('ID', true, { width: 12 }),
              tableCell('Full Name', true, { width: 25 }),
              tableCell('Status', true, { width: 15 }),
              tableCell('Household', true, { width: 20 }),
              tableCell('School & Class', true, { width: 28 }),
            ],
          }),
          ...data.girls.map(
            (g) =>
              new TableRow({
                children: [
                  tableCell(g.id, false),
                  tableCell(g.fullName, false),
                  tableCell(g.status, false),
                  tableCell(houseMap.get(g.householdId) || g.householdId, false),
                  tableCell(`${g.school || '—'} (${g.classLevel || '—'})`, false),
                ],
              })
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  }

  // Educational Follow-ups
  if (config.includeSections.educationalFollowUps && data.edu.length > 0) {
    sections.push(
      createSectionHeading('4. Educational Monitoring & Term Progress'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              tableCell('Date', true, { width: 14 }),
              tableCell('Girl Name', true, { width: 22 }),
              tableCell('School & Class', true, { width: 22 }),
              tableCell('Support Provided', true, { width: 22 }),
              tableCell('Outcome / Next Steps', true, { width: 20 }),
            ],
          }),
          ...data.edu.map(
            (e) =>
              new TableRow({
                children: [
                  tableCell(formatDate(e.date), false),
                  tableCell(girlMap.get(e.girlId) || e.girlId, false),
                  tableCell(`${e.school} (${e.classLevel})`, false),
                  tableCell(e.supportProvided || '—', false),
                  tableCell(e.progressOutcome || e.recommendations || '—', false),
                ],
              })
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  }

  // Health Follow-ups
  if (config.includeSections.healthFollowUps && data.health.length > 0) {
    sections.push(
      createSectionHeading('5. Health Care & Medical Interventions'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              tableCell('Date', true, { width: 14 }),
              tableCell('Girl Name', true, { width: 22 }),
              tableCell('Health Complaint', true, { width: 24 }),
              tableCell('Medical Facility', true, { width: 20 }),
              tableCell('Treatment & Outcome', true, { width: 20 }),
            ],
          }),
          ...data.health.map(
            (h) =>
              new TableRow({
                children: [
                  tableCell(formatDate(h.date), false),
                  tableCell(girlMap.get(h.girlId) || h.girlId, false),
                  tableCell(h.healthIssueComplaint || h.reasonForVisit || '—', false),
                  tableCell(h.medicalFacility || '—', false),
                  tableCell(`${h.treatmentProvided || ''} - ${h.outcome || ''}`, false),
                ],
              })
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  }

  // Family Follow-ups
  if (config.includeSections.familyFollowUps && data.family.length > 0) {
    sections.push(
      createSectionHeading('6. Family Assessments & Home Reintegration'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              tableCell('Date', true, { width: 15 }),
              tableCell('Girl Name', true, { width: 25 }),
              tableCell('Contact Type', true, { width: 20 }),
              tableCell('Family Situation & Challenges', true, { width: 40 }),
            ],
          }),
          ...data.family.map(
            (f) =>
              new TableRow({
                children: [
                  tableCell(formatDate(f.date), false),
                  tableCell(girlMap.get(f.girlId) || f.girlId, false),
                  tableCell(f.contactType, false),
                  tableCell(`${f.familySituation || ''}. Challenges: ${f.challengesOrConcerns || 'None reported'}`, false),
                ],
              })
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  }

  if (config.includeSections.caseActions && data.caseActions.length > 0) {
    sections.push(
      createSectionHeading('Case Actions & Follow-up Tasks'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: ['Due date', 'Action', 'Responsible staff', 'Priority', 'Status', 'Completion'].map((header) => tableCell(header, true)) }),
          ...data.caseActions.map((action) => new TableRow({ children: [
            tableCell(formatDate(action.dueDate)), tableCell(action.title), tableCell(action.assignedStaffName),
            tableCell(action.priority), tableCell(action.status), tableCell(action.completionNotes || '—'),
          ] })),
        ],
      })
    );
  }

  if (config.includeSections.caseReviews && data.caseReviews.length > 0) {
    sections.push(
      createSectionHeading('Case Reviews'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: ['Review date', 'Girl', 'Education', 'Health', 'Family', 'Progress', 'Challenges', 'Action plan', 'Next review'].map((header) => tableCell(header, true)) }),
          ...data.caseReviews.map((review) => new TableRow({ children: [
            tableCell(formatDate(review.reviewDate)), tableCell(girlMap.get(review.girlId) || review.girlId),
            tableCell(review.education || '—'), tableCell(review.health || '—'), tableCell(review.family || '—'),
            tableCell(review.progress || '—'), tableCell(review.challenges || '—'), tableCell(review.actionPlan || '—'),
            tableCell(formatDate(review.nextReviewDate)),
          ] })),
        ],
      })
    );
  }

  // Budgets & Expenditure
  if (config.includeSections.budgets && data.budgets.length > 0) {
    sections.push(
      createSectionHeading('7. Budgets & Financial Allocations'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              tableCell('Period', true, { width: 15 }),
              tableCell('Category', true, { width: 20 }),
              tableCell('Item Description', true, { width: 35 }),
              tableCell('Qty x Unit Cost', true, { width: 15 }),
              tableCell('Budget (MWK)', true, { width: 15, align: AlignmentType.RIGHT }),
            ],
          }),
          ...data.budgets.map(
            (b) =>
              new TableRow({
                children: [
                  tableCell(b.period, false),
                  tableCell(b.category, false),
                  tableCell(b.itemDescription, false),
                  tableCell(`${b.quantity} ${b.unit} @ ${formatMWK(b.unitCost)}`, false),
                  tableCell(formatMWK(b.budgetAmount), false, { align: AlignmentType.RIGHT }),
                ],
              })
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  }

  // Workplans
  if (config.includeSections.workplans && data.workplans.length > 0) {
    sections.push(
      createSectionHeading('8. Strategic Workplans & Implementation Progress'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              tableCell('Activity', true, { width: 25 }),
              tableCell('Responsible', true, { width: 20 }),
              tableCell('Target / Unit', true, { width: 20 }),
              tableCell('Status', true, { width: 15 }),
              tableCell('Progress', true, { width: 20, align: AlignmentType.RIGHT }),
            ],
          }),
          ...data.workplans.map(
            (w) =>
              new TableRow({
                children: [
                  tableCell(w.activity, false),
                  tableCell(w.responsibleStaffName, false),
                  tableCell(`${w.completedCount || 0} / ${w.targetCount} ${w.unit}`, false),
                  tableCell(w.status, false),
                  tableCell(`${w.progress}%`, false, { align: AlignmentType.RIGHT }),
                ],
              })
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  }

  const qualityTable = {
    title: 'Quality Issues',
    headers: ['Severity / score', 'Rule', 'Location', 'Finding', 'Suggested action'],
    rows: qualityAnnexRows(qualityIssues, reportScores),
  };
  [...(config.structuredTables || []), qualityTable].forEach((reportTable, index) => {
    if (reportTable.headers.length === 0) return;
    sections.push(
      createSectionHeading(`${index + 1}. ${reportTable.title}`),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: reportTable.headers.map((header) => tableCell(header, true)),
          }),
          ...reportTable.rows.map((row) => new TableRow({
            children: reportTable.headers.map((header, column) => {
              const value = row[column] ?? '';
              const displayValue = typeof value === 'number' && /MWK|amount|salary|gratuity|budget|actual|variance|expenditure/i.test(header)
                ? formatMWK(value)
                : String(value);
              return tableCell(displayValue);
            }),
          })),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  });

  if (config.includeSections.photoGallery && data.photos.length > 0) {
    const photoSections: any[] = [createSectionHeading('9. Authorized Photos & Attachment References')];
    data.photos.forEach((photo) => {
      const image = config.photoImageData?.[photo.id];
      if (image) {
        photoSections.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 180, after: 60 },
          children: [new ImageRun({
            data: image,
            type: photo.contentType === 'image/png' ? 'png' : 'jpg',
            transformation: { width: 390, height: 260 },
          })],
        }));
        const context = photo.targetType === 'girl'
          ? girlMap.get(photo.targetId)
          : photo.targetType === 'household'
            ? houseMap.get(photo.targetId)
            : data.activities.find((activity) => activity.id === photo.targetId)?.activityName;
        photoSections.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [new TextRun({
            text: [photo.caption?.trim() || `${photo.category} photo`, context, photo.date].filter(Boolean).join(' | '),
            size: 18,
            color: SHINE_COLORS.grayText,
          })],
        }));
      }
    });
    photoSections.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              tableCell('File', true, { width: 24 }),
              tableCell('Record type', true, { width: 20 }),
              tableCell('Record ID', true, { width: 18 }),
              tableCell('Category / date', true, { width: 20 }),
              tableCell('Caption', true, { width: 18 }),
            ],
          }),
          ...data.photos.map((photo) => new TableRow({
            children: [
              tableCell(photo.fileName, false),
              tableCell(photo.targetType, false),
              tableCell(photo.targetId, false),
              tableCell(`${photo.category} · ${photo.date}`, false),
              tableCell(photo.caption || '', false),
            ],
          })),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
    sections.push(...photoSections);
  }

  // Challenges, Recommendations, and Conclusion
  sections.push(
    createSectionHeading('10. Challenges, Recommendations & Action Items'),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text:
            config.recommendationsNotes ||
            buildRecordedRecommendations(db, config),
          size: 20,
          color: SHINE_COLORS.grayText,
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: 'Report Signatures & Authorisation:',
          bold: true,
          size: 20,
          color: SHINE_COLORS.primaryDark,
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            tableCell('Prepared by: ________________________\nCase Worker / Field Lead\nDate: ________________________', false, { width: 50 }),
            tableCell('Approved by: ________________________\nTrust Director / Administrator\nDate: ________________________', false, { width: 50 }),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'SHINE RELIEF TRUST', bold: true, size: 16, color: SHINE_COLORS.primaryDark })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: `${config.title} | Page `, size: 16, color: '6B7280' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '6B7280' }),
              ],
            })],
          }),
        },
        children: sections,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

// ============================================================================
// 2. PROFESSIONAL MULTI-SHEET EXCEL (.XLSX) GENERATOR
// ============================================================================
export function generateExcelWorkbook(db: AppDatabase, config: ReportConfig): Uint8Array {
  const qualityIssues = reviewReportQuality(db, config);
  const reportScores = qualityScores(qualityIssues);
  assertQualityOverride(qualityIssues, config.blockerOverrideReason);
  const data = filterDataForReport(db, config);
  const houseMap = new Map(db.households.map((h) => [h.id, h.name]));
  const girlMap = new Map(db.girls.map((g) => [g.id, g.fullName]));

  const wb = XLSX.utils.book_new();

  // 1. Executive Summary Sheet
  const totalExp = data.expenses.reduce((s, e) => s + (e.totalCost || 0), 0);
  const totalRent = data.rent.reduce((s, r) => s + (r.amountPaid || 0), 0);
  const summaryRows = [
    ['SHINE RELIEF TRUST MALAWI - CASE MANAGEMENT & OPERATIONS REPORT'],
    ['Charity Registration: TR/INC 5995 (Malawi) | UK 1139433 | Zomba, Malawi'],
    [''],
    ['Report Title', config.title],
    ['Period', config.periodLabel],
    ['Exported Date', new Date().toISOString().slice(0, 10)],
    ['Generated By', config.generatedBy],
    [''],
    ['KEY PERFORMANCE INDICATORS', 'RECORDED VALUE', 'UNIT'],
    ['Total Supported Girls', data.girls.length, 'Girls'],
    ['Active Households Monitored', data.households.length, 'Houses'],
    ['Educational Follow-ups Conducted', data.edu.length, 'Follow-up sessions'],
    ['Health & Medical Treatments', data.health.length, 'Medical consultations'],
    ['Family & Home Visits', data.family.length, 'Family visits'],
    ['Household Activities Conducted', data.activities.length, 'Group activities'],
    ['Total Recorded Expenses (MWK)', totalExp, 'MWK'],
    ['Total Rent Disbursed (MWK)', totalRent, 'MWK'],
    ['Total Combined Cash Outlay (MWK)', totalExp + totalRent, 'MWK'],
    ['Active Budget Lines', data.budgets.length, 'Budget items'],
    ['Strategic Workplan Targets', data.workplans.length, 'Workplans'],
    ['Upcoming Field Schedules', data.schedules.length, 'Schedules'],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 38 }, { wch: 25 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // 2. Girls Roster
  if (config.includeSections.girlsList && data.girls.length > 0) {
    const girlsData = data.girls.map((g) => ({
      'Girl ID': g.id,
      'Full Name': g.fullName,
      Status: g.status,
      'Date of Birth': g.dateOfBirth || '',
      'Date Admitted': g.dateAdmitted || '',
      Household: houseMap.get(g.householdId) || g.householdId,
      School: g.school || '',
      'Class Level': g.classLevel || '',
      'Guardian Name': g.guardianInfo?.name || '',
      'Guardian Relation': g.guardianInfo?.relationship || '',
      'Guardian Phone': g.guardianInfo?.phone || '',
      'Guardian Location': g.guardianInfo?.villageOrLocation || '',
      'Guardian Situation': g.guardianInfo?.situationNotes || '',
    }));
    const wsGirls = XLSX.utils.json_to_sheet(girlsData);
    wsGirls['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsGirls, 'Girls Roster');
  }

  // 3. Households
  if (config.includeSections.householdsList && data.households.length > 0) {
    const houseData = data.households.map((h) => ({
      'House ID': h.id,
      'House Name': h.name,
      Status: h.status,
      Location: h.location || '',
      'House Mum / Lead': h.houseMum || '',
      'House Mum Phone': h.houseMumPhone || '',
      'Monthly Rent (MWK)': h.monthlyRentCost || 0,
      Notes: h.notes || '',
    }));
    const wsHouse = XLSX.utils.json_to_sheet(houseData);
    wsHouse['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsHouse, 'Households');
  }

  if (config.includeSections.householdActivities && data.activities.length > 0) {
    const activityData = data.activities.map((item) => ({
      'Activity ID': item.id,
      Date: item.date,
      Household: houseMap.get(item.householdId) || item.householdId,
      Activity: item.activityName,
      Type: item.activityType,
      Location: item.location || '',
      Participants: item.participantCount,
      Description: item.description,
      Outcome: item.outcome || '',
      Challenges: item.challenges || '',
      'Support provided': item.supportProvided || '',
      Recommendations: item.recommendations || '',
      'Further action required': item.furtherActionRequired ? 'Yes' : 'No',
      'Next follow-up': item.nextFollowUpDate || '',
    }));
    const sheet = XLSX.utils.json_to_sheet(activityData);
    sheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 40 }, { wch: 36 }, { wch: 36 }, { wch: 36 }, { wch: 36 }, { wch: 20 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Household Activities');
  }

  // 4. Educational Follow-ups
  if (config.includeSections.educationalFollowUps && data.edu.length > 0) {
    const eduData = data.edu.map((e) => ({
      'Follow-up ID': e.id,
      Date: e.date,
      'Girl ID': e.girlId,
      'Girl Name': girlMap.get(e.girlId) || e.girlId,
      School: e.school,
      Class: e.classLevel,
      'Academic Issue': e.academicIssue || '',
      'Problems Experienced': e.problemsExperienced || '',
      'Subjects Needing Support': e.subjectsNeedingSupport || '',
      'Support Provided': e.supportProvided || '',
      'Progress Outcome': e.progressOutcome || '',
      Recommendations: e.recommendations || '',
      'Further Action Required': e.furtherActionRequired ? 'YES' : 'NO',
      'Recorded By': e.recordedBy || '',
    }));
    const wsEdu = XLSX.utils.json_to_sheet(eduData);
    wsEdu['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 22 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsEdu, 'Education Follow-ups');
  }

  if (config.includeSections.educationalFollowUps && data.educationHistory.length > 0) {
    const historyData = data.educationHistory.map((item) => ({
      'Record ID': item.id,
      'Girl ID': item.girlId,
      'Academic year': item.academicYear,
      School: item.school,
      'Class / form': item.classLevel,
      'Start date': item.startDate || '',
      'End date': item.endDate || '',
      Status: item.status,
      'Reason for change': item.reasonForChange || '',
      Notes: item.notes || '',
    }));
    const sheet = XLSX.utils.json_to_sheet(historyData);
    sheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 32 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Education History');
  }

  if (config.includeSections.educationalFollowUps && data.examinations.length > 0) {
    const examData = data.examinations.map((item) => ({
      'Record ID': item.id,
      'Girl ID': item.girlId,
      Examination: item.examinationType,
      Year: item.examinationYear,
      Subjects: (item.subjects || []).map((subject) => `${subject.subject}: ${subject.result || ''}`).join('; '),
      Outcome: item.overallOutcome || '',
      'Support required': item.supportRequired || '',
      Notes: item.notes || '',
    }));
    const sheet = XLSX.utils.json_to_sheet(examData);
    sheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 44 }, { wch: 28 }, { wch: 32 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Examinations');
  }

  if (config.includeSections.educationalFollowUps && data.attendance.length > 0) {
    const attendanceData = data.attendance.map((item) => ({
      'Record ID': item.id,
      Date: item.date,
      'Girl ID': item.girlId,
      Activity: item.activityName,
      'Activity type': item.activityType,
      Location: item.location || '',
      Status: item.status,
      Notes: item.notes || '',
      'Recorded by': item.recordedBy,
    }));
    const sheet = XLSX.utils.json_to_sheet(attendanceData);
    sheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 36 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Attendance');
  }

  if (config.includeSections.educationalFollowUps && data.girlLeaves.length > 0) {
    const leaveData = data.girlLeaves.map((item) => ({
      'Record ID': item.id,
      'Girl ID': item.girlId,
      'Leave type': item.leaveType,
      'Start date': item.startDate,
      'Expected return': item.expectedReturnDate,
      'Actual return': item.actualReturnDate || '',
      Reason: item.reason,
      Status: item.status,
      'Approved by': item.approvedBy,
      Notes: item.notes || '',
    }));
    const sheet = XLSX.utils.json_to_sheet(leaveData);
    sheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 36 }, { wch: 14 }, { wch: 22 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Leave and Absence');
  }

  // 5. Health Follow-ups
  if (config.includeSections.healthFollowUps && data.health.length > 0) {
    const healthData = data.health.map((h) => ({
      'Follow-up ID': h.id,
      Date: h.date,
      'Girl ID': h.girlId,
      'Girl Name': girlMap.get(h.girlId) || h.girlId,
      'Reason For Visit': h.reasonForVisit || '',
      'Health Complaint': h.healthIssueComplaint || '',
      'Medical Facility': h.medicalFacility || '',
      'Treatment Provided': h.treatmentProvided || '',
      Outcome: h.outcome || '',
      'Next Follow-up Date': h.nextFollowUpDate || '',
      'Recorded By': h.recordedBy || '',
    }));
    const wsHealth = XLSX.utils.json_to_sheet(healthData);
    wsHealth['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 22 }, { wch: 25 }, { wch: 22 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsHealth, 'Health Follow-ups');
  }

  // 6. Family Follow-ups
  if (config.includeSections.familyFollowUps && data.family.length > 0) {
    const famData = data.family.map((f) => ({
      'Follow-up ID': f.id,
      Date: f.date,
      'Girl ID': f.girlId,
      'Girl Name': girlMap.get(f.girlId) || f.girlId,
      'Contact Type': f.contactType,
      'Family Situation': f.familySituation || '',
      Challenges: f.challengesOrConcerns || '',
      'Support Provided': f.supportProvided || '',
      'Recorded By': f.recordedBy || '',
    }));
    const wsFam = XLSX.utils.json_to_sheet(famData);
    wsFam['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 30 }, { wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsFam, 'Family Follow-ups');
  }

  if (config.includeSections.caseActions && data.caseActions.length > 0) {
    const caseActionRows = data.caseActions.map((action) => ({
      'Action ID': action.id, 'Due Date': action.dueDate, Action: action.title,
      'Girl ID': action.girlId || '', 'Household ID': action.householdId || '',
      'Assigned Staff': action.assignedStaffName, Priority: action.priority, Status: action.status,
      'Completion Notes': action.completionNotes || '',
    }));
    const sheet = XLSX.utils.json_to_sheet(caseActionRows);
    sheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Case Actions');
  }

  if (config.includeSections.caseReviews && data.caseReviews.length > 0) {
    const caseReviewRows = data.caseReviews.map((review) => ({
      'Review ID': review.id, 'Review Date': review.reviewDate, Girl: girlMap.get(review.girlId) || review.girlId,
      Education: review.education || '', Health: review.health || '', Family: review.family || '',
      Progress: review.progress || '', Challenges: review.challenges || '', 'Action Plan': review.actionPlan || '',
      'Next Review': review.nextReviewDate || '',
    }));
    const sheet = XLSX.utils.json_to_sheet(caseReviewRows);
    sheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 32 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Case Reviews');
  }

  // 7. Household Expenses
  if (config.includeSections.expenditure && data.expenses.length > 0) {
    const expData = data.expenses.map((e) => ({
      'Expense ID': e.id,
      Date: e.date,
      Household: houseMap.get(e.householdId) || e.householdId,
      Category: e.category,
      Description: e.itemDescription || '',
      Quantity: e.quantity || '',
      'Unit Cost (MWK)': e.unitCost || 0,
      'Total Cost (MWK)': e.totalCost || 0,
      Supplier: e.supplier || '',
      Notes: e.notes || '',
      'Recorded By': e.createdBy || '',
    }));
    const wsExp = XLSX.utils.json_to_sheet(expData);
    wsExp['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 25 }, { wch: 10 }, { wch: 15 }, { wch: 16 }, { wch: 18 }, { wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsExp, 'Expenses');
  }

  // 8. Rent Payments
  if (config.includeSections.rentPayments && data.rent.length > 0) {
    const rentData = data.rent.map((r) => ({
      'Payment ID': r.id,
      'Payment Date': r.datePaid,
      Household: houseMap.get(r.householdId) || r.householdId,
      'For Month/Year': r.monthCovered,
      'Amount Paid (MWK)': r.amountPaid,
      Status: r.paymentStatus,
      'Receipt / Ref Number': r.receiptNumber || '',
      Notes: r.notes || '',
      'Recorded By': r.createdBy || '',
    }));
    const wsRent = XLSX.utils.json_to_sheet(rentData);
    wsRent['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsRent, 'Rent Payments');
  }

  // 9. Budgets & Variance
  if (config.includeSections.budgets && data.budgets.length > 0) {
    const budgetRows: (string | number)[][] = [
      [
        'Period',
        'Programme',
        'Category',
        'Item Description',
        'Unit',
        'Quantity',
        'Unit Cost (MWK)',
        'Budget (MWK)',
        'Actual Spent (MWK)',
        'Variance (MWK)',
        'Variance %',
        'Notes',
      ],
    ];

    let totalBudget = 0;
    let totalActual = 0;
    data.budgets.forEach((b) => {
      const variance = calculateBudgetVariance(b.budgetAmount, b.actualExpenditure || 0);
      totalBudget += variance.budgeted;
      totalActual += variance.actual;
      budgetRows.push([
        b.period,
        b.programme,
        b.category,
        b.itemDescription,
        b.unit,
        b.quantity,
        b.unitCost,
        b.budgetAmount,
        b.actualExpenditure || 0,
        variance.variance,
        variance.variancePercent === null ? 'N/A' : variance.variancePercent / 100,
        b.notes || '',
      ]);
    });

    const totalVariance = calculateBudgetVariance(totalBudget, totalActual);
    budgetRows.push([
      'GRAND TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      totalVariance.budgeted,
      totalVariance.actual,
      totalVariance.variance,
      totalVariance.variancePercent === null ? 'N/A' : totalVariance.variancePercent / 100,
      'Summary Total',
    ]);

    const wsBudget = XLSX.utils.aoa_to_sheet(budgetRows);
    wsBudget['!cols'] = [
      { wch: 14 },
      { wch: 22 },
      { wch: 18 },
      { wch: 28 },
      { wch: 12 },
      { wch: 10 },
      { wch: 15 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, wsBudget, 'Budgets & Variance');
  }

  // 10. Workplans
  if (config.includeSections.workplans && data.workplans.length > 0) {
    const wkpData = data.workplans.map((w) => ({
      'Plan ID': w.id,
      Period: w.period,
      Activity: w.activity,
      Objective: w.objective,
      'Target Count': w.targetCount,
      Unit: w.unit,
      'Completed Count': w.completedCount || 0,
      'Progress %': `${w.progress}%`,
      Status: w.status,
      'Responsible Staff': w.responsibleStaffName,
      'Start Date': w.startDate,
      'End Date': w.endDate,
      Location: w.location,
      Notes: w.notes || '',
    }));
    const wsWkp = XLSX.utils.json_to_sheet(wkpData);
    wsWkp['!cols'] = [
      { wch: 10 },
      { wch: 14 },
      { wch: 25 },
      { wch: 30 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      { wch: 18 },
      { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, wsWkp, 'Workplans');
  }

  // 11. Schedules
  if (config.includeSections.schedules && data.schedules.length > 0) {
    const schData = data.schedules.map((s) => ({
      'Schedule ID': s.id,
      Date: s.scheduledDate,
      Time: s.scheduledTime || '',
      Type: s.type,
      Title: s.title,
      Target: s.targetName || '',
      Location: s.location || '',
      'Assigned Staff': s.assignedStaffName,
      Status: s.status,
      Notes: s.notes || '',
    }));
    const wsSch = XLSX.utils.json_to_sheet(schData);
    wsSch['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 25 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsSch, 'Schedules');
  }

  for (const sheetName of wb.SheetNames.filter((name) => name !== 'Executive Summary')) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const header = String(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]?.v || '');
      const numberFormat = /%|percent|achievement/i.test(header)
        ? '0.0%'
        : /MWK|budget|actual|variance|expenditure|amount|salary|gratuity|cost/i.test(header)
          ? '"MWK" #,##0;[Red]-"MWK" #,##0'
          : undefined;
      if (!numberFormat) continue;
      for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell && typeof cell.v === 'number') cell.z = numberFormat;
      }
    }
  }

  const qualitySheet = XLSX.utils.aoa_to_sheet([
    ['Severity / score', 'Rule', 'Location', 'Finding', 'Suggested action'],
    ...qualityAnnexRows(qualityIssues, reportScores),
  ]);
  qualitySheet['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 36 }, { wch: 72 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, qualitySheet, 'Quality Issues');

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

// ============================================================================
// 3. PROFESSIONAL PDF GENERATOR (JSPDF + JSPDF-AUTOTABLE)
// ============================================================================
export function generatePdfReport(db: AppDatabase, config: ReportConfig): Blob {
  const qualityIssues = reviewReportQuality(db, config);
  const reportScores = qualityScores(qualityIssues);
  assertQualityOverride(qualityIssues, config.blockerOverrideReason);
  const data = filterDataForReport(db, config);
  const houseMap = new Map(db.households.map((h) => [h.id, h.name]));
  const girlMap = new Map(db.girls.map((g) => [g.id, g.fullName]));

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 40;

  // Header Banner
  doc.setFillColor(15, 76, 58); // Forest Teal #0F4C3A
  doc.rect(0, 0, pageWidth, 75, 'F');
  if (config.brandLogoData) doc.addImage(config.brandLogoData, 'PNG', pageWidth - 92, 12, 48, 48);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('SHINE RELIEF TRUST MALAWI', 40, 32);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Zomba District, Malawi • Charity Registration: TR/INC 5995 (Malawi) | UK 1139433', 40, 48);
  doc.text(`Official Document | Reporting Period: ${config.periodLabel}`, 40, 62);

  currentY = 95;

  // Report Title
  doc.setTextColor(15, 76, 58);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(config.title, 40, currentY);
  currentY += 18;

  doc.setTextColor(107, 114, 128);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated By: ${config.generatedBy} • Export Date: ${new Date().toLocaleDateString('en-GB')}`, 40, currentY);
  currentY += 20;

  // Executive Summary
  if (config.includeSections.executiveSummary) {
    doc.setTextColor(15, 76, 58);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Executive Summary', 40, currentY);
    currentY += 14;

    doc.setTextColor(55, 65, 81);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const summaryText = config.executiveSummary || buildFactualReportNarrative(db, config);
    const splitSummary = doc.splitTextToSize(summaryText, pageWidth - 80);
    doc.text(splitSummary, 40, currentY);
    currentY += splitSummary.length * 12 + 15;
  }

  // KPI Statistics Table
  if (config.includeSections.statistics) {
    const totalExp = data.expenses.reduce((s, e) => s + (e.totalCost || 0), 0);
    const totalRent = data.rent.reduce((s, r) => s + (r.amountPaid || 0), 0);

    autoTable(doc, {
      startY: currentY,
      head: [['Key Performance Indicator', 'Recorded Value']],
      body: [
        ['Supported Girls in Caseload', `${data.girls.length} girls`],
        ['Monitored Households / Homes', `${data.households.length} homes`],
        ['Educational Monitoring Follow-ups', `${data.edu.length} sessions`],
        ['Healthcare Interventions & Clinic Visits', `${data.health.length} consultations`],
        ['Family Visits & Home Reintegrations', `${data.family.length} visits`],
        ['Group Household Activities Completed', `${data.activities.length} sessions`],
        ['Total Recorded Household Expenses', formatMWK(totalExp)],
        ['Total Rent Payments Disbursed', formatMWK(totalRent)],
        ['Total Operational Outlay (Rent + Expenses)', formatMWK(totalExp + totalRent)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [15, 76, 58], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [55, 65, 81] },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 160, halign: 'right' } },
      margin: { left: 40, right: 40 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;
  }

  // Girls List
  if (config.includeSections.girlsList && data.girls.length > 0) {
    if (currentY > 650) {
      doc.addPage();
      currentY = 40;
    }
    doc.setTextColor(15, 76, 58);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Supported Girls Profile Summary', 40, currentY);
    currentY += 10;

    autoTable(doc, {
      startY: currentY,
      head: [['ID', 'Full Name', 'Status', 'Household', 'School', 'Class']],
      body: data.girls.map((g) => [
        g.id,
        g.fullName,
        g.status,
        houseMap.get(g.householdId) || g.householdId,
        g.school || '—',
        g.classLevel || '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 76, 58], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 40, right: 40 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;
  }

  // Educational Follow-ups
  if (config.includeSections.educationalFollowUps && data.edu.length > 0) {
    if (currentY > 650) {
      doc.addPage();
      currentY = 40;
    }
    doc.setTextColor(15, 76, 58);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Educational Monitoring Highlights', 40, currentY);
    currentY += 10;

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Girl Name', 'School & Class', 'Support Provided', 'Outcome']],
      body: data.edu.map((e) => [
        formatDate(e.date),
        girlMap.get(e.girlId) || e.girlId,
        `${e.school} (${e.classLevel})`,
        e.supportProvided || '—',
        e.progressOutcome || '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 76, 58], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 40, right: 40 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;
  }

  // Health Follow-ups
  if (config.includeSections.healthFollowUps && data.health.length > 0) {
    if (currentY > 650) {
      doc.addPage();
      currentY = 40;
    }
    doc.setTextColor(15, 76, 58);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Health & Medical Interventions', 40, currentY);
    currentY += 10;

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Girl Name', 'Complaint / Reason', 'Facility', 'Treatment & Outcome']],
      body: data.health.map((h) => [
        formatDate(h.date),
        girlMap.get(h.girlId) || h.girlId,
        h.healthIssueComplaint || h.reasonForVisit || '—',
        h.medicalFacility || '—',
        `${h.treatmentProvided || ''} (${h.outcome || ''})`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 76, 58], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 40, right: 40 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;
  }

  // Family Follow-ups
  if (config.includeSections.familyFollowUps && data.family.length > 0) {
    if (currentY > 650) {
      doc.addPage();
      currentY = 40;
    }
    doc.setTextColor(15, 76, 58);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('5. Family & Guardian Follow-ups', 40, currentY);
    currentY += 10;

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Girl Name', 'Contact Type', 'Family Situation & Support']],
      body: data.family.map((f) => [
        formatDate(f.date),
        girlMap.get(f.girlId) || f.girlId,
        f.contactType,
        `${f.familySituation || ''}. Support: ${f.supportProvided || 'None recorded'}`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 76, 58], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 40, right: 40 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;
  }

  if (config.includeSections.caseActions && data.caseActions.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Due date', 'Action', 'Assigned staff', 'Priority', 'Status']],
      body: data.caseActions.map((action) => [formatDate(action.dueDate), action.title, action.assignedStaffName, action.priority, action.status]),
      theme: 'striped',
      headStyles: { fillColor: [15, 76, 58], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 40, right: 40 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 20;
  }

  if (config.includeSections.caseReviews && data.caseReviews.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Review date', 'Girl', 'Education', 'Family', 'Progress', 'Challenges', 'Action plan']],
      body: data.caseReviews.map((review) => [formatDate(review.reviewDate), girlMap.get(review.girlId) || review.girlId, review.education || '', review.family || '', review.progress || '', review.challenges || '', review.actionPlan || '']),
      theme: 'striped',
      headStyles: { fillColor: [15, 76, 58], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 40, right: 40 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 20;
  }

  if (config.includeSections.photoGallery && config.photoImageData) {
    const selectedPhotos = data.photos.filter((photo) => !!config.photoImageData?.[photo.id]);
    if (selectedPhotos.length > 0) {
      doc.addPage();
      currentY = 48;
      doc.setTextColor(15, 76, 58);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Authorized Photo Highlights', 40, currentY);
      currentY += 20;

      for (const photo of selectedPhotos) {
        const image = config.photoImageData[photo.id];
        const imageFormat = photo.contentType === 'image/png' ? 'PNG' : 'JPEG';
        const dimensions = doc.getImageProperties(image);
        const scale = Math.min((pageWidth - 80) / dimensions.width, 300 / dimensions.height);
        const imageWidth = dimensions.width * scale;
        const imageHeight = dimensions.height * scale;
        const caption = [
          photo.caption?.trim() || `${photo.category} photo`,
          photo.targetType === 'girl' ? girlMap.get(photo.targetId) : undefined,
          photo.targetType === 'household' ? houseMap.get(photo.targetId) : undefined,
          data.activities.find((activity) => activity.id === photo.targetId)?.activityName,
          photo.date,
        ].filter(Boolean).join(' | ');
        const captionLines = doc.splitTextToSize(caption, pageWidth - 80);
        if (currentY + imageHeight + captionLines.length * 12 + 20 > 790) {
          doc.addPage();
          currentY = 48;
        }
        doc.addImage(image, imageFormat, (pageWidth - imageWidth) / 2, currentY, imageWidth, imageHeight);
        currentY += imageHeight + 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(55, 65, 81);
        doc.text(captionLines, 40, currentY);
        currentY += captionLines.length * 12 + 20;
      }
    }
  }

  doc.addPage();
  currentY = 48;
  doc.setTextColor(15, 76, 58);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Quality Issues and Evidence Scores', 40, currentY);
  autoTable(doc, {
    startY: currentY + 12,
    head: [['Severity / score', 'Rule', 'Location', 'Finding', 'Suggested action']],
    body: qualityAnnexRows(qualityIssues, reportScores).map((row) => row.map(String)),
    theme: 'grid',
    headStyles: { fillColor: [15, 76, 58], textColor: [255, 255, 255], fontSize: 7 },
    bodyStyles: { fontSize: 6.5 },
    margin: { left: 40, right: 40 },
  });

  // Footer on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(`SHINE Relief Trust Malawi • Confidential Case Management Record • Page ${i} of ${totalPages}`, 40, 820);
  }

  return doc.output('blob');
}
