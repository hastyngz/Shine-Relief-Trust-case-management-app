import type { QualityIssue } from './qualityRules';

export interface QualityMessage {
  title: string;
  quote: string;
  why: string;
  question: string;
  examples: [string, string];
  buttonLabel: string;
}

type MessageTemplate = Omit<QualityMessage, 'quote' | 'question'> & {
  question?: string;
};

const CATALOGUE: Record<string, MessageTemplate> = {
  'QUANT-01': {
    title: "This section doesn't say how many.",
    why: 'Donors and trustees need to see how many girls took part and how many sessions were held.',
    question: 'How many girls took part in cooperative learning in September?',
    examples: ['8 girls', '6 sessions'],
    buttonLabel: 'Add the numbers',
  },
  'QUANT-02': {
    title: "This sentence says 'various' but not how many.",
    why: 'A count helps readers understand how many people took part.',
    examples: ['8 girls took part', '4 sessions were held'],
    buttonLabel: 'Add a number',
  },
  'QUANT-03': {
    title: 'We don’t have a number for this activity.',
    why: 'A number helps readers understand who took part and what happened.',
    examples: ['8 girls', '4 guest speakers'],
    buttonLabel: 'Add a number or explain',
  },
  'NARRATIVE-TENSE-01': {
    title: 'This report switches between past and present tense.',
    why: 'Using past tense makes completed work easier to follow.',
    examples: ['The girls participated in drama.', 'Staff held three meetings.'],
    buttonLabel: 'Review sentence',
  },
  'NARRATIVE-TRUNCATED-01': {
    title: 'This sentence looks cut off.',
    why: 'Please check the ending against the original document.',
    question: 'Please finish the sentence',
    examples: ['The group met at the school.', 'Staff completed the visit.'],
    buttonLabel: 'Finish sentence',
  },
  'NARRATIVE-PROGRAMME-01': {
    title: 'This programme name isn’t written the way SHINE writes it.',
    why: 'Using the approved name keeps reports consistent.',
    examples: ['Early Years', 'Fish & Chicken Farming'],
    buttonLabel: 'Use the approved name',
  },
  'DQ-RELIABILITY': {
    title: 'We don’t know how this number was counted.',
    why: 'The counting method helps readers understand where the number came from.',
    examples: ['Counted from the daily register', 'I counted them myself'],
    buttonLabel: 'Record how it was counted',
  },
  'DQ-VALIDITY': {
    title: 'We can’t tell where this number came from.',
    why: 'A source and a second check help confirm the number is supported.',
    examples: ['Attendance register, checked by another person', 'School report and matching activity'],
    buttonLabel: 'Check this number',
  },
  'FIN-TOTAL-DISAGREEMENT-01': {
    title: 'The total doesn’t match the lines.',
    why: 'Check the lines before choosing which total to keep.',
    examples: ['Use the recomputed total', 'Keep mine and explain'],
    buttonLabel: 'Review totals',
  },
  'IDENTITY-FUZZY-01': {
    title: 'Is this the same person?',
    why: 'Choose a match only when you are sure; people are never joined automatically.',
    examples: ['Choose the existing person', 'Choose new person'],
    buttonLabel: 'Choose a person',
  },
  'IMPORT-DUPLICATE-EXACT-01': {
    title: 'This row is an exact copy of another row.',
    why: 'Keeping one copy avoids counting the same entry twice.',
    examples: ['Keep the first row', 'Remove the copied row'],
    buttonLabel: 'Review copied row',
  },
  'IMPORT-TEXT-NORMALIZE-01': {
    title: 'This text has extra spaces or unusual punctuation.',
    why: 'A small formatting change makes the text easier to read.',
    examples: ['Remove spaces at the start', 'Use one style of quotation marks'],
    buttonLabel: 'Review change',
  },
  'QUANT-04': {
    title: 'The planned and recorded numbers need a check.',
    why: 'A short explanation helps readers understand the difference.',
    examples: ['Explain why fewer people took part', 'Check that both numbers are correct'],
    buttonLabel: 'Review numbers',
  },
  'QUANT-05': {
    title: 'A number in this text differs from the recorded results.',
    why: 'Matching figures help prevent confusion.',
    examples: ['Check the written number', 'Check the recorded result'],
    buttonLabel: 'Check the figures',
  },
  'QUANT-06': {
    title: 'This result needs supporting evidence.',
    why: 'A record or date helps another person check the result.',
    examples: ['Add a register or report', 'Add the date it was checked'],
    buttonLabel: 'Add evidence',
  },
  'IMPACT-02': {
    title: 'This change needs the numbers from before and after.',
    why: 'Both numbers show how much things changed.',
    examples: ['From 4 to 8 girls', 'From 2 visits to 5 visits'],
    buttonLabel: 'Add both numbers',
  },
  'IMPACT-03': {
    title: 'This percentage needs the numbers behind it.',
    why: 'The total group size helps readers understand the percentage.',
    examples: ['8 of 20 (40%)', '12 of 15 (80%)'],
    buttonLabel: 'Add the group size',
  },
  'BASELINE-01': {
    title: 'This statement needs an earlier number to compare with.',
    why: 'An earlier record shows what changed over time.',
    examples: ['Add the earlier number and date', 'Explain that no earlier record is available'],
    buttonLabel: 'Review comparison',
  },
  'NARRATIVE-VOICE-01': {
    title: 'This report changes the way it refers to the organisation.',
    why: 'Using one voice throughout makes the report easier to read.',
    examples: ['Use “we” throughout', 'Use “SHINE” throughout'],
    buttonLabel: 'Review wording',
  },
  'STYLE-SENTENCE-LENGTH-01': {
    title: 'This sentence may be hard to read.',
    why: 'Shorter sentences can be easier to understand.',
    examples: ['Split at a full stop', 'Keep the original wording'],
    buttonLabel: 'Review suggestion',
  },
  'DQ-INTEGRITY': {
    title: 'A different person needs to check this entry.',
    why: 'An independent check can catch mistakes.',
    examples: ['Ask a colleague to check it', 'Record who checked it'],
    buttonLabel: 'Arrange a check',
  },
  'DQ-TIMELINESS': {
    title: 'This entry needs a date showing when it was checked.',
    why: 'A date helps readers know when the information was current.',
    examples: ['Add the date counted', 'Add the date the record was checked'],
    buttonLabel: 'Add a date',
  },
  'DQ-PRECISION': {
    title: 'This number may need a clearer unit.',
    why: 'A unit explains what the number counts.',
    examples: ['8 girls', '6 sessions'],
    buttonLabel: 'Add a unit',
  },
  'NARRATIVE-HEADING-01': {
    title: 'A heading appears after its text.',
    why: 'Headings are easier to follow when they come before the related text.',
    examples: ['Move the heading above the paragraph', 'Check the section order'],
    buttonLabel: 'Review order',
  },
  'NARRATIVE-NUMBERING-01': {
    title: 'The section numbers may be out of order.',
    why: 'Correct numbering helps readers find each section.',
    examples: ['Check the previous section number', 'Check the next section number'],
    buttonLabel: 'Check section numbers',
  },
  'NARRATIVE-ORDER-01': {
    title: 'These sections may be in the wrong order.',
    why: 'The expected order makes the report easier to navigate.',
    examples: ['Move the heading before its text', 'Check the section list'],
    buttonLabel: 'Review section order',
  },
  'NARRATIVE-SECTION-01': {
    title: 'A required section is missing.',
    why: 'Readers need the agreed sections to understand the report.',
    examples: ['Add the missing section', 'Confirm it does not apply'],
    buttonLabel: 'Review section',
  },
  'NARRATIVE-TITLE-01': {
    title: 'This section needs a heading.',
    why: 'A heading helps readers find the right information.',
    examples: ['Add a short heading', 'Use the approved section name'],
    buttonLabel: 'Add heading',
  },
  'STYLE-ACRONYM-01': {
    title: 'This shortened name needs to be explained.',
    why: 'Writing the full name once helps all readers understand it.',
    examples: ['Write the full name before the short form', 'Remove the short form'],
    buttonLabel: 'Explain the name',
  },
  'STYLE-READABILITY-01': {
    title: 'This text may be difficult to read.',
    why: 'Clear, familiar words help more people understand the report.',
    examples: ['Use shorter sentences', 'Choose simpler words'],
    buttonLabel: 'Review wording',
  },
  'STYLE-UK-01': {
    title: 'This word uses a different spelling style.',
    why: 'UK spelling keeps the report consistent.',
    examples: ['organisation', 'programme'],
    buttonLabel: 'Review spelling',
  },
  'IMPACT-01': {
    title: 'This report says what was done but not what changed.',
    why: 'A result helps readers understand the difference the work made.',
    examples: ['Add a change in attendance', 'Add a change in learning'],
    buttonLabel: 'Add what changed',
  },
  'FORMULA-AMOUNT-01': {
    title: 'The amount does not match the calculation.',
    why: 'Checking the calculation helps prevent an incorrect total.',
    examples: ['Check the quantity', 'Check the unit cost'],
    buttonLabel: 'Check calculation',
  },
  'FORMULA-CACHE-01': {
    title: 'This spreadsheet calculation has no saved answer.',
    why: 'A saved answer is needed when the file is opened without a spreadsheet app.',
    examples: ['Open and save the file in a spreadsheet app', 'Enter the checked amount'],
    buttonLabel: 'Review calculation',
  },
  'FIN-DUPLICATE-LINE-01': {
    title: 'The same cost line appears more than once.',
    why: 'Check that the cost has not been counted twice.',
    examples: ['Keep the correct line', 'Remove an exact duplicate'],
    buttonLabel: 'Review cost lines',
  },
  'FIN-GROUP-COST-01': {
    title: 'This shared cost is not split between activities.',
    why: 'A split shows how much each activity used.',
    examples: ['Add each activity share', 'Explain why it cannot be split'],
    buttonLabel: 'Review shared cost',
  },
  'FIN-HARDCODED-TOTAL-01': {
    title: 'This total was typed instead of calculated.',
    why: 'A calculation can be checked again when a line changes.',
    examples: ['Use a spreadsheet calculation', 'Check the typed total'],
    buttonLabel: 'Review total',
  },
  'FIN-MONTH-01': {
    title: 'This cost needs a month.',
    why: 'A month shows when the cost belongs in the report.',
    examples: ['Add the month it was paid', 'Check the source document'],
    buttonLabel: 'Add a month',
  },
  'FIN-NEGATIVE-01': {
    title: 'This cost or quantity is below zero.',
    why: 'Check for a typing mistake or explain the adjustment.',
    examples: ['Check the minus sign', 'Explain the adjustment'],
    buttonLabel: 'Check amount',
  },
  'FIN-PRICE-01': {
    title: 'A price is missing or unclear.',
    why: 'A clear price makes this cost easier to check.',
    examples: ['Add the price from a receipt', 'Explain why no price is available'],
    buttonLabel: 'Check price',
  },
  'FIN-RESTRICTED-FUND-01': {
    title: 'This cost may not be allowed for this fund.',
    why: 'Check the fund rules before approving the cost.',
    examples: ['Choose the correct fund', 'Ask an authorised manager'],
    buttonLabel: 'Check fund use',
  },
  'FIN-SUM-RANGE-01': {
    title: 'The total may leave out one or more lines.',
    why: 'Check that every line is included.',
    examples: ['Check the first and last row', 'Recalculate from all lines'],
    buttonLabel: 'Check included lines',
  },
  'FIN-TARGET-MISMATCH-01': {
    title: 'The number of people in this cost differs from the plan.',
    why: 'Check that both numbers describe the same group.',
    examples: ['Correct the number', 'Explain the difference'],
    buttonLabel: 'Check numbers',
  },
  'FIN-UNBUDGETED-SPEND-01': {
    title: 'This payment is not linked to an approved cost line.',
    why: 'A link helps managers check and approve the payment.',
    examples: ['Choose an approved cost line', 'Ask a manager to review it'],
    buttonLabel: 'Link payment',
  },
  'FIN-UNIT-CALC-01': {
    title: 'The quantity and price do not add up to this amount.',
    why: 'Check the calculation before using the amount.',
    examples: ['Check the quantity', 'Check the price per item'],
    buttonLabel: 'Check calculation',
  },
  'FIN-YEAR-MISMATCH-01': {
    title: 'The year in this title differs from the report dates.',
    why: 'The correct year helps keep records together.',
    examples: ['Check the report dates', 'Correct the title'],
    buttonLabel: 'Check year',
  },
  'IDENTITY-DUPLICATE-FILE-01': {
    title: 'This file appears to be an exact copy of another.',
    why: 'Keeping the right copy avoids confusion.',
    examples: ['Keep the original file', 'Check whether both are needed'],
    buttonLabel: 'Review file',
  },
  'IDENTITY-REPORT-MISMATCH-01': {
    title: 'A person appears in one file but not the other.',
    why: 'Check both files before changing any person record.',
    examples: ['Check the spelling in both files', 'Ask a manager to review'],
    buttonLabel: 'Review person',
  },
  'IDENTITY-VERSION-01': {
    title: 'Two files have the same name but different contents.',
    why: 'Compare them before choosing which copy to use.',
    examples: ['Compare both versions', 'Ask which copy is current'],
    buttonLabel: 'Compare files',
  },
  'PRIVACY-NAME-01': {
    title: 'This copy may include a person’s name.',
    why: 'Check that names are appropriate for the people receiving this report.',
    examples: ['Remove identifying details', 'Confirm the audience is allowed to see them'],
    buttonLabel: 'Review privacy',
  },
  'PRIVACY-PII-01': {
    title: 'This copy may include private contact details.',
    why: 'Only include private details when the intended readers are allowed to see them.',
    examples: ['Remove the details', 'Check the audience settings'],
    buttonLabel: 'Review privacy',
  },
  'PRIVACY-SENSITIVE-01': {
    title: 'This copy may include private personal information.',
    why: 'Check that this information is safe to share with the intended readers.',
    examples: ['Remove the details', 'Ask an authorised manager'],
    buttonLabel: 'Review privacy',
  },
};

const friendlyFallback: MessageTemplate = {
  title: 'This entry needs a quick review.',
  why: 'Please check the information and add a note about your decision.',
  examples: ['Check the original record', 'Ask a colleague if unsure'],
  buttonLabel: 'Review this entry',
};

function sentenceFor(text: string): string {
  const match = text.match(/[^.!?]+[.!?]?/);
  return match?.[0]?.trim() || text.trim();
}

function activityQuestion(quote: string): string {
  const text = sentenceFor(quote);
  const who = text.match(/\b(girls|children|learners|staff|teachers)\b/i)?.[1]?.toLowerCase() || 'people';
  const activity = text.match(/^([^:]+):/)?.[1]?.trim()
    || text.match(/(?:participated in|took part in|practised|practiced)\s+([^.!?]+)/i)?.[1]?.trim()
    || text.replace(/^(?:the\s+)?(?:girls|children|learners|staff|teachers)\s+/i, '').replace(/[.!?]+$/, '').trim()
    || 'this activity';
  if (/vocational training/i.test(activity)) return `How many girls are in vocational training, and in which courses?`;
  if (/field visits?/i.test(activity)) return `How many field visits were made, and how many girls went?`;
  const countNoun = activity.match(/\b(speakers?|visits?|workshops?|sessions?|competitions?|camps?|retreats?|meetings?|lessons?)\b/i)?.[0];
  if (/guest speakers?/i.test(activity)) return `How many guest speakers visited, and how many girls attended?`;
  if (countNoun) return `How many ${activity} took place, and how many ${who} took part?`;
  return `How many ${who} took part in ${activity}?`;
}

export function qualityMessage(issue: QualityIssue): QualityMessage {
  const template = CATALOGUE[issue.rule] || friendlyFallback;
  const validityValue = issue.rule === 'DQ-VALIDITY'
    ? issue.context?.match(/Measure:\s*([^·]+).*?Value:\s*([^·]+)/)
    : undefined;
  const totals = issue.rule === 'FIN-TOTAL-DISAGREEMENT-01'
    ? issue.message.match(/Stated total\s+([^;]+);\s*recomputed total\s+([^;]+);/i)
    : undefined;
  const quote = validityValue
    ? `${validityValue[2].trim()}: ${validityValue[1].trim()}`
    : totals
      ? `Stated: ${totals[1].trim()}; recomputed: ${totals[2].trim()}`
    : issue.context?.trim() || issue.location;
  const question = template.question
    || (issue.rule === 'QUANT-03' ? activityQuestion(quote) : issue.rule === 'NARRATIVE-TRUNCATED-01' ? 'Please finish the sentence' : 'What should be changed or checked?');
  return { ...template, quote: sentenceFor(quote), question };
}

export function qualityMessageCatalogue(): Readonly<Record<string, MessageTemplate>> {
  return CATALOGUE;
}
