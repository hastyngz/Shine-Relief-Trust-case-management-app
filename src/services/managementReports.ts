import type { AppDatabase, SalaryHistoryRecord, StaffUser } from '../types';
import * as XLSX from 'xlsx';
import { calculateBudgetVariance } from './financialCalculations';
import { buildManagementAnalytics, ManagementFilters, matchesManagementProgramme } from './managementAnalytics';
import { calculateGratuity } from './gratuityService';
import { calculateBudgetForecast, calculateFeedingCostInsight, calculateMarketPriceInsight } from './intelligenceService';

export const MANAGEMENT_REPORTS = [
  { id: 'management-summary', label: 'Management Summary' },
  { id: 'monthly-management', label: 'Monthly Management Report' },
  { id: 'quarterly-management', label: 'Quarterly Management Report' },
  { id: 'annual-management', label: 'Annual Management Report' },
  { id: 'case-management', label: 'Girls / Case Management Summary' },
  { id: 'girl-history', label: 'Girl Activity / Follow-up History' },
  { id: 'case-reviews', label: 'Case Review Report' },
  { id: 'attendance', label: 'Attendance Report' },
  { id: 'employee', label: 'Employee Report' },
  { id: 'salary-history', label: 'Salary History Report' },
  { id: 'households', label: 'Household Management Summary' },
  { id: 'education', label: 'Education Summary' },
  { id: 'health', label: 'Health Summary' },
  { id: 'family', label: 'Family / Guardian Follow-up Summary' },
  { id: 'staff-workload', label: 'Staff Workload Report' },
  { id: 'workplan-progress', label: 'Workplan Progress Report' },
  { id: 'programme-indicators', label: 'Programme Indicator Report' },
  { id: 'programme-activity', label: 'Programme Activity Report' },
  { id: 'annual-budget', label: 'Annual Budget Report' },
  { id: 'budget-actual', label: 'Budget vs Actual Report' },
  { id: 'monthly-budget', label: 'Monthly Budget Report' },
  { id: 'expenditure-category', label: 'Expenditure by Category' },
  { id: 'expenditure-programme', label: 'Expenditure by Programme' },
  { id: 'payroll', label: 'Payroll Report' },
  { id: 'gratuity', label: 'Gratuity Liability Report' },
  { id: 'contract-expiry', label: 'Contract Expiry Report' },
  { id: 'household-expenditure', label: 'Household Expenditure Report' },
  { id: 'outstanding-actions', label: 'Outstanding Actions Report' },
  { id: 'feeding-program', label: 'Feeding Programme Report' },
  { id: 'market-prices', label: 'Market Price Intelligence Report' },
  { id: 'budget-forecast', label: 'Budget Forecast Report' },
] as const;

export type ManagementReportId = (typeof MANAGEMENT_REPORTS)[number]['id'];
export type ReportCell = string | number;

const inRange = (date: string | undefined, filters: ManagementFilters) => !!date &&
  (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate);

const inFinancialPeriod = (date: string | undefined, financialYear?: string, month?: number) => {
  if (!date) return !financialYear && !month;
  return (!financialYear || date.startsWith(financialYear)) && (!month || Number(date.slice(5, 7)) === month);
};

function getCoveredMonthDate(monthCovered: string, fallbackDate: string): string {
  const match = monthCovered.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return fallbackDate;
  const monthNumber = new Date(`${match[1]} 1, ${match[2]}`).getMonth() + 1;
  return `${match[2]}-${String(monthNumber).padStart(2, '0')}-01`;
}

function coveredMonthInRange(monthDate: string, filters: ManagementFilters): boolean {
  if (!filters.startDate && !filters.endDate) return true;
  const [year, month] = monthDate.slice(0, 7).split('-').map(Number);
  const monthStart = `${monthDate.slice(0, 7)}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return (!filters.endDate || monthStart <= filters.endDate) && (!filters.startDate || monthEnd >= filters.startDate);
}

export function buildManagementReportRows(
  reportId: ManagementReportId,
  db: AppDatabase,
  filters: ManagementFilters = {},
  staff: StaffUser[] = [],
  salaryHistory?: SalaryHistoryRecord[],
  today = new Date().toISOString().slice(0, 10)
): { headers: string[]; rows: ReportCell[][] } {
  const girls = db.girls.filter((girl) => (!filters.householdId || girl.householdId === filters.householdId) && (!filters.school || girl.school === filters.school) && (!filters.classLevel || girl.classLevel === filters.classLevel) && matchesManagementProgramme(db, filters.programme, { girlId: girl.id }));
  const girlIds = new Set(girls.map((girl) => girl.id));
  const householdIds = new Set((db.households || []).filter((house) => (!filters.householdId || house.id === filters.householdId) && matchesManagementProgramme(db, filters.programme, { householdId: house.id })).map((house) => house.id));
  const actionRecords = (db.caseActions || []).filter((item) => (!filters.householdId || (item.householdId ? householdIds.has(item.householdId) : !!item.girlId && girlIds.has(item.girlId))) && matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId, householdId: item.householdId, sourceId: item.sourceId }) && (!filters.startDate || item.dueDate >= filters.startDate) && (!filters.endDate || item.dueDate <= filters.endDate) && (!filters.staffId || item.assignedStaffId === filters.staffId) && (!filters.status || item.status === filters.status) && (!filters.priority || item.priority === filters.priority));
  const expenseRecords = (db.expenses || []).filter((item) => householdIds.has(item.householdId) && inRange(item.date, filters) && inFinancialPeriod(item.financialYear ? `${item.financialYear}-${item.date.slice(5, 7)}` : item.date, filters.financialYear, filters.month) && matchesManagementProgramme(db, filters.programme, { id: item.id, householdId: item.householdId, programme: item.programme, budgetLineId: item.budgetLineId }) && (!filters.category || item.budgetCategory === filters.category || item.category === filters.category));
  const budgetRecords = (db.budgets || []).filter((item) => {
    const month = item.period?.match(/^\d{4}-\d{2}/)?.[0] || (item.financialYear ? `${item.financialYear}-${String(item.month || 1).padStart(2, '0')}` : undefined);
    return (!month || coveredMonthInRange(`${month}-01`, filters)) && (!filters.householdId || item.householdId === filters.householdId) && matchesManagementProgramme(db, filters.programme, { id: item.id, programme: item.programme, householdId: item.householdId, girlId: item.girlId, activityId: item.activityId }) && (!filters.category || item.category === filters.category) && (!filters.financialYear || item.financialYear === filters.financialYear || item.period?.startsWith(filters.financialYear)) && (!filters.month || item.month === filters.month);
  });
  const rentRecords = (db.rentPayments || []).filter((item) => householdIds.has(item.householdId) && ((filters.financialYear || filters.month) || coveredMonthInRange(getCoveredMonthDate(item.monthCovered, item.datePaid), filters)) && inFinancialPeriod(getCoveredMonthDate(item.monthCovered, item.datePaid), filters.financialYear, filters.month) && matchesManagementProgramme(db, filters.programme, { id: item.id, householdId: item.householdId, programme: item.programme, budgetLineId: item.budgetLineId }));
  const analytics = buildManagementAnalytics(db, filters, staff, today);
  const headersAndRows = (headers: string[], rows: ReportCell[][]) => ({ headers, rows });

  switch (reportId) {
    case 'management-summary':
    case 'monthly-management':
    case 'quarterly-management':
    case 'annual-management': {
      const data = analytics;
      const gratuityCalculationDate = filters.endDate || today;
      let accruedGratuity = 0;
      let gratuityAvailable = !!salaryHistory;
      for (const person of staff.filter((employee) => employee.contractStartDate && employee.employeeCategory)) {
        const history = (salaryHistory || []).filter((record) => record.employeeId === person.uid || record.employeeId === person.id);
        if (!history.length) {
          gratuityAvailable = false;
          break;
        }
        try {
          accruedGratuity += calculateGratuity({ id: person.uid, employeeCategory: person.employeeCategory!, contractStartDate: person.contractStartDate!, employmentPeriodId: person.employmentPeriods?.[0]?.id }, gratuityCalculationDate, history).totalGratuity;
        } catch {
          gratuityAvailable = false;
          break;
        }
      }
      const rows: ReportCell[][] = [
        ['Reporting period', `${filters.startDate || 'All available dates'} to ${filters.endDate || 'present'}`],
        ['Girls', data.cases.totalGirls], ['Active girls', data.cases.activeGirls], ['Girls on leave', data.cases.onLeaveGirls],
        ['Completed or left girls', data.cases.completedOrLeftGirls], ['Households', data.cases.totalHouseholds], ['Active households', data.cases.activeHouseholds],
        ['Open case actions', data.cases.openActions], ['Overdue case actions', data.cases.overdueActions], ['Education follow-ups', data.education.outstandingFollowUps],
        ['Health follow-ups requiring action', data.health.outstandingFollowUps], ['Family follow-ups', data.family.followUps],
        ['Household activities', data.family.communityActivities], ['Approved budget', data.finance.approvedBudget], ['Budget-line actual', data.finance.actualExpenditure],
        ['Remaining approved budget', data.finance.remainingBudget], ['Payroll expected', data.finance.payrollExpected], ['Payroll paid', data.finance.payrollPaid],
        ['Household expenditure', data.finance.householdExpenditure], ['Accrued gratuity', gratuityAvailable ? accruedGratuity : 'Unavailable: salary history incomplete'],
        ['Active staff', data.staff.length], ['Active workplans', data.workplans.active], ['Planned workplans', data.workplans.planned],
        ['Completed workplans', data.workplans.completed], ['Delayed workplans', data.workplans.delayed], ['Upcoming assignments', data.workplans.upcoming],
        ...data.workplans.byProgramme.map((item) => [`Workplans · ${item.programme}`, item.count] as ReportCell[]),
        ...data.finance.budgetPerformance.filter((item) => item.dimension === 'Programme').map((item) => [`Budget vs actual · ${item.key.replace(/^Programme: /, '')}`, `${item.budget} budgeted; ${item.actual} actual`] as ReportCell[]),
      ];
      return headersAndRows(['Measure', 'Value'], rows);
    }
    case 'case-management':
      return headersAndRows(['Girl ID', 'Name', 'Status', 'Household ID', 'School', 'Class'], girls.map((girl) => [girl.id, girl.fullName, girl.status, girl.householdId, girl.school, girl.classLevel]));
    case 'girl-history': {
      const rows: ReportCell[][] = [
        ...(db.educationalFollowUps || []).filter((item) => girlIds.has(item.girlId) && inRange(item.date, filters)).map((item) => [item.date, item.girlId, 'Education follow-up', item.school, item.classLevel, item.supportProvided || '', item.progressOutcome || '', item.recommendations || ''] as ReportCell[]),
        ...(db.healthFollowUps || []).filter((item) => girlIds.has(item.girlId) && inRange(item.date, filters)).map((item) => [item.date, item.girlId, 'Health follow-up', '', '', item.treatmentProvided || '', item.outcome || '', item.recommendations || ''] as ReportCell[]),
        ...(db.familyFollowUps || []).filter((item) => girlIds.has(item.girlId) && inRange(item.date, filters)).map((item) => [item.date, item.girlId, 'Family follow-up', '', '', item.supportProvided || '', item.familySituation || '', item.recommendations || ''] as ReportCell[]),
        ...(db.attendanceRecords || []).filter((item) => girlIds.has(item.girlId) && inRange(item.date, filters)).map((item) => [item.date, item.girlId, 'Attendance', item.activityName, '', '', item.status, item.notes || ''] as ReportCell[]),
        ...(db.educationHistory || []).filter((item) => girlIds.has(item.girlId) && inRange(item.startDate || `${item.academicYear}-01-01`, filters)).map((item) => [item.startDate || item.academicYear, item.girlId, 'Education history', item.school, item.classLevel, '', item.status, item.notes || ''] as ReportCell[]),
        ...(db.caseActions || []).filter((item) => !!item.girlId && girlIds.has(item.girlId) && inRange(item.dueDate, filters)).map((item) => [item.dueDate, item.girlId!, 'Case action', '', '', item.title, item.status, item.completionNotes || ''] as ReportCell[]),
      ].sort((left, right) => String(left[0]).localeCompare(String(right[0])));
      return headersAndRows(['Date', 'Girl ID', 'Record type', 'School / activity', 'Class', 'Support / action', 'Outcome / status', 'Recommendations / notes'], rows);
    }
    case 'case-reviews':
      return headersAndRows(['Review ID', 'Girl ID', 'Review date', 'Current situation', 'Education', 'Health', 'Family', 'Progress', 'Challenges', 'Support required', 'Action plan', 'Next review'], (db.caseReviews || []).filter((item) => girlIds.has(item.girlId) && inRange(item.reviewDate, filters)).map((item) => [item.id, item.girlId, item.reviewDate, item.currentSituation || '', item.education || '', item.health || '', item.family || '', item.progress || '', item.challenges || '', item.supportRequired || '', item.actionPlan || '', item.nextReviewDate || '']));
    case 'attendance':
      return headersAndRows(['Record ID', 'Date', 'Girl ID', 'Activity', 'Activity type', 'Location', 'Status', 'Notes'], (db.attendanceRecords || []).filter((item) => girlIds.has(item.girlId) && inRange(item.date, filters) && (!filters.status || item.status === filters.status)).map((item) => [item.id, item.date, item.girlId, item.activityName, item.activityType, item.location || '', item.status, item.notes || '']));
    case 'employee':
      return headersAndRows(['Employee ID', 'Name', 'Email', 'Role', 'Position', 'Employment status', 'Contract type', 'Contract start', 'Contract end', 'Contract status'], staff.filter((person) => !filters.staffId || person.uid === filters.staffId || person.id === filters.staffId).map((person) => [person.uid, person.fullName, person.email, person.role, person.position || person.departmentOrTitle || '', person.employmentStatus || '', person.contractType || '', person.contractStartDate || '', person.contractEndDate || '', person.contractStatus || '']));
    case 'salary-history':
      return headersAndRows(['Employee ID', 'Employee', 'Effective date', 'Salary amount', 'Salary frequency', 'Employment period', 'Change reason', 'Recorded by', 'Recorded date'], (salaryHistory || []).filter((record) => (!filters.staffId || record.employeeId === filters.staffId) && (!filters.startDate || record.effectiveDate >= filters.startDate) && (!filters.endDate || record.effectiveDate <= filters.endDate)).map((record) => [record.employeeId, staff.find((person) => person.uid === record.employeeId || person.id === record.employeeId)?.fullName || record.employeeId, record.effectiveDate, record.salaryAmount, record.salaryFrequency, record.employmentPeriodId || '', record.reasonForChange, record.recordedBy, record.recordedDate]));
    case 'households':
      return headersAndRows(['Household ID', 'Household', 'Status', 'Location', 'Girls', 'Monthly rent', 'Rent paid in period', 'Unpaid rent records', 'Partially paid rent records', 'Expenditure'], (db.households || []).filter((house) => householdIds.has(house.id)).map((house) => [house.id, house.name, house.status, house.location, db.girls.filter((girl) => girl.householdId === house.id).length, house.monthlyRentCost, rentRecords.filter((rent) => rent.householdId === house.id).reduce((sum, rent) => sum + rent.amountPaid, 0), rentRecords.filter((rent) => rent.householdId === house.id && rent.paymentStatus === 'Not paid').length, rentRecords.filter((rent) => rent.householdId === house.id && rent.paymentStatus === 'Partially paid').length, expenseRecords.filter((expense) => expense.householdId === house.id).reduce((sum, expense) => sum + expense.totalCost, 0)]));
    case 'education': {
      const rows = (db.educationalFollowUps || []).filter((item) => girlIds.has(item.girlId) && inRange(item.date, filters) && matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId })).map((item) => [item.id, item.girlId, item.date, item.school, item.classLevel, item.academicIssue, item.furtherActionRequired ? 'Yes' : 'No', item.nextFollowUpDate || '']);
      return headersAndRows(['Record ID', 'Girl ID', 'Date', 'School', 'Class / form', 'Issue', 'Action required', 'Next follow-up'], rows);
    }
    case 'health': {
      const rows = (db.healthFollowUps || []).filter((item) => girlIds.has(item.girlId) && inRange(item.date, filters) && matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId })).map((item) => [item.id, item.girlId, item.date, item.furtherActionRequired ? 'Yes' : 'No', item.nextFollowUpDate || '']);
      return headersAndRows(['Record ID', 'Girl ID', 'Visit date', 'Follow-up required', 'Next follow-up'], rows);
    }
    case 'family':
      return headersAndRows(['Record ID', 'Girl ID', 'Date', 'Contact type', 'Further action required', 'Next follow-up'], (db.familyFollowUps || []).filter((item) => girlIds.has(item.girlId) && inRange(item.date, filters) && matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId })).map((item) => [item.id, item.girlId, item.date, item.contactType, item.furtherActionRequired ? 'Yes' : 'No', item.nextFollowUpDate || '']));
    case 'staff-workload':
      return headersAndRows(['Employee', 'Role', 'Position', 'Assigned girls/cases', 'Assigned households', 'Open work', 'In-progress work', 'Overdue work', 'High-priority work', 'Upcoming assignments', 'Case reviews due', 'Workplans', 'Completed work'], analytics.staff.filter((item) => !filters.staffId || item.id === filters.staffId).map((item) => [item.name, item.role, item.position, item.assignedGirls, item.assignedHouseholds, item.openTasks, item.inProgressTasks, item.overdueTasks, item.highPriorityTasks, item.upcomingTasks, item.reviewsDue, item.workplans, item.completedTasks]));
    case 'workplan-progress':
      return headersAndRows(['Workplan ID', 'Programme', 'Activity', 'Responsible staff', 'Start', 'End', 'Status', 'Target', 'Achievement', 'Completion %', 'Budget', 'Actual', 'Remaining'], analytics.workplans.performance.map((item) => [item.id, item.programme || 'Not attributed', item.activity, item.staffName, item.startDate, item.endDate, item.status, item.plannedActivities, item.completedActivities, item.completionPercent, item.plannedBudget, item.actualExpenditure, item.remainingBudget]));
    case 'programme-indicators': {
      const records = (db.workplans || []).filter((item) =>
        (!filters.startDate || item.endDate >= filters.startDate) &&
        (!filters.endDate || item.startDate <= filters.endDate) &&
        (!filters.staffId || item.responsibleStaffId === filters.staffId) &&
        (!filters.status || item.status === filters.status) &&
        matchesManagementProgramme(db, filters.programme, { id: item.id, activityIds: item.linkedActivityIds })
      );
      return headersAndRows(['Indicator / workplan objective', 'Activity', 'Programme', 'Period', 'Target', 'Recorded achievement', 'Achievement %', 'Reporting period'], records.map((item) => [item.objective, item.activity, matchesManagementProgramme(db, filters.programme, { id: item.id, activityIds: item.linkedActivityIds }) ? filters.programme || 'Stored attribution' : 'Unattributed', item.period, item.targetCount, item.completedCount ?? 0, item.targetCount > 0 ? ((item.completedCount ?? 0) / item.targetCount) * 100 : 'N/A', `${filters.startDate || item.startDate} to ${filters.endDate || item.endDate}`]));
    }
    case 'programme-activity': {
      const activityRows: ReportCell[][] = (db.householdActivities || []).filter((item) => householdIds.has(item.householdId) && inRange(item.date, filters) && matchesManagementProgramme(db, filters.programme, { id: item.id, householdId: item.householdId })).map((item) => [item.id, 'Household activity', item.activityName, item.activityType, item.date, item.location || '', item.householdId, item.participantCount ?? 'Not recorded', item.furtherActionRequired ? 'Yes' : 'No']);
      const scheduleRows: ReportCell[][] = (db.schedules || []).filter((item) => inRange(item.scheduledDate, filters) && (!filters.householdId || (item.targetType === 'household' && item.targetId === filters.householdId)) && (!filters.staffId || item.assignedStaffId === filters.staffId) && matchesManagementProgramme(db, filters.programme, { id: item.id, activityId: item.targetType === 'workplan' ? item.targetId : undefined, householdId: item.targetType === 'household' ? item.targetId : undefined, girlId: item.targetType === 'girl' ? item.targetId : undefined })).map((item) => [item.id, 'Scheduled activity', item.title, item.type, item.scheduledDate, item.location || '', item.targetId || '', item.assignedStaffName, item.status]);
      return headersAndRows(['Record ID', 'Record type', 'Activity', 'Activity type', 'Date', 'Recorded location', 'Household / target ID', 'Participants / assigned staff', 'Status / action'], [...activityRows, ...scheduleRows]);
    }
    case 'annual-budget':
      return headersAndRows(['Budget ID', 'Financial year', 'Title', 'Programme', 'Status', 'Approved amount', 'Approval date', 'Approved by'], (db.annualBudgets || []).filter((item) => (!filters.financialYear || item.financialYear === filters.financialYear) && (!filters.programme || item.programme === filters.programme)).map((item) => [item.id, item.financialYear, item.title, item.programme, item.status, item.approvedAmount, item.approvalDate || '', item.approvedBy || '']));
    case 'budget-actual':
    case 'monthly-budget':
      return headersAndRows(['Budget line ID', 'Financial year', 'Month', 'Programme', 'Category', 'Description', 'Budget', 'Actual', 'Remaining', 'Variance', 'Variance %', 'Status'], budgetRecords.map((item) => {
        const variance = calculateBudgetVariance(item.budgetAmount, item.actualExpenditure || 0);
        return [item.id, item.financialYear || '', item.month || '', item.programme, item.category, item.itemDescription, variance.budgeted, variance.actual, variance.remaining, variance.variance, variance.variancePercent === null ? 'N/A' : variance.variancePercent, variance.status];
      }));
    case 'expenditure-category': {
      const totals = new Map<string, { count: number; amount: number }>();
      for (const expense of expenseRecords) {
        const current = totals.get(expense.category) || { count: 0, amount: 0 };
        current.count += 1;
        current.amount += expense.totalCost;
        totals.set(expense.category, current);
      }
      return headersAndRows(['Category', 'Transactions', 'Actual expenditure'], [...totals.entries()].map(([category, total]) => [category, total.count, total.amount]));
    }
    case 'expenditure-programme': {
      const totals = new Map<string, { count: number; amount: number }>();
      for (const expense of expenseRecords) {
        const programme = expense.programme || 'Not attributed';
        const current = totals.get(programme) || { count: 0, amount: 0 };
        current.count += 1;
        current.amount += expense.totalCost;
        totals.set(programme, current);
      }
      return headersAndRows(['Programme attribution', 'Transactions', 'Actual expenditure'], [...totals.entries()].map(([programme, total]) => [programme, total.count, total.amount]));
    }
    case 'payroll':
      return headersAndRows(['Payroll ID', 'Employee ID', 'Employee', 'Programme', 'Pay period', 'Start', 'End', 'Expected', 'Paid', 'Outstanding', 'Payment status'], (db.payrollRecords || []).filter((item) => inRange(item.payPeriodStartDate, filters) && inFinancialPeriod(item.payPeriodStartDate, filters.financialYear, filters.month) && (!filters.programme || item.departmentOrProgramme === filters.programme) && (!filters.staffId || item.employeeId === filters.staffId)).map((item) => [item.id, item.employeeId, item.employeeName, item.departmentOrProgramme || '', item.payPeriod, item.payPeriodStartDate, item.payPeriodEndDate, item.expectedAmount, item.amountPaid, Math.max(0, item.expectedAmount - item.amountPaid), item.paymentStatus]));
    case 'gratuity': {
      if (!salaryHistory) return headersAndRows(['Status'], [['Salary-history data is unavailable']]);
      const gratuityCalculationDate = filters.endDate || today;
      const rows: ReportCell[][] = staff.filter((person) => (!filters.staffId || person.uid === filters.staffId || person.id === filters.staffId) && person.contractStartDate && person.employeeCategory).flatMap((person) => {
        const history = salaryHistory.filter((item) => (item.employeeId === person.uid || item.employeeId === person.id) && (!person.employmentPeriods?.[0]?.id || !item.employmentPeriodId || item.employmentPeriodId === person.employmentPeriods[0].id));
        if (!history.length) return [[person.uid, person.fullName, person.employeeCategory || '', person.contractStartDate || '', '', '', '', '', '', '', 'Salary history missing']];
        try {
          const gratuity = calculateGratuity({ id: person.uid, employeeCategory: person.employeeCategory!, contractStartDate: person.contractStartDate!, employmentPeriodId: person.employmentPeriods?.[0]?.id }, gratuityCalculationDate, history);
          return gratuity.salaryPeriods.map((period) => {
            const activeSalary = history.filter((record) => record.effectiveDate <= period.startDate).sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate)).at(-1);
            return [person.uid, person.fullName, person.employeeCategory || '', person.contractStartDate || '', gratuityCalculationDate, activeSalary?.effectiveDate || '', period.startDate, period.endDate, period.months, period.rate, period.gratuity, gratuity.totalGratuity, 'Calculated'];
          });
        } catch {
          return [[person.uid, person.fullName, person.employeeCategory || '', person.contractStartDate || '', today, '', '', '', '', '', '', '', 'Calculation unavailable']];
        }
      });
      return headersAndRows(['Employee ID', 'Employee', 'Category', 'Contract start', 'Calculation end', 'Salary effective date', 'Period start', 'Period end', 'Months', 'Rate', 'Gratuity for period', 'Total gratuity', 'Status'], rows);
    }
    case 'contract-expiry':
      return headersAndRows(['Employee ID', 'Employee', 'Role', 'Position', 'Contract type', 'Start date', 'End date', 'Contract status', 'Employment status'], staff.filter((person) => (!filters.staffId || person.uid === filters.staffId || person.id === filters.staffId) && (!filters.startDate || (person.contractEndDate || '') >= filters.startDate) && (!filters.endDate || (person.contractEndDate || '') <= filters.endDate)).map((person) => [person.uid, person.fullName, person.role, person.position || person.departmentOrTitle || '', person.contractType || '', person.contractStartDate || '', person.contractEndDate || '', person.contractStatus || '', person.employmentStatus || '']));
    case 'household-expenditure':
      return headersAndRows(['Expense ID', 'Household ID', 'Date', 'Category', 'Description', 'Quantity', 'Unit cost', 'Total cost', 'Programme', 'Budget line ID'], expenseRecords.map((item) => [item.id, item.householdId, item.date, item.category, item.itemDescription, item.quantity, item.unitCost, item.totalCost, item.programme || '', item.budgetLineId || '']));
    case 'outstanding-actions':
      return headersAndRows(['Action ID', 'Title', 'Description', 'Girl ID', 'Household ID', 'Assigned staff', 'Priority', 'Due date', 'Status'], actionRecords.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).map((item) => [item.id, item.title, item.description, item.girlId || '', item.householdId || '', item.assignedStaffName, item.priority, item.dueDate, item.status]));
    case 'feeding-program': {
      const logs = (db.feedingProgramLogs || []).filter((item) => inRange(item.date, filters));
      const insight = calculateFeedingCostInsight(logs);
      return headersAndRows(['Date', 'Students present', 'Meals served', 'Estimated cost', 'Actual cost', 'Cost per meal', 'Food items', 'Recorded by'], [
        ...logs.map((item) => [item.date, item.studentsPresent, item.mealsServed, item.estimatedCost, item.actualCost ?? item.estimatedCost, item.mealsServed ? (item.actualCost ?? item.estimatedCost) / item.mealsServed : 0, item.foodItems.join(', '), item.createdBy]),
        ['TOTAL', insight.studentsPresent, insight.mealsServed, '', insight.actualCost, insight.costPerMeal, `${insight.days} feeding days`, ''],
      ]);
    }
    case 'market-prices': {
      const records = (db.marketPrices || []).filter((item) => inRange(item.dateRecorded, filters));
      return headersAndRows(['Item', 'Category', 'Unit', 'Price', 'Currency', 'Date', 'Source', 'Location', 'Trend', 'Change %'], records.map((item) => {
        const insight = calculateMarketPriceInsight(records, item.itemName, item.locationOrShop);
        return [item.itemName, item.category, item.unit || '', item.price, item.currency, item.dateRecorded, item.sourceType, item.locationOrShop || '', insight?.trend || 'stable', insight?.percentageChange ?? ''];
      }));
    }
    case 'budget-forecast': {
      const forecast = calculateBudgetForecast(db.budgets || [], 1 + ((db.forecastSettings?.[0]?.inflationPercent || 0) / 100));
      return headersAndRows(['Measure', 'Value', 'Status'], [['Approved budget', forecast.approved, 'Approved'], ['Actual expenditure', forecast.actual, 'Actual'], ['Forecast expenditure', forecast.forecast, 'Forecast'], ['Remaining approved', forecast.remainingApproved, forecast.status], ['Burn rate', forecast.burnRate, 'Calculated']]);
    }
    default:
      return headersAndRows([], []);
  }
}

export function generateManagementReportWorkbook(
  reportId: ManagementReportId,
  report: { headers: string[]; rows: ReportCell[][] },
  filters: ManagementFilters,
  generatedBy: string,
  generatedAt = new Date().toISOString(),
  qualityRows: Array<Array<string | number>> = []
): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const reportLabel = MANAGEMENT_REPORTS.find((item) => item.id === reportId)?.label || reportId;
  const summary = XLSX.utils.aoa_to_sheet([
    ['SHINE Relief Trust Management Report'],
    ['Report', reportLabel],
    ['Reporting period', `${filters.startDate || 'All available dates'} to ${filters.endDate || 'present'}`],
    ['Financial year', filters.financialYear || 'All years'],
    ['Programme', filters.programme || 'All programmes'],
    ['Household', filters.householdId || 'All households'],
    ['Category', filters.category || 'All categories'],
    ['Staff member', filters.staffId || 'All staff'],
    ['Status', filters.status || 'All statuses'],
    ['Generated by', generatedBy],
    ['Generated at', generatedAt],
    ['Matching records', report.rows.length],
  ]);
  summary['!cols'] = [{ wch: 25 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, summary, 'Executive Summary');

  const sheet = XLSX.utils.aoa_to_sheet([report.headers, ...report.rows]);
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  sheet['!cols'] = report.headers.map((header, column) => {
    const contentWidth = [header, ...report.rows.slice(0, 100).map((row) => String(row[column] ?? ''))]
      .reduce((max, value) => Math.max(max, value.length), 12);
    return { wch: Math.min(contentWidth, 40) };
  });
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const header = String(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]?.v || '');
    const numberFormat = /%|percent/i.test(header)
      ? '0.0'
      : /MWK|budget|actual|variance|amount|salary|gratuity|expenditure|remaining/i.test(header)
        ? '"MWK" #,##0;[Red]-"MWK" #,##0'
        : undefined;
    if (!numberFormat) continue;
    for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell && typeof cell.v === 'number') cell.z = numberFormat;
    }
  }
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report Data');
  const qualitySheet = XLSX.utils.aoa_to_sheet([
    ['Severity / score', 'Rule', 'Location', 'Finding', 'Suggested action'],
    ...qualityRows,
  ]);
  qualitySheet['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 36 }, { wch: 72 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, qualitySheet, 'Quality Issues');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}