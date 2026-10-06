import assert from 'node:assert/strict';
import { qualityScores, runQualityRules } from '../src/services/qualityRules';
import { qualityMessage, qualityMessageCatalogue } from '../src/services/qualityMessages';
import { toggleQualityGroup } from '../src/components/QualityCheckPanel';

const ruleCases: Array<[string, unknown]> = [
  ['QUANT-01', { finalReport: true, narrativeSections: [{ text: 'Staff were trained in group sessions.' }] }],
  ['QUANT-02', { narrativeSections: [{ text: 'The girls participated in various activities.' }] }],
  ['QUANT-03', { finalReport: true, activities: [{ id: 'session-activity', description: 'Children attended group sessions.' }] }],
  ['QUANT-04', { results: [{ target: 100, actual: 40 }] }],
  ['QUANT-05', { narrativeSections: [{ text: '99 learners attended.' }], results: [{ target: 100, actual: 12 }] }],
  ['QUANT-06', { options: { now: '2026-10-04' }, results: [{ actual: 3, evidenceRequired: true, verificationStatus: 'unverified', evidenceDate: '2026-01-01' }] }],
  ['IMPACT-01', { results: [{ title: 'Eight workshop sessions delivered' }] }],
  ['IMPACT-02', { narrativeSections: [{ text: 'Attendance improved during the programme.' }] }],
  ['IMPACT-03', { narrativeSections: [{ text: 'Attendance improved to 60%.' }] }],
  ['BASELINE-01', { narrativeSections: [{ text: 'Since the start, attendance increased.' }], indicators: [{ name: 'Attendance', change: 'increased' }] }],
  ['DQ-VALIDITY', { results: [{ id: 'validity-result', actual: 1, validity: 'invalid' }] }],
  ['DQ-RELIABILITY', { indicators: [{ id: 'i1', actual: 1, method: 'survey' }, { id: 'i1', actual: 2, method: 'interview' }] }],
  ['DQ-TIMELINESS', { results: [{ actual: 2 }] }],
  ['DQ-PRECISION', { results: [{ actual: 12.5 }] }],
  ['DQ-INTEGRITY', { results: [{ actual: 2, createdBy: 'staff-1', verifiedBy: 'staff-1' }] }],
  ['PRIVACY-PII-01', { donorReport: { donorFacing: true, description: 'Email contact at team@example.invalid for details.' } }],
  ['PRIVACY-SENSITIVE-01', { donorFacing: true, donorReport: { description: 'A medical diagnosis is recorded.' } }],
  ['PRIVACY-NAME-01', { donorReport: { donorFacing: true, personName: 'Sample Person' } }],
  ['STYLE-UK-01', { options: { ukSpelling: true }, narrative: [{ text: 'The program will organize the center.' }] }],
  ['STYLE-READABILITY-01', { options: { maxReadingGrade: 1 }, narrative: [{ text: 'The international organisation implemented comprehensive interventions for participants.' }] }],
  ['STYLE-SENTENCE-LENGTH-01', { options: { maxSentenceWords: 4 }, narrative: [{ text: 'This is a very long sentence that exceeds four words.' }] }],
  ['STYLE-ACRONYM-01', { narrative: [{ text: 'The XYZ programme reached 25 people.' }] }],
  ['NARRATIVE-VOICE-01', { narrativeSections: [{ text: 'We delivered support and the team recorded outcomes.' }] }],
  ['NARRATIVE-TENSE-01', { narrativeSections: [{ text: 'The team was active and the programme is active.' }] }],
  ['NARRATIVE-TRUNCATED-01', { narrativeSections: [{ text: 'The group completed the activity and then' }] }],
  ['NARRATIVE-PROGRAMME-01', { options: { programmeNames: ['Early Years'] }, narrativeSections: [{ text: 'Early childhood activities reached 10 learners.' }] }],
  ['NARRATIVE-SECTION-01', { options: { requiredSections: ['Executive summary'] }, narrativeSections: [{ title: 'Results', text: 'Five learners attended.' }] }],
  ['NARRATIVE-ORDER-01', { options: { requiredSections: ['Summary', 'Results'] }, narrativeSections: [{ title: 'Results' }, { title: 'Summary' }] }],
  ['NARRATIVE-HEADING-01', { narrativeSections: [{ text: 'Content before heading.', headingAfterContent: true }] }],
  ['NARRATIVE-NUMBERING-01', { narrativeSections: [{ title: 'Results', sectionNumber: 3, expectedSectionNumber: 2 }] }],
  ['NARRATIVE-TITLE-01', { title: 'Completely unrelated title', narrativeSections: [{ text: 'Programme attendance results.' }] }],
  ['FORMULA-AMOUNT-01', { budgets: [{ quantity: 3, unitCost: 10, amount: 25 }] }],
  ['FIN-UNIT-CALC-01', { budgets: [{ quantity: 3, unitCost: 10, amount: 25 }] }],
  ['FORMULA-CACHE-01', { budgets: [{ formula: 'A1*B1' }] }],
  ['FIN-HARDCODED-TOTAL-01', { budgets: [{ formulaExpected: true, amount: 15 }] }],
  ['FIN-SUM-RANGE-01', { budgets: [{ formula: '=SUM(B2:B3)', expectedRowCount: 4 }] }],
  ['FIN-NEGATIVE-01', { budgets: [{ amount: -5 }] }],
  ['FIN-NEGATIVE-01', { budgets: [{ quantity: -2, unitCost: 4 }] }],
  ['FIN-PRICE-01', { budgets: [{ priceStatus: 'missing' }] }],
  ['FIN-MONTH-01', { budgets: [{ itemDescription: 'Transport', amount: 4 }] }],
  ['FIN-GROUP-COST-01', { budgets: [{ costLevel: 'group', costBrokenDown: false }] }],
  ['FIN-UNBUDGETED-SPEND-01', { expenses: [{ spend: 100 }] }],
  ['FIN-RESTRICTED-FUND-01', { expenses: [{ restrictedFund: true, fundPurpose: 'education', spendPurpose: 'transport' }] }],
  ['FIN-DUPLICATE-LINE-01', { budgets: [{ itemDescription: 'Exercise books', month: '2026-01' }, { itemDescription: 'Exercise books', month: '2026-01' }] }],
  ['FIN-TOTAL-DISAGREEMENT-01', { budgets: [{ itemDescription: 'Fuel', statedAmount: 500, recomputedAmount: 400 }] }],
  ['FIN-TARGET-MISMATCH-01', { budgets: [{ itemDescription: 'Meals', beneficiaryCount: 300, reportTarget: 100 }] }],
  ['FIN-YEAR-MISMATCH-01', { title: 'Annual budget 2025', filePeriod: '2026', budgets: [{ itemDescription: 'Meals', month: '2026-01' }] }],
  ['IDENTITY-FUZZY-01', { identityNames: ['Sampleperson', 'Samplepersom'] }],
  ['IDENTITY-REPORT-MISMATCH-01', { budgets: [{ personName: 'Sample person' }], narrativeSections: [{ personName: 'Another person', text: 'Anonymised summary.' }] }],
  ['IDENTITY-DUPLICATE-FILE-01', { documents: [{ hash: 'hash-a' }, { hash: 'hash-a' }] }],
  ['IDENTITY-VERSION-01', { documents: [{ title: 'Quarterly report', text: 'Draft A' }, { title: 'Quarterly report', text: 'Draft B' }] }],
];

for (const [rule, input] of ruleCases) {
  assert.ok(runQualityRules(input).some((issue) => issue.rule === rule), `expected ${rule} issue`);
}

const bannedMessageWords = /\b(?:programme section|indicator|narrative|validity|reliability|quantitative|target result|disaggregation|baseline)\b/i;
for (const [rule, template] of Object.entries(qualityMessageCatalogue())) {
  for (const value of Object.values(template)) {
    if (typeof value === 'string') assert.ok(!bannedMessageWords.test(value), `${rule} contains technical wording: ${value}`);
    else for (const example of value) assert.ok(!bannedMessageWords.test(example), `${rule} contains technical wording: ${example}`);
  }
  let openGroup = toggleQualityGroup(null, 'quant-02');
  assert.equal(openGroup, 'quant-02', 'the first click opens the issue group');
  openGroup = toggleQualityGroup(openGroup, 'quant-02');
  assert.equal(openGroup, null, 'the second click closes the issue group');
  openGroup = toggleQualityGroup(openGroup, 'quant-02');
  assert.equal(openGroup, 'quant-02', 'the third click opens the issue group again');
}
for (const [rule] of ruleCases) {
  assert.ok(qualityMessageCatalogue()[rule], `missing plain-language message for ${rule}`);
}

const activityQuestion = (text: string) => qualityMessage({
  id: 'question-test', severity: 'warning', rule: 'QUANT-03', message: 'ignored', location: 'test', context: text,
}).question;
assert.match(activityQuestion('Cooperative learning: The girls participated in cooperative learning.'), /cooperative learning/i);
assert.match(activityQuestion('Guest speakers visited the school.'), /guest speakers visited, and how many girls attended/i);
assert.match(activityQuestion('Field visits: children went to the farm.'), /field visits were made, and how many girls went/i);
assert.match(activityQuestion('Vocational training: Learners took part.'), /vocational training, and in which courses/i);
assert.match(qualityMessage({
  id: 'section-question', severity: 'warning', rule: 'QUANT-01', message: 'ignored', location: 'test',
  context: 'Cooperative learning: The girls participated in cooperative learning in September.',
}).question, /cooperative learning in september/i);
const stableTargetIssue = runQualityRules({
  narrativeSections: [{ id: 'preview-stable-42', text: 'The girls participated in various activities.' }],
}).find((issue) => issue.rule === 'QUANT-02');
assert.equal(stableTargetIssue?.target?.id, 'preview-stable-42');
const ordinaryCaseNotes = runQualityRules({
  narrativeSections: [
    { id: 'travel-note', text: 'Margaret travelled to a school.' },
    { id: 'school-change-note', text: 'Margaret changed school from X to Y.' },
    { id: 'person-detected-note', text: 'A person was identified during the visit.' },
  ],
  activities: [
    { id: 'travel-activity', description: 'Margaret travelled to a school.' },
    { id: 'school-change-activity', description: 'Margaret changed school from X to Y.' },
  ],
  results: [{ id: 'ordinary-event', title: 'A person was identified during the visit.' }],
});
assert.ok(!ordinaryCaseNotes.some((issue) => ['QUANT-01', 'QUANT-02', 'QUANT-03', 'DQ-VALIDITY', 'DQ-RELIABILITY'].includes(issue.rule)),
  'ordinary case-management events and non-numerical records must not be flagged for missing counts or checks');
assert.ok(runQualityRules({
  narrativeSections: [{ id: 'genuine-count', text: 'Cooperative learning: The girls participated in cooperative learning in September.' }],
}).some((issue) => issue.rule === 'QUANT-02'), 'the sentence-level check takes precedence over a section-level count warning');
const rebuiltActivityText = 'In September 2026, 8 girls took part in 6 cooperative learning sessions at Zomba.';
assert.ok(!runQualityRules({
  narrativeSections: [{ id: 'preview-stable-42', text: rebuiltActivityText }],
  activities: [{ id: 'preview-stable-42', indicatorId: 'result-1', actual: 8, method: 'Attendance register' }],
  results: [{ id: 'preview-stable-42', actual: 8, method: 'Attendance register' }],
}).some((issue) => issue.rule === 'QUANT-02'));

const exampleSentence = runQualityRules({
  narrativeSections: [{ text: 'The girls participated in various activities.' }],
});
assert.ok(exampleSentence.find((issue) => issue.rule === 'QUANT-02')?.suggestedFix?.includes('{period}'));

const fuzzyIdentityIssues = runQualityRules({
  identityReviews: [{
    id: 'preview-person-1',
    name: 'Magret Example',
    candidates: [{ id: 'girl-1', name: 'Margaret Example' }],
  }],
});
const fuzzyIdentityIssue = fuzzyIdentityIssues.find((issue) => issue.rule === 'IDENTITY-FUZZY-01');
assert.equal(fuzzyIdentityIssue?.target?.id, 'preview-person-1');
assert.deepEqual(fuzzyIdentityIssue?.fix?.options?.map((option) => option.value), ['girl-1', 'new-person']);
assert.deepEqual(fuzzyIdentityIssue?.candidateA, { id: 'preview-person-1', name: 'Magret Example' });
assert.deepEqual(fuzzyIdentityIssue?.candidateB, { id: 'girl-1', name: 'Margaret Example' });
assert.ok(!runQualityRules({
  identityReviews: [{
    id: 'preview-person-1',
    name: 'Magret Example',
    candidates: [{ id: 'girl-1', name: 'Margaret Example' }],
    decision: 'existing-person',
  }],
}).some((issue) => issue.rule === 'IDENTITY-FUZZY-01'));

const reportGirlIdentityIssue = runQualityRules({
  identityReviews: [{
    id: 'report-girl-aisha',
    name: 'Aisha',
    candidates: [{ id: 'girl-aida', name: 'Aida' }],
  }],
}).find((issue) => issue.rule === 'IDENTITY-FUZZY-01');
assert.equal(reportGirlIdentityIssue?.target?.id, 'report-girl-aisha');
assert.deepEqual(reportGirlIdentityIssue?.candidateB, { id: 'girl-aida', name: 'Aida' });

const repeatedQuantIssues = runQualityRules({
  narrativeSections: [{ id: 'same-text-block', text: 'Several girls participated in various activities.' }],
  activities: [{ id: 'same-text-block', description: 'Several girls participated in various activities.' }],
});
assert.deepEqual(repeatedQuantIssues.filter((issue) => /^QUANT-0[123]$/.test(issue.rule)).map((issue) => issue.rule), ['QUANT-03']);
assert.ok(repeatedQuantIssues.find((issue) => issue.rule === 'QUANT-03')?.nodeId === 'same-text-block');
const structuralOverviewIssues = runQualityRules({
  narrativeSections: [{ id: 'overview-block', text: 'Several girls participated in various activities.', isOverviewParagraph: true }],
  overviewSections: [{ id: 'overview-impact', text: 'Attendance improved during the programme.', isOverviewParagraph: true }],
  activities: [{ id: 'header-block', description: 'Several girls participated in various activities.', isHeader: true }],
});
assert.ok(!structuralOverviewIssues.some((issue) => /^QUANT-0[123]$/.test(issue.rule)));
assert.ok(structuralOverviewIssues.some((issue) => issue.rule === 'IMPACT-02'), 'structural flags suppress quant forms without disabling other narrative checks');

const sensitiveFixture = {
  finalReport: true,
  options: { now: '2026-10-04T00:00:00.000Z', staleAfterDays: 45, maxReadingGrade: 8, ukSpelling: true },
  narrativeSections: [{
    id: 'section-1',
    text: 'Several participants attended training sessions. 60% improved. We reached 20 participants, although the recorded result is 12. The program was very successful.',
  }],
  activities: [{ id: 'activity-1', title: 'Workshop sessions', target: 10, actual: 4 }],
  results: [{
    id: 'result-1',
    title: 'Impact of training sessions caused lasting change',
    actual: 12,
    evidenceRequired: true,
    verificationStatus: 'unverified',
    evidenceDate: '2025-01-01',
  }],
  indicators: [{ id: 'indicator-1', name: 'Attendance rate', target: 90 }],
  dataQuality: { validity: 'invalid', reliability: 'poor', timeliness: 'untimely', precision: 'imprecise', integrity: 'incomplete' },
  donorReport: { donorFacing: true, description: 'Contact team@example.invalid at +1 (555) 555-0134 for details.' },
  budget: { quantity: 3, unitCost: 10, cachedAmount: 25, formula: 'quantity * unitCost', statedTotal: 31, recomputedTotal: 30 },
};
const originalFixture = structuredClone(sensitiveFixture);
const issues = runQualityRules(sensitiveFixture);
assert.deepEqual(sensitiveFixture, originalFixture, 'rules must not mutate input');
assert.ok(issues.every((issue) => issue.id && issue.location && issue.message));
assert.ok(!issues.some((issue) => issue.message.includes('team@example.invalid')), 'messages must not expose sensitive values');
assert.ok(issues.some((issue) => issue.rule === 'QUANT-02' && issue.severity === 'warning'));
assert.ok(issues.some((issue) => issue.rule === 'FIN-TOTAL-DISAGREEMENT-01' && issue.message.includes('difference')));

const definedAcronym = runQualityRules({
  narrative: [{ text: 'The World Health Organization (WHO) published guidance.' }],
});
assert.ok(!definedAcronym.some((issue) => issue.rule === 'STYLE-ACRONYM-01'));
assert.ok(runQualityRules({ narrative: [{ text: 'The XYZ service reached 25 people.' }] })
  .some((issue) => issue.rule === 'STYLE-ACRONYM-01'));

const cleanScores = qualityScores([]);
assert.deepEqual(cleanScores, { quantification: 100, impact: 100, dataQuality: 100 });
const issueScores = qualityScores(issues);
assert.ok(issueScores.quantification < 100);
assert.ok(issueScores.impact < 100);
assert.ok(issueScores.dataQuality < 100);
assert.deepEqual(qualityScores(sensitiveFixture), issueScores);

const targetedIssue = runQualityRules({
  results: [{ id: 'result-stable-1', target: 10 }],
});
const target = targetedIssue.find((issue) => issue.rule === 'QUANT-04')?.target;
assert.deepEqual(target, { kind: 'indicator-result', id: 'result-stable-1' }, 'targets must use stable record ids, not array indexes');
const duplicateTargetIssues = runQualityRules({
  results: [{ id: 'same-result', target: 10 }, { id: 'same-result', target: 10 }],
});
assert.equal(duplicateTargetIssues.filter((issue) => issue.rule === 'QUANT-04').length, 1, 'identical issues on one target are deduplicated');

const safeTextIssues = runQualityRules({
  previewQualityText: [{ id: 'preview-safe-1', summary: ' \t•  Activity  “note” — item  ' }],
});
const safeTextIssue = safeTextIssues.find((issue) => issue.rule === 'IMPORT-TEXT-NORMALIZE-01');
assert.equal(safeTextIssue?.target?.id, 'preview-safe-1');
assert.equal(safeTextIssue?.target?.field, 'summary');
assert.equal(safeTextIssue?.fix?.safe, true);
assert.equal(safeTextIssue?.fix?.suggestedValue, 'Activity "note" - item');
assert.ok(!runQualityRules({ narrativeSections: [{ id: 'narrative-1', text: 'In Q2 2026, 12 girls took part in 4 art sessions at Zomba.' }] })
  .some((issue) => issue.rule === 'QUANT-02'), 'an issue stops firing after its rule condition is corrected');
assert.equal(runQualityRules({ narrativeSections: [{ text: 'The girls participated in various activities.' }] })
  .find((issue) => issue.rule === 'QUANT-02')?.fix?.safe, false, 'vague narrative is never marked safe for automatic fixing');

const validResult = runQualityRules({
  results: [{
    id: 'valid-result',
    indicatorName: 'Attendance',
    definition: 'Girls attending school during the period',
    unit: 'girls',
    actual: 8,
    target: 10,
    enrolment: 10,
    evidenceDate: '2026-10-01',
    method: 'attendance register',
    evidenceNote: 'School register, 1 October',
    enteredBy: 'staff-a',
    validity: {
      checks: ['source-seen', 'definition-match'],
      source: { name: 'Attendance register', reference: '1 October 2026' },
      checkedBy: 'staff-b',
      checkedAt: '2026-10-04',
      note: 'Register checked against the attendance definition.',
    },
  }],
});
assert.ok(!validResult.some((issue) => issue.rule === 'DQ-VALIDITY'), 'source plus definition match and plausible value passes validity');
const minimumValidityCheck = runQualityRules({
  results: [{
    id: 'minimum-validity',
    actual: 6,
    target: 8,
    unit: 'girls',
    validity: {
      checks: ['definition-match'],
      source: { name: 'Attendance register', reference: 'September 2026' },
    },
  }],
});
assert.ok(!minimumValidityCheck.some((issue) => issue.rule === 'DQ-VALIDITY'), 'source plus the definition check is sufficient without an optional checker name or note');
const secondSourceValidity = runQualityRules({
  results: [{
    id: 'second-source-validity',
    actual: 6,
    target: 8,
    unit: 'girls',
    validity: { checks: ['definition-match'], secondSource: 'School report' },
  }],
});
assert.ok(!secondSourceValidity.some((issue) => issue.rule === 'DQ-VALIDITY'), 'a second source plus the definition check passes');
const sameCheckerValidity = runQualityRules({
  results: [{
    id: 'same-checker-validity',
    actual: 6,
    target: 8,
    unit: 'girls',
    enteredBy: 'staff-a',
    validity: {
      checks: ['definition-match'],
      source: { name: 'Attendance register', reference: 'September 2026' },
      checkedBy: 'staff-a',
    },
  }],
});
assert.ok(sameCheckerValidity.some((issue) => issue.rule === 'DQ-VALIDITY' && issue.enteredBy === 'staff-a'), 'a checker cannot be the person who entered the result');
const invalidResult = runQualityRules({
  results: [{ id: 'invalid-result', indicatorName: 'Attendance', unit: 'girls', actual: 12, enrolment: 10, validity: { checks: [] } }],
});
assert.match(invalidResult.find((issue) => issue.rule === 'DQ-VALIDITY')?.message || '', /source|cross-check/i);
assert.ok(invalidResult.some((issue) => issue.rule === 'DQ-VALIDITY' && issue.message.includes('plausible range')));

const importDefaultResults = runQualityRules({
  results: [{ id: 'import-default', target: 12, actual: 10, method: 'attendance register', source: 'School attendance report' }],
});
assert.ok(!importDefaultResults.some((issue) => issue.rule === 'DQ-RELIABILITY'));

console.log(`Synthetic quality-rules tests passed (${ruleCases.length} rule scenarios).`);
