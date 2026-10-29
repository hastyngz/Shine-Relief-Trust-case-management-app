import assert from 'node:assert/strict';
import type { ScheduleItem } from '../src/types';
import { buildNextComplianceOccurrence, getNextComplianceOccurrenceDate } from '../src/services/complianceRecurrence';

assert.equal(getNextComplianceOccurrenceDate('2026-10-31', 'Monthly', '2026-10-31'), '2026-11-30',
  'monthly recurrence should clamp to the target month end');
assert.equal(getNextComplianceOccurrenceDate('2026-02-28', 'Monthly', '2026-01-31'), '2026-03-31',
  'month-end anchoring should not drift after a short February');
assert.equal(getNextComplianceOccurrenceDate('2026-10-15', 'Quarterly'), '2027-01-15');
assert.equal(getNextComplianceOccurrenceDate('2026-10-15', 'Every 6 months'), '2027-04-15');
assert.equal(getNextComplianceOccurrenceDate('2026-10-15', 'Annually'), '2027-10-15');
assert.equal(getNextComplianceOccurrenceDate('2024-02-29', 'Annually', '2024-02-29'), '2025-02-28');
assert.equal(getNextComplianceOccurrenceDate('2027-02-28', 'Annually', '2024-02-29'), '2028-02-29',
  'leap-day anchor should be restored in the next leap year');
assert.equal(getNextComplianceOccurrenceDate('2026-10-15', 'One-off'), null);
assert.equal(getNextComplianceOccurrenceDate('2026-02-30', 'Monthly'), null);

const source: ScheduleItem = {
  id: 'CMP-SERIES-1',
  type: 'other',
  title: 'Synthetic annual compliance review',
  description: 'Synthetic fixture only',
  scheduledDate: '2026-10-31',
  targetType: 'general',
  assignedStaffId: 'synthetic-staff',
  assignedStaffName: 'Synthetic Staff',
  status: 'Completed',
  completedAt: '2026-10-31T12:00:00.000Z',
  completionNote: 'Synthetic completion note',
  evidenceReference: 'SYNTHETIC-EVIDENCE',
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: 'Synthetic Staff',
  complianceCategory: 'Organisational renewal',
  compliancePriority: 'High',
  complianceRecurrence: 'Monthly',
  complianceSeriesId: 'series-1',
  complianceAnchorDate: '2026-10-31',
};
const next = buildNextComplianceOccurrence(source, 'Synthetic Staff', '2026-10-31T12:00:00.000Z');
assert.ok(next);
assert.equal(next.id, 'CMP-REC-series-1-2026-11-30');
assert.equal(next.item.scheduledDate, '2026-11-30');
assert.equal(next.item.status, 'Scheduled');
assert.equal(next.item.complianceSeriesId, 'series-1');
assert.equal(next.item.complianceAnchorDate, '2026-10-31');
assert.equal(next.item.completionNote, undefined);
assert.equal(next.item.evidenceReference, undefined);
assert.equal(buildNextComplianceOccurrence(source, 'Synthetic Staff', '2026-10-31T12:00:00.000Z')?.id, next.id,
  'retrying occurrence generation must retain the same deterministic ID');

console.log('Compliance recurrence generation tests passed.');
