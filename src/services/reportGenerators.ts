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
  BorderStyle,
  ShadingType,
  ImageRun,
} from 'docx';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
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
  title: string;
  subtitle?: string;
  periodLabel: string;
  generatedBy: string;
  dateRange?: { start?: string; end?: string };
  selectedHouseholdId?: string;
  selectedGirlId?: string;
  executiveSummary?: string;
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
  };
  selectedPhotoIds?: string[];
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
  let workplans = [...(db.workplans || [])];
  let schedules = [...(db.schedules || [])];
  let photos = [...(db.attachments || [])];

  // Filter by Household if selected
  if (config.selectedHouseholdId && config.selectedHouseholdId !== 'ALL') {
    households = households.filter((h) => h.id === config.selectedHouseholdId);
    girls = girls.filter((g) => g.householdId === config.selectedHouseholdId);
    activities = activities.filter((a) => a.householdId === config.selectedHouseholdId);
    expenses = expenses.filter((e) => e.householdId === config.selectedHouseholdId);
    rent = rent.filter((r) => r.householdId === config.selectedHouseholdId);
  }

  // Filter by Girl if selected
  if (config.selectedGirlId && config.selectedGirlId !== 'ALL') {
    girls = girls.filter((g) => g.id === config.selectedGirlId);
    edu = edu.filter((e) => e.girlId === config.selectedGirlId);
    health = health.filter((h) => h.girlId === config.selectedGirlId);
    family = family.filter((f) => f.girlId === config.selectedGirlId);
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

  // Selected Photos
  if (config.selectedPhotoIds && config.selectedPhotoIds.length > 0) {
    const idSet = new Set(config.selectedPhotoIds);
    photos = photos.filter((p) => idSet.has(p.id));
  }

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
  };
}

// ============================================================================
// 1. PROFESSIONAL WORD (.DOCX) GENERATOR
// ============================================================================
export async function generateWordReport(db: AppDatabase, config: ReportConfig): Promise<Blob> {
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
              `During the reporting period (${config.periodLabel}), SHINE Relief Trust continued to deliver comprehensive community and family-centred care in Zomba District. This report details progress across our core pillars: residential and household care, secondary and primary school education tracking, medical check-ups, and holistic family reintegration support. Staff conducted active case management across all monitored households to ensure safety, health, and academic progress for all supported girls.`,
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
          ...data.edu.slice(0, 30).map(
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
          ...data.health.slice(0, 30).map(
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
          ...data.family.slice(0, 25).map(
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

  // Challenges, Recommendations, and Conclusion
  sections.push(
    createSectionHeading('9. Challenges, Recommendations & Action Items'),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text:
            config.recommendationsNotes ||
            '• School Fees & Exam Fees: Ensure timely term disbursements to prevent any classroom disruption for candidates taking MSCE and JCE examinations.\n• Health Clinic Logistics: Continue active partnerships with Zomba Central Hospital and local health centres for timely preventative health interventions.\n• Reintegration Support: Expand vocational skills linkages and caregiver counseling for households nearing transition readiness.',
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
        properties: {},
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
  if (data.girls.length > 0) {
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
  if (data.households.length > 0) {
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

  // 4. Educational Follow-ups
  if (data.edu.length > 0) {
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

  // 5. Health Follow-ups
  if (data.health.length > 0) {
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
  if (data.family.length > 0) {
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

  // 7. Household Expenses
  if (data.expenses.length > 0) {
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
  if (data.rent.length > 0) {
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

  // 9. Budgets & Variance with Excel Formulas
  if (data.budgets.length > 0) {
    // Build rows with formulas:
    // Columns: A: Period, B: Programme, C: Category, D: Description, E: Unit, F: Qty, G: Unit Cost, H: Budget Amount, I: Actual Spent, J: Variance (Budget - Actual), K: % Spent
    const budgetRows: (string | number | { f: string })[][] = [
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
        '% Spent',
        'Notes',
      ],
    ];

    data.budgets.forEach((b, idx) => {
      const rowNum = idx + 2;
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
        { f: `H${rowNum}-I${rowNum}` }, // Variance formula
        { f: `IF(H${rowNum}>0, I${rowNum}/H${rowNum}, 0)` }, // % Spent formula
        b.notes || '',
      ]);
    });

    // Add Grand Total row
    const totalRow = data.budgets.length + 2;
    budgetRows.push([
      'GRAND TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      { f: `SUM(H2:H${totalRow - 1})` },
      { f: `SUM(I2:I${totalRow - 1})` },
      { f: `SUM(J2:J${totalRow - 1})` },
      { f: `IF(H${totalRow}>0, I${totalRow}/H${totalRow}, 0)` },
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
  if (data.workplans.length > 0) {
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
  if (data.schedules.length > 0) {
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

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

// ============================================================================
// 3. PROFESSIONAL PDF GENERATOR (JSPDF + JSPDF-AUTOTABLE)
// ============================================================================
export function generatePdfReport(db: AppDatabase, config: ReportConfig): Blob {
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
    const summaryText =
      config.executiveSummary ||
      `During this reporting period (${config.periodLabel}), SHINE Relief Trust delivered holistic case management across Zomba District, covering secondary school sponsorships, primary school monitoring, clinical treatments, and family assessments.`;
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
      body: data.edu.slice(0, 25).map((e) => [
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
      body: data.health.slice(0, 25).map((h) => [
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
