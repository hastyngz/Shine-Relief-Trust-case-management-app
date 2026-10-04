import { AppDatabase, BudgetItem, FeedingProgramLog, MarketPriceRecord, WhatIfScenario } from '../types';
import { PROGRAMMES } from '../data/programmes';

export interface IntelligenceSearchResult {
  recordType: 'girl' | 'household' | 'meeting' | 'schedule' | 'workplan' | 'marketPrice' | 'feedingLog' | 'programmeLog';
  recordId: string;
  title: string;
  detail: string;
  date?: string;
}

export interface MarketPriceInsight {
  itemName: string;
  currency: string;
  count: number;
  currentPrice: number;
  previousPrice?: number;
  averagePrice: number;
  minimumPrice: number;
  maximumPrice: number;
  percentageChange?: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface FeedingCostInsight {
  days: number;
  studentsPresent: number;
  mealsServed: number;
  actualCost: number;
  averageDailyCost: number;
  costPerChild: number;
  costPerMeal: number;
}

export interface BudgetForecast {
  approved: number;
  actual: number;
  forecast: number;
  monthlyForecast?: number[];
  remainingApproved: number;
  burnRate: number;
  status: 'on_track' | 'at_risk' | 'over_budget';
}

export interface ScenarioResult {
  baselineForecast: number;
  scenarioForecast: number;
  difference: number;
  assumptions: WhatIfScenario;
}

const normalize = (value: unknown): string => String(value || '').toLowerCase();

export function searchOperationalRecords(db: AppDatabase, query: string, limit = 25): IntelligenceSearchResult[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const matches = (values: unknown[]) => terms.every((term) => values.some((value) => normalize(value).includes(term)));
  const results: IntelligenceSearchResult[] = [];

  db.girls.forEach((girl) => {
    if (matches([girl.id, girl.fullName, girl.school, girl.classLevel, girl.status])) {
      results.push({ recordType: 'girl', recordId: girl.id, title: girl.fullName, detail: `${girl.id} · ${girl.school} · ${girl.status}` });
    }
  });
  db.households.forEach((household) => {
    if (matches([household.id, household.name, household.location, household.houseMum, household.status])) {
      results.push({ recordType: 'household', recordId: household.id, title: household.name, detail: `${household.location} · ${household.status}` });
    }
  });
  (db.meetings || []).forEach((meeting) => {
    if (matches([meeting.id, meeting.title, meeting.location, meeting.minutesText, meeting.summaryAndOutcomes])) {
      results.push({ recordType: 'meeting', recordId: meeting.id, title: meeting.title, detail: `${meeting.status} · ${meeting.dateTime}`, date: meeting.dateTime });
    }
  });
  (db.schedules || []).forEach((schedule) => {
    if (matches([schedule.id, schedule.title, schedule.description, schedule.location, schedule.assignedStaffName])) {
      results.push({ recordType: 'schedule', recordId: schedule.id, title: schedule.title, detail: `${schedule.status} · ${schedule.scheduledDate}`, date: schedule.scheduledDate });
    }
  });
  (db.workplans || []).forEach((workplan) => {
    if (matches([workplan.id, workplan.activity, workplan.objective, workplan.location, workplan.responsibleStaffName])) {
      results.push({ recordType: 'workplan', recordId: workplan.id, title: workplan.activity, detail: `${workplan.status} · ${workplan.startDate} to ${workplan.endDate}`, date: workplan.startDate });
    }
  });
  (db.marketPrices || []).forEach((price) => {
    if (matches([price.id, price.itemName, price.category, price.locationOrShop, price.unit])) {
      results.push({ recordType: 'marketPrice', recordId: price.id, title: price.itemName, detail: `${price.currency} ${price.price.toLocaleString()} · ${price.dateRecorded}`, date: price.dateRecorded });
    }
  });
  (db.feedingProgramLogs || []).forEach((log) => {
    if (matches([log.id, log.date, log.earlyYearsGroup, log.foodItems.join(' '), log.notes])) {
      results.push({ recordType: 'feedingLog', recordId: log.id, title: `Feeding log ${log.date}`, detail: `${log.studentsPresent} students · ${log.mealsServed} meals`, date: log.date });
    }
  });
  (db.programmeLogs || []).forEach((log) => {
    const programme = PROGRAMMES.find((item) => item.id === log.programmeId);
    const programmeName = programme?.name || log.programmeId;
    if (matches([log.id, programmeName, log.entryType, log.description, log.date, log.notes])) {
      results.push({
        recordType: 'programmeLog',
        recordId: log.id,
        title: `${programmeName} · ${log.entryType}`,
        detail: `${log.description} · ${log.date}`,
        date: log.date,
      });
    }
  });

  return results
    .sort((left, right) => (right.date || '').localeCompare(left.date || ''))
    .slice(0, limit);
}

export function calculateMarketPriceInsight(records: MarketPriceRecord[], itemName: string, locationOrShop?: string): MarketPriceInsight | null {
  const filtered = records
    .filter((record) => normalize(record.itemName) === normalize(itemName))
    .filter((record) => !locationOrShop || normalize(record.locationOrShop) === normalize(locationOrShop))
    .sort((left, right) => left.dateRecorded.localeCompare(right.dateRecorded));
  if (filtered.length === 0) return null;
  const prices = filtered.map((record) => record.price);
  const current = filtered[filtered.length - 1];
  const previous = filtered.length > 1 ? filtered[filtered.length - 2].price : undefined;
  const percentageChange = previous && previous !== 0 ? ((current.price - previous) / previous) * 100 : undefined;
  return {
    itemName: current.itemName,
    currency: current.currency,
    count: filtered.length,
    currentPrice: current.price,
    previousPrice: previous,
    averagePrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
    minimumPrice: Math.min(...prices),
    maximumPrice: Math.max(...prices),
    percentageChange,
    trend: percentageChange === undefined || Math.abs(percentageChange) < 0.01 ? 'stable' : percentageChange > 0 ? 'increasing' : 'decreasing',
  };
}

export function calculateFeedingCostInsight(logs: FeedingProgramLog[], startDate?: string, endDate?: string): FeedingCostInsight {
  const filtered = logs.filter((log) => (!startDate || log.date >= startDate) && (!endDate || log.date <= endDate));
  const actualCost = filtered.reduce((sum, log) => sum + (log.actualCost ?? log.estimatedCost), 0);
  const studentsPresent = filtered.reduce((sum, log) => sum + log.studentsPresent, 0);
  const mealsServed = filtered.reduce((sum, log) => sum + log.mealsServed, 0);
  return {
    days: filtered.length,
    studentsPresent,
    mealsServed,
    actualCost,
    averageDailyCost: filtered.length ? actualCost / filtered.length : 0,
    costPerChild: studentsPresent ? actualCost / studentsPresent : 0,
    costPerMeal: mealsServed ? actualCost / mealsServed : 0,
  };
}

export function calculateBudgetForecast(budgetItems: BudgetItem[], forecastMultiplier = 1): BudgetForecast {
  const approved = budgetItems.reduce((sum, item) => sum + item.budgetAmount, 0);
  const actual = budgetItems.reduce((sum, item) => sum + (item.actualExpenditure || 0), 0);
  const forecast = Math.round(budgetItems.reduce((sum, item) => sum + item.budgetAmount * forecastMultiplier, 0));
  const monthlyForecast = Array.from({ length: 12 }, () => 0);
  budgetItems.forEach((item) => {
    const amount = item.budgetAmount * forecastMultiplier;
    const months = Array.from(new Set((item.seasonalMonths || []).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)));
    if (months.length) {
      const monthlyAmount = amount / months.length;
      months.forEach((month) => { monthlyForecast[month - 1] += monthlyAmount; });
    } else if (Number.isInteger(item.month) && (item.month || 0) >= 1 && (item.month || 0) <= 12) {
      monthlyForecast[(item.month || 1) - 1] += amount;
    } else {
      monthlyForecast.forEach((_, index) => { monthlyForecast[index] += amount / 12; });
    }
  });
  const burnRate = approved ? actual / approved : 0;
  return {
    approved,
    actual,
    forecast,
    monthlyForecast,
    remainingApproved: approved - actual,
    burnRate,
    status: actual > approved || forecast > approved * 1.1 ? 'over_budget' : forecast > approved ? 'at_risk' : 'on_track',
  };
}

export function calculateWhatIfScenario(baselineForecast: number, scenario: WhatIfScenario): ScenarioResult {
  const priceMultiplier = 1 + (scenario.foodPricePercent + scenario.fuelPricePercent + scenario.transportPercent) / 100;
  const populationMultiplier = 1 + (scenario.studentPopulationPercent + scenario.increasedEnrollmentPercent) / 100;
  const feedingDayMultiplier = Math.max(0, 1 + scenario.feedingDaysChange / 30);
  const scenarioForecast = Math.round(baselineForecast * priceMultiplier * populationMultiplier * feedingDayMultiplier);
  return { baselineForecast, scenarioForecast, difference: scenarioForecast - baselineForecast, assumptions: scenario };
}