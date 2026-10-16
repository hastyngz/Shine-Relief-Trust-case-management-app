import assert from 'node:assert/strict';
import { OPERATIONAL_COLLECTIONS_TO_CLEAR } from '../src/services/firestoreResetPolicy';

const operational = new Set<string>(OPERATIONAL_COLLECTIONS_TO_CLEAR);

// Reset must remove every major operational module, including modules that
// previously remained behind in Firestore after the UI reported a reset.
for (const collection of [
  'contacts',
  'employees',
  'employeeSalaryHistory',
  'meetings',
  'feedingProgramLogs',
  'marketPrices',
  'forecastSettings',
  'whatIfScenarios',
  'intelligenceSuggestions',
  'aiSettings',
  'caseGoals',
  'inventoryItems',
  'assets',
]) {
  assert.ok(operational.has(collection), `operational reset omits ${collection}`);
}

// Access and communication data, safeguarding case records, and durable audit
// logs are intentionally retained by the operational reset.
for (const collection of [
  'staffUsers',
  'staffConversations',
  'staffMessages',
  'staffNotifications',
  'staffAnnouncements',
  'userNotificationPreferences',
  'safeguardingCases',
  'safeguardingAuditLogs',
  'caseActionAuditLogs',
  'employeeAuditLogs',
  'reportHistory',
  'reportExports',
]) {
  assert.ok(!operational.has(collection), `operational reset must preserve ${collection}`);
}

assert.equal(new Set(OPERATIONAL_COLLECTIONS_TO_CLEAR).size, OPERATIONAL_COLLECTIONS_TO_CLEAR.length,
  'reset collection names must be unique');


import { readFileSync } from 'node:fs';

const firestoreSyncSource = readFileSync(new URL('../src/services/firestoreSync.ts', import.meta.url), 'utf8');
const collectionBlock = firestoreSyncSource.match(/export const COLLECTIONS = \{([\s\S]*?)\} as const;/);
assert.ok(collectionBlock, 'Firestore collection registry must remain discoverable for reset coverage checks');
const registeredCollections = Array.from(collectionBlock[1].matchAll(/^\s*[A-Z_]+:\s*'([^']+)'\s*,?\s*$/gm), (match) => match[1]);
assert.ok(registeredCollections.length > 0, 'Firestore collection registry must not be empty');

// Every registered Firestore collection must be deliberately classified as
// operational data cleared by reset or as data intentionally retained.
// This makes adding a new collection fail closed until its reset policy is reviewed.
const intentionallyRetained = new Set([
  'staffUsers',
  'staffConversations',
  'staffMessages',
  'staffNotifications',
  'staffAnnouncements',
  'userNotificationPreferences',
  'caseActionAuditLogs',
  'safeguardingCases',
  'safeguardingAuditLogs',
  'employeeAuditLogs',
  'reportHistory',
  'reportExports',
]);
const classifiedCollections = new Set([...operational, ...intentionallyRetained]);
for (const collection of registeredCollections) {
  assert.ok(classifiedCollections.has(collection),
    `Firestore collection ${collection} has no explicit reset/retention policy`);
}
for (const collection of classifiedCollections) {
  assert.ok(registeredCollections.includes(collection),
    `reset policy references unknown Firestore collection ${collection}`);
}
assert.equal(new Set(registeredCollections).size, registeredCollections.length,
  'Firestore collection registry must not contain duplicate collection names');

console.log('Firestore operational reset policy tests passed.');
