import type { AppDatabase, SalaryHistoryRecord, StaffUser } from '../types';
import { calculateBudgetVariance } from './financialCalculations';
import { buildManagementAnalytics, ManagementFilters, matchesManagementProgramme } from './managementAnalytics';
import { calculateGratuity } from './gratuityService';

export const MANAGEMENT_REPORTS = [
  { id: 'management-summary', label: 'Management Summary' },
  { id: 'case-management', label: 'Girls / Case Management Summary' },
  { id: 'households', label: 'Household Management Summary' },
  { id: 'education', label: 'Education Summary' },
  { id: 'health', label: 'Health Summary' },
  { id: 'family', label: 'Family / Guardian Follow-up Summary' },
  { id: 'staff-workload', label: 'Staff Workload Report' },
  { id: 'workplan-progress', label: 'Workplan Progress Report' },
  { id: 'programme-activity', label: 'Programme Activity Report' },
  { id: 'annual-budget', label: 'Annual Budget Report' },
  { id: 'budget-actual', label: 'Budget vs Actual Report' },
  { id: 'payroll', label: 'Payroll Report' },
  { id: 'gratuity', label: 'Gratuity Liability Report' },
  { id: 'contract-expiry', label: 'Contract Expiry Report' },
  { id: 'household-expenditure', label: 'Household Expenditure Report' },
  { id: 'outstanding-actions', label: 'Outstanding Actions Report' },
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

export function buildManagementReportRows(
  reportId: ManagementReportId,
  db: AppDatabase,
  filters: ManagementFilters = {},
  staff: StaffUser[] = [],
  salaryHistory?: SalaryHistoryRecord[],
  today = new Date().toISOString().slice(0, 10)
): { headers: string[]; rows: ReportCell[][] } {
  const girls = db.girls.filter((girl) => (!filters.householdId || girl.householdId === filters.householdId) && matchesManagementProgramme(db, filters.programme, { girlId: girl.id }));
  const girlIds = new Set(girls.map((girl) => girl.id));
  const householdIds = new Set((db.households || []).filter((house) => (!filters.householdId || house.id === filters.householdId) && matchesManagementProgramme(db, filters.programme, { householdId: house.id })).map((house) => house.id));
  const actionRecords = (db.caseActions || []).filter((item) => (!filters.householdId || (item.householdId ? householdIds.has(item.householdId) : !!item.girlId && girlIds.has(item.girlId))) && matchesManagementProgramme(db, filters.programme, { id: item.id, girlId: item.girlId, householdId: item.householdId, sourceId: item.sourceId }) && (!filters.startDate || item.dueDate >= filters.startDate) && (!filters.endDate || item.dueDate <= filters.endDate) && (!filters.staffId || item.assignedStaffId === filters.staffId) && (!filters.status || item.status === filters.status) && (!filters.priority || item.priority === filters.priority));
  const expenseRecords = (db.expenses || []).filter((item) => householdIds.has(item.householdId) && inFinancialPeriod(item.financialYear ? `${item.financialYear}-${item.date.slice(5, 7)}` : item.date, filters.financialYear, filters.month) && matchesManagementProgramme(db, filters.programme, { id: item.id, householdId: item.householdId, programme: item.programme, budgetLineId: item.budgetLineId }) && (!filters.category || item.budgetCategory === filters.category || item.category === filters.category));
  const budgetRecords = (db.budgets || []).filter((item) => (!filters.householdId || item.householdId === filters.householdId) && matchesManagementProgramme(db, filters.programme, { id: item.id, programme: item.programme, householdId: item.householdId, girlId: item.girlId, activityId: item.activityId }) && (!filters.category || item.category === filters.category) && (!filters.financialYear || item.financialYear === filters.financialYear || item.period?.startsWith(filters.financialYear)) && (!filters.month || item.month === filters.month));
  const rentRecords = (db.rentPayments || []).filter((item) => householdIds.has(item.householdId) && inFinancialPeriod(getCoveredMonthDate(item.monthCovered, item.datePaid), filters.financialYear, filters.month) && matchesManagementProgramme(db, filters.programme, { id: item.id, householdId: item.householdId, programme: item.programme, budgetLineId: item.budgetLineId }));
  const analytics = buildManagementAnalytics(db, filters, staff, today);
  const headersAndRows = (headers: string[], rows: ReportCell[][]) => ({ headers, rows });

  switch (reportId) {
    case 'management-summary': {
      const data = analytics;
      let accruedGratuity = 0;
      let gratuityAvailable = !!salaryHistory;
      for (const person of staff.filter((employee) => employee.contractStartDate && employee.employeeCategory)) {
        const history = (salaryHistory || []).filter((record) => record.employeeId === person.uid || record.employeeId === person.id);
        if (!history.length) {
          gratuityAvailable = false;
          break;
        }
        try {
          accruedGratuity += calculateGratuity({ id: person.uid, employeeCategory: person.employeeCategory!, contractStartDate: person.contractStartDate! }, today, history).totalGratuity;
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
    case 'programme-activity': {
      const activityRows: ReportCell[][] = (db.householdActivities || []).filter((item) => householdIds.has(item.householdId) && inRange(item.date, filters) && matchesManagementProgramme(db, filters.programme, { id: item.id, householdId: item.householdId })).map((item) => [item.id, 'Household activity', item.activityName, item.activityType, item.date, item.location || '', item.householdId, item.participantCount, item.furtherActionRequired ? 'Yes' : 'No']);
      const scheduleRows: ReportCell[][] = (db.schedules || []).filter((item) => inRange(item.scheduledDate, filters) && (!filters.householdId || (item.targetType === 'household' && item.targetId === filters.householdId)) && (!filters.staffId || item.assignedStaffId === filters.staffId) && matchesManagementProgramme(db, filters.programme, { id: item.id, activityId: item.targetType === 'workplan' ? item.targetId : undefined, householdId: item.targetType === 'household' ? item.targetId : undefined, girlId: item.targetType === 'girl' ? item.targetId : undefined })).map((item) => [item.id, 'Scheduled activity', item.title, item.type, item.scheduledDate, item.location || '', item.targetId || '', item.assignedStaffName, item.status]);
      return headersAndRows(['Record ID', 'Record type', 'Activity', 'Activity type', 'Date', 'Recorded location', 'Household / target ID', 'Participants / assigned staff', 'Status / action'], [...activityRows, ...scheduleRows]);
    }
    case 'annual-budget':
      return headersAndRows(['Budget ID', 'Financial year', 'Title', 'Programme', 'Status', 'Approved amount', 'Approval date', 'Approved by'], (db.annualBudgets || []).filter((item) => (!filters.financialYear || item.financialYear === filters.financialYear) && (!filters.programme || item.programme === filters.programme)).map((item) => [item.id, item.financialYear, item.title, item.programme, item.status, item.approvedAmount, item.approvalDate || '', item.approvedBy || '']));
    case 'budget-actual':
      return headersAndRows(['Budget line ID', 'Financial year', 'Month', 'Programme', 'Category', 'Description', 'Budget', 'Actual', 'Remaining', 'Variance', 'Variance %', 'Status'], budgetRecords.map((item) => {
        const variance = calculateBudgetVariance(item.budgetAmount, item.actualExpenditure || 0);
        return [item.id, item.financialYear || '', item.month || '', item.programme, item.category, item.itemDescription, variance.budgeted, variance.actual, variance.remaining, variance.variance, variance.variancePercent === null ? 'N/A' : variance.variancePercent, variance.status];
      }));
    case 'payroll':
      return headersAndRows(['Payroll ID', 'Employee ID', 'Employee', 'Programme', 'Pay period', 'Start', 'End', 'Expected', 'Paid', 'Outstanding', 'Payment status'], (db.payrollRecords || []).filter((item) => inFinancialPeriod(item.payPeriodStartDate, filters.financialYear, filters.month) && (!filters.programme || item.departmentOrProgramme === filters.programme) && (!filters.staffId || item.employeeId === filters.staffId)).map((item) => [item.id, item.employeeId, item.employeeName, item.departmentOrProgramme || '', item.payPeriod, item.payPeriodStartDate, item.payPeriodEndDate, item.expectedAmount, item.amountPaid, Math.max(0, item.expectedAmount - item.amountPaid), item.paymentStatus]));
    case 'gratuity': {
      if (!salaryHistory) return headersAndRows(['Status'], [['Salary-history data is unavailable']]);
      const rows: ReportCell[][] = staff.filter((person) => (!filters.staffId || person.uid === filters.staffId || person.id === filters.staffId) && person.contractStartDate && person.employeeCategory).map((person) => {
        const history = salaryHistory.filter((item) => item.employeeId === person.uid || item.employeeId === person.id);
        if (!history.length) return [person.uid, person.fullName, person.employeeCategory || '', person.contractStartDate || '', '', 'Salary history missing'];
        try {
          const gratuity = calculateGratuity({ id: person.uid, employeeCategory: person.employeeCategory!, contractStartDate: person.contractStartDate! }, today, history);
          return [person.uid, person.fullName, person.employeeCategory || '', person.contractStartDate || '', gratuity.employmentMonths, gratuity.totalGratuity, 'Calculated'];
        } catch {
          return [person.uid, person.fullName, person.employeeCategory || '', person.contractStartDate || '', '', '', 'Calculation unavailable'];
        }
      });
      return headersAndRows(['Employee ID', 'Employee', 'Category', 'Contract start', 'Employment months', 'Accrued gratuity', 'Status'], rows);
    }
    case 'contract-expiry':
      return headersAndRows(['Employee ID', 'Employee', 'Role', 'Position', 'Contract type', 'Start date', 'End date', 'Contract status', 'Employment status'], staff.filter((person) => (!filters.staffId || person.uid === filters.staffId || person.id === filters.staffId) && (!filters.startDate || (person.contractEndDate || '') >= filters.startDate) && (!filters.endDate || (person.contractEndDate || '') <= filters.endDate)).map((person) => [person.uid, person.fullName, person.role, person.position || person.departmentOrTitle || '', person.contractType || '', person.contractStartDate || '', person.contractEndDate || '', person.contractStatus || '', person.employmentStatus || '']));
    case 'household-expenditure':
      return headersAndRows(['Expense ID', 'Household ID', 'Date', 'Category', 'Description', 'Quantity', 'Unit cost', 'Total cost', 'Programme', 'Budget line ID'], expenseRecords.map((item) => [item.id, item.householdId, item.date, item.category, item.itemDescription, item.quantity, item.unitCost, item.totalCost, item.programme || '', item.budgetLineId || '']));
    case 'outstanding-actions':
      return headersAndRows(['Action ID', 'Title', 'Description', 'Girl ID', 'Household ID', 'Assigned staff', 'Priority', 'Due date', 'Status'], actionRecords.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).map((item) => [item.id, item.title, item.description, item.girlId || '', item.householdId || '', item.assignedStaffName, item.priority, item.dueDate, item.status]));
    default:
      return headersAndRows([], []);
  }
}