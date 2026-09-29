import assert from 'node:assert/strict';
import { buildIntelligentCaseSummary, detectIntelligenceSuggestions, findPotentialDuplicates, scanDataQuality } from '../src/services/caseIntelligenceService';

const db: any = {
  girls: [
    { id: 'g1', fullName: 'Margaret Banda', dateOfBirth: '2012-01-01', householdId: 'h1', school: 'Zomba Primary', guardianInfo: { name: 'Grace', phone: '', relationship: 'Aunt' } },
    { id: 'g2', fullName: 'Margaret Banda', dateOfBirth: '2012-01-01', householdId: 'h1', school: 'Zomba Primary', guardianInfo: { name: 'Grace', phone: '', relationship: 'Aunt' } },
  ],
  households: [{ id: 'h1', name: 'Shine House', location: 'Zomba', houseMum: 'Grace' }],
  educationalFollowUps: [{ id: 'edu1', girlId: 'g1', date: '2026-09-01', school: 'Zomba Primary', classLevel: 'Standard 5', academicIssue: 'Attendance', furtherActionRequired: true, recommendations: 'School visit' }],
  healthFollowUps: [], familyFollowUps: [], caseActions: [{ id: 'action1', girlId: 'g1', title: 'School visit', dueDate: '2026-08-01', status: 'Open', assignedStaffId: 'staff-1' }, { id: 'action2', girlId: 'g1', title: 'Assign owner', dueDate: '2026-08-01', status: 'Open', assignedStaffId: '' }], caseReviews: [], householdActivities: [], attachments: [], people: [],
};

const summary = buildIntelligentCaseSummary(db, 'g1');
assert.equal(summary?.girl.id, 'g1');
assert.equal(summary?.outstandingFollowUps.length, 1);
assert.ok(summary?.missingInformation.includes('Guardian phone is missing'));
assert.ok(detectIntelligenceSuggestions(db, '2026-09-29').some((item) => item.type === 'follow_up'));
assert.ok(detectIntelligenceSuggestions(db, '2026-09-29').some((item) => item.type === 'workplan'));
assert.ok(findPotentialDuplicates(db).some((item) => item.recordType === 'girl'));
assert.ok(scanDataQuality(db).some((item) => item.type === 'duplicate_candidate'));
assert.ok(scanDataQuality(db).some((item) => item.recordId === 'action2'));
console.log('Phase 5 case intelligence tests passed.');
