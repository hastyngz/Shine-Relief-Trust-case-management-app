import { AppDatabase, ProgrammeLogRecord } from '../types';
import { ProgrammeId, PROGRAMME_BY_ID } from '../data/programmes';
import { formatMWK } from '../utils/export';

export interface ProgrammeSummary {
  value: string;
  label: string;
  detail?: string;
  fallbackStartDate?: string;
}

export function logsForProgramme(db: AppDatabase, id: ProgrammeId): ProgrammeLogRecord[] {
  return (db.programmeLogs || [])
    .filter((log) => log.programmeId === id)
    .sort((first, second) => second.date.localeCompare(first.date));
}

export function incomeTotals(logs: ProgrammeLogRecord[]): {
  sales: number;
  costs: number;
  net: number;
  cashReceived: number;
  cashPaid: number;
  receivables: number;
  payables: number;
} {
  const sales = logs.filter((log) => log.entryType === 'Sale');
  const costs = logs.filter((log) => log.entryType === 'Expense' || log.entryType === 'Input');
  const totalSales = sales.reduce((total, log) => total + (log.amountMWK || 0), 0);
  const totalCosts = costs.reduce((total, log) => total + (log.amountMWK || 0), 0);
  const cashReceived = sales.reduce((total, log) => total + (log.cashAmountMWK ?? log.amountMWK ?? 0), 0);
  const cashPaid = costs.reduce((total, log) => total + (log.cashAmountMWK ?? log.amountMWK ?? 0), 0);
  const receivables = sales.reduce((total, log) => total + Math.max(0, (log.amountMWK || 0) - (log.cashAmountMWK ?? log.amountMWK ?? 0)), 0);
  const payables = costs.reduce((total, log) => total + Math.max(0, (log.amountMWK || 0) - (log.cashAmountMWK ?? log.amountMWK ?? 0)), 0);
  return { sales: totalSales, costs: totalCosts, net: totalSales - totalCosts, cashReceived, cashPaid, receivables, payables };
}

export function productionByUnit(logs: ProgrammeLogRecord[]): Array<{ unit: string; quantity: number }> {
  const totals = new Map<string, number>();
  logs.filter((log) => log.entryType === 'Production' && log.unit).forEach((log) => {
    const unit = log.unit as string;
    totals.set(unit, (totals.get(unit) || 0) + (log.quantity || 0));
  });
  return Array.from(totals, ([unit, quantity]) => ({ unit, quantity }));
}

export function summariseProgramme(db: AppDatabase, id: ProgrammeId): ProgrammeSummary {
  const logs = logsForProgramme(db, id);
  switch (id) {
    case 'early-years': {
      const records = db.earlyYearsRecords || [];
      const children = records.filter((record) => record.studentName?.trim() && (!record.studentStatus || record.studentStatus === 'Active'));
      const dates = records.map((record) => record.programmeStartDate).filter((date): date is string => Boolean(date)).sort();
      return {
        value: String(children.length),
        label: 'children enrolled',
        detail: `${new Set((db.feedingProgramLogs || []).map((log) => log.date)).size} feeding days logged`,
        fallbackStartDate: dates[0],
      };
    }
    case 'bursary': {
      const students = db.girls.filter((girl) => girl.status === 'Active' && Boolean(girl.school?.trim()));
      const schools = new Set(students.map((girl) => girl.school.trim()));
      return { value: String(students.length), label: 'students supported', detail: `${schools.size} distinct schools` };
    }
    case 'child-house': {
      const residents = db.girls.filter((girl) => girl.householdId);
      return { value: String(db.households.length), label: 'houses', detail: `${residents.length} girls living in houses` };
    }
    case 'relief-family': {
      const reached = logs
        .filter((log) => log.entryType === 'Distribution' || log.entryType === 'Family support')
        .reduce((total, log) => total + (log.beneficiaries || 0), 0);
      return {
        value: String(reached),
        label: 'households reached',
        detail: `${logs.filter((log) => log.entryType === 'Distribution').length} distributions · ${logs.filter((log) => log.entryType === 'Family support').length} family support visits`,
      };
    }
    case 'shine-village':
      return { value: String(logs.length), label: 'recorded activities' };
    case 'fish-farming':
    case 'chicken-farming':
    case 'fish-chicken':
    case 'rice-maize-mill':
    case 'tomato-farming': {
      const totals = incomeTotals(logs);
      return { value: formatMWK(totals.net), label: 'net income', detail: `Sales ${formatMWK(totals.sales)}` };
    }
  }
}

export function startBadge(id: ProgrammeId, fallbackStartDate?: string): { text: string; confirmed: boolean } {
  const programme = PROGRAMME_BY_ID[id];
  const year = programme.startYear || (fallbackStartDate ? new Date(fallbackStartDate).getFullYear() : undefined);
  return {
    text: year ? `Since ${year}` : 'Start date not set',
    confirmed: programme.startConfirmed,
  };
}