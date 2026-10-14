import assert from 'node:assert/strict';
import { COLLECTIONS, shouldSubscribeToCollection } from '../src/services/firestoreSync';

// Management-only listeners must remain off unless App.tsx explicitly grants access.
assert.equal(shouldSubscribeToCollection(COLLECTIONS.WHAT_IF_SCENARIOS), false);
assert.equal(shouldSubscribeToCollection(COLLECTIONS.PROJECT_PROJECTIONS, {}), false);
assert.equal(shouldSubscribeToCollection(COLLECTIONS.WHAT_IF_SCENARIOS, { canReadManagementPlanning: true }), true);
assert.equal(shouldSubscribeToCollection(COLLECTIONS.PROJECT_PROJECTIONS, { canReadManagementPlanning: true }), true);

// Restricted import source data is opt-in; sensitive follow-up/review listeners
// are skipped only when the caller explicitly says the role cannot read them.
assert.equal(shouldSubscribeToCollection(COLLECTIONS.RESTRICTED_IMPORT_SOURCES), false);
assert.equal(shouldSubscribeToCollection(COLLECTIONS.RESTRICTED_IMPORT_SOURCES, { canReadImportSourceData: true }), true);
assert.equal(shouldSubscribeToCollection(COLLECTIONS.HEALTH_FOLLOW_UPS, { canReadHealthRecords: false }), false);
assert.equal(shouldSubscribeToCollection(COLLECTIONS.HEALTH_FOLLOW_UPS, { canReadHealthRecords: true }), true);
assert.equal(shouldSubscribeToCollection(COLLECTIONS.CASE_REVIEWS, { canReadCaseReviews: false }), false);
assert.equal(shouldSubscribeToCollection(COLLECTIONS.CASE_REVIEWS, { canReadCaseReviews: true }), true);

// Ordinary listeners retain the existing default behavior.
assert.equal(shouldSubscribeToCollection(COLLECTIONS.GIRLS), true);
assert.equal(shouldSubscribeToCollection(COLLECTIONS.CONTACTS, {}), true);

console.log('Firestore listener permission tests passed.');
