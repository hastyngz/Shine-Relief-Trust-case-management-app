import { AppDatabase } from '../types';

/**
 * Initial empty production database for SHINE Relief Trust Malawi.
 * Starts with zero records so field staff can input their real data.
 */
export const INITIAL_DATABASE: AppDatabase = {
  households: [],
  girls: [],
  educationalFollowUps: [],
  healthFollowUps: [],
  familyFollowUps: [],
  rentPayments: [],
  expenses: [],
  householdActivities: [],
  contacts: [],
  attachments: [],
  budgets: [],
  annualBudgets: [],
  payrollRecords: [],
  workplans: [],
  schedules: [],
  historicalRecords: [],
  importAudits: [],
  people: [],
  customPersonTypes: [],
};
