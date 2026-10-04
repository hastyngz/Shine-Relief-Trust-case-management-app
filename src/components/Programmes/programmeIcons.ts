import { Apple, Baby, Fish, GraduationCap, HeartHandshake, Home, Trees, Wheat, LucideIcon } from 'lucide-react';
import { ProgrammeId } from '../../data/programmes';

export const PROGRAMME_ICONS: Record<ProgrammeId, LucideIcon> = {
  'early-years': Baby,
  'shine-village': Trees,
  bursary: GraduationCap,
  'child-house': Home,
  'relief-family': HeartHandshake,
  'fish-chicken': Fish,
  'rice-maize-mill': Wheat,
  'tomato-farming': Apple,
};