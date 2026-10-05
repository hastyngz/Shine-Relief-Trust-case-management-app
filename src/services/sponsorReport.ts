import type { AppDatabase } from '../types';
import { LEGACY_PROGRAMMES, PROGRAMMES, type ProgrammeId } from '../data/programmes';
import { startBadge, summariseProgramme } from './programmeSummary';
import { generateReportNarrative } from './reportNarrative';

export type SponsorReportAudience = 'Trustee' | 'Donor' | 'Sponsor';

export interface SponsorReportOptions {
  fromDate: string;
  toDate: string;
  programmeId: 'ALL' | ProgrammeId;
  audience: SponsorReportAudience;
  hideIdentifyingDetails: boolean;
}

export interface SponsorReportProgramme {
  id: ProgrammeId;
  name: string;
  headline: string;
  label: string;
  since: string;
  budgeted: number;
  actual: number;
  workplansCompleted: number;
  workplansTotal: number;
}

export interface SponsorReportData {
  audience: SponsorReportAudience;
  periodLabel: string;
  hideIdentifyingDetails: boolean;
  girlsSupported: number;
  programmeCount: number;
  budgeted: number;
  actual: number;
  workplanCompletionPercent: number;
  openWorkplans: number;
  programmes: SponsorReportProgramme[];
  narrative: string;
}

function recordDateIsInRange(date: string | undefined, fromDate: string, toDate: string): boolean {
  if (!fromDate && !toDate) return true;
  if (!date) return false;
  return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
}

function budgetRecordDate(period: string, financialYear?: string, month?: number): string | undefined {
  if (financialYear && month) return `${financialYear}-${String(month).padStart(2, '0')}-01`;
  const periodMatch = period.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
  if (periodMatch) return `${periodMatch[1]}-${periodMatch[2].padStart(2, '0')}-01`;
  const yearMatch = period.match(/\b(20\d{2})\b/) || financialYear?.match(/\b(20\d{2})\b/);
  return yearMatch ? `${yearMatch[1]}-01-01` : undefined;
}

export function assembleSponsorReport(db: AppDatabase, options: SponsorReportOptions): SponsorReportData {
  const periodLabel = options.fromDate || options.toDate
    ? `${options.fromDate || 'Beginning'} to ${options.toDate || 'Present'}`
    : 'All available dates';
  const selectedProgrammes = [...PROGRAMMES, ...LEGACY_PROGRAMMES]
    .filter((item) => options.programmeId === 'ALL' || item.id === options.programmeId);
  const inPeriodBudget = (db.budgets || []).filter((item) =>
    recordDateIsInRange(budgetRecordDate(item.period, item.financialYear, item.month), options.fromDate, options.toDate)
  );
  const inPeriodWorkplans = (db.workplans || []).filter((item) =>
    recordDateIsInRange(item.startDate || item.endDate, options.fromDate, options.toDate)
  );
  const inPeriodLogs = (db.programmeLogs || []).filter((item) =>
    recordDateIsInRange(item.date, options.fromDate, options.toDate)
  );

  const safeAggregateDb: AppDatabase = {
    ...db,
    programmeLogs: inPeriodLogs,
  };
  const programmeRows = selectedProgrammes.map((programme) => {
    const summary = summariseProgramme(safeAggregateDb, programme.id);
    const budgetLines = inPeriodBudget.filter((item) => item.programmeId === programme.id);
    const workplans = inPeriodWorkplans.filter((item) => item.programmeId === programme.id);
    return {
      id: programme.id,
      name: programme.name,
      headline: summary.value,
      label: summary.label,
      since: startBadge(programme.id, summary.fallbackStartDate).text,
      budgeted: budgetLines.reduce((sum, item) => sum + (item.budgetAmount || 0), 0),
      actual: budgetLines.reduce((sum, item) => sum + (item.actualExpenditure || 0), 0),
      workplansCompleted: workplans.filter((item) => item.status === 'Completed').length,
      workplansTotal: workplans.length,
    };
  });
  const budgeted = programmeRows.reduce((sum, item) => sum + item.budgeted, 0);
  const actual = programmeRows.reduce((sum, item) => sum + item.actual, 0);
  const workplansCompleted = programmeRows.reduce((sum, item) => sum + item.workplansCompleted, 0);
  const workplansTotal = programmeRows.reduce((sum, item) => sum + item.workplansTotal, 0);
  const openWorkplans = Math.max(0, workplansTotal - workplansCompleted);
  const girlsSupported = db.girls.filter((girl) => girl.status === 'Active').length;
  const narrative = generateReportNarrative({
    audience: options.audience,
    periodLabel,
    girlsSupported,
    programmeCount: selectedProgrammes.length,
    budgeted,
    actual,
    workplanCompletionPercent: workplansTotal ? Math.round((workplansCompleted / workplansTotal) * 100) : 0,
    openWorkplans,
  });

  return {
    audience: options.audience,
    periodLabel,
    hideIdentifyingDetails: options.hideIdentifyingDetails,
    girlsSupported,
    programmeCount: selectedProgrammes.length,
    budgeted,
    actual,
    workplanCompletionPercent: workplansTotal ? Math.round((workplansCompleted / workplansTotal) * 100) : 0,
    openWorkplans,
    programmes: programmeRows,
    narrative,
  };
}
