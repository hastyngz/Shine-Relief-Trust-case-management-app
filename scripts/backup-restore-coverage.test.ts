import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKUP_RESTORE_COLLECTIONS } from '../src/services/firestoreResetPolicy';

const source = readFileSync(new URL('../src/services/firestoreSync.ts', import.meta.url), 'utf8');
const requiredMappings: Array<[string, string]> = [
  ['meetings', 'MEETINGS'],
  ['feedingProgramLogs', 'FEEDING_LOGS'],
  ['marketPrices', 'MARKET_PRICES'],
  ['forecastSettings', 'FORECAST_SETTINGS'],
  ['whatIfScenarios', 'WHAT_IF_SCENARIOS'],
  ['intelligenceSuggestions', 'INTELLIGENCE_SUGGESTIONS'],
  ['aiSettings', 'AI_SETTINGS'],
  ['caseGoals', 'CASE_GOALS'],
  ['employees', 'EMPLOYEES'],
  ['restrictedImportSources', 'RESTRICTED_IMPORT_SOURCES'],
  ['assets', 'ASSETS'],
  ['inventoryItems', 'INVENTORY_ITEMS'],
];

for (const [field, collection] of requiredMappings) {
  assert.ok(
    source.includes(`['${field}', COLLECTIONS.${collection}]`) ||
      source.includes(`db.${field}`) ||
      source.includes(`['${field}', COLLECTIONS.${collection}],`),
    `backup sync must map ${field} to its Firestore collection`,
  );
  const firestoreCollectionName = ({
    meetings: 'meetings',
    feedingProgramLogs: 'feedingProgramLogs',
    marketPrices: 'marketPrices',
    forecastSettings: 'forecastSettings',
    whatIfScenarios: 'whatIfScenarios',
    intelligenceSuggestions: 'intelligenceSuggestions',
    aiSettings: 'aiSettings',
    caseGoals: 'caseGoals',
    employees: 'employees',
    restrictedImportSources: 'restrictedImportSources',
    assets: 'assets',
    inventoryItems: 'inventoryItems',
  } as Record<string, string>)[field];
  assert.ok(BACKUP_RESTORE_COLLECTIONS.includes(firestoreCollectionName as never),
    `backup replacement must clean stale ${field} records`);
}

assert.ok(source.includes('const collectionNames: readonly string[] = BACKUP_RESTORE_COLLECTIONS'),
  'backup replacement must use the shared collection policy');
assert.ok(!BACKUP_RESTORE_COLLECTIONS.includes('employeeSalaryHistory' as never),
  'replacement must not delete salary history that is not represented by AppDatabase backups');

console.log('Backup restore coverage tests passed.');
