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

console.log('Firestore operational reset policy tests passed.');
