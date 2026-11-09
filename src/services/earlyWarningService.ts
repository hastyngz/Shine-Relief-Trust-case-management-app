import type { AppDatabase } from '../types';
import type { AttentionItem } from './attentionService';

export interface EarlyWarningThresholds {
  attendanceMinimumPercent: number;
  attendanceDropPercentagePoints: number;
  gradeDropPoints: number;
  noFollowUpDays: number;
  clinicOverdueGraceDays: number;
}

export const DEFAULT_EARLY_WARNING_THRESHOLDS: EarlyWarningThresholds = {
  attendanceMinimumPercent: 70,
  attendanceDropPercentagePoints: 20,
  gradeDropPoints: 10,
  noFollowUpDays: 60,
  clinicOverdueGraceDays: 0,
};

const DAY_MS = 86_400_000;
const dateMs = (date: string) => new Date(`${date}T00:00:00.000Z`).getTime();
const isValidDate = (date?: string) => Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(dateMs(date)));

function numericGrade(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/\b(\d{1,3}(?:\.\d+)?)\s*%?\b/);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 0 && number <= 100 ? number : null;
}

/** Deterministic local-only rules; never calls an AI or network service. */
export function buildGirlEarlyWarnings(
  db: AppDatabase,
  today = new Date().toISOString().slice(0, 10),
  canViewHealthRecords = false,
  thresholds: Partial<EarlyWarningThresholds> = {},
): AttentionItem[] {
  const config = { ...DEFAULT_EARLY_WARNING_THRESHOLDS, ...thresholds };
  const now = dateMs(today);
  const girls = db.girls.filter((girl) => girl.status === 'Active');
  const households = new Map((db.households || []).map((household) => [household.id, household]));
  const flagsByGirl = new Map<string, AttentionItem[]>();
  const add = (girlId: string, item: Omit<AttentionItem, 'id' | 'target'> & { target?: string }) => {
    const rows = flagsByGirl.get(girlId) || [];
    rows.push({ ...item, id: `early-warning:${girlId}:${rows.length + 1}`, target: item.target || `#/girl/${encodeURIComponent(girlId)}` });
    flagsByGirl.set(girlId, rows);
  };

  for (const girl of girls) {
    const attendance = (db.attendanceRecords || []).filter((row) => row.girlId === girl.id && isValidDate(row.date));
    const recentStart = now - 30 * DAY_MS;
    const previousStart = now - 60 * DAY_MS;
    const recent = attendance.filter((row) => dateMs(row.date) >= recentStart && dateMs(row.date) <= now);
    const previous = attendance.filter((row) => dateMs(row.date) >= previousStart && dateMs(row.date) < recentStart);
    const attendanceRate = (rows: typeof attendance) => rows.length
      ? rows.filter((row) => row.status === 'Present' || row.status === 'Late').length / rows.length * 100
      : null;
    const recentRate = attendanceRate(recent);
    const previousRate = attendanceRate(previous);
    if (recentRate !== null && recent.length >= 2 && recentRate < config.attendanceMinimumPercent) {
      add(girl.id, { severity: 'high', title: 'Attendance has fallen', detail: `Present or late at ${Math.round(recentRate)}% of ${recent.length} recorded sessions in the last 30 days (threshold ${config.attendanceMinimumPercent}%).` });
    } else if (recentRate !== null && previousRate !== null && previous.length >= 2 && recent.length >= 2
      && previousRate - recentRate >= config.attendanceDropPercentagePoints) {
      add(girl.id, { severity: 'high', title: 'Attendance has dropped between periods', detail: `Attendance changed from ${Math.round(previousRate)}% in the previous 30 days to ${Math.round(recentRate)}% in the last 30 days (drop ${Math.round(previousRate - recentRate)} percentage points).` });
    }

    const exams = (db.examinationRecords || []).filter((row) => row.girlId === girl.id)
      .map((row) => ({ row, score: numericGrade(row.overallOutcome), period: row.examinationYear }))
      .filter((row) => row.score !== null)
      .sort((a, b) => String(a.period).localeCompare(String(b.period)));
    if (exams.length >= 2) {
      const previousExam = exams[exams.length - 2];
      const latestExam = exams[exams.length - 1];
      const drop = (previousExam.score as number) - (latestExam.score as number);
      if (drop >= config.gradeDropPoints) add(girl.id, {
        severity: 'medium', title: 'Exam results have fallen',
        detail: `Recorded result changed from ${previousExam.score} in ${previousExam.period} to ${latestExam.score} in ${latestExam.period} (drop ${drop} points).`,
      });
    }

    const education = (db.educationalFollowUps || []).filter((row) => row.girlId === girl.id);
    const family = (db.familyFollowUps || []).filter((row) => row.girlId === girl.id);
    const health = canViewHealthRecords ? (db.healthFollowUps || []).filter((row) => row.girlId === girl.id) : [];
    const latestDates = [...education, ...family, ...health].map((row) => row.date).filter(isValidDate);
    const latest = latestDates.length ? latestDates.sort().at(-1) : undefined;
    if (!latest || now - dateMs(latest) >= config.noFollowUpDays * DAY_MS) {
      const days = latest ? Math.floor((now - dateMs(latest)) / DAY_MS) : null;
      add(girl.id, { severity: 'medium', title: 'No recent case follow-up', detail: days === null
        ? 'No education, family, or health follow-up is recorded.'
        : `The latest recorded follow-up was ${days} days ago; the threshold is ${config.noFollowUpDays} days.` });
    }

    if (canViewHealthRecords) {
      const outstandingClinic = health.filter((row) => row.furtherActionRequired);
      const overdueClinic = outstandingClinic.filter((row) => isValidDate(row.nextFollowUpDate)
        && dateMs(row.nextFollowUpDate as string) < now - config.clinicOverdueGraceDays * DAY_MS);
      if (overdueClinic.length || outstandingClinic.length >= 2) {
        add(girl.id, { severity: 'high', title: 'Clinic follow-up needs attention', detail: overdueClinic.length
          ? `${overdueClinic.length} clinic follow-up(s) are overdue; earliest due date ${overdueClinic.map((row) => row.nextFollowUpDate as string).sort()[0]}.`
          : `${outstandingClinic.length} clinic follow-ups still require action.` });
      }
    }

    const householdId = girl.householdId;
    const missedRent = (db.rentPayments || []).filter((payment) => payment.householdId === householdId && payment.paymentStatus === 'Not paid');
    if (householdId && missedRent.length) add(girl.id, {
      severity: 'high', title: 'Household rent payment needs attention',
      detail: `${missedRent.length} rent payment record(s) are marked Not paid.`,
      target: '#/households',
    });
  }

  for (const [girlId, flags] of flagsByGirl) {
    if (flags.length >= 2) flags.unshift({
      id: `early-warning:${girlId}:combined`, severity: 'high', title: 'Needs attention now',
      detail: `${flags.length} separate attention flags are active for this girl.`,
      target: `#/girl/${encodeURIComponent(girlId)}`,
    });
  }
  return [...flagsByGirl.values()].flat();
}
