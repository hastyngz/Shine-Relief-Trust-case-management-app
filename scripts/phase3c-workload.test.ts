import assert from 'node:assert/strict';
import { buildActivityOverview, buildWorkloadSummary, normalizeWorkplanStatus, summarizeWorkplanHealth } from '../src/services/workload';

const workplans = [
  {
    id: 'w1',
    period: 'Q1 2026',
    periodType: 'quarterly',
    activity: 'School monitor',
    objective: 'Check attendance',
    description: 'Check attendance',
    responsibleStaffId: 'staff-1',
    responsibleStaffName: 'Amina',
    startDate: '2026-01-05',
    endDate: '2026-01-20',
    targetCount: 10,
    unit: 'visits',
    completedCount: 6,
    location: 'Zomba',
    status: 'Not Started' as const,
    progress: 60,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'w2',
    period: 'Q1 2026',
    periodType: 'quarterly',
    activity: 'Family follow-up',
    objective: 'Track household support',
    description: 'Track household support',
    responsibleStaffId: 'staff-1',
    responsibleStaffName: 'Amina',
    startDate: '2026-01-06',
    endDate: '2026-01-30',
    targetCount: 8,
    unit: 'visits',
    completedCount: 8,
    location: 'Zomba',
    status: 'Completed' as const,
    progress: 100,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'w3',
    period: 'Q1 2026',
    periodType: 'quarterly',
    activity: 'Case review',
    objective: 'Review youth cases',
    description: 'Review youth cases',
    responsibleStaffId: 'staff-2',
    responsibleStaffName: 'Benson',
    startDate: '2026-01-10',
    endDate: '2026-01-25',
    targetCount: 5,
    unit: 'cases',
    completedCount: 2,
    location: 'Blantyre',
    status: 'On Hold' as const,
    progress: 40,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  },
] as any;

assert.equal(normalizeWorkplanStatus('Not Started'), 'Planned');
assert.equal(normalizeWorkplanStatus('On Hold'), 'Delayed');
assert.equal(normalizeWorkplanStatus('Delayed'), 'Delayed');
assert.equal(normalizeWorkplanStatus('In Progress'), 'In Progress');

const summary = buildWorkloadSummary(workplans, '2026-01-20');
assert.equal(summary.totalPlans, 3);
assert.equal(summary.byStaff['staff-1'].plannedCount, 2);
assert.equal(summary.byStaff['staff-1'].completedCount, 1);
assert.equal(summary.byStaff['staff-1'].totalProgress, 80);
assert.equal(summary.byStaff['staff-2'].delayedCount, 1);
assert.equal(summary.onTrackCount, 1);
assert.equal(summary.overdueCount, 0);
assert.equal(summary.completedCount, 1);

const health = summarizeWorkplanHealth(workplans);
assert.equal(health.overdueCount, 1);
assert.equal(health.atRiskCount, 1);
assert.equal(health.completedCount, 1);

const schedules = [
  {
    id: 's1',
    type: 'school_visit',
    title: 'School monitoring visit',
    scheduledDate: '2026-01-21',
    assignedStaffId: 'staff-1',
    assignedStaffName: 'Amina',
    status: 'Upcoming',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 's2',
    type: 'household_visit',
    title: 'Family follow-up',
    scheduledDate: '2026-01-15',
    assignedStaffId: 'staff-2',
    assignedStaffName: 'Benson',
    status: 'Completed',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 's3',
    type: 'activity',
    title: 'Review meeting',
    scheduledDate: '2026-01-18',
    assignedStaffId: 'staff-2',
    assignedStaffName: 'Benson',
    status: 'Upcoming',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
] as any;

const activityOverview = buildActivityOverview(workplans, schedules, '2026-01-20');
assert.equal(activityOverview.upcomingCount, 2);
assert.equal(activityOverview.overdueCount, 1);
assert.equal(activityOverview.todayCount, 1);
assert.equal(activityOverview.byStaff['staff-1'].upcomingCount, 1);
assert.equal(activityOverview.byStaff['staff-1'].todayCount, 1);
assert.equal(activityOverview.byStaff['staff-2'].upcomingCount, 1);
assert.equal(activityOverview.byStaff['staff-2'].overdueCount, 1);

console.log('Phase 3C workload summary tests passed.');
