import type { WorkplanItem } from '../types';

export const MAX_WORKPLANS_PER_STAFF_PER_WEEK = 6;

export interface WorkplanOccurrence {
  workplanId: string;
  date: string;
  occurrenceId: string;
  completed: boolean;
}

const parseDate = (date: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : parsed;
};

const addInterval = (anchor: Date, every: NonNullable<WorkplanItem['recurrence']>['every'], index: number): Date => {
  const monthOffset = every === 'month' ? index : every === 'term' ? index * 3 : every === 'year' ? index * 12 : 0;
  if (every === 'week') return new Date(anchor.getTime() + index * 7 * 86400000);
  const year = anchor.getUTCFullYear() + Math.floor((anchor.getUTCMonth() + monthOffset) / 12);
  const month = (anchor.getUTCMonth() + monthOffset) % 12;
  const day = Math.min(anchor.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day));
};

export function expandWorkplanOccurrences(
  workplans: WorkplanItem[],
  rangeStart: string,
  rangeEnd: string
): WorkplanOccurrence[] {
  const start = parseDate(rangeStart);
  const end = parseDate(rangeEnd);
  if (!start || !end || start > end) return [];
  const startKey = start.toISOString().slice(0, 10);
  const endKey = end.toISOString().slice(0, 10);
  const occurrences: WorkplanOccurrence[] = [];

  workplans.forEach((item) => {
    const anchor = parseDate(item.endDate);
    if (!anchor) return;
    const until = item.recurrence?.until ? parseDate(item.recurrence.until) : null;
    if (item.recurrence?.until && !until) return;
    if (until && until < anchor) return;
    const lastDate = until && until < end ? until : end;

    if (!item.recurrence) {
      const date = anchor.toISOString().slice(0, 10);
      if (date < startKey || date > endKey) return;
      occurrences.push({
        workplanId: item.id,
        date,
        occurrenceId: `${item.id}@${date}`,
        completed: (item.completionDates || []).includes(date),
      });
      return;
    }

    for (let index = 0; index < 10000; index += 1) {
      const date = addInterval(anchor, item.recurrence.every, index);
      const key = date.toISOString().slice(0, 10);
      if (date > lastDate) break;
      if (key >= startKey) {
        occurrences.push({
          workplanId: item.id,
          date: key,
          occurrenceId: `${item.id}@${key}`,
          completed: (item.completionDates || []).includes(key),
        });
      }
    }
  });

  return occurrences.sort((left, right) => left.date.localeCompare(right.date) || left.workplanId.localeCompare(right.workplanId));
}

export function findOverloadedStaff(
  workplans: WorkplanItem[],
  rangeStart: string,
  rangeEnd: string,
  threshold = MAX_WORKPLANS_PER_STAFF_PER_WEEK
): Set<string> {
  const weeklyLoads = new Map<string, number>();
  const plansById = new Map(workplans.map((item) => [item.id, item]));
  expandWorkplanOccurrences(workplans, rangeStart, rangeEnd)
    .filter((occurrence) => !occurrence.completed && !['Completed', 'Cancelled'].includes(plansById.get(occurrence.workplanId)?.status || ''))
    .forEach((occurrence) => {
      const item = plansById.get(occurrence.workplanId);
      if (!item?.responsibleStaffId) return;
      const date = parseDate(occurrence.date);
      if (!date) return;
      const day = date.getUTCDay() || 7;
      const weekStart = new Date(date.getTime() - (day - 1) * 86400000).toISOString().slice(0, 10);
      const key = `${item.responsibleStaffId}:${weekStart}`;
      weeklyLoads.set(key, (weeklyLoads.get(key) || 0) + 1);
    });

  return new Set(
    Array.from(weeklyLoads)
      .filter(([, load]) => load > threshold)
      .map(([key]) => key.split(':')[0])
  );
}
