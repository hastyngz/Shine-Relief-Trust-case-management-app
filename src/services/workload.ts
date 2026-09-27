import type { ScheduleItem, WorkplanItem, WorkplanStatus } from '../types';

export type WorkloadStaffSummary = {
  id: string;
  name: string;
  plannedCount: number;
  activeCount: number;
  completedCount: number;
  delayedCount: number;
  totalProgress: number;
  averageProgress: number;
};

export type WorkloadSummary = {
  totalPlans: number;
  activePlans: number;
  completedCount: number;
  delayedCount: number;
  overdueCount: number;
  onTrackCount: number;
  byStaff: Record<string, WorkloadStaffSummary>;
};

export type WorkplanHealthSummary = {
  overdueCount: number;
  atRiskCount: number;
  completedCount: number;
};

export type ActivityOverviewStaffSummary = {
  id: string;
  name: string;
  upcomingCount: number;
  overdueCount: number;
  todayCount: number;
};

export type ActivityOverview = {
  totalActivities: number;
  upcomingCount: number;
  overdueCount: number;
  todayCount: number;
  byStaff: Record<string, ActivityOverviewStaffSummary>;
};

export function normalizeWorkplanStatus(status?: string): WorkplanStatus {
  const value = (status || '').trim();
  switch (value) {
    case 'Not Started':
    case 'Planned':
      return 'Planned';
    case 'On Hold':
    case 'Delayed':
      return 'Delayed';
    case 'In Progress':
      return 'In Progress';
    case 'Completed':
      return 'Completed';
    case 'Cancelled':
      return 'Cancelled';
    default:
      return 'Planned';
  }
}

function calculateProgress(item: Pick<WorkplanItem, 'progress' | 'completedCount' | 'targetCount'>): number {
  if (typeof item.progress === 'number' && Number.isFinite(item.progress)) return Math.max(0, Math.min(100, item.progress));
  const target = Number(item.targetCount) || 0;
  const completed = Number(item.completedCount) || 0;
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / target) * 100)));
}

export function buildWorkloadSummary(workplans: WorkplanItem[] = [], referenceDate?: string): WorkloadSummary {
  const today = referenceDate || new Date().toISOString().slice(0, 10);
  const byStaff: Record<string, WorkloadStaffSummary> = {};

  const registerStaff = (id: string, name: string) => {
    if (!byStaff[id]) {
      byStaff[id] = {
        id,
        name,
        plannedCount: 0,
        activeCount: 0,
        completedCount: 0,
        delayedCount: 0,
        totalProgress: 0,
        averageProgress: 0,
      };
    }
  };

  let completedCount = 0;
  let delayedCount = 0;
  let overdueCount = 0;
  let onTrackCount = 0;

  workplans.forEach((plan) => {
    const status = normalizeWorkplanStatus(plan.status);
    const staffKey = plan.responsibleStaffId || 'unassigned';
    const staffName = plan.responsibleStaffName || 'Unassigned';
    registerStaff(staffKey, staffName);

    const staffEntry = byStaff[staffKey];
    staffEntry.plannedCount += 1;

    if (status === 'Completed') {
      staffEntry.completedCount += 1;
      completedCount += 1;
    }

    if (status === 'Delayed') {
      staffEntry.delayedCount += 1;
      delayedCount += 1;
    }

    if (status === 'In Progress' || status === 'Planned') {
      staffEntry.activeCount += 1;
    }

    const progress = calculateProgress(plan);
    staffEntry.totalProgress += progress;
    staffEntry.averageProgress = staffEntry.plannedCount > 0 ? Math.round(staffEntry.totalProgress / staffEntry.plannedCount) : 0;

    const isPastDue = !!plan.endDate && plan.endDate <= today && (status === 'In Progress' || status === 'Delayed');
    if (isPastDue) {
      overdueCount += 1;
    }

    const isOnTrack = status !== 'Completed' && status !== 'Cancelled' && status !== 'Delayed' && !isPastDue;
    if (isOnTrack) {
      onTrackCount += 1;
    }
  });

  Object.values(byStaff).forEach((entry) => {
    entry.averageProgress = entry.plannedCount > 0 ? Math.round(entry.totalProgress / entry.plannedCount) : 0;
    entry.totalProgress = entry.plannedCount > 0 ? Math.round(entry.totalProgress / entry.plannedCount) : 0;
  });

  return {
    totalPlans: workplans.length,
    activePlans: workplans.filter((plan) => normalizeWorkplanStatus(plan.status) !== 'Completed' && normalizeWorkplanStatus(plan.status) !== 'Cancelled').length,
    completedCount,
    delayedCount,
    overdueCount,
    onTrackCount,
    byStaff,
  };
}

export function summarizeWorkplanHealth(workplans: WorkplanItem[] = []): WorkplanHealthSummary {
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = workplans.filter((plan) => {
    const status = normalizeWorkplanStatus(plan.status);
    return !!plan.endDate && plan.endDate <= today && (status === 'In Progress' || status === 'Delayed');
  }).length;

  const atRiskCount = workplans.filter((plan) => {
    const status = normalizeWorkplanStatus(plan.status);
    return status === 'Delayed';
  }).length;

  const completedCount = workplans.filter((plan) => normalizeWorkplanStatus(plan.status) === 'Completed').length;

  return { overdueCount, atRiskCount, completedCount };
}

export function buildActivityOverview(workplans: WorkplanItem[] = [], schedules: ScheduleItem[] = [], referenceDate?: string): ActivityOverview {
  const today = referenceDate || new Date().toISOString().slice(0, 10);
  const byStaff: Record<string, ActivityOverviewStaffSummary> = {};

  const registerStaff = (id: string, name: string) => {
    if (!byStaff[id]) {
      byStaff[id] = { id, name, upcomingCount: 0, overdueCount: 0, todayCount: 0 };
    }
  };

  const bump = (id: string, name: string, bucket: 'upcoming' | 'overdue' | 'today') => {
    registerStaff(id, name);
    const entry = byStaff[id];
    if (bucket === 'upcoming') entry.upcomingCount += 1;
    if (bucket === 'overdue') entry.overdueCount += 1;
    if (bucket === 'today') entry.todayCount += 1;
  };

  let upcomingCount = 0;
  let overdueCount = 0;
  let todayCount = 0;

  workplans.forEach((plan) => {
    const status = normalizeWorkplanStatus(plan.status);
    if (status === 'Completed' || status === 'Cancelled') return;

    const staffId = plan.responsibleStaffId || 'unassigned';
    const staffName = plan.responsibleStaffName || 'Unassigned';

    if (!!plan.endDate && plan.endDate < today && (status === 'In Progress' || status === 'Delayed')) {
      overdueCount += 1;
      bump(staffId, staffName, 'overdue');
      return;
    }

    if (plan.endDate === today || plan.startDate === today) {
      todayCount += 1;
      bump(staffId, staffName, 'today');
      return;
    }

    if (!plan.endDate || plan.endDate >= today) {
      upcomingCount += 1;
      bump(staffId, staffName, 'upcoming');
    }
  });

  schedules.forEach((item) => {
    const status = (item.status || 'Upcoming').trim();
    if (status === 'Completed' || status === 'Cancelled') return;

    const staffId = item.assignedStaffId || 'unassigned';
    const staffName = item.assignedStaffName || 'Unassigned';
    if (!item.scheduledDate) {
      upcomingCount += 1;
      bump(staffId, staffName, 'upcoming');
      return;
    }

    if (item.scheduledDate < today) {
      overdueCount += 1;
      bump(staffId, staffName, 'overdue');
      return;
    }

    if (item.scheduledDate === today) {
      todayCount += 1;
      bump(staffId, staffName, 'today');
      return;
    }

    upcomingCount += 1;
    bump(staffId, staffName, 'upcoming');
  });

  return {
    totalActivities: upcomingCount + overdueCount + todayCount,
    upcomingCount,
    overdueCount,
    todayCount,
    byStaff,
  };
}
