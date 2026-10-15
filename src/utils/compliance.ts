import type { ScheduleItem } from '../types';

/** Date-only comparisons avoid timezone drift for locally entered deadlines. */
export function isComplianceOverdue(item: Pick<ScheduleItem, 'status' | 'scheduledDate'>, today: string): boolean {
  return item.status !== 'Completed' && item.status !== 'Cancelled'
    && /^\d{4}-\d{2}-\d{2}$/.test(item.scheduledDate)
    && item.scheduledDate < today;
}

export function isComplianceDueSoon(item: Pick<ScheduleItem, 'status' | 'scheduledDate'>, today: string): boolean {
  if (item.status === 'Completed' || item.status === 'Cancelled' || !/^\d{4}-\d{2}-\d{2}$/.test(item.scheduledDate)) return false;
  const due = Date.parse(`${item.scheduledDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(due) && Number.isFinite(current) && due >= current && due - current <= 30 * 86400000;
}
