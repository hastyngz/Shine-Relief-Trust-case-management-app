import assert from 'node:assert/strict';
import { buildGirlEarlyWarnings } from '../src/services/earlyWarningService';

const today = '2026-10-15';
const db: any = {
  girls: [{ id: 'G1', fullName: 'Fixture only', status: 'Active', householdId: 'H1' }],
  households: [{ id: 'H1', name: 'Fixture household' }],
  attendanceRecords: [
    { id: 'a1', girlId: 'G1', date: '2026-09-20', status: 'Present' },
    { id: 'a2', girlId: 'G1', date: '2026-09-22', status: 'Present' },
    { id: 'a3', girlId: 'G1', date: '2026-10-05', status: 'Absent' },
    { id: 'a4', girlId: 'G1', date: '2026-10-08', status: 'Absent' },
  ],
  examinationRecords: [
    { id: 'e1', girlId: 'G1', examinationYear: '2025', overallOutcome: '75%' },
    { id: 'e2', girlId: 'G1', examinationYear: '2026', overallOutcome: '55%' },
  ],
  educationalFollowUps: [{ id: 'ed1', girlId: 'G1', date: '2026-07-01' }],
  familyFollowUps: [],
  healthFollowUps: [
    { id: 'h1', girlId: 'G1', date: '2026-08-01', furtherActionRequired: true, nextFollowUpDate: '2026-09-01' },
    { id: 'h2', girlId: 'G1', date: '2026-08-02', furtherActionRequired: true, nextFollowUpDate: '2026-09-02' },
  ],
  rentPayments: [{ id: 'r1', householdId: 'H1', paymentStatus: 'Not paid' }],
};

const restricted = buildGirlEarlyWarnings(db, today, false);
assert.ok(restricted.some((flag) => flag.title === 'Attendance has fallen'));
assert.ok(restricted.some((flag) => flag.title === 'Exam results have fallen'));
assert.ok(restricted.some((flag) => flag.title === 'No recent case follow-up'));
assert.ok(restricted.some((flag) => flag.title === 'Household rent payment needs attention'));
assert.ok(!restricted.some((flag) => flag.title === 'Clinic follow-up needs attention'), 'health flags are hidden without permission');
assert.ok(restricted.some((flag) => flag.title === 'Needs attention now'), 'several flags combine into an urgent flag');

const permitted = buildGirlEarlyWarnings(db, today, true);
assert.ok(permitted.some((flag) => flag.title === 'Clinic follow-up needs attention'));
assert.ok(permitted.some((flag) => flag.detail.includes('overdue')), 'clinic warning explains the overdue count/date');

const stricter = buildGirlEarlyWarnings(db, today, false, { attendanceMinimumPercent: 20, noFollowUpDays: 200, gradeDropPoints: 30 });
assert.ok(!stricter.some((flag) => flag.title === 'Attendance has fallen'), 'administrator-adjustable threshold changes the attendance result');
assert.ok(!stricter.some((flag) => flag.title === 'No recent case follow-up'), 'adjusting the follow-up threshold changes the result');
assert.ok(!stricter.some((flag) => flag.title === 'Exam results have fallen'), 'adjusting the grade threshold changes the result');

console.log('Early-warning rules passed: attendance, grade trend, follow-up age, clinic permission, missed rent, combined flags, and thresholds.');
