import { ProgrammeLogType } from '../types';

export type ProgrammeId =
  | 'early-years'
  | 'shine-village'
  | 'bursary'
  | 'child-house'
  | 'relief-family'
  | 'fish-farming'
  | 'chicken-farming'
  | 'fish-chicken'
  | 'rice-maize-mill'
  | 'tomato-farming';

export interface ProgrammeDefinition {
  id: ProgrammeId;
  name: string;
  group: string;
  tagline: string;
  background: string;
  startYear?: number;
  startConfirmed: boolean;
  startNote?: string;
  logTypes: ProgrammeLogType[];
}

export const PROGRAMMES: ProgrammeDefinition[] = [
  {
    id: 'early-years',
    name: 'Early Years',
    group: 'Care & Education',
    tagline: 'A strong, joyful start to learning and development.',
    background: 'SHINE supports young children in TA Kuntumanji with early learning, attentive care, and preparation for primary school. The programme also records enrolment and feeding activity to help children thrive.',
    startConfirmed: false,
    logTypes: [],
  },
  {
    id: 'shine-village',
    name: 'Shine Village',
    group: 'Care & Education',
    tagline: 'A community resource centre growing into a village of care.',
    background: 'SHINE Village builds a supportive community around children and families in TA Kuntumanji. The resource centre opened in 2014, with broader village development beginning around 2016; the development date needs confirmation.',
    startYear: 2014,
    startConfirmed: false,
    startNote: 'The resource centre opened in 2014; village development began around 2016. Please confirm which date should represent the programme start.',
    logTypes: ['Activity', 'Expense', 'Input', 'Note'],
  },
  {
    id: 'bursary',
    name: 'Bursary',
    group: 'Care & Education',
    tagline: 'Removing barriers to education for vulnerable girls.',
    background: 'SHINE bursaries help orphaned and vulnerable children access and continue their education. Support is focused on practical school-related needs and is followed through with the girls and their schools.',
    startYear: 2010,
    startConfirmed: false,
    logTypes: ['Expense', 'Note'],
  },
  {
    id: 'child-house',
    name: 'Child House',
    group: 'Care & Education',
    tagline: 'A safe, stable home for children in SHINE’s care.',
    background: 'Child House is the SHINE Children’s Home, represented by the existing Households records in this app. Its first residents arrived in September 2018, and the home provides care, protection, and day-to-day support.',
    startYear: 2018,
    startConfirmed: false,
    logTypes: [],
  },
  {
    id: 'relief-family',
    name: 'Relief & Family Preservation',
    group: 'Community Support',
    tagline: 'Practical support that helps families stay together.',
    background: 'SHINE works with vulnerable households in the local community to respond to immediate needs and strengthen family stability. This programme has its own distribution and family-support records, separate from case-management follow-ups for SHINE Girls.',
    startConfirmed: false,
    logTypes: ['Distribution', 'Family support', 'Expense', 'Note'],
  },
  {
    id: 'fish-farming',
    name: 'Fish Farming',
    group: 'Income Projects',
    tagline: 'Fish farming that creates reliable income and opportunity.',
    background: 'SHINE’s fish farming project develops practical agricultural activity as a source of sustainable income. Production, sales, inputs, and costs are tracked to understand output and financial performance.',
    startYear: 2021,
    startConfirmed: true,
    logTypes: ['Production', 'Sale', 'Expense', 'Input', 'Activity', 'Note'],
  },
  {
    id: 'chicken-farming',
    name: 'Chicken Farming',
    group: 'Income Projects',
    tagline: 'Chicken farming that creates reliable income and opportunity.',
    background: 'SHINE’s chicken farming project develops practical agricultural activity as a source of sustainable income. Production, sales, inputs, and costs are tracked to understand output and financial performance.',
    startYear: 2021,
    startConfirmed: true,
    logTypes: ['Production', 'Sale', 'Expense', 'Input', 'Activity', 'Note'],
  },
  {
    id: 'rice-maize-mill',
    name: 'Maize & Rice Mill',
    group: 'Income Projects',
    tagline: 'Turning staple crops into a sustainable community enterprise.',
    background: 'SHINE’s maize and rice mill project processes staple crops and generates income while serving the surrounding community. Records capture production, sales, operating costs, and inputs.',
    startYear: 2022,
    startConfirmed: true,
    logTypes: ['Production', 'Sale', 'Expense', 'Input', 'Activity', 'Note'],
  },
  {
    id: 'tomato-farming',
    name: 'Tomato Farming',
    group: 'Income Projects',
    tagline: 'Growing marketable crops through practical local agriculture.',
    background: 'SHINE’s tomato farming project supports practical agricultural skills and creates income from locally grown produce. Production, sales, inputs, and costs can be recorded to follow each season’s results.',
    startYear: 2023,
    startConfirmed: true,
    logTypes: ['Production', 'Sale', 'Expense', 'Input', 'Activity', 'Note'],
  },
];

export const LEGACY_PROGRAMMES: ProgrammeDefinition[] = [
  {
    id: 'fish-chicken',
    name: 'Fish & Chicken Farming (historical records)',
    group: 'Historical records',
    tagline: 'Combined historical records are retained without assigning them to either programme.',
    background: 'Older records combined fish and chicken farming. They remain available here and are not reassigned because their original programme cannot be determined safely.',
    startYear: 2021,
    startConfirmed: true,
    logTypes: ['Production', 'Sale', 'Expense', 'Input', 'Activity', 'Note'],
  },
];

export const PROGRAMME_BY_ID: Record<ProgrammeId, ProgrammeDefinition> = Object.fromEntries(
  [...PROGRAMMES, ...LEGACY_PROGRAMMES].map((programme) => [programme.id, programme])
) as Record<ProgrammeId, ProgrammeDefinition>;

const PROGRAMME_NAME_ALIASES: Partial<Record<ProgrammeId, string[]>> = {
  'early-years': ['early childhood', 'early years programme'],
  'shine-village': ['shine village programme'],
  'child-house': ["shine children's home", 'shine children’s home'],
  'relief-family': ['relief and family preservation'],
  'fish-farming': ['fish farm'],
  'chicken-farming': ['chicken farm'],
  'rice-maize-mill': ['maize and rice mill'],
};

export function programmeNameAliases(approvedNames: string[] = PROGRAMMES.map(({ name }) => name)): Array<{ alias: string; approvedName: string }> {
  return PROGRAMMES
    .filter((programme) => approvedNames.includes(programme.name))
    .flatMap((programme) => (PROGRAMME_NAME_ALIASES[programme.id] || []).map((alias) => ({
      alias,
      approvedName: programme.name,
    })));
}

export function findProgrammeNameAliases(
  text: string,
  approvedNames: string[] = PROGRAMMES.map(({ name }) => name),
): Array<{ alias: string; approvedName: string }> {
  return programmeNameAliases(approvedNames).filter(({ alias }) =>
    new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
}

export function normalizeProgrammeNames(
  text: string,
  approvedNames: string[] = PROGRAMMES.map(({ name }) => name),
): string {
  let normalizedText = text;
  const approvedByLowerName = new Map(PROGRAMMES
    .filter((programme) => approvedNames.includes(programme.name))
    .map((programme) => [programme.name.toLowerCase(), programme.name]));
  for (const [lowerName, approvedName] of approvedByLowerName) {
    normalizedText = normalizedText.replace(
      new RegExp(`\\b${lowerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
      approvedName,
    );
  }
  for (const { alias, approvedName } of programmeNameAliases(approvedNames)) {
    normalizedText = normalizedText.replace(
      new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
      approvedName,
    );
  }
  return normalizedText;
}