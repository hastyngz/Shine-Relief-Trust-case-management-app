import assert from 'node:assert/strict';
import type { AppDatabase, ProgrammeLogRecord } from '../src/types';
import {
  findProgrammeNameAliases,
  LEGACY_PROGRAMMES,
  normalizeProgrammeNames,
  PROGRAMMES,
  PROGRAMME_BY_ID,
} from '../src/data/programmes';
import { logsForProgramme } from '../src/services/programmeSummary';
import { runQualityRules } from '../src/services/qualityRules';
import { correctImportPreviewText } from '../src/services/safeTextCorrections';

const fishProgramme = PROGRAMMES.find((programme) => programme.name === 'Fish Farming');
const chickenProgramme = PROGRAMMES.find((programme) => programme.name === 'Chicken Farming');
assert.ok(fishProgramme && chickenProgramme);
assert.notEqual(fishProgramme.id, chickenProgramme.id);
assert.notEqual(fishProgramme.name, chickenProgramme.name);
assert.ok(!PROGRAMMES.some((programme) => programme.name === 'Fish & Chicken Farming'));

const legacyLog: ProgrammeLogRecord = {
  id: 'legacy-farm-log',
  programmeId: 'fish-chicken',
  date: '2024-06-01',
  entryType: 'Production',
  description: 'Historical combined farm entry',
  quantity: 12,
  unit: 'items',
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
  createdBy: 'Historical user',
  updatedBy: 'Historical user',
};
const legacyDatabase = { programmeLogs: [legacyLog] } as AppDatabase;
assert.equal(PROGRAMME_BY_ID['fish-chicken'].name, LEGACY_PROGRAMMES[0].name);
assert.deepEqual(logsForProgramme(legacyDatabase, 'fish-chicken'), [legacyLog]);

assert.equal(normalizeProgrammeNames('The chicken farm produced eggs.'), 'The Chicken Farming produced eggs.');
assert.equal(normalizeProgrammeNames('Fish and chicken farming'), 'Fish and Chicken Farming');
assert.deepEqual(findProgrammeNameAliases('Fish and chicken farming'), []);
assert.ok(findProgrammeNameAliases('fish farm activity').some(({ approvedName }) => approvedName === 'Fish Farming'));
const autoFix = correctImportPreviewText({ summary: 'This was the fish farm programme.' });
assert.equal(autoFix[0]?.after, 'This was the Fish Farming programme.');
const qualityProgrammeIssue = runQualityRules({
  options: { programmeNames: PROGRAMMES.map(({ name }) => name) },
  narrativeSections: [{ id: 'programme-name', text: 'This was the fish farm programme.' }],
}).find((issue) => issue.rule === 'NARRATIVE-PROGRAMME-01');
assert.equal(qualityProgrammeIssue?.fix?.suggestedValue, 'Fish Farming');
assert.ok(!qualityProgrammeIssue?.fix?.options?.some(({ label }) => label.includes('Fish & Chicken Farming')));

console.log('Programme separation tests passed.');
