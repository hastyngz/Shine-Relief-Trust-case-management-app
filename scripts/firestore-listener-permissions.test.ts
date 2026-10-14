import assert from 'node:assert/strict';
import { shouldSubscribeToCollection } from '../src/services/firestoreListenerPermissions';

// Management-only listeners must remain off unless App.tsx explicitly grants access.
assert.equal(shouldSubscribeToCollection('whatIfScenarios'), false);
assert.equal(shouldSubscribeToCollection('projectProjections', {}), false);
assert.equal(shouldSubscribeToCollection('employees', {}), false);
assert.equal(shouldSubscribeToCollection('whatIfScenarios', { canReadManagementPlanning: true }), true);
assert.equal(shouldSubscribeToCollection('projectProjections', { canReadManagementPlanning: true }), true);
assert.equal(shouldSubscribeToCollection('employees', { canReadManagementPlanning: true }), true);

// Restricted import source data is opt-in; sensitive follow-up/review listeners
// are skipped only when the caller explicitly says the role cannot read them.
assert.equal(shouldSubscribeToCollection('restrictedImportSources'), false);
assert.equal(shouldSubscribeToCollection('restrictedImportSources', { canReadImportSourceData: true }), true);
assert.equal(shouldSubscribeToCollection('healthFollowUps', { canReadHealthRecords: false }), false);
assert.equal(shouldSubscribeToCollection('healthFollowUps', { canReadHealthRecords: true }), true);
assert.equal(shouldSubscribeToCollection('caseReviews', { canReadCaseReviews: false }), false);
assert.equal(shouldSubscribeToCollection('caseReviews', { canReadCaseReviews: true }), true);

// Ordinary listeners retain the existing default behavior.
assert.equal(shouldSubscribeToCollection('girls'), true);
assert.equal(shouldSubscribeToCollection('contacts', {}), true);

console.log('Firestore listener permission tests passed.');
