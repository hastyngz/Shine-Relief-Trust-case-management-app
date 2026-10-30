import assert from 'node:assert/strict';
import { shouldSubscribeToCollection } from '../src/services/firestoreListenerPermissions';
import { aggregateFirestoreSnapshotMetadata } from '../src/services/firestoreSnapshotState';

// Management-only listeners must remain off unless App.tsx explicitly grants access.
assert.equal(shouldSubscribeToCollection('whatIfScenarios'), false);
assert.equal(shouldSubscribeToCollection('projectProjections', {}), false);
assert.equal(shouldSubscribeToCollection('employees', {}), false);
assert.equal(shouldSubscribeToCollection('whatIfScenarios', { canReadManagementPlanning: true }), true);
assert.equal(shouldSubscribeToCollection('projectProjections', { canReadManagementPlanning: true }), true);
assert.equal(shouldSubscribeToCollection('employees', { canReadManagementPlanning: true }), true);

// Case-action listeners must be UID-scoped for non-management callers.
assert.equal(shouldSubscribeToCollection('caseActions'), false);
assert.equal(shouldSubscribeToCollection('caseActions', { canViewTeamTasks: false }), false);
assert.equal(shouldSubscribeToCollection('caseActions', { uid: 'staff-uid', canViewTeamTasks: false }), true);
assert.equal(shouldSubscribeToCollection('caseActions', { canViewTeamTasks: true }), true);

// Non-management staff must have a UID for payroll, and their listener is
// constrained by the same employeeId == authenticated UID rule as Firestore.
assert.equal(shouldSubscribeToCollection('payrollRecords'), false);
assert.equal(shouldSubscribeToCollection('payrollRecords', { canReadManagementPlanning: false }), false);
assert.equal(shouldSubscribeToCollection('payrollRecords', { uid: 'staff-uid', canReadManagementPlanning: false }), true);
assert.equal(shouldSubscribeToCollection('payrollRecords', { canReadManagementPlanning: true }), true);

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

const serverSnapshot = { fromCache: false, hasPendingWrites: false };
assert.deepEqual(
	aggregateFirestoreSnapshotMetadata([serverSnapshot], false),
	{ fromCache: true, hasPendingWrites: false },
	'an incomplete listener set cannot be server-confirmed',
);
assert.deepEqual(
	aggregateFirestoreSnapshotMetadata([serverSnapshot, { fromCache: true, hasPendingWrites: false }], true),
	{ fromCache: true, hasPendingWrites: false },
	'one cache-backed collection keeps the aggregate unconfirmed',
);
assert.deepEqual(
	aggregateFirestoreSnapshotMetadata([serverSnapshot, { fromCache: false, hasPendingWrites: true }], true),
	{ fromCache: false, hasPendingWrites: true },
	'pending writes in any collection keep the aggregate unconfirmed',
);
assert.deepEqual(
	aggregateFirestoreSnapshotMetadata([serverSnapshot, serverSnapshot], true),
	serverSnapshot,
	'all loaded server-backed collections can confirm the aggregate',
);

console.log('Firestore listener permission tests passed.');
