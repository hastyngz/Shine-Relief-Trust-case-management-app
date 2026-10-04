import assert from 'node:assert/strict';
import type { AppDatabase } from '../src/types';
import { buildNeedsAttention } from '../src/services/attentionService';

const emptyDb: AppDatabase = {
  girls: [],
  households: [],
  educationalFollowUps: [],
  healthFollowUps: [],
  familyFollowUps: [],
  rentPayments: [],
  expenses: [],
  householdActivities: [],
};

const emptyResults = buildNeedsAttention(emptyDb, '2026-10-04');
assert.equal(emptyResults.length, 3);
assert.ok(emptyResults.every((item) => item.severity === 'low'));

const databaseWithAttention: AppDatabase = {
  ...emptyDb,
  girls: [{
    id: 'SG-1',
    fullName: 'Example Girl',
    dateOfBirth: '2010-01-01',
    gender: 'Female',
    dateAdmitted: '2020-01-01',
    school: 'Example School',
    classLevel: 'Form 1',
    householdId: '',
    status: 'Active',
    guardianInfo: { name: '', relationship: '', phone: '', villageOrLocation: '', situationNotes: '' },
    createdAt: '',
    updatedAt: '',
  }],
  workplans: [{
    id: 'wp-1',
    period: 'October 2026',
    periodType: 'monthly',
    activity: 'School visit',
    objective: 'Visit school',
    description: '',
    responsibleStaffId: 'staff-1',
    responsibleStaffName: 'Staff One',
    startDate: '2026-09-01',
    endDate: '2026-09-10',
    targetCount: 1,
    unit: 'visit',
    location: '',
    status: 'Planned',
    progress: 0,
    createdAt: '',
  }],
  budgets: [{
    id: 'budget-1',
    period: '2026-09',
    periodType: 'monthly',
    programme: 'Education',
    category: 'Education',
    itemDescription: 'School supplies',
    unit: 'set',
    quantity: 1,
    unitCost: 100,
    budgetAmount: 100,
    actualExpenditure: 120,
    createdAt: '',
  }],
  programmeLogs: [],
};

const attention = buildNeedsAttention(databaseWithAttention, '2026-10-04', false);
assert.equal(attention[0]?.id, 'workplan:wp-1');
assert.equal(attention[1]?.id, 'budget:budget-1');
assert.equal(attention.filter((item) => item.id.startsWith('case-review:')).length, 0);
assert.ok(attention.every((item, index) => index === 0 || (
  ['high', 'medium', 'low'].indexOf(attention[index - 1].severity)
  <= ['high', 'medium', 'low'].indexOf(item.severity)
)));

console.log('attentionService tests passed');
