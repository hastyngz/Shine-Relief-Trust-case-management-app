import assert from 'node:assert/strict';
import { buildManagementAnalytics, canAccessManagementDashboard, projectManagementDatabase } from '../src/services/managementAnalytics';
import { buildManagementReportRows, MANAGEMENT_REPORTS } from '../src/services/managementReports';
import { generateExcelWorkbook, generateWordReport, ReportConfig } from '../src/services/reportGenerators';
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
assert.equal(MANAGEMENT_REPORTS.length, 16);

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
  attachments: [
    { id: 'health-photo', targetType: 'healthFollowUp' },
    { id: 'safeguarding-photo', targetType: 'safeguardingCase' },
    { id: 'house-photo', targetType: 'household' },
  ],
} as any, { canViewHealthRecords: false, canViewSafeguarding: false });
assert.equal(protectedProjection.healthFollowUps.length, 0);
assert.deepEqual(protectedProjection.caseActions?.map((item) => item.id), ['visible-action']);
assert.deepEqual(protectedProjection.attachments?.map((item) => item.id), ['house-photo']);

const filteredPeriods = buildManagementAnalytics({
  ...db,
  educationalFollowUps: [{ id: 'e-old', girlId: 'g1', date: '2026-01-12', furtherActionRequired: true }],
  payrollRecords: [{ id: 'p-period', employeeId: 's1', employeeName: 'Amina', expectedAmount: 200, amountPaid: 100, paymentStatus: 'Partially Paid', payPeriodStartDate: '2026-01-01' }],
} as any, { startDate: '2026-06-01', endDate: '2026-06-30', financialYear: '2026', month: 1 }, [], '2026-06-15');
assert.equal(filteredPeriods.education.outstandingFollowUps, 0);
assert.equal(filteredPeriods.finance.payrollExpected, 200);

const budgetReport = buildManagementReportRows('budget-actual', {
  ...db,
  budgets: [{ id: 'line-1', period: '2026-01', financialYear: '2026', month: 1, programme: 'Education', category: 'Education', itemDescription: 'Books', budgetAmount: 100, actualExpenditure: 120 }],
} as any, { financialYear: '2026', month: 1 });
assert.equal(budgetReport.rows[0][8], -20);
assert.equal(budgetReport.rows[0][9], 20);
assert.equal(budgetReport.rows[0][11], 'Over budget');

for (const reportType of MANAGEMENT_REPORTS) {
  const reportData = buildManagementReportRows(reportType.id, db as any, {}, [], []);
  assert.ok(reportData.headers.length > 0, `${reportType.id} should provide report columns`);
}

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
const wordReport = await generateWordReport(reportDb, reportConfig);
const wordWithAttachmentReferences = await generateWordReport({ ...reportDb, attachments: [{ id: 'photo-1', targetType: 'household', targetId: 'h1', fileName: 'house.jpg', category: 'Household Condition', date: '2026-01-10', downloadUrl: '', storagePath: '', contentType: 'image/jpeg', fileSize: 100, uploadedBy: { uid: 'manager', name: 'Manager', email: 'manager@example.test' } }] } as any, {
  ...reportConfig,
  selectedPhotoIds: ['photo-1'],
  includeSections: { ...reportConfig.includeSections, photoGallery: true },
});
const excelReport = generateExcelWorkbook(reportDb, reportConfig);
assert.ok(wordReport.size > 0);
assert.ok(wordWithAttachmentReferences.size > 0);
assert.ok(excelReport.byteLength > 0 || excelReport.length > 0);

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
