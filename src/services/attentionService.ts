import type { AppDatabase } from '../types';
import { PROGRAMMES, type ProgrammeId } from '../data/programmes';

export type AttentionSeverity = 'high' | 'medium' | 'low';

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  target: string;
}

const severityOrder: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };
const dayMs = 24 * 60 * 60 * 1000;

export function buildNeedsAttention(
  db: AppDatabase,
  today = new Date().toISOString().slice(0, 10),
  canViewCaseReviews = true
): AttentionItem[] {
  const rows: Array<{ item: AttentionItem; sortDate: string }> = [];
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  const thirtyDaysAgo = new Date(todayMs - 30 * dayMs).toISOString().slice(0, 10);
  const girlsById = new Map(db.girls.map((girl) => [girl.id, girl]));

  (db.workplans || []).forEach((workplan) => {
    if (['Completed', 'Cancelled'].includes(workplan.status) || !workplan.endDate || workplan.endDate >= today) return;
    rows.push({
      item: {
        id: `workplan:${workplan.id}`,
        severity: 'high',
        title: `Overdue workplan: ${workplan.activity}`,
        detail: `Due ${workplan.endDate} · ${workplan.responsibleStaffName || 'Unassigned'}`,
        target: '#/planning',
      },
      sortDate: workplan.endDate,
    });
  });

  (db.budgets || []).forEach((budget) => {
    const actual = budget.actualExpenditure || 0;
    if (budget.budgetAmount <= 0 || actual <= budget.budgetAmount * 1.1) return;
    rows.push({
      item: {
        id: `budget:${budget.id}`,
        severity: 'high',
        title: `Budget line over by more than 10%: ${budget.itemDescription}`,
        detail: `${budget.period} · ${Math.round((actual / budget.budgetAmount - 1) * 100)}% over budget`,
        target: '#/planning',
      },
      sortDate: budget.updatedAt || today,
    });
  });

  (db.payrollRecords || []).forEach((payroll) => {
    if (!['Unpaid', 'Partially Paid', 'Pending'].includes(payroll.paymentStatus)
      || !payroll.payPeriodEndDate
      || payroll.payPeriodEndDate > today) return;
    rows.push({
      item: {
        id: `payroll:${payroll.id}`,
        severity: payroll.payPeriodEndDate < today ? 'high' : 'medium',
        title: `Payroll ${payroll.payPeriodEndDate < today ? 'overdue' : 'due'}: ${payroll.employeeName}`,
        detail: `${payroll.payPeriod} · ${payroll.paymentStatus}`,
        target: '#/payroll',
      },
      sortDate: payroll.payPeriodEndDate,
    });
  });

  if (canViewCaseReviews) {
    const latestReviewByGirl = new Map<string, string>();
    (db.caseReviews || []).forEach((review) => {
      const previous = latestReviewByGirl.get(review.girlId);
      if (!previous || review.reviewDate > previous) latestReviewByGirl.set(review.girlId, review.reviewDate);
    });
    db.girls.filter((girl) => girl.status === 'Active').forEach((girl) => {
      const latestReview = latestReviewByGirl.get(girl.id);
      if (latestReview && latestReview > thirtyDaysAgo) return;
      rows.push({
        item: {
          id: `case-review:${girl.id}`,
          severity: 'medium',
          title: `Case review overdue: ${girl.fullName}`,
          detail: latestReview ? `Last review ${latestReview}` : 'No case review recorded',
          target: `#/girl/${encodeURIComponent(girl.id)}`,
        },
        sortDate: latestReview || '0000-00-00',
      });
    });
  }

  const girlsWithEducationConcern = new Set<string>();
  (db.educationalFollowUps || []).filter((record) => record.furtherActionRequired).forEach((record) => {
    girlsWithEducationConcern.add(record.girlId);
  });
  (db.academicSupports || []).filter((record) => record.furtherActionRequired).forEach((record) => {
    girlsWithEducationConcern.add(record.girlId);
  });

  const absentCountByGirl = new Map<string, number>();
  (db.attendanceRecords || []).filter((record) => record.date >= thirtyDaysAgo && record.date <= today && record.status === 'Absent')
    .forEach((record) => absentCountByGirl.set(record.girlId, (absentCountByGirl.get(record.girlId) || 0) + 1));

  const concernGirlIds = new Set([...girlsWithEducationConcern, ...absentCountByGirl.keys()]);
  concernGirlIds.forEach((girlId) => {
    const girl = girlsById.get(girlId);
    if (!girl) return;
    const absences = absentCountByGirl.get(girlId) || 0;
    const hasEducationConcern = girlsWithEducationConcern.has(girlId);
    rows.push({
      item: {
        id: `girl-concern:${girlId}`,
        severity: 'medium',
        title: `Attendance or education follow-up: ${girl.fullName}`,
        detail: [
          absences ? `${absences} absence${absences === 1 ? '' : 's'} in the last 30 days` : '',
          hasEducationConcern ? 'Education follow-up required' : '',
        ].filter(Boolean).join(' · '),
        target: `#/girl/${encodeURIComponent(girlId)}`,
      },
      sortDate: today,
    });
  });

  const unconfirmedStartIds: ProgrammeId[] = ['bursary', 'shine-village', 'child-house'];
  unconfirmedStartIds.forEach((id) => {
    const programme = PROGRAMMES.find((item) => item.id === id);
    if (!programme || programme.startConfirmed || !programme.startYear) return;
    rows.push({
      item: {
        id: `programme-start:${id}`,
        severity: 'low',
        title: `Confirm ${programme.name} start date`,
        detail: `Currently recorded as ${programme.startYear}`,
        target: `#/programmes/${id}`,
      },
      sortDate: `${programme.startYear}-01-01`,
    });
  });

  return rows
    .sort((left, right) =>
      severityOrder[left.item.severity] - severityOrder[right.item.severity]
      || left.sortDate.localeCompare(right.sortDate)
      || left.item.id.localeCompare(right.item.id)
    )
    .map(({ item }) => item);
}
