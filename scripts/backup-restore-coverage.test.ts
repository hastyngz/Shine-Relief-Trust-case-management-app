import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKUP_RESTORE_COLLECTIONS } from '../src/services/firestoreResetPolicy';

const source = readFileSync(new URL('../src/services/firestoreSync.ts', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../src/utils/storage.ts', import.meta.url), 'utf8');
const requiredMappings: Array<[string, string, string]> = [
  ['girls', 'GIRLS', 'girls'],
  ['households', 'HOUSEHOLDS', 'households'],
  ['educationalFollowUps', 'EDU_FOLLOW_UPS', 'educationalFollowUps'],
  ['healthFollowUps', 'HEALTH_FOLLOW_UPS', 'healthFollowUps'],
  ['familyFollowUps', 'FAMILY_FOLLOW_UPS', 'familyFollowUps'],
  ['rentPayments', 'RENT_PAYMENTS', 'rentPayments'],
  ['expenses', 'EXPENSES', 'expenses'],
  ['householdActivities', 'ACTIVITIES', 'householdActivities'],
  ['contacts', 'CONTACTS', 'contacts'],
  ['attachments', 'ATTACHMENTS', 'attachments'],
  ['budgets', 'BUDGETS', 'budgets'],
  ['annualBudgets', 'ANNUAL_BUDGETS', 'annualBudgets'],
  ['payrollRecords', 'PAYROLL_RECORDS', 'payrollRecords'],
  ['employees', 'EMPLOYEES', 'employees'],
  ['workplans', 'WORKPLANS', 'workplans'],
  ['schedules', 'SCHEDULES', 'schedules'],
  ['meetings', 'MEETINGS', 'meetings'],
  ['feedingProgramLogs', 'FEEDING_LOGS', 'feedingProgramLogs'],
  ['marketPrices', 'MARKET_PRICES', 'marketPrices'],
  ['forecastSettings', 'FORECAST_SETTINGS', 'forecastSettings'],
  ['whatIfScenarios', 'WHAT_IF_SCENARIOS', 'whatIfScenarios'],
  ['intelligenceSuggestions', 'INTELLIGENCE_SUGGESTIONS', 'intelligenceSuggestions'],
  ['aiSettings', 'AI_SETTINGS', 'aiSettings'],
  ['historicalRecords', 'HISTORICAL_RECORDS', 'historicalCaseRecords'],
  ['importAudits', 'IMPORT_AUDITS', 'importAudits'],
  ['restrictedImportSources', 'RESTRICTED_IMPORT_SOURCES', 'restrictedImportSources'],
  ['earlyYearsRecords', 'EARLY_YEARS', 'earlyYearsRecords'],
  ['people', 'PEOPLE', 'people'],
  ['caseActions', 'CASE_ACTIONS', 'caseActions'],
  ['educationHistory', 'EDUCATION_HISTORY', 'educationHistory'],
  ['academicSupports', 'ACADEMIC_SUPPORTS', 'academicSupports'],
  ['examinationRecords', 'EXAMINATION_RECORDS', 'examinationRecords'],
  ['attendanceRecords', 'ATTENDANCE_RECORDS', 'attendanceRecords'],
  ['girlLeaves', 'GIRL_LEAVES', 'girlLeaves'],
  ['programmeLogs', 'PROGRAMME_LOGS', 'programmeLogs'],
  ['caseReviews', 'CASE_REVIEWS', 'caseReviews'],
  ['caseGoals', 'CASE_GOALS', 'caseGoals'],
  ['procurementLists', 'PROCUREMENT_LISTS', 'procurementLists'],
  ['projectProjections', 'PROJECT_PROJECTIONS', 'projectProjections'],
  ['inventoryItems', 'INVENTORY_ITEMS', 'inventoryItems'],
  ['assets', 'ASSETS', 'assets'],
];

for (const [field, collection, firestoreCollectionName] of requiredMappings) {
  assert.ok(
    source.includes(`['${field}', COLLECTIONS.${collection}]`) ||
      source.includes(`db.${field}`) ||
      source.includes(`['${field}', COLLECTIONS.${collection}],`),
    `backup sync must map ${field} to its Firestore collection`,
  );
  assert.ok(BACKUP_RESTORE_COLLECTIONS.includes(firestoreCollectionName as never),
    `backup replacement must clean stale ${field} records from ${firestoreCollectionName}`);
}

assert.ok(source.includes('const collectionNames: readonly string[] = BACKUP_RESTORE_COLLECTIONS'),
  'backup replacement must use the shared collection policy');
assert.ok(!BACKUP_RESTORE_COLLECTIONS.includes('employeeSalaryHistory' as never),
  'replacement must not delete salary history that is not represented by AppDatabase backups');
assert.ok(storageSource.includes("String(attachment.targetType) !== 'safeguardingCase'"),
  'general database backups must exclude safeguarding attachments');

console.log('Backup restore coverage tests passed.');
