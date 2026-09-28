import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import type { SalaryHistoryRecord } from '../src/types';
import { buildManagementAnalytics, canAccessManagementDashboard, projectManagementDatabase } from '../src/services/managementAnalytics';
import { buildManagementReportRows, generateManagementReportWorkbook, MANAGEMENT_REPORTS } from '../src/services/managementReports';
import { buildFactualReportNarrative, buildRecordedRecommendations, filterDataForReport, generateExcelWorkbook, generatePdfReport, generateWordReport, ReportConfig } from '../src/services/reportGenerators';
import { downloadCSV } from '../src/utils/export';

const db = {
  girls: [
    { id: 'g1', status: 'Active' },
    { id: 'g2', status: 'On Holiday' },
    { id: 'g3', status: 'Completed' },
  ],
  households: [
    { id: 'h1', status: 'Active' },
    { id: 'h2', status: 'Inactive' },
  ],
  workplans: [
    { id: 'w1', status: 'In Progress', endDate: '2026-01-15', responsibleStaffId: 's1', responsibleStaffName: 'Amina', progress: 60, targetCount: 10, completedCount: 6, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'w2', status: 'Delayed', endDate: '2026-01-10', responsibleStaffId: 's1', responsibleStaffName: 'Amina', progress: 50, targetCount: 5, completedCount: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'w3', status: 'Completed', endDate: '2026-01-20', responsibleStaffId: 's2', responsibleStaffName: 'Benson', progress: 100, targetCount: 4, completedCount: 4, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ],
  caseActions: [
    { id: 'c1', status: 'Open', dueDate: '2026-01-05', priority: 'High', assignedStaffId: 's1' },
    { id: 'c2', status: 'Completed', dueDate: '2026-01-08', priority: 'Low', assignedStaffId: 's2' },
  ],
  payrollRecords: [
    { id: 'p1', employeeId: 's1', employeeName: 'Amina', expectedAmount: 800000, amountPaid: 400000, paymentStatus: 'Partially Paid' },
    { id: 'p2', employeeId: 's2', employeeName: 'Benson', expectedAmount: 600000, amountPaid: 600000, paymentStatus: 'Paid' },
  ],
  budgets: [
    { id: 'b1', programme: 'Education', category: 'Education', itemDescription: 'School support', budgetAmount: 600000, actualExpenditure: 450000 },
    { id: 'b2', programme: 'Food', category: 'Food', itemDescription: 'Meals', budgetAmount: 500000, actualExpenditure: 700000 },
  ],
  annualBudgets: [
    { id: 'ab1', financialYear: '2026', programme: 'Education', approvedAmount: 1200000 },
    { id: 'ab2', financialYear: '2026', programme: 'Food', approvedAmount: 1000000 },
  ],
} as any;

assert.equal(canAccessManagementDashboard(true, 'Administrator'), true);
assert.equal(canAccessManagementDashboard(false, 'Manager'), true);
assert.equal(canAccessManagementDashboard(false, 'Staff'), false);
assert.equal(canAccessManagementDashboard(false, 'View Only'), false);
assert.equal(MANAGEMENT_REPORTS.length, 28);

const analytics = buildManagementAnalytics({
  ...db,
  educationalFollowUps: [{ id: 'e1', girlId: 'g1', date: '2026-01-12', school: 'School A', classLevel: 'Form 1', academicIssue: 'Attendance', furtherActionRequired: true }],
  familyFollowUps: [{ id: 'f1', girlId: 'g1', date: '2026-01-11', contactType: 'Home visit', furtherActionRequired: true }],
  healthFollowUps: [{ id: 'h1', girlId: 'g1', date: '2026-01-10', furtherActionRequired: true, nextFollowUpDate: '2026-01-12' }],
  households: [{ id: 'h1', name: 'House 1', status: 'Active', monthlyRentCost: 100000 }],
  householdActivities: [{ id: 'a1', householdId: 'h1', date: '2026-01-13', activityName: 'Group meeting', activityType: 'Group activity', location: 'House 1', furtherActionRequired: false }],
  expenses: [{ id: 'x1', householdId: 'h1', date: '2026-01-10', category: 'Repairs', itemDescription: 'Roof repair', totalCost: 50000 }],
  rentPayments: [{ id: 'r1', householdId: 'h1', datePaid: '2026-01-10', monthCovered: 'January 2026', amountPaid: 50000, paymentStatus: 'Partially paid' }],
  caseReviews: [{ id: 'cr1', girlId: 'g1', reviewDate: '2026-01-01', nextReviewDate: '2026-01-12' }],
  academicSupports: [{ id: 'as1', girlId: 'g1', date: '2026-01-10', furtherActionRequired: true }],
  girlLeaves: [{ id: 'l1', girlId: 'g2', status: 'Active' }],
  schedules: [{ id: 's1', type: 'activity', title: 'Planning', scheduledDate: '2026-01-20', assignedStaffId: 's1', assignedStaffName: 'Amina', status: 'Upcoming', createdAt: '2026-01-01' }],
  payrollRecords: [{ id: 'p3', employeeId: 's1', employeeName: 'Amina', expectedAmount: 100000, amountPaid: 0, paymentStatus: 'Unpaid', payPeriodStartDate: '2026-01-01' }],
} as any, {}, [], '2026-01-15');

assert.equal(analytics.cases.overdueActions, 1);
assert.equal(analytics.cases.totalGirls, 3);
assert.equal(analytics.cases.activeGirls, 1);
assert.equal(analytics.cases.caseReviewsDue, 1);
assert.equal(analytics.education.girlsRequiringSupport, 1);
assert.equal(analytics.health.dueFollowUps, 1);
assert.equal(analytics.family.homeVisits, 1);
assert.equal(analytics.households.partiallyPaidRent, 1);
assert.equal(analytics.staff.length, 0);
assert.equal(analytics.finance.unpaidPayroll, 1);
assert.equal(analytics.finance.gratuity, null);
assert.equal(analytics.finance.variance, 50000);

const householdScoped = buildManagementAnalytics({
  ...db,
  girls: [{ id: 'g1', status: 'Active', householdId: 'h1' }, { id: 'g2', status: 'Active', householdId: 'h2' }],
  households: [{ id: 'h1', name: 'House 1', status: 'Active', monthlyRentCost: 100000 }, { id: 'h2', name: 'House 2', status: 'Active', monthlyRentCost: 120000 }],
  workplans: [
    { id: 'w-edu', activity: 'Education visit', status: 'Planned', startDate: '2026-01-10', responsibleStaffId: 's1', responsibleStaffName: 'Amina', targetCount: 2, linkedActivityIds: ['a-edu'] },
    { id: 'w-food', activity: 'Food distribution', status: 'Planned', startDate: '2026-01-10', responsibleStaffId: 's2', responsibleStaffName: 'Benson', targetCount: 3, linkedActivityIds: ['a-food'] },
  ],
  budgets: [
    { id: 'pb1', programme: 'Education', category: 'Education', activityId: 'a-edu', householdId: 'h1', girlId: 'g1', period: '2026-01', budgetAmount: 100, actualExpenditure: 0 },
    { id: 'pb2', programme: 'Food', category: 'Food', activityId: 'a-food', period: '2026-01', budgetAmount: 100, actualExpenditure: 0 },
  ],
} as any, { householdId: 'h1', programme: 'Education' }, [], '2026-01-15');
assert.equal(householdScoped.cases.totalGirls, 1);
assert.equal(householdScoped.cases.totalHouseholds, 1);
assert.deepEqual(householdScoped.workplans.performance.map((item) => item.id), ['w-edu']);

const protectedProjection = projectManagementDatabase({
  ...db,
  healthFollowUps: [{ id: 'restricted-health' }],
  caseActions: [{ id: 'restricted-safeguarding', sourceType: 'safeguarding' }, { id: 'visible-action', sourceType: 'manual' }],
  caseReviews: [{ id: 'restricted-review', health: 'restricted' }],
  attachments: [
    { id: 'health-photo', targetType: 'healthFollowUp' },
    { id: 'medical-doc', targetType: 'girl', category: 'Medical Document' },
    { id: 'safeguarding-photo', targetType: 'safeguardingCase' },
    { id: 'house-photo', targetType: 'household' },
  ],
} as any, { canViewHealthRecords: false, canViewSafeguarding: false, canViewCaseReviews: false });
assert.equal(protectedProjection.healthFollowUps.length, 0);
assert.deepEqual(protectedProjection.caseActions?.map((item) => item.id), ['visible-action']);
assert.deepEqual(protectedProjection.attachments?.map((item) => item.id), ['house-photo']);
assert.deepEqual(protectedProjection.caseReviews, []);
const caseReviewWithoutHealth = projectManagementDatabase({ ...db, caseReviews: [{ id: 'review-1', health: 'restricted', education: 'Progress' }] } as any, { canViewHealthRecords: false, canViewSafeguarding: false, canViewCaseReviews: true });
assert.equal(caseReviewWithoutHealth.caseReviews?.[0].health, undefined);
assert.equal(caseReviewWithoutHealth.caseReviews?.[0].education, 'Progress');

const filteredPeriods = buildManagementAnalytics({
  ...db,
  educationalFollowUps: [{ id: 'e-old', girlId: 'g1', date: '2026-01-12', furtherActionRequired: true }],
  payrollRecords: [{ id: 'p-period', employeeId: 's1', employeeName: 'Amina', expectedAmount: 200, amountPaid: 100, paymentStatus: 'Partially Paid', payPeriodStartDate: '2026-01-01' }],
} as any, { startDate: '2026-06-01', endDate: '2026-06-30', financialYear: '2026', month: 1 }, [], '2026-06-15');
assert.equal(filteredPeriods.education.outstandingFollowUps, 0);
assert.equal(filteredPeriods.finance.payrollExpected, 0);
const quarterFinance = buildManagementAnalytics({
  ...db,
  households: [{ id: 'h1', status: 'Active', monthlyRentCost: 100 }],
  expenses: [
    { id: 'q2-expense', householdId: 'h1', date: '2026-05-10', category: 'Food', totalCost: 30 },
    { id: 'q3-expense', householdId: 'h1', date: '2026-07-10', category: 'Food', totalCost: 90 },
  ],
  rentPayments: [
    { id: 'q2-rent', householdId: 'h1', monthCovered: 'May 2026', datePaid: '2026-07-02', amountPaid: 40, paymentStatus: 'Paid' },
    { id: 'q3-rent', householdId: 'h1', monthCovered: 'July 2026', datePaid: '2026-07-03', amountPaid: 90, paymentStatus: 'Paid' },
  ],
  payrollRecords: [
    { id: 'q2-payroll', employeeId: 's1', employeeName: 'Amina', expectedAmount: 70, amountPaid: 70, paymentStatus: 'Paid', payPeriodStartDate: '2026-05-01' },
    { id: 'q3-payroll', employeeId: 's1', employeeName: 'Amina', expectedAmount: 90, amountPaid: 90, paymentStatus: 'Paid', payPeriodStartDate: '2026-07-01' },
  ],
} as any, { startDate: '2026-04-01', endDate: '2026-06-30' }, [], '2026-09-28');
assert.equal(quarterFinance.finance.householdExpenditure, 30);
assert.equal(quarterFinance.finance.payrollExpected, 70);
assert.equal(quarterFinance.finance.rent, 40);

const budgetReport = buildManagementReportRows('budget-actual', {
  ...db,
  budgets: [{ id: 'line-1', period: '2026-01', financialYear: '2026', month: 1, programme: 'Education', category: 'Education', itemDescription: 'Books', budgetAmount: 100, actualExpenditure: 120 }],
} as any, { financialYear: '2026', month: 1 });
assert.equal(budgetReport.rows[0][8], -20);
assert.equal(budgetReport.rows[0][9], 20);
assert.equal(budgetReport.rows[0][11], 'Over budget');
const monthlyBudgetReport = buildManagementReportRows('monthly-budget', {
  ...db,
  budgets: [{ id: 'monthly-line', financialYear: '2026', month: 2, programme: 'Education', category: 'Education', itemDescription: 'Books', budgetAmount: 100, actualExpenditure: 80 }],
} as any, { financialYear: '2026', month: 2 });
assert.equal(monthlyBudgetReport.rows[0][8], 20);
const categoryExpenseReport = buildManagementReportRows('expenditure-category', {
  ...db,
  households: [{ id: 'h1', status: 'Active' }],
  expenses: [
    { id: 'food-1', householdId: 'h1', date: '2026-01-01', category: 'Food', totalCost: 100 },
    { id: 'food-2', householdId: 'h1', date: '2026-01-02', category: 'Food', totalCost: 50 },
    { id: 'repair-1', householdId: 'h1', date: '2026-01-03', category: 'Repairs', totalCost: 25 },
  ],
} as any, {});
assert.deepEqual(categoryExpenseReport.rows, [['Food', 2, 150], ['Repairs', 1, 25]]);
const managementWorkbook = XLSX.read(generateManagementReportWorkbook('budget-actual', budgetReport, { financialYear: '2026', month: 1 }, 'Test user'), { type: 'array', cellNF: true });
assert.deepEqual(managementWorkbook.SheetNames, ['Executive Summary', 'Report Data']);
assert.equal(managementWorkbook.Sheets['Report Data']['J2']?.v, 20);
assert.ok(managementWorkbook.Sheets['Report Data']['!autofilter']);

for (const reportType of MANAGEMENT_REPORTS) {
  const reportData = buildManagementReportRows(reportType.id, db as any, {}, [], []);
  assert.ok(reportData.headers.length > 0, `${reportType.id} should provide report columns`);
}

const employeeFixture = {
  uid: 'employee-1', id: 'employee-1', fullName: 'Fixture Employee', email: 'employee@example.test',
  role: 'Staff', status: 'Active', employeeCategory: 'Other Staff', contractStartDate: '2026-01-01',
} as any;
const salaryFixture: SalaryHistoryRecord[] = [
  { id: 'salary-1', employeeId: 'employee-1', effectiveDate: '2026-01-01', salaryAmount: 200000, salaryFrequency: 'Monthly', reasonForChange: 'Start', recordedBy: 'Admin', recordedDate: '2026-01-01', auditMetadata: { createdAt: '2026-01-01', createdByUid: 'admin' } },
  { id: 'salary-2', employeeId: 'employee-1', effectiveDate: '2026-07-01', salaryAmount: 250000, salaryFrequency: 'Monthly', reasonForChange: 'Increase', recordedBy: 'Admin', recordedDate: '2026-07-01', auditMetadata: { createdAt: '2026-07-01', createdByUid: 'admin' } },
];
const salaryHistoryRows = buildManagementReportRows('salary-history', db as any, {}, [employeeFixture], salaryFixture);
assert.equal(salaryHistoryRows.rows.length, 2);
const gratuityPeriodRows = buildManagementReportRows('gratuity', db as any, {}, [employeeFixture], salaryFixture, '2027-01-01');
assert.equal(gratuityPeriodRows.rows.length, 2);
assert.equal(gratuityPeriodRows.rows[0][10], 120000);
assert.equal(gratuityPeriodRows.rows[1][10], 150000);
assert.equal(gratuityPeriodRows.rows[0][11], 270000);
assert.equal(gratuityPeriodRows.rows[1][11], 270000);
const employeeRows = buildManagementReportRows('employee', db as any, {}, [employeeFixture]);
assert.equal(employeeRows.rows[0][1], 'Fixture Employee');
const indicatorRows = buildManagementReportRows('programme-indicators', {
  ...db,
  workplans: [{ id: 'indicator-1', objective: 'Improve school attendance', activity: 'School visits', period: '2026-Q1', startDate: '2026-01-01', endDate: '2026-03-31', targetCount: 20, completedCount: 15, status: 'In Progress', responsibleStaffId: 'staff-1', linkedActivityIds: [] }],
} as any, { startDate: '2026-01-01', endDate: '2026-03-31' });
assert.equal(indicatorRows.rows[0][5], 15);
assert.equal(indicatorRows.rows[0][6], 75);
const attendanceRows = buildManagementReportRows('attendance', {
  ...db,
  girls: [{ id: 'g1', fullName: 'Fixture Girl', householdId: 'h1' }],
  attendanceRecords: [{ id: 'att-1', date: '2026-01-10', girlId: 'g1', activityName: 'Class', activityType: 'Education', status: 'Present' }],
} as any, {});
assert.equal(attendanceRows.rows.length, 1);

const activityReport = buildManagementReportRows('programme-activity', {
  ...db,
  householdActivities: [
    { id: 'activity-house-1', householdId: 'h1', activityName: 'House meeting', activityType: 'Household meeting', date: '2026-01-10', location: 'Recorded House 1' },
    { id: 'activity-house-2', householdId: 'h2', activityName: 'Other house', activityType: 'Household meeting', date: '2026-01-10', location: 'Recorded House 2' },
  ],
  schedules: [
    { id: 'schedule-house-1', type: 'household_visit', title: 'Visit 1', scheduledDate: '2026-01-10', targetType: 'household', targetId: 'h1', assignedStaffId: 's1', assignedStaffName: 'Amina', status: 'Upcoming' },
    { id: 'schedule-general', type: 'programme_event', title: 'External event', scheduledDate: '2026-01-10', targetType: 'general', targetId: 'outside', assignedStaffId: 's1', assignedStaffName: 'Amina', status: 'Upcoming' },
  ],
} as any, { householdId: 'h1' });
assert.deepEqual(activityReport.rows.map((row) => row[0]), ['activity-house-1', 'schedule-house-1']);

const rentReport = buildManagementReportRows('households', {
  ...db,
  households: [{ id: 'h1', name: 'House 1', status: 'Active', location: 'Zomba', monthlyRentCost: 100 }],
  girls: [],
  rentPayments: [{ id: 'rent-covered-jan', householdId: 'h1', monthCovered: 'January 2026', datePaid: '2026-02-15', amountPaid: 50, paymentStatus: 'Partially paid' }],
  expenses: [],
} as any, { startDate: '2026-02-01', endDate: '2026-02-28', financialYear: '2026', month: 1 });
assert.equal(rentReport.rows[0][6], 50);

const reportDb = {
  ...db,
  educationalFollowUps: [], healthFollowUps: [], familyFollowUps: [], rentPayments: [], expenses: [],
  householdActivities: [], schedules: [], attachments: [],
} as any;
const reportConfig: ReportConfig = {
  title: 'Management Summary Test',
  periodLabel: 'Test period',
  generatedBy: 'Phase 3D test',
  structuredTables: [{ title: 'Recorded fixture values', headers: ['Measure', 'Value'], rows: [['Girl profiles', 3]] }],
  executiveSummary: 'Recorded summary metrics only.',
  includeSections: {
    executiveSummary: true,
    statistics: false,
    girlsList: false,
    householdsList: false,
    educationalFollowUps: false,
    healthFollowUps: false,
    familyFollowUps: false,
    householdActivities: false,
    expenditure: false,
    rentPayments: false,
    budgets: false,
    workplans: false,
    schedules: false,
    photoGallery: false,
  },
};
const scopedReport = filterDataForReport({
  ...reportDb,
  girls: [
    { id: 'g1', school: 'School A', classLevel: 'Form 1', householdId: 'h1' },
    { id: 'g2', school: 'School B', classLevel: 'Form 2', householdId: 'h2' },
  ],
  households: [{ id: 'h1' }, { id: 'h2' }],
  educationalFollowUps: [
    { id: 'edu-1', girlId: 'g1', school: 'School A', classLevel: 'Form 1', date: '2026-01-01' },
    { id: 'edu-2', girlId: 'g2', school: 'School B', classLevel: 'Form 2', date: '2026-01-01' },
  ],
  healthFollowUps: [{ id: 'health-1', girlId: 'g1', date: '2026-01-01' }],
  familyFollowUps: [{ id: 'family-1', girlId: 'g1', date: '2026-01-01' }],
  caseActions: [
    { id: 'action-1', girlId: 'g1', status: 'Open', dueDate: '2026-01-01', assignedStaffId: 'staff-1' },
    { id: 'action-2', girlId: 'g2', status: 'Open', dueDate: '2026-01-01', assignedStaffId: 'staff-2' },
  ],
  caseReviews: [{ id: 'review-1', girlId: 'g1', reviewDate: '2026-01-01' }, { id: 'review-2', girlId: 'g2', reviewDate: '2026-01-01' }],
} as any, { ...reportConfig, filters: { school: 'School A', classLevel: 'Form 1', followUpType: 'education' } });
assert.deepEqual(scopedReport.girls.map((girl) => girl.id), ['g1']);
assert.deepEqual(scopedReport.edu.map((item) => item.id), ['edu-1']);
assert.equal(scopedReport.health.length + scopedReport.family.length, 0);
assert.deepEqual(scopedReport.caseActions.map((item) => item.id), ['action-1']);
assert.deepEqual(scopedReport.caseReviews.map((item) => item.id), ['review-1']);
assert.match(buildFactualReportNarrative(reportDb, reportConfig), /3 girl profile\(s\)/);
assert.doesNotMatch(buildFactualReportNarrative(reportDb, reportConfig), /continued to deliver|conducted active case management/i);
assert.equal(buildRecordedRecommendations(reportDb, reportConfig), 'No recommendations were recorded in the selected records.');
const wordReport = await generateWordReport(reportDb, reportConfig);
const extractedWordText = await mammoth.extractRawText({ buffer: Buffer.from(await wordReport.arrayBuffer()) } as any);
assert.match(extractedWordText.value, /Recorded fixture values/);
assert.match(extractedWordText.value, /Girl profiles/);
const caseReportDb = {
  ...reportDb,
  girls: [{ id: 'g1', fullName: 'Fixture Girl', householdId: 'h1' }],
  caseActions: [{ id: 'action-report-1', title: 'School follow-up', description: 'Visit school', girlId: 'g1', assignedStaffId: 'staff-1', assignedStaffName: 'Case worker', sourceType: 'manual', priority: 'Medium', status: 'Open', dueDate: '2026-01-20', createdBy: 'Test', createdByUid: 'staff-1', updatedBy: 'Test', updatedByUid: 'staff-1', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
  caseReviews: [{ id: 'review-report-1', girlId: 'g1', reviewDate: '2026-01-15', education: 'Attendance improved', health: 'Check-up recorded', progress: 'On track', challenges: 'Transport', actionPlan: 'Follow up', createdBy: 'Test', createdAt: '2026-01-15', updatedBy: 'Test', updatedAt: '2026-01-15' }],
} as any;
const caseReportConfig: ReportConfig = {
  ...reportConfig,
  includeSections: { ...reportConfig.includeSections, caseActions: true, caseReviews: true },
};
const caseDocx = await generateWordReport(caseReportDb, caseReportConfig);
const caseDocxText = await mammoth.extractRawText({ buffer: Buffer.from(await caseDocx.arrayBuffer()) } as any);
assert.match(caseDocxText.value, /School follow-up/);
assert.match(caseDocxText.value, /Attendance improved/);
const caseWorkbook = XLSX.read(generateExcelWorkbook(caseReportDb, caseReportConfig), { type: 'array' });
assert.ok(caseWorkbook.SheetNames.includes('Case Actions'));
assert.ok(caseWorkbook.SheetNames.includes('Case Reviews'));
const completeCaseWorkbook = XLSX.read(generateExcelWorkbook({
  ...caseReportDb,
  educationalFollowUps: [{ id: 'edu-x', girlId: 'g1', date: '2026-01-10', school: 'School A', classLevel: 'Form 1', academicIssue: 'Attendance', problemsExperienced: '', supportProvided: 'Visit', progressOutcome: 'Improved', recommendations: '', furtherActionRequired: false }],
  educationHistory: [{ id: 'history-x', girlId: 'g1', academicYear: '2026', school: 'School A', classLevel: 'Form 1', status: 'Current' }],
  examinationRecords: [{ id: 'exam-x', girlId: 'g1', examinationType: 'MSCE', examinationYear: '2026', subjects: [{ subject: 'English', result: 'A' }], overallOutcome: 'Passed' }],
  attendanceRecords: [{ id: 'attendance-x', girlId: 'g1', date: '2026-01-10', activityName: 'Class', activityType: 'Education', status: 'Present', recordedBy: 'Staff' }],
  girlLeaves: [{ id: 'leave-x', girlId: 'g1', leaveType: 'School Leave', startDate: '2026-01-10', expectedReturnDate: '2026-01-11', reason: 'Exam', approvedBy: 'Manager', status: 'Returned' }],
  householdActivities: [{ id: 'activity-x', householdId: 'h1', date: '2026-01-10', activityName: 'House meeting', activityType: 'Household meeting', participantCount: 1, description: 'Meeting', furtherActionRequired: false }],
} as any, {
  ...caseReportConfig,
  includeSections: { ...caseReportConfig.includeSections, educationalFollowUps: true, householdActivities: true },
}), { type: 'array' });
for (const sheetName of ['Education History', 'Examinations', 'Attendance', 'Leave and Absence', 'Household Activities']) {
  assert.ok(completeCaseWorkbook.SheetNames.includes(sheetName), `${sheetName} worksheet should be exported`);
}
const wordWithAttachmentReferences = await generateWordReport({ ...reportDb, attachments: [{ id: 'photo-1', targetType: 'household', targetId: 'h1', fileName: 'house.jpg', category: 'Household Condition', date: '2026-01-10', downloadUrl: '', storagePath: '', contentType: 'image/jpeg', fileSize: 100, uploadedBy: { uid: 'manager', name: 'Manager', email: 'manager@example.test' } }] } as any, {
  ...reportConfig,
  selectedPhotoIds: ['photo-1'],
  includeSections: { ...reportConfig.includeSections, photoGallery: true },
});
const excelReport = generateExcelWorkbook(reportDb, reportConfig);
assert.ok(wordReport.size > 0);
const wordBytes = new Uint8Array(await wordReport.arrayBuffer());
assert.deepEqual(Array.from(wordBytes.slice(0, 2)), [0x50, 0x4b]);
assert.ok(wordWithAttachmentReferences.size > 0);
assert.ok(excelReport.byteLength > 0 || excelReport.length > 0);
const selectedWorkbook = XLSX.read(excelReport, { type: 'array' });
assert.deepEqual(selectedWorkbook.SheetNames, ['Executive Summary']);

const budgetWorkbookBytes = generateExcelWorkbook(reportDb, {
  ...reportConfig,
  includeSections: { ...reportConfig.includeSections, budgets: true },
});
const budgetWorkbook = XLSX.read(budgetWorkbookBytes, { type: 'array', cellNF: true });
assert.ok(budgetWorkbook.SheetNames.includes('Budgets & Variance'));
const budgetSheet = budgetWorkbook.Sheets['Budgets & Variance'];
assert.equal(budgetSheet['J2']?.v, -150000);
assert.equal(budgetSheet['J2']?.z, '"MWK" #,##0;[Red]-"MWK" #,##0');
assert.equal(budgetSheet['K2']?.z, '0.0%');
assert.ok(budgetSheet['!autofilter']);

const reportImageFixture = new Uint8Array(readFileSync(new URL('../public/logo.png', import.meta.url)));
const wordWithEmbeddedPhoto = await generateWordReport({
  ...reportDb,
  attachments: [{ id: 'photo-1', targetType: 'household', targetId: 'h1', fileName: 'house.png', category: 'Household Condition', date: '2026-01-10', downloadUrl: '', storagePath: 'attachments/household/h1/photo-1', contentType: 'image/png', fileSize: reportImageFixture.byteLength, uploadedBy: { uid: 'manager', name: 'Manager', email: 'manager@example.test' } }],
} as any, {
  ...reportConfig,
  selectedPhotoIds: ['photo-1'],
  photoImageData: { 'photo-1': reportImageFixture },
  includeSections: { ...reportConfig.includeSections, photoGallery: true },
});
assert.ok(wordWithEmbeddedPhoto.size > wordReport.size);
const pdfWithEmbeddedPhoto = generatePdfReport({
  ...reportDb,
  attachments: [{ id: 'photo-1', targetType: 'household', targetId: 'h1', fileName: 'house.png', category: 'Household Condition', date: '2026-01-10', downloadUrl: '', storagePath: 'attachments/household/h1/photo-1', contentType: 'image/png', fileSize: reportImageFixture.byteLength, uploadedBy: { uid: 'manager', name: 'Manager', email: 'manager@example.test' } }],
} as any, {
  ...reportConfig,
  selectedPhotoIds: ['photo-1'],
  photoImageData: { 'photo-1': reportImageFixture },
  includeSections: { ...reportConfig.includeSections, photoGallery: true },
});
const pdfBytes = new Uint8Array(await pdfWithEmbeddedPhoto.arrayBuffer());
assert.equal(new TextDecoder().decode(pdfBytes.slice(0, 8)), '%PDF-1.3');
assert.ok(new TextDecoder('latin1').decode(pdfBytes).includes('/Subtype /Image'));

const originalDocument = globalThis.document;
let csvDownloaded = false;
let csvHref = '';
const mockLink = {
  setAttribute: (name: string, value: string) => { if (name === 'href') csvHref = value; },
  click: () => { csvDownloaded = true; },
};
globalThis.document = { createElement: () => mockLink, body: { appendChild: () => undefined, removeChild: () => undefined } } as any;
try {
  downloadCSV('phase3d-test', [['Budget', 'Actual'], [100, 120]]);
} finally {
  globalThis.document = originalDocument;
}
assert.equal(csvDownloaded, true);
assert.ok(csvHref.startsWith('data:text/csv'));

console.log('Phase 3D management overview tests passed.');
