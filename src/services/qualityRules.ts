import { matchNameCandidates } from './spreadsheetImport/nameMatcher';

export type QualityIssue = {
  id: string;
  severity: 'blocker' | 'warning' | 'info';
  rule: string;
  message: string;
  location: string;
  suggestedFix?: string;
  target?: {
    kind: 'preview-item' | 'indicator-result' | 'budget-item' | 'workplan-item' | 'narrative-section' | 'report-section';
    id: string;
    field?: string;
  };
  fix?: {
    type: 'set-field' | 'choose-option' | 'text-input' | 'confirm' | 'external';
    safe: boolean;
    field?: string;
    options?: Array<{ value: string; label: string }>;
    suggestedValue?: unknown;
    reversible: boolean;
  };
  status?: 'open' | 'resolved' | 'overridden' | 'pending-approval';
  resolution?: {
    note: string;
    by: string;
    at: string;
    before?: unknown;
    after?: unknown;
  };
  context?: string;
  whyMatters?: string;
};

type QualityValue = Record<string, unknown>;

type QualityOptions = {
  varianceThresholdPercent?: number;
  staleAfterDays?: number;
  maxReadingGrade?: number;
  maxSentenceWords?: number;
  ukSpelling?: boolean;
  knownAcronyms?: string[];
  programmeNames?: string[];
  requiredSections?: string[];
  now?: string | Date;
};

export type QualityRulesInput = QualityValue & {
  options?: QualityOptions;
};

type Node = {
  path: string;
  key: string;
  value: unknown;
  target?: QualityIssue['target'];
};

const MAX_NODES = 5000;
const MAX_DEPTH = 12;
const MAX_ISSUES = 250;
const TEXT_KEYS = /^(?:name|title|description|text|content|narrative|summary|statement|measure|evidence|notes|source|methodology|status|comment|finding|recommendation|claim)$/i;

function isRecord(value: unknown): value is QualityValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSafeText(value: string): string {
  return value
    .replace(/\t/g, ' ')
    .replace(/^\s*(?:[•●▪◦*-]\s*)+/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparableImportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparableImportValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(?:id|tempId|sheet|row|rowNumber|sourceRow|createdAt|updatedAt|selected)$/i.test(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, comparableImportValue(item)]));
}

function targetKind(path: string): NonNullable<QualityIssue['target']>['kind'] {
  if (/budget/i.test(path)) return 'budget-item';
  if (/workplan/i.test(path)) return 'workplan-item';
  if (/indicator|result|outcome|impact/i.test(path)) return 'indicator-result';
  if (/narrative/i.test(path)) return 'narrative-section';
  if (/section|report/i.test(path)) return 'report-section';
  return 'preview-item';
}

function flatten(input: unknown): Node[] {
  const nodes: Node[] = [];
  const seen = new WeakSet<object>();
  const visit = (value: unknown, path: string, key: string, depth: number, inheritedTarget?: QualityIssue['target']): void => {
    if (nodes.length >= MAX_NODES || depth > MAX_DEPTH) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`, key, depth + 1, inheritedTarget));
      return;
    }
    if (isRecord(value)) {
      if (seen.has(value)) return;
      seen.add(value);
      const stableId = typeof value.tempId === 'string' ? value.tempId : typeof value.id === 'string' ? value.id : undefined;
      const target = stableId
        ? { kind: targetKind(path || key), id: stableId }
        : inheritedTarget;
      nodes.push({ path: path || 'input', key, value, target });
      for (const [childKey, childValue] of Object.entries(value)) {
        const safeKey = childKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'field';
        visit(childValue, path ? `${path}.${safeKey}` : safeKey, childKey, depth + 1, target);
      }
      return;
    }
    nodes.push({ path: path || 'input', key, value, target: inheritedTarget });
  };
  visit(input, '', 'input', 0);
  return nodes;
}

function textOf(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => textOf(item, depth + 1));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    if (TEXT_KEYS.test(key) || /narrative|description|statement|evidence|comment|finding|recommendation/i.test(key)) {
      return textOf(child, depth + 1);
    }
    return [];
  });
}

function recordsFor(nodes: Node[], pattern: RegExp): Node[] {
  return nodes.filter((node) => isRecord(node.value) && pattern.test(node.path));
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function getNumber(record: QualityValue, names: string[]): number | undefined {
  for (const name of names) {
    const value = record[name] ?? Object.entries(record).find(([key]) => normalized(key) === normalized(name))?.[1];
    const parsed = numberValue(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function getField(record: QualityValue, names: string[]): unknown {
  for (const name of names) {
    const entry = Object.entries(record).find(([key]) => normalized(key) === normalized(name));
    if (entry) return entry[1];
  }
  return undefined;
}

function hasMapping(record: QualityValue): boolean {
  return Object.entries(record).some(([key, value]) =>
    /^(?:indicator|indicatorid|indicatorids|resultid|resultids|mappedto|linkedto|measureid|outcomeid|mapping)$/i.test(normalized(key))
    && value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0));
}

function words(text: string): string[] {
  return text.match(/\b[\p{L}]+(?:['’-][\p{L}]+)*\b/gu) ?? [];
}

function syllables(word: string): number {
  const normalizedWord = word.toLowerCase().replace(/(?:e|es)$/i, '');
  const groups = normalizedWord.match(/[aeiouy]+/g)?.length ?? 1;
  return Math.max(1, groups);
}

function readingGrade(text: string): number {
  const tokens = words(text);
  const sentences = Math.max(1, text.split(/[.!?]+/).filter((part) => part.trim()).length);
  if (!tokens.length) return 0;
  const syllableCount = tokens.reduce((sum, token) => sum + syllables(token), 0);
  return 0.39 * (tokens.length / sentences) + 11.8 * (syllableCount / tokens.length) - 15.59;
}

function dateValue(value: unknown): number | undefined {
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function createIssue(
  rule: string,
  severity: QualityIssue['severity'],
  message: string,
  location: string,
  suggestedFix?: string,
): QualityIssue {
  return {
    id: `${rule}:${location}`,
    severity,
    rule,
    message,
    location,
    ...(suggestedFix ? { suggestedFix } : {}),
  };
}

export function runQualityRules(input: QualityRulesInput | unknown): QualityIssue[] {
  const root = isRecord(input) ? input : {};
  const options = isRecord(root.options) ? root.options as QualityOptions : {};
  const nodes = flatten(input);
  const issues: QualityIssue[] = [];
  const add = (issue: QualityIssue): void => {
    const sourceNode = nodes.find((node) => node.path === issue.location);
    const target = issue.target || sourceNode?.target;
    const enriched: QualityIssue = {
      ...issue,
      ...(target ? { id: `${issue.rule}:${target.kind}:${target.id}${target.field ? `:${target.field}` : ''}` } : {}),
      ...(target ? { target } : {}),
      status: issue.status || 'open',
    };
    if (issues.length < MAX_ISSUES && !issues.some((existing) =>
      existing.rule === enriched.rule && existing.message === enriched.message
      && (enriched.target
        ? existing.target?.kind === enriched.target.kind && existing.target.id === enriched.target.id
          && existing.target.field === enriched.target.field
        : !existing.target && existing.location === enriched.location))) issues.push(enriched);
  };

  const narratives = recordsFor(nodes, /narrative|section/i);
  const activities = recordsFor(nodes, /activit/i);
  const results = recordsFor(nodes, /result|outcome|impact/i).filter((entry) =>
    isRecord(entry.value) && !/\.validity(?:\.|$)/i.test(entry.path));
  const indicators = recordsFor(nodes, /indicator/i);
  const finalReport = root.finalReport === true;
  const narrativeText = narratives.map((entry) => textOf(entry.value).join(' ')).join('\n');

  const importRows = Array.isArray(root.importPreviewRows) ? root.importPreviewRows.filter(isRecord) : [];
  const seenImportRows = new Set<string>();
  for (const row of importRows) {
    const id = typeof row.id === 'string' ? row.id : typeof row.tempId === 'string' ? row.tempId : undefined;
    if (!id) continue;
    const fingerprint = JSON.stringify(comparableImportValue(row));
    if (seenImportRows.has(fingerprint)) {
      add({
        ...createIssue('IMPORT-DUPLICATE-EXACT-01', 'warning', 'This preview row exactly duplicates an earlier row; the first row is retained.', `importPreviewRows.${id}`, 'Remove the duplicate row from this preview.'),
        target: { kind: 'preview-item', id },
        context: 'Exact duplicate of an earlier preview row.',
        fix: { type: 'confirm', safe: true, field: '__remove', suggestedValue: 'remove duplicate row', reversible: true },
      });
    } else {
      seenImportRows.add(fingerprint);
    }
  }

  for (const node of nodes) {
    if (typeof node.value !== 'string' || !node.target) continue;
    const record = nodes.find((candidate) => candidate.path === node.path.slice(0, node.path.lastIndexOf('.')));
    if (!record || !isRecord(record.value)) continue;
    const field = node.key;
    if (!/^(?:title|text|content|description|summary|notes|objective|itemDescription|originalSnippet)$/i.test(field)) continue;
    const corrected = normalizeSafeText(node.value);
    if (corrected !== node.value) {
      add({
        ...createIssue('IMPORT-TEXT-NORMALIZE-01', 'info', 'Text contains whitespace or formatting that can be normalised safely.', node.path, 'Trim, collapse whitespace, and standardise quotes and dashes.'),
        target: { ...node.target, field },
        context: node.value,
        fix: { type: 'set-field', safe: true, field, suggestedValue: corrected, reversible: true },
      });
    }
  }

  for (const entry of narratives) {
    const sectionText = textOf(entry.value).join(' ');
    if (!sectionText.trim()) continue;
    const sectionResults = Array.isArray((entry.value as QualityValue).results)
      ? (entry.value as QualityValue).results as unknown[]
      : [];
    const hasResultAgainstTarget = sectionResults.some((result) => isRecord(result)
      && (getNumber(result, ['target', 'planned', 'plannedValue']) ?? 0) > 0
      && getNumber(result, ['actual', 'actualValue', 'achieved', 'result', 'resultValue']) !== undefined);
    if (finalReport ? !hasResultAgainstTarget : !hasResultAgainstTarget && !/\b\d+(?:[,.]\d+)?\s*(?:%|percent|people|girls|children|households|sessions|visits|days|months|years)?\b/i.test(sectionText)) {
      add(createIssue('QUANT-01', finalReport ? 'blocker' : 'warning', 'Programme section has no quantitative result against a target.', entry.path, 'Add a measured result and its target.'));
    }
    const vague = sectionText.match(/\b(?:various|several|many|some|a number of|a lot of|regularly|different activities|the girls participated|the children took part|numerous|significant)\b[^.!?]*[.!?]?/i)?.[0];
    if (vague) {
      add({
        ...createIssue('QUANT-02', 'warning', 'Narrative includes an unquantified statement.', entry.path, 'Replace it with: “In {period}, {n} {who} took part in {n} {activity type} at {place}.”'),
        context: vague,
        whyMatters: 'Donors need measurable evidence to understand who was reached and what was delivered.',
        fix: { type: 'text-input', safe: false, field: 'text', reversible: true },
      });
    }
    if (sectionText.match(/(?:\d+(?:\.\d+)?\s*%|percent)/i) && !/\b(?:n\s*=\s*\d+|\b\d+\s+of\s+\d+|\b\d+\s+(?:girls|children|people|participants|households))\b/i.test(sectionText)) {
      add(createIssue('IMPACT-03', 'warning', 'A percentage is reported without its base number (n).', entry.path, 'Report the numerator and denominator, for example “8 of 20 (40%)”.'));
    }
    if (/\b(?:improved|increased|reduced|decreased|rose|fell|declined)\b/i.test(sectionText)
      && !(/\b\d+(?:\.\d+)?\b[\s\S]{0,70}\b(?:to|from)\b|\b(?:from|before)\b[\s\S]{0,70}\b\d+(?:\.\d+)?\b[\s\S]{0,70}\b(?:to|after)\b[\s\S]{0,70}\b\d+(?:\.\d+)?\b/i.test(sectionText))) {
      add(createIssue('IMPACT-02', 'warning', 'A change is claimed without before-and-after figures.', entry.path, 'Add the baseline and follow-up figures, dates, and units.'));
    }
    if (/\b(?:since the start|since inception|since the programme began)\b/i.test(sectionText)
      && !/\b(?:baseline|previous record|earlier record|at inception)\b/i.test(sectionText)) {
      add(createIssue('BASELINE-01', 'warning', 'A “since the start” claim has no earlier comparison record.', entry.path, 'Cite the dated baseline or qualify the claim.'));
    }
    if (/^(?:the|our|we)\b/i.test(sectionText.trim()) && /\b(?:we|our|us)\b/i.test(sectionText) && /\b(?:the team|staff|SHINE)\b/i.test(sectionText)) {
      add(createIssue('NARRATIVE-VOICE-01', 'info', 'Narrative shifts between first-person and third-person voice.', entry.path, 'Use one reporting voice consistently.'));
    }
    if (/\b(?:was|were|had)\b/i.test(sectionText) && /\b(?:is|are|has|have)\b/i.test(sectionText)) {
      add(createIssue('NARRATIVE-TENSE-01', 'info', 'Narrative may mix past and present tense.', entry.path, 'Use past tense for completed reporting-period activities.'));
    }
    const lastChar = sectionText.trim().slice(-1);
    if (sectionText.trim().length > 0 && !/[.!?…'”")\]]/.test(lastChar)) {
      add(createIssue('NARRATIVE-TRUNCATED-01', 'warning', 'Narrative may end with a truncated sentence.', entry.path, 'Review the final sentence against the source document.'));
    }
    if (Number.isFinite(options.maxSentenceWords)) {
      const tooLong = sectionText.split(/[.!?]+/).some((sentence) => words(sentence).length > (options.maxSentenceWords as number));
      if (tooLong) add(createIssue('STYLE-SENTENCE-LENGTH-01', 'info', 'A sentence exceeds the configured word limit.', entry.path, 'Split long sentences into shorter statements.'));
    }
    for (const programmeName of options.programmeNames ?? []) {
      const shortName = programmeName.trim();
      const fullNamePresent = shortName && new RegExp(`\\b${shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sectionText);
      const alias = shortName ? sectionText.match(new RegExp(`\\b(?:the )?${shortName.split(/\s+/)[0]}\\b`, 'i'))?.[0] : undefined;
      if (shortName && !fullNamePresent && alias) {
        add({
          ...createIssue('NARRATIVE-PROGRAMME-01', 'warning', 'Programme naming may not match the approved programme register.', entry.path, `Use the approved name “${shortName}”.`),
          context: alias,
          fix: {
            type: 'choose-option',
            safe: false,
            field: 'text',
            options: (options.programmeNames ?? []).map((name) => ({ value: name, label: name })),
            suggestedValue: shortName,
            reversible: true,
          },
        });
      }
    }
  }

  if (Array.isArray(options.requiredSections)) {
    const headings = narratives.map((entry) => String(getField(entry.value as QualityValue, ['heading', 'title', 'name']) ?? '').toLowerCase());
    const positions = options.requiredSections.map((required) => headings.indexOf(required.toLowerCase()));
    options.requiredSections.forEach((required, index) => {
      if (positions[index] < 0) add(createIssue('NARRATIVE-SECTION-01', 'warning', `Required section “${required}” is missing.`, 'narrative', 'Add the missing report section.'));
      else if (index > 0 && positions[index - 1] >= 0 && positions[index] < positions[index - 1]) {
        add(createIssue('NARRATIVE-ORDER-01', 'warning', 'Required report sections are out of order.', 'narrative', 'Reorder sections to match the approved report structure.'));
      }
    });
  }
  for (const entry of narratives) {
    const record = entry.value as QualityValue;
    if (record.headingAfterContent === true || record.contentBeforeHeading === true) {
      add(createIssue('NARRATIVE-HEADING-01', 'warning', 'Section content appears before its heading.', entry.path, 'Move the heading before the section content.'));
    }
    if (typeof record.sectionNumber === 'number' && record.expectedSectionNumber !== undefined
      && record.sectionNumber !== record.expectedSectionNumber) {
      add(createIssue('NARRATIVE-NUMBERING-01', 'warning', 'Section numbering is out of sequence.', entry.path, 'Renumber sections in the required order.'));
    }
  }
  const sectionNumbers = narratives
    .map((entry) => (entry.value as QualityValue).sectionNumber)
    .filter((value): value is number => typeof value === 'number');
  if (sectionNumbers.some((number, index) => index > 0 && number !== sectionNumbers[index - 1] + 1)) {
    add(createIssue('NARRATIVE-NUMBERING-01', 'warning', 'Section numbering is out of sequence.', 'narrativeSections', 'Renumber sections in the required order.'));
  }
  const rootTitle = String(root.title ?? '');
  if (rootTitle && narrativeText && !rootTitle.toLowerCase().split(/\W+/).filter(Boolean).some((word) => narrativeText.toLowerCase().includes(word))) {
    add(createIssue('NARRATIVE-TITLE-01', 'warning', 'Report title may not match its content.', 'title', 'Align the title with the report scope and reporting period.'));
  }

  if (finalReport && narratives.length === 0) {
    add(createIssue('QUANT-01', 'blocker', 'Final report has no programme sections with quantitative results.', 'narrative', 'Add programme results with targets.'));
  }

  const knownIndicators = indicators.flatMap((entry) => textOf(entry.value).map((text) => text.toLowerCase()));
  for (const activity of activities) {
    const record = activity.value as QualityValue;
    const activityText = textOf(record).join(' ').toLowerCase();
    const namedMatch = knownIndicators.some((indicator) => indicator && activityText.includes(indicator));
    const narrativeOnly = record.narrativeOnly === true
      && typeof record.narrativeOnlyReason === 'string'
      && record.narrativeOnlyReason.trim().length >= 10
      && record.managerApproved === true;
    if (!hasMapping(record) && !namedMatch && !narrativeOnly) {
      const options = indicators.flatMap((indicator) => {
        if (!isRecord(indicator.value)) return [];
        const indicatorRecord = indicator.value;
        const id = getField(indicatorRecord, ['indicatorId', 'id']);
        const label = getField(indicatorRecord, ['indicatorName', 'name', 'title', 'indicator']);
        return id && label ? [{ value: String(id), label: String(label) }] : [];
      });
      add({
        ...createIssue('QUANT-03', finalReport ? 'blocker' : 'warning', 'Activity is not mapped to a result or manager-approved narrative-only reason.', activity.path, 'Link an indicator result or record a manager-approved narrative-only reason.'),
        context: String(getField(record, ['title', 'activity', 'name']) ?? ''),
        fix: { type: 'choose-option', safe: false, field: 'indicatorId', options: [...options, { value: 'narrative-only', label: 'Narrative only (requires manager approval)' }], reversible: true },
      });
    }
  }

  const varianceThreshold = Number.isFinite(options.varianceThresholdPercent) ? Math.max(0, options.varianceThresholdPercent as number) : 20;
  for (const entry of [...activities, ...results, ...indicators]) {
    const record = entry.value as QualityValue;
    const target = getNumber(record, ['target', 'planned', 'plannedValue']);
    const actual = getNumber(record, ['actual', 'actualValue', 'achieved', 'result', 'resultValue']);
    const varianceExplanation = getField(record, ['varianceExplanation', 'varianceReason']);
    if ((target === undefined) !== (actual === undefined)) {
      add(createIssue('QUANT-04', 'warning', target === undefined ? 'Result has no target.' : 'Target has no recorded result.', entry.path, 'Record both a target and a result.'));
    }
    if (target !== undefined && actual !== undefined && target > 0) {
      const achievement = actual / target * 100;
      if ((achievement > 120 || achievement < 50) && !(typeof varianceExplanation === 'string' && varianceExplanation.trim())) {
        add(createIssue('QUANT-04', 'warning', `Achievement is ${Math.round(achievement)}% and has no variance explanation.`, entry.path, 'Add a brief explanation for the variance.'));
      }
      if (Math.abs(target) > 0 && Math.abs(actual - target) / Math.abs(target) * 100 > varianceThreshold && achievement >= 50 && achievement <= 120) {
        add(createIssue('QUANT-04', 'warning', 'Recorded result differs materially from its target.', entry.path, 'Verify the result and explain the variance.'));
      }
    }
  }

  const systemValues = [...activities, ...results, ...indicators]
    .map(({ value }) => getNumber(value as QualityValue, ['actual', 'actualValue', 'achieved', 'result', 'resultValue']))
    .filter((value): value is number => value !== undefined);
  for (const entry of narratives) {
    const narrativeText = textOf(entry.value).join(' ');
    const claims = [...narrativeText.matchAll(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\b/g)].map((match) => Number(match[1].replace(/,/g, '')));
    if (claims.length && systemValues.length && claims.some((claim) => !systemValues.some((value) => Math.abs(value - claim) <= Math.max(1, Math.abs(value) * 0.05)))) {
      add(createIssue('QUANT-05', 'warning', 'Narrative figures do not align with recorded programme results.', entry.path, 'Reconcile narrative figures with the structured results.'));
    }
  }

  const now = dateValue(options.now);
  const staleDays = Number.isFinite(options.staleAfterDays) ? Math.max(0, options.staleAfterDays as number) : 45;
  for (const entry of results) {
    const record = entry.value as QualityValue;
    const reported = getNumber(record, ['actual', 'actualValue', 'achieved', 'result', 'resultValue']);
    const evidence = getField(record, ['evidence', 'evidenceNote', 'evidenceSource', 'source', 'verification']);
    const status = String(getField(record, ['verificationStatus', 'evidenceStatus', 'status']) ?? '').toLowerCase();
    if ((evidence === undefined || evidence === null || evidence === '') && record.evidenceRequired !== false) {
      add(createIssue('QUANT-06', 'warning', 'Result has no supporting evidence recorded.', entry.path, 'Attach or reference verifiable supporting evidence.'));
    }
    if (/unverified|not verified|pending|unknown|unconfirmed/.test(status)) {
      add(createIssue('QUANT-06', 'warning', 'Result evidence is marked unverified.', entry.path, 'Verify the result and update its verification status.'));
    }
    const evidenceDate = dateValue(getField(record, ['evidenceDate', 'verifiedAt', 'lastVerifiedAt', 'updatedAt']));
    if (evidenceDate === undefined) {
      add(createIssue('DQ-TIMELINESS', 'warning', 'Result has no evidence or verification date.', entry.path, 'Record the date the result was measured or last verified.'));
    } else if (now !== undefined && now - evidenceDate > staleDays * 86400000) {
      add(createIssue('QUANT-06', 'warning', 'Result evidence is older than the configured freshness limit.', entry.path, 'Refresh or revalidate the supporting evidence.'));
    }
    const validityValue = getField(record, ['validity', 'validityCheck']);
    const validity = isRecord(validityValue) ? validityValue : undefined;
    const validityChecks = Array.isArray(validity?.checks) ? validity.checks.map(String) : [];
    const sourceSeen = isRecord(validity?.source)
      && Boolean(validity.source.name && (validity.source.reference || validity.source.date));
    const crossChecked = typeof validity?.secondSource === 'string' && Boolean(validity.secondSource.trim());
    const definitionMatched = validityChecks.includes('definition-match');
    const enteredByForValidity = getField(record, ['enteredBy', 'createdBy', 'createdByUid']);
    const validityCheckedBy = getField(validity || {}, ['checkedBy']);
    const missingValidity: string[] = [];
    if (!sourceSeen && !crossChecked) missingValidity.push('a named source or a second-source cross-check');
    if (!definitionMatched) missingValidity.push('confirmation that the measure, unit, period, and group match the indicator definition');
    if (typeof validityCheckedBy !== 'string' || !validityCheckedBy.trim()
      || (enteredByForValidity && enteredByForValidity === validityCheckedBy)) {
      missingValidity.push('verification by a person other than the data entrant');
    }
    const plausible = reported !== undefined
      && reported >= 0
      && !(record.unit === '%' && reported > 100)
      && !(getNumber(record, ['enrolment', 'enrollment', 'populationLimit']) !== undefined
        && /girl|child|participant/i.test(String(record.unit || ''))
        && reported > Number(getNumber(record, ['enrolment', 'enrollment', 'populationLimit'])));
    if (!plausible) missingValidity.push('a value within a plausible range');
    const validityNote = typeof validity?.note === 'string' ? validity.note.trim() : '';
    if (missingValidity.length || !validity || !validityNote) {
      const missing = [...missingValidity, ...(!validityNote ? ['a validation note'] : [])];
      add({
        ...createIssue('DQ-VALIDITY', 'warning', `Validity check incomplete: ${missing.join('; ')}.`, entry.path, 'Check the indicator definition and document the source, comparison, plausible range, and review note.'),
        context: `Indicator: ${String(getField(record, ['indicatorName', 'name', 'title']) ?? 'Not named')} · Definition: ${String(getField(record, ['definition', 'indicatorDefinition']) ?? 'Not recorded')} · Unit: ${String(record.unit ?? 'Not recorded')} · Value: ${reported ?? 'Not recorded'}${plausible ? ' · plausible-range check passed' : ' · plausible-range check failed'}`,
      });
    }
    if (validity?.checkedBy && getField(record, ['enteredBy', 'createdBy', 'createdByUid']) === validity.checkedBy) {
      add(createIssue('DQ-INTEGRITY', 'warning', 'Validity was checked by the same person who entered the result.', entry.path, 'Ask a second person to review the result where practical.'));
    }
    const enteredBy = getField(record, ['enteredBy', 'createdBy', 'createdByUid']);
    const verifiedBy = getField(record, ['verifiedBy', 'verifiedByUid']);
    if (enteredBy && verifiedBy && enteredBy === verifiedBy) {
      add(createIssue('DQ-INTEGRITY', 'warning', 'Result was entered and verified by the same person.', entry.path, 'Request independent verification where practical.'));
    }
    const sampleSize = getNumber(record, ['n', 'sampleSize', 'denominator']);
    if (reported !== undefined && sampleSize === undefined && (reported % 1 !== 0 || record.isPercentage === true || record.unit === '%')) {
      add(createIssue('DQ-PRECISION', 'warning', 'A decimal result has no sample size (n) or stated precision.', entry.path, 'Report the base count (n) and use precision supported by the method.'));
    }
    if (getField(record, ['precision', 'rounding']) === undefined && reported !== undefined && reported % 1 !== 0 && sampleSize !== undefined) {
      add(createIssue('DQ-PRECISION', 'info', 'Result precision is not described.', entry.path, 'State the rounding rule or precision used.'));
    }
    if (!getField(record, ['method', 'measurementMethod', 'dataCollectionMethod'])) {
      add(createIssue('DQ-RELIABILITY', 'info', 'Result has no measurement method recorded.', entry.path, 'Record the method so it can be applied consistently in later periods.'));
    }
  }

  for (const entry of results) {
    const record = entry.value as QualityValue;
    const text = textOf(record).join(' ').toLowerCase();
    const hasOutcome = Boolean(getField(record, ['outcomeIndicator', 'outcomeId', 'outcome']))
      || /\b(?:improved|increased|reduced|change|changed|outcome|wellbeing|attendance|retention|learning|confidence)\b/.test(text);
    const hasOutput = /\b(?:sessions?|training|workshops?|meetings?|distributions?|activities|events?)\b/.test(text);
    if (hasOutput && !hasOutcome) {
      add(createIssue('IMPACT-01', 'warning', 'Programme reports outputs without an outcome indicator.', entry.path, 'Add an outcome indicator and explain its baseline.'));
    }
    const outcomeClaimed = /\b(?:improved|increased|reduced|decreased|change|changed|impact|outcome)\b/i.test(text);
    const baselineValue = getNumber(record, ['baseline', 'baselineValue']);
    if (outcomeClaimed && baselineValue === undefined && !/\bbaseline\b/i.test(text)) {
      add(createIssue('IMPACT-01', 'warning', 'Outcome is claimed without a baseline.', entry.path, 'Record the dated baseline for this outcome.'));
    }
  }

  for (const indicator of indicators) {
    const record = indicator.value as QualityValue;
    const baseline = Object.entries(record).find(([key, value]) => /baseline/i.test(key) && value !== null && value !== undefined && value !== '');
    const baselineDate = getField(record, ['baselineDate', 'baselineRecordedAt']);
    const baselineType = getField(record, ['baselineType', 'baselineMethod']);
    if (!baseline) add(createIssue('BASELINE-01', 'warning', 'Indicator has no baseline value recorded.', indicator.path, 'Record a baseline value or state why it is unavailable.'));
    else if (!baselineDate || !baselineType) add(createIssue('BASELINE-01', 'warning', 'Baseline is missing its date or measurement type.', indicator.path, 'Record when and how the baseline was measured.'));
    if (/change/i.test(String(getField(record, ['change', 'changeValue']) ?? '')) && !baselineDate) {
      add(createIssue('BASELINE-01', 'warning', 'Change figure does not state the baseline date.', indicator.path, 'Add the baseline measurement date.'));
    }
  }

  const reliabilityByIndicator = new Map<string, Set<string>>();
  for (const entry of indicators) {
    const record = entry.value as QualityValue;
    const indicatorId = String(getField(record, ['indicatorId', 'id', 'name']) ?? '');
    const method = String(getField(record, ['method', 'measurementMethod', 'dataCollectionMethod']) ?? '');
    if (!indicatorId || !method) continue;
    const methods = reliabilityByIndicator.get(indicatorId) ?? new Set<string>();
    methods.add(normalized(method));
    reliabilityByIndicator.set(indicatorId, methods);
  }
  for (const [indicatorId, methods] of reliabilityByIndicator) {
    if (methods.size > 1) add(createIssue('DQ-RELIABILITY', 'warning', 'The same indicator uses different measurement methods across periods.', `indicators.${normalized(indicatorId)}`, 'Use a consistent method or document the method change.'));
  }

  const dataQualityNodes = nodes.filter((node) => /validity|reliability|timeliness|precision|integrity/i.test(node.path));
  for (const node of dataQualityNodes) {
    const raw = typeof node.value === 'string' || typeof node.value === 'boolean' ? String(node.value).toLowerCase() : '';
    if (/^(?:false|invalid|unreliable|untimely|imprecise|incomplete|failed|poor|low|needs? (?:review|improvement))$/.test(raw)) {
      const dimension = node.path.match(/validity|reliability|timeliness|precision|integrity/i)?.[0] ?? 'data quality';
      add(createIssue(`DQ-${dimension.toUpperCase()}`, 'warning', `Data quality ${dimension} check is flagged.`, node.path, `Review and correct the ${dimension} issue.`));
    }
  }

  for (const entry of nodes) {
    if (!isRecord(entry.value)) continue;
    const record = entry.value;
    const donorFacing = /donor|external|public|report/i.test(entry.path)
      || record.donorFacing === true || record.audience === 'donor';
    if (donorFacing) {
      const publicText = textOf(record).join(' ');
      if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(publicText)
        || /(?:\+?\d[\d\s().-]{7,}\d)/.test(publicText)) {
        add(createIssue('PRIVACY-PII-01', 'warning', 'Donor-facing content may contain unredacted contact information.', entry.path, 'Remove or redact personal contact details before sharing.'));
      }
      if (getField(record, ['personName', 'fullName', 'girlName', 'beneficiaryName', 'staffName']) !== undefined) {
        add(createIssue('PRIVACY-NAME-01', 'blocker', 'Donor-facing content includes a directly identifying person name.', entry.path, 'Replace the name with an approved aggregate or anonymised reference.'));
      }
    }
  }

  const sensitiveTerms = /\b(?:medical|diagnosis|health condition|psychosocial|safeguarding|abuse|violence|family details|guardian|phone number|date of birth)\b/i;
  const sensitiveNames = Array.isArray(root.sensitiveNames) ? root.sensitiveNames.filter((name): name is string => typeof name === 'string') : [];
  for (const entry of nodes) {
    if (!isRecord(entry.value)) continue;
    const record = entry.value;
    const donorFacing = /donor|external|public|report/i.test(entry.path)
      || record.donorFacing === true || record.audience === 'donor' || root.donorFacing === true;
    if (!donorFacing) continue;
    const text = textOf(record).join(' ');
    if (sensitiveTerms.test(text) || sensitiveNames.some((name) => name && text.toLowerCase().includes(name.toLowerCase()))) {
      add(createIssue('PRIVACY-SENSITIVE-01', 'blocker', 'Donor-facing content may expose a person or sensitive health, family, psychosocial, or safeguarding information.', entry.path, 'Remove identifying and sensitive case details; report only authorised aggregates.'));
    }
  }
  if (root.donorFacing === true) {
    for (const node of nodes) {
      if (typeof node.value !== 'string') continue;
      const stringValue = node.value;
      if (sensitiveTerms.test(stringValue) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(stringValue)
        || /(?:\+?\d[\d\s().-]{7,}\d)/.test(stringValue)
        || /^(?:fullName|personName|girlName|beneficiaryName|staffName)$/i.test(node.key)) {
        add(createIssue('PRIVACY-SENSITIVE-01', 'blocker', 'Donor-facing content may expose a person or sensitive health, family, psychosocial, or safeguarding information.', node.path, 'Remove identifying and sensitive case details; report only authorised aggregates.'));
      }
      if (sensitiveNames.some((name) => name && stringValue.toLowerCase().includes(name.toLowerCase()))) {
        add(createIssue('PRIVACY-SENSITIVE-01', 'blocker', 'Donor-facing content may expose a person or sensitive health, family, psychosocial, or safeguarding information.', node.path, 'Remove identifying and sensitive case details; report only authorised aggregates.'));
      }
    }
  }

  const acronymAllowlist = new Set(['SHINE', 'USA', 'UK', 'UN', 'WHO', ...(options.knownAcronyms ?? []).map((item) => item.toUpperCase())]);
  for (const entry of narratives) {
    const narrativeText = textOf(entry.value).join(' ');
    for (const match of narrativeText.matchAll(/\b[A-Z][A-Z0-9]{1,7}\b/g)) {
      const acronym = match[0];
      if (acronymAllowlist.has(acronym)) continue;
      const defined = new RegExp(`\\b[A-Za-z][A-Za-z -]{3,50}\\s\\(${acronym}\\)|\\b${acronym}\\s*\\([^)]{5,}\\)`).test(narrativeText);
      if (!defined) add(createIssue('STYLE-ACRONYM-01', 'info', 'Acronym is used without a nearby definition.', entry.path, 'Spell out the term on first use.'));
    }
  }

  if (options.ukSpelling) {
    const spellings: Array<[RegExp, string]> = [
      [/\bcolor\b/i, 'colour'], [/\borganize\b/i, 'organise'], [/\bprogram\b/i, 'programme'],
      [/\bcenter\b/i, 'centre'], [/\bbehavior\b/i, 'behaviour'], [/\bprioritize\b/i, 'prioritise'],
      [/\banalyze\b/i, 'analyse'], [/\blabor\b/i, 'labour'], [/\bfavorite\b/i, 'favourite'],
      [/\bcatalog\b/i, 'catalogue'], [/\btraveling\b/i, 'travelling'],
    ];
    for (const entry of narratives) {
      const text = textOf(entry.value).join(' ');
      if (spellings.some(([pattern]) => pattern.test(text))) {
        add(createIssue('STYLE-UK-01', 'info', 'Narrative may use US spelling.', entry.path, `Use the configured UK spelling (for example, ${spellings.find(([pattern]) => pattern.test(text))?.[1]}).`));
      }
    }
  }

  if (Number.isFinite(options.maxReadingGrade)) {
    for (const entry of narratives) {
      if (readingGrade(textOf(entry.value).join(' ')) > (options.maxReadingGrade as number)) {
        add(createIssue('STYLE-READABILITY-01', 'info', 'Narrative may exceed the configured reading level.', entry.path, 'Use shorter sentences and simpler wording.'));
      }
    }
  }

  for (const entry of nodes) {
    if (!isRecord(entry.value)) continue;
    const record = entry.value;
    const quantity = getNumber(record, ['quantity']);
    const unitCost = getNumber(record, ['unitCost', 'unitPrice']);
    const amount = getNumber(record, ['amount', 'total', 'cachedAmount', 'cachedValue']);
    const formula = getField(record, ['formula']);
    if (quantity !== undefined && unitCost !== undefined && amount !== undefined
      && Math.abs(quantity * unitCost - amount) > Math.max(0.01, Math.abs(amount) * 0.01)) {
      add(createIssue('FORMULA-AMOUNT-01', 'warning', 'Cached amount does not match quantity multiplied by unit cost.', entry.path, 'Recalculate the amount or correct its inputs.'));
    }
    if (quantity !== undefined && unitCost !== undefined && amount !== undefined && Math.abs(quantity * unitCost - amount) > 0.01) {
      add(createIssue('FIN-UNIT-CALC-01', 'warning', 'Typed amount does not equal quantity multiplied by unit cost.', entry.path, 'Recompute the line amount from quantity and unit cost.'));
    }
    if (typeof formula === 'string' && formula.trim() && amount === undefined) {
      add(createIssue('FORMULA-CACHE-01', 'info', 'Formula is present but no cached amount is available.', entry.path, 'Recalculate and save the formula result.'));
    }
    if (record.formulaExpected === true && !(typeof formula === 'string' && formula.trim())) {
      add(createIssue('FIN-HARDCODED-TOTAL-01', 'warning', 'A total is hard-coded where a formula is expected.', entry.path, 'Replace the typed total with a formula and retain the source value in notes.'));
    }
    if (typeof formula === 'string') {
      const range = formula.match(/SUM\s*\(\s*[A-Z]+(\d+)\s*:\s*[A-Z]+(\d+)\s*\)/i);
      const expectedRows = getNumber(record, ['expectedRowCount', 'lineCount']);
      if (range && expectedRows !== undefined && Number(range[2]) - Number(range[1]) + 1 < expectedRows) {
        add(createIssue('FIN-SUM-RANGE-01', 'warning', 'The total formula range appears to omit one or more lines.', entry.path, 'Check the formula range against all detail rows.'));
      }
      const explicitRows = formula.match(/SUM\s*\(\s*([A-Z]+\d+(?:\s*,\s*[A-Z]+\d+)+)\s*\)/i)?.[1]
        ?.match(/\d+/g)?.map(Number);
      if (explicitRows?.some((row, index) => index > 0 && row !== explicitRows[index - 1] + 1)) {
        add(createIssue('FIN-SUM-RANGE-01', 'warning', 'The total formula skips one or more detail rows.', entry.path, 'Check the formula against every detail line.'));
      }
      const formulaTotal = getNumber(record, ['formulaTotal', 'recomputedTotal', 'calculatedTotal']);
      if (amount !== undefined && formulaTotal !== undefined && Math.abs(amount - formulaTotal) > 0.01) {
        add(createIssue('FIN-TOTAL-DISAGREEMENT-01', 'warning', `Stated total ${amount}; recomputed total ${formulaTotal}; difference ${amount - formulaTotal}.`, entry.path, 'Recompute the total from all detail rows.'));
      }
    }
    if ((quantity !== undefined && unitCost !== undefined && quantity * unitCost < 0) || (amount !== undefined && amount < 0)) {
      add(createIssue('FIN-NEGATIVE-01', 'warning', 'Quantity or unit cost produces a negative amount.', entry.path, 'Confirm the sign and correct the source values.'));
    }
    if (record.priceMissing === true || (record.priceStatus === 'missing' && !unitCost)) {
      add(createIssue('FIN-PRICE-01', 'warning', 'Budget or procurement item has no price.', entry.path, 'Add a verified unit price or mark the item as awaiting quotation.'));
    }
    const period = String(getField(record, ['period', 'month', 'budgetMonth']) ?? '');
    if (/budget|spend/i.test(entry.path) && !period && record.periodRequired !== false) {
      add(createIssue('FIN-MONTH-01', 'warning', 'Budget line has no month or period.', entry.path, 'Assign the budget line to a reporting month or period.'));
    }
    if (record.costLevel === 'group' && record.costBrokenDown !== true) {
      add(createIssue('FIN-GROUP-COST-01', 'warning', 'Group-level cost is not broken down by activity.', entry.path, 'Allocate the grouped cost to its activities.'));
    }
    if (record.hasBudgetLine === false || (record.spend !== undefined && !record.budgetLineId && !record.budgetId)) {
      add(createIssue('FIN-UNBUDGETED-SPEND-01', 'warning', 'Spend is not linked to a budget line.', entry.path, 'Link the expenditure to an approved budget line.'));
    }
    if (record.restrictedFund === true && record.fundPurpose && record.spendPurpose
      && normalized(String(record.fundPurpose)) !== normalized(String(record.spendPurpose))) {
      add(createIssue('FIN-RESTRICTED-FUND-01', 'blocker', 'Restricted-fund spend does not match the fund purpose.', entry.path, 'Do not charge this spend to the restricted fund; obtain an authorised correction.'));
    }
  }

  const budgetLines = recordsFor(nodes, /budget|procurement/i).filter((entry) => {
    const record = entry.value as QualityValue;
    return getField(record, ['itemDescription', 'description', 'item', 'name']) !== undefined;
  });
  const seenBudgetLines = new Set<string>();
  for (const entry of budgetLines) {
    const record = entry.value as QualityValue;
    const line = [
      getField(record, ['programme', 'programmeId']),
      getField(record, ['itemDescription', 'description', 'item', 'name']),
      getField(record, ['month', 'period']),
    ].map((value) => normalized(String(value ?? ''))).join('|');
    if (seenBudgetLines.has(line)) add(createIssue('FIN-DUPLICATE-LINE-01', 'warning', 'A duplicate budget line appears in this period.', entry.path, 'Review duplicate rows and retain the authoritative line.'));
    seenBudgetLines.add(line);
    const typedAmount = getNumber(record, ['statedAmount', 'typedAmount', 'amount']);
    const recomputedAmount = getNumber(record, ['recomputedAmount', 'calculatedAmount']);
    if (typedAmount !== undefined && recomputedAmount !== undefined && Math.abs(typedAmount - recomputedAmount) > 0.01) {
      add({
        ...createIssue('FIN-TOTAL-DISAGREEMENT-01', 'warning', `Stated total ${typedAmount}; recomputed total ${recomputedAmount}; difference ${typedAmount - recomputedAmount}.`, entry.path, 'Use the recomputed total after checking all line items.'),
        fix: { type: 'choose-option', safe: false, field: 'amount', options: [
          { value: String(recomputedAmount), label: `Use recomputed total (${recomputedAmount})` },
          { value: 'keep-stated', label: `Keep stated total (${typedAmount}) and explain` },
        ], suggestedValue: recomputedAmount, reversible: true },
      });
    }
    const people = getNumber(record, ['beneficiaryCount', 'peopleCount', 'population']);
    const targetPeople = getNumber(record, ['reportTarget', 'workplanTarget', 'targetPeople']);
    if (people !== undefined && targetPeople !== undefined && people !== targetPeople) {
      add(createIssue('FIN-TARGET-MISMATCH-01', 'warning', 'Budget population does not match the report or workplan target.', entry.path, 'Align the budget quantity with the approved target or explain the difference.'));
    }
    const filePeriod = String(root.filePeriod ?? root.reportingPeriod ?? '');
    const title = String(getField(record, ['title', 'budgetTitle']) ?? root.title ?? '');
    const titleYear = title.match(/\b20\d{2}\b/)?.[0];
    const periodYear = filePeriod.match(/\b20\d{2}\b/)?.[0];
    if (titleYear && periodYear && titleYear !== periodYear) {
      add(createIssue('FIN-YEAR-MISMATCH-01', 'warning', 'Budget title year does not match the file reporting period.', entry.path, 'Confirm the correct financial or reporting year.'));
    }
  }

  for (const entry of nodes) {
    if (!isRecord(entry.value)) continue;
    const record = entry.value;
    const stated = getNumber(record, ['statedTotal', 'typedTotal', 'reportedTotal']);
    const recomputed = getNumber(record, ['recomputedTotal', 'calculatedTotal', 'lineItemsTotal']);
    if (stated !== undefined && recomputed !== undefined && Math.abs(stated - recomputed) > 0.01) {
      add({
        ...createIssue('FIN-TOTAL-DISAGREEMENT-01', 'warning', `Stated total ${stated}; recomputed total ${recomputed}; difference ${stated - recomputed}.`, entry.path, 'Recompute the total from the detail lines.'),
        fix: { type: 'choose-option', safe: false, field: 'statedTotal', options: [
          { value: String(recomputed), label: `Use recomputed total (${recomputed})` },
          { value: 'keep-stated', label: `Keep stated total (${stated}) and explain` },
        ], suggestedValue: recomputed, reversible: true },
      });
    }
  }

  const identityRecords = recordsFor(nodes, /identit|person|girl|staff|payroll|budget|narrative|report/i);
  const identityReviews = Array.isArray(root.identityReviews) ? root.identityReviews.filter(isRecord) : [];
  for (const review of identityReviews) {
    const sourceName = typeof review.name === 'string' ? review.name.trim() : '';
    if (review.decision === 'new-person' || review.decision === 'existing-person') continue;
    const candidates = Array.isArray(review.candidates)
      ? review.candidates.filter(isRecord).flatMap((candidate) =>
        typeof candidate.id === 'string' && typeof candidate.name === 'string'
          ? [{ id: candidate.id, name: candidate.name }]
          : [])
      : [];
    if (!sourceName || !candidates.length) continue;
    const possible = matchNameCandidates(sourceName, candidates).possible;
    const targetId = typeof review.id === 'string' ? review.id : '';
    if (!possible.length || !targetId) continue;
    const location = `identityReviews.${targetId}`;
    add({
      ...createIssue(
        'IDENTITY-FUZZY-01',
        'warning',
        'Imported person name has possible matches and needs explicit human confirmation; no automatic merge was made.',
        location,
        'Select an existing person or explicitly mark this as a new person.',
      ),
      target: { kind: 'preview-item', id: targetId, field: 'matchedId' },
      context: `Imported name: ${sourceName}. ${possible.length} possible match(es) found.`,
      fix: {
        type: 'choose-option',
        safe: false,
        field: 'matchedId',
        options: [
          ...possible.map((candidate) => ({ value: candidate.id, label: candidate.name })),
          { value: 'new-person', label: 'This is a new person' },
        ],
        reversible: true,
      },
    });
  }
  const suppliedNames = Array.isArray(root.identityNames) ? root.identityNames.filter((name): name is string => typeof name === 'string') : [];
  const candidateNames = new Set(suppliedNames);
  for (const entry of identityRecords) {
    const record = entry.value as QualityValue;
    const name = getField(record, ['personName', 'fullName', 'employeeName', 'beneficiaryName', 'name']);
    if (typeof name === 'string' && name.trim()) candidateNames.add(name.trim());
  }
  const nameList = [...candidateNames].slice(0, 500);
  const nameCandidates = nameList.map((name, index) => ({ id: String(index), name }));
  const possibleNameMatch = nameCandidates.some((candidate, index) =>
    matchNameCandidates(candidate.name, nameCandidates.slice(index + 1)).possible.length > 0
  );
  if (possibleNameMatch && identityReviews.length === 0) {
    add(createIssue('IDENTITY-FUZZY-01', 'warning', 'Two person-name records are similar and need human confirmation; no automatic merge was made.', 'identities', 'Ask a manager to confirm whether these records refer to the same person.'));
  }
  const budgetNames = new Set(recordsFor(nodes, /budget/i).map((entry) => getField(entry.value as QualityValue, ['personName', 'fullName', 'employeeName', 'beneficiaryName'])).filter((name): name is string => typeof name === 'string').map(normalized));
  const narrativeNames = new Set(recordsFor(nodes, /narrative|report/i).map((entry) => getField(entry.value as QualityValue, ['personName', 'fullName', 'employeeName', 'beneficiaryName'])).filter((name): name is string => typeof name === 'string').map(normalized));
  if ([...budgetNames].some((name) => !narrativeNames.has(name)) || [...narrativeNames].some((name) => !budgetNames.has(name))) {
    add(createIssue('IDENTITY-REPORT-MISMATCH-01', 'warning', 'A person appears in only one of the budget and report datasets.', 'identities', 'Reconcile the roster without automatically merging similarly named people.'));
  }
  const documents = Array.isArray(root.documents) ? root.documents.filter(isRecord) : [];
  const hashes = new Set<string>();
  const titles = new Map<string, string>();
  for (const [index, document] of documents.entries()) {
    const hash = String(document.hash ?? '');
    if (hash && hashes.has(hash)) add(createIssue('IDENTITY-DUPLICATE-FILE-01', 'warning', 'A file with the same content hash was supplied more than once.', `documents[${index}]`, 'Review the duplicate and choose the authoritative source.'));
    if (hash) hashes.add(hash);
    const title = normalized(String(document.title ?? ''));
    const content = String(document.text ?? '');
    if (title && titles.has(title) && titles.get(title) !== content) {
      add(createIssue('IDENTITY-VERSION-01', 'warning', 'Files have the same title but different content; a version diff is required.', `documents[${index}]`, 'Compare versions and select which is current.'));
    } else if (title) titles.set(title, content);
  }

  return issues;
}

export function qualityScores(input: QualityRulesInput | QualityIssue[]): {
  quantification: number;
  impact: number;
  dataQuality: number;
} {
  const issues = Array.isArray(input) ? input : runQualityRules(input);
  const groups: Record<'quantification' | 'impact' | 'dataQuality', RegExp> = {
    quantification: /^(?:QUANT-|BASELINE-)/,
    impact: /^IMPACT-/,
    dataQuality: /^(?:DQ-|PRIVACY-|FORMULA-)/,
  };
  const maxPenalties = { quantification: 30, impact: 15, dataQuality: 24 };
  const penalty = (severity: QualityIssue['severity']): number => severity === 'blocker' ? 3 : severity === 'warning' ? 2 : 1;
  return {
    quantification: Math.round(Math.max(0, 100 - issues.filter((issue) => groups.quantification.test(issue.rule)).reduce((sum, issue) => sum + penalty(issue.severity), 0) / maxPenalties.quantification * 100)),
    impact: Math.round(Math.max(0, 100 - issues.filter((issue) => groups.impact.test(issue.rule)).reduce((sum, issue) => sum + penalty(issue.severity), 0) / maxPenalties.impact * 100)),
    dataQuality: Math.round(Math.max(0, 100 - issues.filter((issue) => groups.dataQuality.test(issue.rule)).reduce((sum, issue) => sum + penalty(issue.severity), 0) / maxPenalties.dataQuality * 100)),
  };
}
