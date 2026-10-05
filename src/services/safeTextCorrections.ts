export interface SafeTextChange {
  field: 'summary' | 'originalSnippet';
  before: string;
  after: string;
  reason: string;
}

function comparableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparableValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/^(?:id|tempId|sheet|row|rowNumber|sourceRow|createdAt|updatedAt|selected)$/i.test(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, comparableValue(child)]));
}

export function exactPreviewDuplicateKey(item: {
  targetEntity: string;
  title?: string;
  summary: string;
  originalSnippet?: string;
  extractedData: Record<string, unknown>;
}): string {
  return JSON.stringify(comparableValue(item));
}

const MONTH_HEADER_FIXES: Array<[RegExp, string]> = [
  [/^(\s*)SEPTMBER(\s*:?\s*)$/i, '$1September$2'],
  [/^(\s*)SEPT(\s*:?\s*)$/i, '$1September$2'],
  [/^(\s*)JULY(\s*:?\s*)$/i, '$1July$2'],
];
const SENTENCE_START_WORDS = new Set([
  'the', 'our', 'we', 'in', 'during', 'staff', 'girls', 'children', 'learners',
  'teachers', 'shine', 'it', 'this', 'these', 'those', 'a', 'an',
]);

function hasUnfinishedEnding(value: string): boolean {
  return /\b(?:and|or|but|because|with|of|to|in|then|which|while|for|from|by|that)$/i.test(value.trim());
}

function containsVerb(value: string): boolean {
  return /\b(?:is|are|was|were|has|have|had|takes?|took|participates?|participated|practises?|practised|attends?|attended|holds?|held|receives?|received|visits?|visited|works?|worked|supports?|supported|provides?|provided|reports?|reported|counts?|counted|went|made|delivered|completed|met|helped|learned|learnt)\b/i.test(value);
}

export function pastTenseReportedActivities(value: string): string {
  return value.replace(
    /\b(girls|children|learners|staff|teachers)\s+(participate|participates|practise|practises|practice|practices|take part)\b/gi,
    (_match, subject: string, verb: string) => {
      const corrected = /^participate/i.test(verb) ? 'participated'
        : /^practi[cs]e/i.test(verb) ? 'practised'
          : 'took part';
      return `${subject} ${corrected}`;
    },
  );
}

function splitLongSentence(value: string): string | undefined {
  if (value.split(/\s+/).length <= 35 || /["“”‘’]/.test(value)) return undefined;
  const chunks = value.split(/;\s+|,\s+and then\s+/i);
  if (chunks.length < 2 || chunks.some((chunk) => !containsVerb(chunk))) return undefined;
  return chunks.map((chunk, index) => {
    const clause = chunk.trim();
    if (index === 0 || /^[A-Z]/.test(clause) || !SENTENCE_START_WORDS.has(clause.split(/\s+/, 1)[0].toLowerCase())) return clause;
    return `${clause[0].toUpperCase()}${clause.slice(1)}`;
  }).join('. ');
}

function correctText(value: string): { value: string; reason: string[] } {
  let text = value;
  const reasons: string[] = [];
  const spacing = text.replace(/[ \t]+/g, ' ').replace(/^\s+|\s+$/gm, '');
  if (spacing !== text) {
    text = spacing;
    reasons.push('Removed extra spaces');
  }

  const bullets = text.replace(/^\s*[•●▪◦]\s*/gm, '- ');
  if (bullets !== text) {
    text = bullets;
    reasons.push('Standardised bullet marks');
  }

  const units = text.replace(/\b(\d+(?:\.\d+)?)(kg|g|km|cm|mm|litres?|ml|ha)\b/gi, '$1 $2');
  if (units !== text) {
    text = units;
    reasons.push('Separated a number from its unit');
  }

  const dashes = text.replace(/[–—]/g, '-');
  if (dashes !== text) {
    text = dashes;
    reasons.push('Standardised dash marks');
  }

  let monthHeader = false;
  for (const [pattern, replacement] of MONTH_HEADER_FIXES) {
    if (pattern.test(text.trim())) {
      text = text.trim().replace(pattern, replacement);
      monthHeader = true;
      reasons.push('Corrected a month heading');
      break;
    }
  }

  const ukSpelling = text.replace(/\b(?:organization|Organization)\b/g, (word) =>
    word[0] === word[0].toUpperCase() ? 'Organisation' : 'organisation');
  if (ukSpelling !== text) {
    text = ukSpelling;
    reasons.push('Changed to UK spelling');
  }

  const pastTense = pastTenseReportedActivities(text);
  if (pastTense !== text) {
    text = pastTense;
    reasons.push('Changed a completed activity to past tense');
  }

  const split = splitLongSentence(text);
  if (split && split !== text) {
    text = split;
    reasons.push('Split a long sentence at a clear break');
  }

  const capitalized = text.replace(/(^|[.!?]\s+)([a-z][a-z'-]*)/g, (_match, boundary: string, word: string) =>
    SENTENCE_START_WORDS.has(word.toLowerCase()) ? `${boundary}${word[0].toUpperCase()}${word.slice(1)}` : `${boundary}${word}`);
  if (capitalized !== text) {
    text = capitalized;
    reasons.push('Capitalised a sentence start');
  }

  const ending = text.trimEnd();
  const isCurrencyEnding = /\b(?:MWK|MK|USD|GBP)\s*[\d,]+$/i.test(ending);
  if (!monthHeader && ending && /[a-zA-Z0-9]$/.test(ending) && !isCurrencyEnding
    && !hasUnfinishedEnding(ending) && !/["'”’)]$/.test(ending)) {
    text = `${ending}.`;
    reasons.push('Added a full stop');
  }

  return { value: text, reason: reasons };
}

export function correctImportPreviewText(item: {
  summary?: string;
  originalSnippet?: string;
}): SafeTextChange[] {
  const changes: SafeTextChange[] = [];
  for (const field of ['summary', 'originalSnippet'] as const) {
    const before = item[field];
    if (typeof before !== 'string' || !before.trim() || /["“”‘’]/.test(before)) continue;
    const corrected = correctText(before);
    if (corrected.value !== before) {
      changes.push({ field, before, after: corrected.value, reason: corrected.reason.join('; ') });
    }
  }
  return changes;
}
