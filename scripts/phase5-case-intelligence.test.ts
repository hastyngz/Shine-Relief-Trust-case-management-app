import assert from 'node:assert/strict';
import { buildIntelligentCaseSummary, detectIntelligenceSuggestions, filterCaseIntelligenceData, findPotentialDuplicates, scanDataQuality } from '../src/services/caseIntelligenceService';

const db: any = {
  girls: [
    { id: 'g1', fullName: 'Margaret Banda', dateOfBirth: '2012-01-01', householdId: 'h1', school: 'Zomba Primary', guardianInfo: { name: 'Grace', phone: '', relationship: 'Aunt' } },
    { id: 'g2', fullName: 'Margaret Banda', dateOfBirth: '2012-01-01', householdId: 'h1', school: 'Zomba Primary', guardianInfo: { name: 'Grace', phone: '', relationship: 'Aunt' } },
  ],
  households: [{ id: 'h1', name: 'Shine House', location: 'Zomba', houseMum: 'Grace' }],
  educationalFollowUps: [{ id: 'edu1', girlId: 'g1', date: '2026-09-01', school: 'Zomba Primary', classLevel: 'Standard 5', academicIssue: 'Attendance', furtherActionRequired: true, recommendations: 'School visit' }],
  healthFollowUps: [], familyFollowUps: [], caseActions: [{ id: 'action1', girlId: 'g1', title: 'School visit', dueDate: '2026-08-01', status: 'Open', assignedStaffId: 'staff-1', sourceType: 'manual' }, { id: 'action2', girlId: 'g1', title: 'Assign owner', dueDate: '2026-08-01', status: 'Open', assignedStaffId: '', sourceType: 'manual' }], caseReviews: [], householdActivities: [], attachments: [], people: [],
};

const sensitiveDb: any = {
  ...db,
  healthFollowUps: [{ id: 'health-private', girlId: 'g1', date: '2026-09-10', reasonForVisit: 'SYNTHETIC_MEDICAL_NOTE', furtherActionRequired: true, recommendations: 'SYNTHETIC_HEALTH_RECOMMENDATION', nextFollowUpDate: '2026-09-30' }],
  caseReviews: [{ id: 'review-private', girlId: 'g1', nextReviewDate: '2026-10-10', summary: 'SYNTHETIC_CASE_REVIEW_NOTE', health: 'SYNTHETIC_REVIEW_HEALTH_NOTE' }],
  attachments: [
    { id: 'medical-attachment', targetId: 'g1', targetType: 'girl', fileName: 'SYNTHETIC_MEDICAL_FILENAME', category: 'Medical Document' },
    { id: 'safeguarding-attachment', targetId: 'g1', targetType: 'safeguardingCase', fileName: 'SYNTHETIC_SAFEGUARDING_FILENAME', category: 'Other' },
  ],
};
const restrictedDb = filterCaseIntelligenceData(sensitiveDb, { canViewHealthRecords: false, canViewCaseReviews: false });
assert.equal(restrictedDb.healthFollowUps.length, 0);
assert.equal((restrictedDb.caseReviews || []).length, 0);
assert.ok(!(restrictedDb.attachments || []).some((item) => item.fileName === 'SYNTHETIC_MEDICAL_FILENAME'));
assert.ok(!(restrictedDb.attachments || []).some((item) => item.fileName === 'SYNTHETIC_SAFEGUARDING_FILENAME'));
const restrictedSummary = buildIntelligentCaseSummary(restrictedDb, 'g1');
assert.ok(!JSON.stringify(restrictedSummary).includes('SYNTHETIC_MEDICAL_NOTE'));
assert.ok(!JSON.stringify(restrictedSummary).includes('SYNTHETIC_HEALTH_RECOMMENDATION'));
assert.ok(!JSON.stringify(restrictedSummary).includes('SYNTHETIC_CASE_REVIEW_NOTE'));
assert.ok(!restrictedSummary?.upcomingActions.some((item) => item.includes('2026-10-10')));
const permittedDb = filterCaseIntelligenceData(sensitiveDb, { canViewHealthRecords: true, canViewCaseReviews: true });
assert.equal(permittedDb.healthFollowUps.length, 1);
assert.equal((permittedDb.caseReviews || []).length, 1);
assert.ok(!JSON.stringify(filterCaseIntelligenceData(sensitiveDb, { canViewHealthRecords: false, canViewCaseReviews: true }).caseReviews).includes('SYNTHETIC_REVIEW_HEALTH_NOTE'));

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
