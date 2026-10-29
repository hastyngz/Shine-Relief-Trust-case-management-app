import type { ScheduleItem } from '../types';

export type ComplianceRecurrence = NonNullable<ScheduleItem['complianceRecurrence']>;

function parseDate(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)), day: Number(value.slice(8, 10)) };
}

/** Calculate the next date while retaining the original day-of-month anchor. */
export function getNextComplianceOccurrenceDate(
  currentDate: string,
  recurrence: ComplianceRecurrence,
  anchorDate = currentDate,
): string | null {
  if (recurrence === 'One-off') return null;
  const current = parseDate(currentDate);
  const anchor = parseDate(anchorDate);
  if (!current || !anchor) return null;
  const intervalMonths: Record<Exclude<ComplianceRecurrence, 'One-off'>, number> = {
    Monthly: 1,
    Quarterly: 3,
    'Every 6 months': 6,
    Annually: 12,
  };
  const target = new Date(Date.UTC(current.year, current.month - 1 + intervalMonths[recurrence], 1));
  const year = target.getUTCFullYear();
  const monthIndex = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(anchor.day, lastDay);
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface NextComplianceOccurrence {
  id: string;
  item: Omit<ScheduleItem, 'id' | 'createdAt'>;
}

export function buildNextComplianceOccurrence(
  source: ScheduleItem,
  actor: string,
  createdAt: string,
): NextComplianceOccurrence | null {
  const recurrence = source.complianceRecurrence || 'One-off';
  const anchorDate = source.complianceAnchorDate || source.scheduledDate;
  const nextDate = getNextComplianceOccurrenceDate(source.scheduledDate, recurrence, anchorDate);
  if (!nextDate || recurrence === 'One-off') return null;
  const seriesId = source.complianceSeriesId || source.id;
  const safeSeriesId = seriesId.replace(/[^A-Za-z0-9_-]/g, '_');
  const id = `CMP-REC-${safeSeriesId}-${nextDate}`;
  return {
    id,
    item: {
      type: source.type,
      title: source.title,
      description: source.description,
      scheduledDate: nextDate,
      scheduledTime: source.scheduledTime,
      targetType: 'general',
      location: source.location,
      assignedStaffId: source.assignedStaffId,
      assignedStaffName: source.assignedStaffName,
      status: 'Scheduled',
      notes: source.notes,
      createdBy: actor,
      updatedBy: actor,
      complianceCategory: source.complianceCategory,
      compliancePriority: source.compliancePriority,
      complianceRecurrence: recurrence,
      complianceSeriesId: seriesId,
      complianceAnchorDate: anchorDate,
      complianceHistory: [{
        id: `CREATED-${id}`,
        action: 'Created',
        actor,
        at: createdAt,
        note: `Next occurrence generated from ${source.id}.`,
      }],
    },
  };
}
