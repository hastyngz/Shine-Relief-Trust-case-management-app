import type { ScheduleItem } from '../types';

/** Validate a date-only value without relying on the device timezone. */
function validDate(value: string): boolean {
  if (value.length !== 10 || value[4] !== '-' || value[7] !== '-') return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Date-only comparisons avoid timezone drift for locally entered deadlines. */
export function isComplianceOverdue(item: Pick<ScheduleItem, 'status' | 'scheduledDate'>, today: string): boolean {
  return item.status !== 'Completed' && item.status !== 'Cancelled'
    && validDate(item.scheduledDate) && validDate(today) && item.scheduledDate < today;
}

export function isComplianceDueSoon(item: Pick<ScheduleItem, 'status' | 'scheduledDate'>, today: string): boolean {
  if (item.status === 'Completed' || item.status === 'Cancelled' || !validDate(item.scheduledDate) || !validDate(today)) return false;
  const due = Date.parse(item.scheduledDate + 'T00:00:00Z');
  const current = Date.parse(today + 'T00:00:00Z');
  return due >= current && due - current <= 30 * 86400000;
}
