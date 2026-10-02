export type ActivityCategory =
  | 'Business / Entrepreneurship'
  | 'Sports / Recreation'
  | 'Life Skills'
  | 'Agriculture / Practical Skills'
  | 'Health'
  | 'Education'
  | 'Community Outreach'
  | 'Group Activity';

export const ACTIVITY_CATEGORY_OPTIONS: ActivityCategory[] = [
  'Business / Entrepreneurship',
  'Sports / Recreation',
  'Life Skills',
  'Agriculture / Practical Skills',
  'Health',
  'Education',
  'Community Outreach',
  'Group Activity',
];
export type DueDatePeriodChoice =
  | { type: 'month'; value: string }
  | { type: 'quarter'; year: string; quarter: string }
  | { type: 'range'; start: string; end: string };

export function isActionItemText(text: string): boolean {
  return extractPendingActionText(text).length > 0;
}

export function getWorkplanDomain(text: string, fallback = 'Programme'): string {
  if (/early years|early childhood|ecd|pre-school|teacher(?:\s*\/\s*caregiver)?\s*(?:to\s*child\s*)?ratio|feeding programme/i.test(text)) return 'Early Years';
  if (/business|entrepreneur|pitch(?:ing)?|enterprise|market day|profit-making/i.test(text)) return 'Business / Entrepreneurship';
  if (/sports?|athletics?|football|netball|volleyball|athlete/i.test(text)) return 'Sports / Recreation';
  if (/agriculture|gardening|irrigation|farming|harvest|poultry|maize/i.test(text)) return 'Agriculture / Practical Skills';
  return fallback;
}

export function detectActivityCategory(text: string, context = ''): ActivityCategory {
  const value = `${context} ${text}`;
  if (/business|entrepreneur|pitch(?:ing)?|enterprise|market day|profit-making|business competition/i.test(value)) return 'Business / Entrepreneurship';
  if (/sports?|athletics?|football|netball|volleyball|athlete|fitness activities/i.test(value)) return 'Sports / Recreation';
  if (/agriculture|gardening|irrigation|farming|harvest|poultry|maize/i.test(value)) return 'Agriculture / Practical Skills';
  if (/health|nutrition|feeding|hygiene|wellbeing/i.test(value)) return 'Health';
  if (/education|digital literacy|school|literacy|classes?|learning|training/i.test(value)) return 'Education';
  if (/community (?:engagement|outreach|service)|church celebration|visiting the sick|charity drive/i.test(value)) return 'Community Outreach';
  if (/life skills|leadership|teamwork|personal development|housekeeping|mentorship|counselling|counseling/i.test(value)) return 'Life Skills';
  return 'Group Activity';
}

export function extractPendingActionText(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim().replace(/^(?:\d+[.)]|[•\-])\s*/, ''))
    .filter(Boolean);
  const pendingActionPattern = /\b(?:will|plan(?:s|ned)?\s+to|aim(?:s|ed)?\s+to|work(?:s|ing)?\s+towards?|maintain(?:s|ing)?|target(?:s|ing)?|restart|begin|start(?:ing)?|resume|launch|record|monitor|track|conduct|organis[ei]e|implement|establish|provide|distribute|complete|hold|train|enrol|enroll|continue|maximi[sz]e|strengthen|improve|develop|support|engage|ensure|increase|reduce)\b/i;

  return sentences.filter((sentence) => pendingActionPattern.test(sentence));
}

export function serializeDueDatePeriod(choice: DueDatePeriodChoice): string {
  if (choice.type === 'month') return `month:${choice.value}`;
  if (choice.type === 'quarter') return `quarter:${choice.year}-Q${choice.quarter}`;
  return `range:${choice.start}/${choice.end}`;
}

export function getDueDateRange(dueDatePeriod: string): { startDate: string; endDate: string } | null {
  const month = dueDatePeriod.match(/^month:(\d{4})-(0[1-9]|1[0-2])$/);
  if (month) {
    const year = Number(month[1]);
    const monthNumber = Number(month[2]);
    const endDay = new Date(year, monthNumber, 0).getDate();
    return { startDate: `${month[1]}-${month[2]}-01`, endDate: `${month[1]}-${month[2]}-${String(endDay).padStart(2, '0')}` };
  }

  const quarter = dueDatePeriod.match(/^quarter:(\d{4})-Q([1-4])$/);
  if (quarter) {
    const firstMonth = (Number(quarter[2]) - 1) * 3 + 1;
    const endMonth = firstMonth + 2;
    const endDay = new Date(Number(quarter[1]), endMonth, 0).getDate();
    return {
      startDate: `${quarter[1]}-${String(firstMonth).padStart(2, '0')}-01`,
      endDate: `${quarter[1]}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    };
  }

  const range = dueDatePeriod.match(/^range:(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/);
  if (range && range[1] <= range[2]) return { startDate: range[1], endDate: range[2] };
  return null;
}
