import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPORT_RULE_EXPLANATIONS, REPORT_SECTION_EXAMPLES } from '../src/data/reportWritingHelp';

const source = readFileSync(new URL('../src/services/qualityRules.ts', import.meta.url), 'utf8');
const ruleIds = new Set([...source.matchAll(/['"]([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)['"]/g)].map((match) => match[1]));
const missing = [...ruleIds].filter((id) => !REPORT_RULE_EXPLANATIONS[id]?.trim());
assert.deepEqual(missing, [], `every quality rule needs a plain-English explanation: ${missing.join(', ')}`);
for (const [section, examples] of Object.entries(REPORT_SECTION_EXAMPLES)) {
  assert.ok(examples.weak.trim(), `${section} needs a weak example`);
  assert.ok(examples.strong.trim(), `${section} needs a strong example`);
  assert.notEqual(examples.weak, examples.strong, `${section} examples should demonstrate an improvement`);
}
console.log(`Report-writing guidance covers ${ruleIds.size} quality-rule IDs and ${Object.keys(REPORT_SECTION_EXAMPLES).length} section types.`);
