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
const PROGRAMME_ALIASES: Array<[string, string]> = [
  ['early childhood', 'Early Years'],
  ['early years programme', 'Early Years'],
  ['shine village', 'Shine Village'],
  ['shine children’s home', 'Child House'],
  ["shine children's home", 'Child House'],
  ['relief and family preservation', 'Relief & Family Preservation'],
  ['fish and chicken farming', 'Fish & Chicken Farming'],
  ['maize and rice mill', 'Maize & Rice Mill'],
  ['tomato farming', 'Tomato Farming'],
];
const SENTENCE_START_WORDS = new Set([
  'the', 'our', 'we', 'in', 'during', 'staff', 'girls', 'children', 'learners',
  'teachers', 'shine', 'it', 'this', 'these', 'those', 'a', 'an',
]);
const SAFE_BULLET_OPENERS: Array<[RegExp, string]> = [
  [/^conducting\b/i, 'Activities included conducting'],
  [/^holding\b/i, 'Activities included holding'],
  [/^providing\b/i, 'Activities included providing'],
  [/^delivering\b/i, 'Activities included delivering'],
  [/^supporting\b/i, 'Activities included supporting'],
  [/^visiting\b/i, 'Activities included visiting'],
  [/^teaching\b/i, 'Activities included teaching'],
];

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
  const match = /;\s+|,\s+(?:while|and then|which)\s+/i.exec(value);
  if (!match || match.index === undefined) return undefined;
  const left = value.slice(0, match.index).trim();
  const right = value.slice(match.index + match[0].length).trim();
  if (!containsVerb(left) || !containsVerb(right)) return undefined;
  const chunks = [left, right];
  return chunks.map((chunk, index) => {
    const clause = chunk.trim();
    if (index === 0 || !clause) return clause;
    return `${clause[0].toUpperCase()}${clause.slice(1)}`;
  }).join('. ');
}

function correctText(value: string): { value: string; reason: string[] } {
  let text = value;
  const reasons: string[] = [];
  const quotations: string[] = [];
  text = text.replace(/“[^”]*”|"[^"]*"|‘[^’]*’/g, (quotation) => {
    const index = quotations.push(quotation.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")) - 1;
    return `\uE000${index}\uE001`;
  });
  const spacing = text.replace(/[ \t]+/g, ' ').replace(/^\s+|\s+$/gm, '');
  if (spacing !== text) {
    text = spacing;
    reasons.push('Removed extra spaces');
  }

  const bullets = text.replace(/^(\s*)[•●▪◦*]\s*/gm, '$1- ');
  if (bullets !== text) {
    text = bullets;
    reasons.push('Standardised bullet marks');
  }

  const fullSentenceBullets = text.replace(/^(\s*-\s*)(.+)$/gm, (line, prefix: string, body: string) => {
    const opener = SAFE_BULLET_OPENERS.find(([pattern]) => pattern.test(body.trim()));
    if (!opener) return line;
    const corrected = body.trim().replace(opener[0], opener[1]);
    return `${prefix}${corrected[0].toUpperCase()}${corrected.slice(1).replace(/[.!?]*$/, '')}.`;
  });
  if (fullSentenceBullets !== text) {
    text = fullSentenceBullets;
    reasons.push('Turned a bare activity bullet into a complete sentence');
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
  if (/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*:?\s*$/i.test(text.trim())) {
    const normalizedMonth = text.trim().replace(/^([a-z]+)/i, (month) => `${month[0].toUpperCase()}${month.slice(1).toLowerCase()}`);
    if (normalizedMonth !== text) {
      text = normalizedMonth;
      monthHeader = true;
      reasons.push('Standardised a month heading');
    }
  }

  const programmeNames = text;
  for (const [alias, approvedName] of PROGRAMME_ALIASES) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\b${escapedAlias}\\b`, 'gi'), approvedName);
  }
  if (programmeNames !== text) reasons.push('Used the approved programme name');

  const ukSpelling = text.replace(/\borganization\b/gi, (word) =>
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

  const monthNameDates = text.replace(/\b(?:(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})|(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4}))\b/gi,
    (match, dayFirstDay: string | undefined, dayFirstMonth: string | undefined, dayFirstYear: string | undefined,
      monthFirstMonth: string | undefined, monthFirstDay: string | undefined, monthFirstYear: string | undefined) => {
      const day = dayFirstDay || monthFirstDay || '';
      const month = dayFirstMonth || monthFirstMonth || '';
      const year = dayFirstYear || monthFirstYear || '';
      const numericDay = Number(day);
      const monthIndex = new Date(`${month} 1, ${year}`).getUTCMonth();
      const date = new Date(Date.UTC(Number(year), monthIndex, numericDay));
      if (!Number.isFinite(monthIndex) || date.getUTCFullYear() !== Number(year) || date.getUTCDate() !== numericDay) return match;
      return `${String(numericDay).padStart(2, '0')} ${month[0].toUpperCase()}${month.slice(1).toLowerCase()} ${year}`;
    });
  if (monthNameDates !== text) {
    text = monthNameDates;
    reasons.push('Standardised a date with an unambiguous month name');
  }

  const capitalized = text.replace(/(^|[.!?]\s+)([a-z][a-z'-]*)/g, (_match, boundary: string, word: string) =>
    SENTENCE_START_WORDS.has(word.toLowerCase()) ? `${boundary}${word[0].toUpperCase()}${word.slice(1)}` : `${boundary}${word}`);
  if (capitalized !== text) {
    text = capitalized;
    reasons.push('Capitalised a sentence start');
  }

  const restoredText = text.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => quotations[Number(index)]);
  if (restoredText !== text) {
    text = restoredText;
    reasons.push('Standardised quotation marks without changing quoted words');
  }

  const ending = text.trimEnd();
  const isCurrencyEnding = /\b(?:MWK|MK|USD|GBP)\s*[\d,]+$/i.test(ending);
  const isBareNumberOrDate = /^(?:\d[\d,]*(?:[./-]\d+)*|\d[\d,]*\s*(?:kg|g|km|cm|mm|litres?|ml|ha))$/i.test(ending);
  if (!monthHeader && ending && /[a-zA-Z0-9]$/.test(ending) && !isCurrencyEnding
    && !isBareNumberOrDate && !hasUnfinishedEnding(ending) && !/["'”’)]$/.test(ending)) {
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
    if (typeof before !== 'string' || !before.trim()) continue;
    const corrected = correctText(before);
    if (corrected.value !== before) {
      changes.push({ field, before, after: corrected.value, reason: corrected.reason.join('; ') });
    }
  }
  return changes;
}
