import { ProgrammeLogType } from '../types';

export type ProgrammeId =
  | 'early-years'
  | 'shine-village'
  | 'bursary'
  | 'child-house'
  | 'relief-family'
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
    id: 'fish-chicken',
    name: 'Fish & Chicken Farming',
    group: 'Income Projects',
    tagline: 'Local farming that creates reliable income and opportunity.',
    background: 'SHINE’s fish and chicken farming project develops practical agricultural activity as a source of sustainable income. Production, sales, inputs, and costs are tracked to understand output and financial performance.',
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

export const PROGRAMME_BY_ID: Record<ProgrammeId, ProgrammeDefinition> = Object.fromEntries(
  PROGRAMMES.map((programme) => [programme.id, programme])
) as Record<ProgrammeId, ProgrammeDefinition>;