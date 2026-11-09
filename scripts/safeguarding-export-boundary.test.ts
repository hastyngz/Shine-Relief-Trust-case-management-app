import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../src/components/SafeguardingView.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(component, /downloadExcel|downloadCSV|Export restricted report|SHINE_Restricted_Safeguarding_Report/,
  'restricted safeguarding records must not be exported from the safeguarding screen');
assert.match(component, /permission-checked server endpoint|permission checked server endpoint|loadRecords/,
  'safeguarding data must continue to use the restricted loading flow');
console.log('Safeguarding export-boundary test passed.');
