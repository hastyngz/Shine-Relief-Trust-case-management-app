import type { AppDatabase, StaffUser } from '../types';
import { calculateBudgetVariance } from './financialCalculations';
import { normalizeWorkplanStatus } from './workload';

export interface ManagementFilters {
  startDate?: string;
  endDate?: string;
  programme?: string;
  householdId?: string;
  financialYear?: string;
  month?: number;
  category?: string;
  staffId?: string;
  status?: string;
  priority?: string;
}

export function canAccessManagementDashboard(isAdmin: boolean, role?: string | null): boolean {
  return isAdmin || role === 'Manager';
}

export function projectManagementDatabase(
  db: AppDatabase,
  permissions: { canViewHealthRecords: boolean; canViewSafeguarding: boolean }
): AppDatabase {
  return {
    ...db,
    healthFollowUps: permissions.canViewHealthRecords ? db.healthFollowUps : [],
    caseActions: (db.caseActions || []).filter((action) => action.sourceType !== 'safeguarding' || permissions.canViewSafeguarding),
    attachments: (db.attachments || []).filter((attachment) => {
      const targetType = String(attachment.targetType);
      return (targetType !== 'healthFollowUp' || permissions.canViewHealthRecords) &&
        (targetType !== 'safeguardingCase' || permissions.canViewSafeguarding);
    }),
  };
}

export interface ProgrammeAttribution {
  id?: string;
  programme?: string;
  departmentOrProgramme?: string;
  girlId?: string;
  householdId?: string;
  activityId?: string;
  activityIds?: string[];
  sourceId?: string;
  budgetId?: string;
  budgetLineId?: string;
}

export function matchesManagementProgramme(
  db: AppDatabase,
  programme: string | undefined,
  record: ProgrammeAttribution
): boolean {
  if (!programme) return true;
  if (record.programme === programme || record.departmentOrProgramme === programme) return true;
  return (db.budgets || []).some((line) => line.programme === programme && (
    (!!record.id && (line.activityId === record.id || line.budgetId === record.id)) ||
    (!!record.activityId && line.activityId === record.activityId) ||
    (record.activityIds || []).includes(line.activityId || '') ||
    (!!record.girlId && line.girlId === record.girlId) ||
    (!!record.householdId && line.householdId === record.householdId) ||
    (!!record.sourceId && line.activityId === record.sourceId) ||
    (!!record.budgetId && line.budgetId === record.budgetId) ||
    (!!record.budgetLineId && (line.id === record.budgetLineId || line.budgetId === record.budgetLineId))
  ));
}

export interface ManagementAnalytics {
  cases: {
    totalGirls: number;
    activeGirls: number;
    onLeaveGirls: number;
    completedOrLeftGirls: number;
    totalHouseholds: number;
    activeHouseholds: number;
    openActions: number;
    overdueActions: number;
    highPriorityActions: number;
    caseReviewsDue: number;
    outstandingFollowUps: number;
  };
  education: {
    girlsRequiringSupport: number;
    outstandingFollowUps: number;
    bySchool: Array<{ name: string; count: number }>;
    byClass: Array<{ name: string; count: number }>;
    recent: Array<{ id: string; girlId: string; date: string; school: string; issue: string }>;
  };
  health: { outstandingFollowUps: number; dueFollowUps: number; recentCount: number };
  family: { followUps: number; homeVisits: number; communityActivities: number; outstandingActions: number };
  households: {
    residentsByHouse: Array<{ id: string; name: string; girls: number; expenditure: number }>;
    rentDue: number;
    unpaidRent: number;
    partiallyPaidRent: number;
    expenditure: number;
    recentActivities: Array<{ id: string; householdId: string; date: string; name: string; location?: string }>;
    repairsRequiringAction: number;
  };
  staff: Array<{
    id: string;
    name: string;
    role: string;
    position: string;
    employeeCategory: string;
    assignedGirls: number;
    assignedHouseholds: number;
    openTasks: number;
    inProgressTasks: number;
    overdueTasks: number;
    highPriorityTasks: number;
    upcomingTasks: number;
    reviewsDue: number;
    workplans: number;
    completedTasks: number;
  }>;
  finance: {
    approvedBudget: number;
    actualExpenditure: number;
    remainingBudget: number;
    variance: number;
    variancePercent: number | null;
    payrollExpected: number;
    payrollPaid: number;
    unpaidPayroll: number;
    partiallyPaidPayroll: number;
    rent: number;
    householdExpenditure: number;
    programmeExpenditure: number;
    educationExpenditure: number;
    healthExpenditure: number;
    maintenanceExpenditure: number;
    otherExpenditure: number;
    gratuity: number | null;
    budgetPerformance: Array<{
      key: string;
      dimension: 'Programme' | 'Category' | 'Period' | 'Budget line';
      budget: number;
      actual: number;
      remaining: number;
      variance: number;
      variancePercent: number | null;
      status: string;
    }>;
    payrollOutstandingByEmployee: Array<{ id: string; name: string; expected: number; paid: number; outstanding: number; status: string }>;
  };
  workplans: {
    active: number;
    planned: number;
    completed: number;
    delayed: number;
    upcoming: number;
    byProgramme: Array<{ programme: string; count: number }>;
    performance: Array<{
      id: string;
      activity: string;
      programme: string;
      staffName: string;
      startDate: string;
      endDate: string;
      status: string;
      plannedActivities: number;
      completedActivities: number;
      completionPercent: number;
      plannedBudget: number;
      actualExpenditure: number;
      remainingBudget: number;
    }>;
  };
  alerts: Array<{ id: string; type: string; label: string; detail: string; date?: string; target?: string }>;
  trends: {
    enoughData: boolean;
    monthly: Array<{ month: string; admissions: number; exits: number | null; education: number; health: number; family: number; activities: number; householdSpend: number; programmeSpend: number; payroll: number; budget: number; actual: number }>;
  };
}

const isInRange = (date: string | undefined, filters: ManagementFilters): boolean => {
  if (!date) return !filters.startDate && !filters.endDate;
  return (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate);
};

const matchesPeriod = (date: string | undefined, filters: ManagementFilters): boolean => {
  if (!date) return !filters.financialYear && !filters.month;
  if (filters.financialYear && !date.startsWith(filters.financialYear)) return false;
  if (filters.month && Number(date.slice(5, 7)) !== filters.month) return false;
  return true;
};

const sum = (values: number[]) => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
const labelCounts = (values: string[]) => Array.from(values.reduce((counts, value) => counts.set(value || 'Unspecified', (counts.get(value || 'Unspecified') || 0) + 1), new Map<string, number>()).entries())
  .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

export function buildManagementAnalytics(
  db: AppDatabase,
  filters: ManagementFilters = {},
  staffRoster: StaffUser[] = [],
  today = new Date().toISOString().slice(0, 10),
  gratuityByEmployee?: Record<string, number>
): ManagementAnalytics {
  const girls = (db.girls || []).filter((girl) => matchesManagementProgramme(db, filters.programme, { girlId: girl.id }) && (!filters.householdId || girl.householdId === filters.householdId));
  const households = (db.households || []).filter((house) => (!filters.householdId || house.id === filters.householdId) && matchesManagementProgramme(db, filters.programme, { householdId: house.id }));
  const householdIds = new Set(households.map((house) => house.id));
  const girlIds = new Set(girls.filter((girl) => !filters.householdId || householdIds.has(girl.householdId)).map((girl) => girl.id));
  const inHouse = (girlId?: string, householdId?: string) => !filters.householdId || (!!householdId && householdIds.has(householdId)) || (!!girlId && girlIds.has(girlId));
  const inProgramme = (record: ProgrammeAttribution & { budgetCategory?: string; category?: string }) => {
    if (!matchesManagementProgramme(db, filters.programme, record)) return false;
    if (filters.category && (record.budgetCategory || record.category) !== filters.category) return false;
    return true;
  };
  const edu = (db.educationalFollowUps || []).filter((item) => girlIds.has(item.girlId) && isInRange(item.date, filters) && inProgramme({ id: item.id, girlId: item.girlId }));
  const health = (db.healthFollowUps || []).filter((item) => girlIds.has(item.girlId) && isInRange(item.date, filters) && inProgramme({ id: item.id, girlId: item.girlId }));
  const family = (db.familyFollowUps || []).filter((item) => girlIds.has(item.girlId) && isInRange(item.date, filters) && inProgramme({ id: item.id, girlId: item.girlId }));
  const activities = (db.householdActivities || []).filter((item) => householdIds.has(item.householdId) && isInRange(item.date, filters) && inProgramme({ id: item.id, householdId: item.householdId }));
  const expenses = (db.expenses || []).filter((item) => householdIds.has(item.householdId) && matchesPeriod(item.financialYear ? `${item.financialYear}-${item.date.slice(5, 7)}` : item.date, filters) && inProgramme(item));
  const rentPeriods = filters.financialYear
    ? filters.month ? [`${filters.financialYear}-${String(filters.month).padStart(2, '0')}`] : Array.from({ length: 12 }, (_, index) => `${filters.financialYear}-${String(index + 1).padStart(2, '0')}`)
    : filters.month ? [`${today.slice(0, 4)}-${String(filters.month).padStart(2, '0')}`] : [today.slice(0, 7)];
  const monthCoveredKey = (value: string, fallbackDate: string) => {
    const parts = value.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (!parts) return fallbackDate.slice(0, 7);
    const monthIndex = new Date(`${parts[1]} 1, ${parts[2]}`).getMonth() + 1;
    return `${parts[2]}-${String(monthIndex).padStart(2, '0')}`;
  };
  const rents = (db.rentPayments || []).filter((item) => householdIds.has(item.householdId) && rentPeriods.includes(monthCoveredKey(item.monthCovered, item.datePaid)) && inProgramme(item));
  const actions = (db.caseActions || []).filter((item) => inHouse(item.girlId, item.householdId) && isInRange(item.dueDate, filters) && inProgramme({ id: item.id, girlId: item.girlId, householdId: item.householdId, sourceId: item.sourceId }) && (!filters.staffId || item.assignedStaffId === filters.staffId) && (!filters.status || item.status === filters.status) && (!filters.priority || item.priority === filters.priority));
  const reviews = (db.caseReviews || []).filter((item) => girlIds.has(item.girlId) && isInRange(item.nextReviewDate || item.reviewDate, filters) && inProgramme({ girlId: item.girlId }));
  const academicSupports = (db.academicSupports || []).filter((item) => girlIds.has(item.girlId) && isInRange(item.date, filters) && inProgramme({ girlId: item.girlId }));
  const workplans = (db.workplans || []).filter((item) => {
    return isInRange(item.startDate, filters) && inProgramme({ id: item.id, activityIds: item.linkedActivityIds || [] }) && (!filters.staffId || item.responsibleStaffId === filters.staffId) && (!filters.status || normalizeWorkplanStatus(item.status) === filters.status);
  });
  const schedules = (db.schedules || []).filter((item) => isInRange(item.scheduledDate, filters) && inHouse(item.targetType === 'girl' ? item.targetId : undefined, item.targetType === 'household' ? item.targetId : undefined) && inProgramme({ id: item.id, activityId: item.targetType === 'workplan' ? item.targetId : undefined, girlId: item.targetType === 'girl' ? item.targetId : undefined, householdId: item.targetType === 'household' ? item.targetId : undefined }) && (!filters.staffId || item.assignedStaffId === filters.staffId) && (!filters.status || item.status === filters.status));
  const budgets = (db.budgets || []).filter((item) => matchesPeriod(item.period?.match(/^\d{4}-\d{2}/)?.[0] || (item.financialYear ? `${item.financialYear}-${String(item.month || 1).padStart(2, '0')}` : undefined), filters) && (!filters.householdId || item.householdId === filters.householdId) && inProgramme(item));
  const annualBudgets = (db.annualBudgets || []).filter((item) => (!filters.financialYear || item.financialYear === filters.financialYear) && (!filters.programme || item.programme === filters.programme));
  const payroll = (db.payrollRecords || []).filter((item) => matchesPeriod(item.payPeriodStartDate, filters) && (!filters.programme || item.departmentOrProgramme === filters.programme) && (!filters.staffId || item.employeeId === filters.staffId));

  const openActions = actions.filter((item) => !['Completed', 'Cancelled'].includes(item.status));
  const overdueActions = openActions.filter((item) => item.dueDate < today);
  const outstandingFollowUps = [...edu, ...family].filter((item) => item.furtherActionRequired).length + health.filter((item) => item.furtherActionRequired).length;
  const approvedBudget = sum(annualBudgets.filter((item) => ['Approved', 'Active'].includes(item.status)).map((item) => item.approvedAmount));
  const actualExpenditure = sum(budgets.map((item) => item.actualExpenditure || 0));
  const budgetAmount = sum(budgets.map((item) => item.budgetAmount));
  const managementBudgetBaseline = approvedBudget || budgetAmount;
  const variance = actualExpenditure - managementBudgetBaseline;
  const variancePercent = managementBudgetBaseline ? variance / managementBudgetBaseline * 100 : null;
  const householdSpend = sum(expenses.map((item) => item.totalCost));
  const payrollExpected = sum(payroll.map((item) => item.expectedAmount));
  const payrollPaid = sum(payroll.map((item) => item.amountPaid));
  const byHouse = households.map((house) => ({
    id: house.id,
    name: house.name,
    girls: girls.filter((girl) => girl.householdId === house.id).length,
    expenditure: sum(expenses.filter((expense) => expense.householdId === house.id).map((expense) => expense.totalCost)),
  }));
  const staff = staffRoster.filter((person) => {
    if (person.status !== 'Active' || (filters.staffId && person.id !== filters.staffId && person.uid !== filters.staffId)) return false;
    if (!filters.programme) return true;
    return actions.some((action) => action.assignedStaffId === person.uid || action.assignedStaffId === person.id) ||
      workplans.some((plan) => plan.responsibleStaffId === person.uid || plan.responsibleStaffId === person.id) ||
      payroll.some((record) => record.employeeId === person.uid || record.employeeId === person.id);
  }).map((person) => {
    const assigned = actions.filter((item) => item.assignedStaffId === person.uid || item.assignedStaffId === person.id);
    const personSchedules = schedules.filter((item) => item.assignedStaffId === person.uid || item.assignedStaffId === person.id);
    const personPlans = workplans.filter((item) => item.responsibleStaffId === person.uid || item.responsibleStaffId === person.id);
    return {
      id: person.uid || person.id,
      name: person.fullName,
      role: person.role,
      position: person.position || person.departmentOrTitle || '',
      employeeCategory: person.employeeCategory || '',
      assignedGirls: new Set(assigned.map((item) => item.girlId).filter(Boolean)).size,
      assignedHouseholds: new Set(assigned.map((item) => item.householdId).filter(Boolean)).size,
      openTasks: assigned.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).length,
      inProgressTasks: assigned.filter((item) => item.status === 'In Progress').length,
      overdueTasks: assigned.filter((item) => !['Completed', 'Cancelled'].includes(item.status) && item.dueDate < today).length,
      highPriorityTasks: assigned.filter((item) => !['Completed', 'Cancelled'].includes(item.status) && ['High', 'Urgent'].includes(item.priority)).length,
      upcomingTasks: personSchedules.filter((item) => !['Completed', 'Cancelled'].includes(item.status) && item.scheduledDate >= today).length,
      reviewsDue: reviews.filter((review) => assigned.some((action) => action.girlId === review.girlId) && !!review.nextReviewDate && review.nextReviewDate <= today).length,
      workplans: personPlans.length,
      completedTasks: assigned.filter((item) => item.status === 'Completed').length,
    };
  });

  const performance = workplans.map((plan) => {
    const linkedSchedules = schedules.filter((schedule) => schedule.targetType === 'workplan' && schedule.targetId === plan.id);
    const completedLinks = (plan.linkedActivityIds || []).filter((id) => activities.some((activity) => activity.id === id) || edu.some((item) => item.id === id) || family.some((item) => item.id === id) || health.some((item) => item.id === id)).length;
    const completedSchedules = linkedSchedules.filter((schedule) => schedule.status === 'Completed').length;
    const target = Math.max(0, Number(plan.targetCount || 0));
    const completedActivities = Math.max(Number(plan.completedCount || 0), completedLinks, completedSchedules);
    const completionPercent = normalizeWorkplanStatus(plan.status) === 'Completed' ? 100 : target ? Math.min(100, Math.round(completedActivities / target * 100)) : 0;
    const associatedBudget = budgets.filter((line) => line.activityId && (plan.linkedActivityIds || []).includes(line.activityId));
    const plannedBudget = associatedBudget.length ? sum(associatedBudget.map((line) => line.budgetAmount)) : Number(plan.budget || 0);
    const actual = sum(associatedBudget.map((line) => Number(line.actualExpenditure || 0)));
    const linkedProgramme = associatedBudget[0]?.programme || '';
    return {
      id: plan.id,
      activity: plan.activity,
      programme: linkedProgramme,
      staffName: plan.responsibleStaffName,
      startDate: plan.startDate,
      endDate: plan.endDate,
      status: normalizeWorkplanStatus(plan.status),
      plannedActivities: target,
      completedActivities,
      completionPercent,
      plannedBudget,
      actualExpenditure: actual,
      remainingBudget: plannedBudget - actual,
    };
  });
  const workplanPrograms = labelCounts(performance.map((item) => item.programme).filter(Boolean)).map((item) => ({ programme: item.name, count: item.count }));
  const budgetPerformance = new Map<string, { dimension: 'Programme' | 'Category' | 'Period' | 'Budget line'; budget: number; actual: number }>();
  budgets.forEach((line) => {
    const dimensions: Array<[string, 'Programme' | 'Category' | 'Period' | 'Budget line']> = [
      [`Programme: ${line.programme}`, 'Programme'],
      [`Category: ${line.category}`, 'Category'],
      [`Period: ${line.period}`, 'Period'],
      [`Budget line: ${line.itemDescription || line.id}`, 'Budget line'],
    ];
    dimensions.forEach(([key, dimension]) => {
      const total = budgetPerformance.get(key) || { dimension, budget: 0, actual: 0 };
      total.budget += line.budgetAmount;
      total.actual += line.actualExpenditure || 0;
      budgetPerformance.set(key, total);
    });
  });
  const budgetRows = [...budgetPerformance.entries()].map(([key, total]) => {
    const result = calculateBudgetVariance(total.budget, total.actual);
    return { key, dimension: total.dimension, budget: total.budget, actual: total.actual, remaining: result.remaining, variance: result.variance, variancePercent: result.variancePercent, status: result.status };
  });

  const alerts: ManagementAnalytics['alerts'] = [
    ...overdueActions.map((item) => ({ id: item.id, type: 'case_action', label: item.priority === 'High' || item.priority === 'Urgent' ? 'High-priority overdue action' : 'Overdue case action', detail: item.title, date: item.dueDate, target: item.girlId || item.householdId })),
    ...reviews.filter((item) => !!item.nextReviewDate && item.nextReviewDate <= today).map((item) => ({ id: item.id, type: 'case_review', label: 'Case review due', detail: `Review due for ${item.girlId}`, date: item.nextReviewDate, target: item.girlId })),
    ...[...edu, ...health, ...family].filter((item) => item.furtherActionRequired && !!item.nextFollowUpDate && item.nextFollowUpDate < today).map((item) => ({ id: item.id, type: 'follow_up', label: 'Overdue follow-up', detail: 'A follow-up date has passed.', date: item.nextFollowUpDate, target: item.girlId })),
    ...rents.filter((item) => item.paymentStatus === 'Not paid' || item.paymentStatus === 'Partially paid').map((item) => ({ id: item.id, type: 'rent', label: item.paymentStatus === 'Not paid' ? 'Unpaid rent' : 'Partially paid rent', detail: item.monthCovered, date: item.datePaid, target: item.householdId })),
    ...payroll.filter((item) => item.paymentStatus === 'Unpaid' || item.paymentStatus === 'Partially Paid').map((item) => ({ id: item.id, type: 'payroll', label: item.paymentStatus === 'Unpaid' ? 'Unpaid payroll' : 'Partially paid payroll', detail: item.employeeName, date: item.payPeriodStartDate, target: item.employeeId })),
    ...staffRoster.filter((person) => person.status === 'Active' && !!person.contractEndDate && person.contractEndDate >= today && person.contractEndDate <= new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)).map((person) => ({ id: person.uid || person.id, type: 'contract', label: 'Contract approaching expiry', detail: person.fullName, date: person.contractEndDate, target: person.uid || person.id })),
    ...performance.filter((item) => item.status === 'Delayed' || (item.status === 'In Progress' && !!item.endDate && item.endDate < today)).map((item) => ({ id: item.id, type: 'workplan', label: item.status === 'Delayed' ? 'Delayed workplan activity' : 'Overdue workplan activity', detail: item.activity, date: item.endDate, target: item.id })),
    ...budgetRows.filter((item) => item.status === 'Over budget').map((item) => ({ id: item.key, type: 'budget', label: 'Over-budget allocation', detail: item.key, target: item.key })),
  ];
  alerts.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const monthly = new Map<string, ManagementAnalytics['trends']['monthly'][number]>();
  const bumpTrend = (date: string | undefined, field: Exclude<keyof Omit<ManagementAnalytics['trends']['monthly'][number], 'month'>, 'exits'>, amount = 1) => {
    if (!date || !isInRange(date, filters)) return;
    const key = date.slice(0, 7);
    const row = monthly.get(key) || { month: key, admissions: 0, exits: null, education: 0, health: 0, family: 0, activities: 0, householdSpend: 0, programmeSpend: 0, payroll: 0, budget: 0, actual: 0 };
    row[field] += amount;
    monthly.set(key, row);
  };
  girls.forEach((girl) => bumpTrend(girl.dateAdmitted, 'admissions'));
  edu.forEach((item) => bumpTrend(item.date, 'education'));
  health.forEach((item) => bumpTrend(item.date, 'health'));
  family.forEach((item) => bumpTrend(item.date, 'family'));
  activities.forEach((item) => bumpTrend(item.date, 'activities'));
  expenses.forEach((item) => bumpTrend(item.date, 'householdSpend', item.totalCost));
  budgets.forEach((item) => {
    const periodDate = item.period?.match(/^\d{4}-\d{2}/)?.[0] ? `${item.period.slice(0, 7)}-01` : undefined;
    bumpTrend(periodDate, 'budget', item.budgetAmount);
    bumpTrend(periodDate, 'actual', item.actualExpenditure || 0);
    if (item.programme) bumpTrend(periodDate, 'programmeSpend', item.actualExpenditure || 0);
  });
  payroll.forEach((item) => bumpTrend(item.payPeriodStartDate, 'payroll', item.amountPaid));
  const monthlyRows = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month));
  const peopleWithSupport = new Set(academicSupports.filter((item) => item.furtherActionRequired).map((item) => item.girlId));
  const activeWorkplans = workplans.filter((item) => !['Completed', 'Cancelled'].includes(normalizeWorkplanStatus(item.status)));
  const dueRent = sum(households.filter((item) => item.status === 'Active').map((item) => item.monthlyRentCost)) * rentPeriods.length - sum(rents.map((item) => item.amountPaid));
  const payrollOutstanding = payroll.filter((item) => item.paymentStatus === 'Unpaid').length;
  const partialPayroll = payroll.filter((item) => item.paymentStatus === 'Partially Paid').length;
  const payrollOutstandingByEmployee = new Map<string, { id: string; name: string; expected: number; paid: number; outstanding: number; status: string }>();
  payroll.filter((item) => item.amountPaid < item.expectedAmount).forEach((item) => {
    const current = payrollOutstandingByEmployee.get(item.employeeId) || { id: item.employeeId, name: item.employeeName, expected: 0, paid: 0, outstanding: 0, status: item.paymentStatus };
    current.expected += item.expectedAmount;
    current.paid += item.amountPaid;
    current.outstanding += Math.max(0, item.expectedAmount - item.amountPaid);
    if (item.paymentStatus === 'Unpaid') current.status = 'Unpaid';
    payrollOutstandingByEmployee.set(item.employeeId, current);
  });

  return {
    cases: {
      totalGirls: girlIds.size,
      activeGirls: girls.filter((girl) => girlIds.has(girl.id) && girl.status === 'Active').length,
      onLeaveGirls: new Set([...(db.girlLeaves || []).filter((item) => girlIds.has(item.girlId) && item.status === 'Active').map((item) => item.girlId), ...girls.filter((girl) => girlIds.has(girl.id) && girl.status === 'On Holiday').map((item) => item.id)]).size,
      completedOrLeftGirls: girls.filter((girl) => girlIds.has(girl.id) && ['Completed', 'Left SHINE'].includes(girl.status)).length,
      totalHouseholds: households.length,
      activeHouseholds: households.filter((item) => item.status === 'Active').length,
      openActions: openActions.length,
      overdueActions: overdueActions.length,
      highPriorityActions: openActions.filter((item) => ['High', 'Urgent'].includes(item.priority)).length,
      caseReviewsDue: reviews.filter((item) => !!item.nextReviewDate && item.nextReviewDate <= today).length,
      outstandingFollowUps,
    },
    education: {
      girlsRequiringSupport: peopleWithSupport.size,
      outstandingFollowUps: edu.filter((item) => item.furtherActionRequired).length,
      bySchool: labelCounts(edu.map((item) => item.school)),
      byClass: labelCounts(edu.map((item) => item.classLevel)),
      recent: [...edu].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((item) => ({ id: item.id, girlId: item.girlId, date: item.date, school: item.school, issue: item.academicIssue })),
    },
    health: {
      outstandingFollowUps: health.filter((item) => item.furtherActionRequired).length,
      dueFollowUps: health.filter((item) => item.furtherActionRequired && !!item.nextFollowUpDate && item.nextFollowUpDate <= today).length,
      recentCount: health.filter((item) => item.date >= today.slice(0, 7) && item.date <= today).length,
    },
    family: {
      followUps: family.length,
      homeVisits: family.filter((item) => item.contactType === 'Home visit').length + activities.filter((item) => item.activityType === 'House visit').length,
      communityActivities: activities.filter((item) => ['Group activity', 'Household meeting'].includes(item.activityType)).length,
      outstandingActions: family.filter((item) => item.furtherActionRequired).length + activities.filter((item) => item.furtherActionRequired).length,
    },
    households: {
      residentsByHouse: byHouse,
      rentDue: Math.max(0, dueRent),
      unpaidRent: rents.filter((item) => item.paymentStatus === 'Not paid').length,
      partiallyPaidRent: rents.filter((item) => item.paymentStatus === 'Partially paid').length,
      expenditure: householdSpend,
      recentActivities: [...activities].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((item) => ({ id: item.id, householdId: item.householdId, date: item.date, name: item.activityName, location: item.location })),
      repairsRequiringAction: actions.filter((action) => action.householdId && action.sourceType === 'expense' && !['Completed', 'Cancelled'].includes(action.status) && expenses.some((expense) => expense.id === action.sourceId && ['Repairs', 'Repairs/maintenance', 'Maintenance'].includes(expense.category))).length,
    },
    staff,
    finance: {
      approvedBudget,
      actualExpenditure,
      remainingBudget: approvedBudget - actualExpenditure,
      variance,
      variancePercent,
      payrollExpected,
      payrollPaid,
      unpaidPayroll: payrollOutstanding,
      partiallyPaidPayroll: partialPayroll,
      rent: sum(rents.map((item) => item.amountPaid)),
      householdExpenditure: householdSpend,
      programmeExpenditure: sum(budgets.filter((item) => !!item.programme).map((item) => item.actualExpenditure || 0)),
      educationExpenditure: sum(budgets.filter((item) => /education/i.test(item.category)).map((item) => item.actualExpenditure || 0)),
      healthExpenditure: sum(budgets.filter((item) => /health|medical/i.test(item.category)).map((item) => item.actualExpenditure || 0)),
      maintenanceExpenditure: sum(budgets.filter((item) => /maint|repair/i.test(item.category)).map((item) => item.actualExpenditure || 0)),
      otherExpenditure: sum(budgets.filter((item) => /other/i.test(item.category)).map((item) => item.actualExpenditure || 0)),
      gratuity: gratuityByEmployee ? sum(Object.values(gratuityByEmployee)) : null,
      budgetPerformance: budgetRows,
      payrollOutstandingByEmployee: [...payrollOutstandingByEmployee.values()].sort((a, b) => b.outstanding - a.outstanding),
    },
    workplans: {
      active: activeWorkplans.length,
      planned: workplans.filter((item) => normalizeWorkplanStatus(item.status) === 'Planned').length,
      completed: workplans.filter((item) => normalizeWorkplanStatus(item.status) === 'Completed').length,
      delayed: workplans.filter((item) => normalizeWorkplanStatus(item.status) === 'Delayed').length,
      upcoming: schedules.filter((item) => !['Completed', 'Cancelled'].includes(item.status) && item.scheduledDate >= today).length,
      byProgramme: workplanPrograms,
      performance,
    },
    alerts,
    trends: { enoughData: monthlyRows.length >= 2, monthly: monthlyRows },
  };
}