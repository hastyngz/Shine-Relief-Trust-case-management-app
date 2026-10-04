import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  Users,
  Sparkles,
} from 'lucide-react';
import { AppDatabase } from '../types';
import { buildManagementAnalytics, canAccessManagementDashboard, ManagementFilters, projectManagementDatabase } from '../services/managementAnalytics';
import { getEmployeeSalaryHistoryForStaff } from '../services/firestoreSync';
import { calculateGratuity } from '../services/gratuityService';
import { calculateBudgetForecast, calculateFeedingCostInsight } from '../services/intelligenceService';
import { formatMWK } from '../utils/export';
import { useAuth } from '../contexts/AuthContext';
import type { SalaryHistoryRecord, StaffUser } from '../types';
import { PROGRAMMES, type ProgrammeId } from '../data/programmes';
import { startBadge, summariseProgramme } from '../services/programmeSummary';

interface ManagementDashboardProps {
  db: AppDatabase;
  staff: StaffUser[];
  onNavigateReports: () => void;
}

type DatePreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

function getPresetRange(preset: DatePreset, start: string, end: string, today: Date): { startDate?: string; endDate?: string } {
  const asIso = (date: Date) => date.toISOString().slice(0, 10);
  const endDate = asIso(today);
  if (preset === 'custom') return { startDate: start || undefined, endDate: end || undefined };
  const from = new Date(today);
  if (preset === 'today') return { startDate: endDate, endDate };
  if (preset === 'week') {
    from.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  } else if (preset === 'month') {
    from.setDate(1);
  } else if (preset === 'quarter') {
    from.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
  } else {
    from.setMonth(0, 1);
  }
  return { startDate: asIso(from), endDate };
}

const currency = (amount: number | null) => amount === null ? 'Not available' : formatMWK(amount);

export const ManagementDashboard: React.FC<ManagementDashboardProps> = ({ db, staff, onNavigateReports }) => {
  const { isAdmin, role, canViewHealthRecords, canViewCaseReviews, canViewSafeguarding } = useAuth();
  const [preset, setPreset] = useState<DatePreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [financialYear, setFinancialYear] = useState('ALL');
  const [month, setMonth] = useState('ALL');
  const [programme, setProgramme] = useState('ALL');
  const [programmeId, setProgrammeId] = useState<'ALL' | ProgrammeId>('ALL');
  const [householdId, setHouseholdId] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [staffId, setStaffId] = useState('ALL');
  const [staffRole, setStaffRole] = useState('ALL');
  const [taskStatus, setTaskStatus] = useState('ALL');
  const [taskPriority, setTaskPriority] = useState('ALL');
  const [staffSort, setStaffSort] = useState('overdue');
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistoryRecord[] | null>(null);
  const [salaryHistoryError, setSalaryHistoryError] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    if (!canAccessManagementDashboard(isAdmin, role)) return;
    let mounted = true;
    getEmployeeSalaryHistoryForStaff(staff.map((person) => person.uid || person.id))
      .then((records) => { if (mounted) setSalaryHistory(records); })
      .catch(() => { if (mounted) setSalaryHistoryError(true); });
    return () => { mounted = false; };
  }, [isAdmin, role, staff]);

  useEffect(() => {
    const timer = window.setTimeout(() => setOverviewLoading(false), 0);
    return () => window.clearTimeout(timer);
  }, [db.girls.length, db.households.length, db.importAudits?.length]);

  const today = new Date().toISOString().slice(0, 10);
  const range = getPresetRange(preset, customStart, customEnd, new Date());
  const filters: ManagementFilters = {
    ...range,
    financialYear: financialYear === 'ALL' ? undefined : financialYear,
    month: month === 'ALL' ? undefined : Number(month),
    programme: programme === 'ALL' ? undefined : programme,
    householdId: householdId === 'ALL' ? undefined : householdId,
    category: category === 'ALL' ? undefined : category,
    staffId: staffId === 'ALL' ? undefined : staffId,
    status: taskStatus === 'ALL' ? undefined : taskStatus,
    priority: taskPriority === 'ALL' ? undefined : taskPriority,
  };
  const permittedDb = projectManagementDatabase(db, { canViewHealthRecords, canViewCaseReviews, canViewSafeguarding });
  const programmeFilteredDb = programmeId === 'ALL' ? permittedDb : {
    ...permittedDb,
    budgets: (permittedDb.budgets || []).filter((item) => item.programmeId === programmeId),
    workplans: (permittedDb.workplans || []).filter((item) => item.programmeId === programmeId),
    programmeLogs: (permittedDb.programmeLogs || []).filter((item) => item.programmeId === programmeId),
  };
  const gratuityByEmployee = useMemo(() => {
    if (!salaryHistory || salaryHistoryError) return undefined;
    const totals: Record<string, number> = {};
    const eligible = staff.filter((person) => person.status === 'Active' && person.contractStartDate && person.employeeCategory);
    for (const person of eligible) {
      const employeeHistory = salaryHistory.filter((record) => record.employeeId === person.uid || record.employeeId === person.id);
      if (employeeHistory.length === 0) return undefined;
      try {
        totals[person.uid || person.id] = calculateGratuity({
          id: person.uid || person.id,
          employeeCategory: person.employeeCategory!,
          contractStartDate: person.contractStartDate!,
          employmentPeriodId: person.employmentPeriods?.[0]?.id,
        }, today, employeeHistory).totalGratuity;
      } catch {
        return undefined;
      }
    }
    return totals;
  }, [salaryHistory, salaryHistoryError, staff, today]);
  const analytics = buildManagementAnalytics(programmeFilteredDb, filters, staff, today, gratuityByEmployee);
  const latestImport = [...(db.importAudits || [])].sort((left, right) => right.importedAt.localeCompare(left.importedAt))[0];
  const latestReportPeriod = [...(db.importAudits || [])]
    .filter((record) => record.reportingPeriod)
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt))[0]?.reportingPeriod;
  const hasOverviewData = db.girls.length > 0 || db.households.length > 0 || !!latestImport;
  const programmes = Array.from(new Set([
    ...(db.budgets || []).map((line) => line.programme),
    ...(db.annualBudgets || []).map((plan) => plan.programme),
    ...(db.expenses || []).map((expense) => expense.programme),
    ...(db.payrollRecords || []).map((record) => record.departmentOrProgramme),
  ].filter((value): value is string => !!value))).sort();
  const categories = Array.from(new Set([
    ...(db.budgets || []).map((line) => line.category),
    ...(db.expenses || []).map((expense) => expense.category),
    ...(db.expenses || []).map((expense) => expense.budgetCategory).filter((value): value is string => !!value),
  ])).sort();
  const financialYears = Array.from(new Set([
    ...(db.annualBudgets || []).map((plan) => plan.financialYear),
    ...(db.budgets || []).map((line) => line.financialYear).filter((year): year is string => !!year),
    ...(db.payrollRecords || []).map((record) => record.payPeriodStartDate.slice(0, 4)),
  ])).sort().reverse();
  const programmeBudgetRows = analytics.finance.budgetPerformance.filter((line) => line.dimension === 'Programme').map((line) => {
    const programmeName = line.key.replace(/^Programme: /, '');
    const approvedAmount = (db.annualBudgets || []).filter((plan) => plan.programme === programmeName && ['Approved', 'Active'].includes(plan.status) && (!filters.financialYear || plan.financialYear === filters.financialYear)).reduce((total, plan) => total + plan.approvedAmount, 0);
    return { ...line, programme: programmeName, approvedAmount };
  });
  const visibleStaff = analytics.staff.filter((person) => staffRole === 'ALL' || person.role === staffRole).sort((a, b) => {
    if (staffSort === 'name') return a.name.localeCompare(b.name);
    if (staffSort === 'open') return b.openTasks - a.openTasks;
    if (staffSort === 'completed') return b.completedTasks - a.completedTasks;
    return b.overdueTasks - a.overdueTasks;
  });
  const phase5Feeding = calculateFeedingCostInsight(permittedDb.feedingProgramLogs || [], range.startDate, range.endDate);
  const phase5Forecast = calculateBudgetForecast(programmeFilteredDb.budgets || [], 1 + ((permittedDb.forecastSettings?.[0]?.inflationPercent || 0) / 100));
  const programmePerformance = PROGRAMMES
    .filter((item) => programmeId === 'ALL' || item.id === programmeId)
    .map((item) => {
      const summary = summariseProgramme(permittedDb, item.id);
      const budgetLines = (permittedDb.budgets || []).filter((line) => line.programmeId === item.id);
      const budget = budgetLines.reduce((sum, line) => sum + (line.budgetAmount || 0), 0);
      const actual = budgetLines.reduce((sum, line) => sum + (line.actualExpenditure || 0), 0);
      const openWorkplans = (permittedDb.workplans || []).filter((workplan) =>
        workplan.programmeId === item.id && !['Completed', 'Cancelled'].includes(workplan.status)
      ).length;
      const incomeByYear = new Map<number, number>();
      (permittedDb.programmeLogs || [])
        .filter((log) => log.programmeId === item.id && log.date >= `${item.startYear || 0}-01-01`)
        .forEach((log) => {
          const year = Number(log.date.slice(0, 4));
          if (!Number.isFinite(year)) return;
          const amount = log.amountMWK || 0;
          const delta = log.entryType === 'Sale' ? amount : log.entryType === 'Expense' || log.entryType === 'Input' ? -amount : 0;
          incomeByYear.set(year, (incomeByYear.get(year) || 0) + delta);
        });
      const yearlyIncome = ['fish-chicken', 'rice-maize-mill', 'tomato-farming'].includes(item.id)
        ? Array.from({ length: Math.max(0, new Date().getFullYear() - (item.startYear || new Date().getFullYear()) + 1) }, (_, index) => {
            const year = (item.startYear || new Date().getFullYear()) + index;
            return { year, net: incomeByYear.get(year) || 0 };
          })
        : [];
      return {
        programme: item,
        summary,
        badge: startBadge(item.id, summary.fallbackStartDate),
        budget,
        actual,
        openWorkplans,
        yearlyIncome,
      };
    });

  if (!canAccessManagementDashboard(isAdmin, role)) {
    return <div className="rounded-xl border border-rose-200 bg-white p-8 text-center"><h1 className="text-lg font-bold text-stone-900">Management access restricted</h1><p className="mt-2 text-sm text-stone-600">Only Administrators and Managers can view this dashboard.</p></div>;
  }

  return (
    <div id="management-dashboard-view" className="space-y-6 pb-12">
      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" aria-label="Executive Overview">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
          <h1 className="text-base font-black text-stone-900">Executive Overview</h1>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600"><CheckCircle2 className="h-4 w-4 text-emerald-700" />Live operational view</span>
        </div>
        {overviewLoading ? <p className="py-5 text-sm text-stone-600" role="status">Loading executive overview…</p> : !hasOverviewData ? <p className="py-5 text-sm text-stone-600">No operational records or imports are available yet.</p> : <div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0"><p className="text-xs font-semibold text-stone-600">Active girls</p><p className="mt-1 text-xl font-black text-stone-900">{analytics.cases.activeGirls}</p></div>
          <div className="min-w-0"><p className="text-xs font-semibold text-stone-600">Active households</p><p className="mt-1 text-xl font-black text-stone-900">{analytics.cases.activeHouseholds}</p></div>
          <div className="min-w-0"><p className="text-xs font-semibold text-stone-600">Latest report period</p><p className="mt-1 break-words text-sm font-bold text-stone-900">{latestReportPeriod || 'No report period recorded'}</p></div>
          <div className="min-w-0"><p className="text-xs font-semibold text-stone-600">Latest import</p><p className="mt-1 break-words text-sm font-bold text-stone-900">{latestImport?.fileName || 'No import recorded'}</p>{latestImport && <p className="mt-0.5 text-xs text-stone-600">{new Date(latestImport.importedAt).toLocaleDateString()}</p>}</div>
        </div>}
      </section>

      <section className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm space-y-3" aria-label="Management dashboard filters">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-black text-stone-900">Dashboard filters</h2>
          <button onClick={onNavigateReports} className="inline-flex items-center gap-2 text-xs font-bold text-teal-800 hover:text-teal-950">
            <FileSpreadsheet className="w-4 h-4" /> Management reports
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
          <label className="text-[11px] text-stone-600">Period
            <select className="field mt-1 w-full" value={preset} onChange={(event) => setPreset(event.target.value as DatePreset)}>
              <option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option><option value="custom">Custom range</option>
            </select>
          </label>
          <label className="text-[11px] text-stone-600">Financial year
            <select className="field mt-1 w-full" value={financialYear} onChange={(event) => setFinancialYear(event.target.value)}>
              <option value="ALL">All years</option>{financialYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-stone-600">Financial month
            <select className="field mt-1 w-full" value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="ALL">All months</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleString('en', { month: 'long' })}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-stone-600">Programme grouping
            <select className="field mt-1 w-full" value={programme} onChange={(event) => setProgramme(event.target.value)}>
              <option value="ALL">All programmes</option>{programmes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-stone-600">Programme
            <select className="field mt-1 w-full" value={programmeId} onChange={(event) => setProgrammeId(event.target.value as 'ALL' | ProgrammeId)}>
              <option value="ALL">All portfolio programmes</option>{PROGRAMMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-stone-600">Household
            <select className="field mt-1 w-full" value={householdId} onChange={(event) => setHouseholdId(event.target.value)}>
              <option value="ALL">All households</option>{(db.households || []).map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-stone-600">Budget category
            <select className="field mt-1 w-full" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="ALL">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        {preset === 'custom' && <div className="grid grid-cols-2 gap-2 max-w-md">
          <label className="text-[11px] text-stone-600">From<input className="field mt-1 w-full" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
          <label className="text-[11px] text-stone-600">To<input className="field mt-1 w-full" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
        </div>}
        {(programme !== 'ALL' || programmeId !== 'ALL') && <p className="text-[11px] text-amber-800">Programme filtering applies only to records with a stored programme attribution; untagged operational records are not assigned a guessed programme.</p>}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" aria-label="Programme performance">
        <h2 className="text-sm font-black text-stone-900">Programme performance</h2>
        <div className="mt-3 divide-y divide-stone-200">
          {programmePerformance.map(({ programme: item, summary, badge, budget, actual, openWorkplans, yearlyIncome }) => (
            <article key={item.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-stone-900">{item.name}</h3>
                <p className="text-xs text-stone-600">{summary.value} {summary.label}</p>
                <p className="text-[11px] text-stone-500">{badge.text}</p>
              </div>
              <div className="text-xs"><span className="block text-stone-500">Budget vs actual</span><strong>{formatMWK(budget)}</strong><span className="text-stone-500"> / {formatMWK(actual)}</span></div>
              <div className="text-xs"><span className="block text-stone-500">Open workplan items</span><strong>{openWorkplans}</strong></div>
              {yearlyIncome.length > 0 && (
                <div className="text-xs">
                  <span className="block text-stone-500">Net income by year</span>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                    {yearlyIncome.map(({ year, net }) => <span key={year}>{year}: <strong>{formatMWK(net)}</strong></span>)}
                  </div>
                </div>
              )}
            </article>
          ))}
          {programmePerformance.length === 0 && <p className="py-4 text-xs text-stone-500">No programmes match this filter.</p>}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-stone-500">
            <span>Active girls</span>
            <Users className="w-4 h-4 text-teal-800" />
          </div>
          <div className="mt-2 text-2xl font-black text-stone-900">{analytics.cases.activeGirls}</div>
          <div className="text-[11px] text-stone-500">of {analytics.cases.totalGirls} total</div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-stone-500">
            <span>Active households</span>
            <Building2 className="w-4 h-4 text-teal-800" />
          </div>
          <div className="mt-2 text-2xl font-black text-stone-900">{analytics.cases.activeHouseholds}</div>
          <div className="text-[11px] text-stone-500">of {analytics.cases.totalHouseholds} total</div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-stone-500">
            <span>Overdue case actions</span>
            <BarChart3 className="w-4 h-4 text-amber-700" />
          </div>
          <div className="mt-2 text-2xl font-black text-stone-900">{analytics.cases.overdueActions}</div>
          <div className="text-[11px] text-stone-500">of {analytics.cases.openActions} open actions</div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-stone-500">
            <span>Payroll outstanding</span>
            <BadgeDollarSign className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-xl font-black text-emerald-700">{formatMWK(Math.max(0, analytics.finance.payrollExpected - analytics.finance.payrollPaid))}</div>
          <div className="text-[11px] text-stone-500">Expected {formatMWK(analytics.finance.payrollExpected)}</div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-stone-500">
            <span>Budget variance</span>
            <BriefcaseBusiness className="w-4 h-4 text-sky-700" />
          </div>
          <div className={`mt-2 text-xl font-black ${analytics.finance.variance > 0 ? 'text-rose-700' : 'text-sky-700'}`}>{formatMWK(Math.abs(analytics.finance.variance))}</div>
          <div className="text-[11px] text-stone-500">{analytics.finance.variance > 0 ? 'Over budget' : 'Remaining'} · actual {formatMWK(analytics.finance.actualExpenditure)}</div>
        </div>
      </div>

      <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 shadow-sm" aria-label="Phase 5 intelligence metrics">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-black text-teal-950">Operational intelligence</h2><p className="text-[11px] text-teal-800">Recorded Phase 5 data and clearly labelled forecast values.</p></div><Sparkles className="h-5 w-5 text-amber-600" /></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-bold uppercase text-stone-500">Meetings</div><div className="mt-1 text-xl font-black text-stone-900">{(permittedDb.meetings || []).filter((item) => !range.startDate || item.dateTime.slice(0, 10) >= range.startDate).filter((item) => !range.endDate || item.dateTime.slice(0, 10) <= range.endDate).length}</div></div>
          <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-bold uppercase text-stone-500">Feeding cost</div><div className="mt-1 text-xl font-black text-stone-900">{formatMWK(phase5Feeding.actualCost)}</div><div className="text-[10px] text-stone-500">{phase5Feeding.mealsServed} meals recorded</div></div>
          <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-bold uppercase text-stone-500">Market prices</div><div className="mt-1 text-xl font-black text-stone-900">{(permittedDb.marketPrices || []).length}</div><div className="text-[10px] text-stone-500">price observations</div></div>
          <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-bold uppercase text-stone-500">Forecast</div><div className="mt-1 text-xl font-black text-amber-700">{formatMWK(phase5Forecast.forecast)}</div><div className="text-[10px] text-stone-500">estimate, not actual expenditure</div></div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-stone-900">Programme budget snapshot</h2>
            <span className="text-[11px] text-stone-500">Approved {formatMWK(analytics.finance.approvedBudget)}</span>
          </div>

          <div className="space-y-3">
            {programmeBudgetRows.length === 0 ? (
              <div className="text-sm text-stone-500">No budget lines are available yet.</div>
            ) : (
              programmeBudgetRows.map((programme) => (
                <div key={programme.programme} className="border border-stone-200 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-stone-900">{programme.programme}</div>
                      <div className="text-[11px] text-stone-500">Approved {formatMWK(programme.approvedAmount || 0)}</div>
                    </div>
                    <div className={`text-xs font-bold px-2 py-1 rounded-full ${programme.variance >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {programme.variance >= 0 ? 'Under budget' : 'Over budget'}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-stone-600">
                    <div className="bg-stone-50 rounded-lg p-2">
                      <div className="text-stone-500">Budgeted</div>
                      <div className="font-bold text-stone-900">{formatMWK(programme.budget)}</div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-2">
                      <div className="text-stone-500">Actual</div>
                      <div className="font-bold text-stone-900">{formatMWK(programme.actual)}</div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-2">
                      <div className="text-stone-500">Variance</div>
                      <div className={`font-bold ${programme.variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {programme.variance >= 0 ? '+' : '-'}{formatMWK(Math.abs(programme.variance))}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-stone-900">Management risks</h2>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>

          <div className="space-y-3">
            {analytics.alerts.length === 0 ? (
              <div className="text-sm text-stone-500">No active management risks identified.</div>
            ) : (
              analytics.alerts.slice(0, 8).map((alert) => (
                <div key={`${alert.type}-${alert.id}`} className="flex items-center justify-between gap-3 border border-stone-200 rounded-xl p-3 bg-stone-50">
                  <div className="min-w-0">
                    <div className="font-bold text-xs text-stone-800">{alert.label}</div>
                    <p className="mt-1 text-[11px] text-stone-600">{alert.detail}{alert.date ? ` · ${alert.date}` : ''}</p>
                  </div>
                  <a className="shrink-0 text-[11px] font-bold text-teal-800 underline" href={alert.type === 'rent' && alert.target ? `#/house/${alert.target}` : alert.type === 'workplan' || alert.type === 'budget' ? '#/planning' : alert.type === 'payroll' ? '#/payroll' : alert.type === 'contract' ? '#/staff' : alert.type === 'follow_up' || alert.type === 'case_review' ? `#/girl/${alert.target}` : '#/case-management'}>Open</a>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-stone-900">Payroll watchlist</h2>
            <BadgeDollarSign className="w-4 h-4 text-emerald-700" />
          </div>

          {analytics.finance.payrollOutstandingByEmployee.length === 0 ? (
            <div className="text-sm text-stone-500">No employee payroll arrears are currently open.</div>
          ) : (
            <div className="space-y-3">
              {analytics.finance.payrollOutstandingByEmployee.slice(0, 6).map((person) => (
                <div key={`${person.id}-${person.name}`} className="flex items-center justify-between border border-stone-200 rounded-xl p-3">
                  <div>
                    <div className="font-bold text-stone-900">{person.name}</div>
                    <div className="text-[11px] text-stone-500">Paid {formatMWK(person.paid)} of {formatMWK(person.expected)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-amber-700">{formatMWK(person.outstanding)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-stone-500">Outstanding</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-stone-900">Action watchlist</h2>
            <ArrowRight className="w-4 h-4 text-teal-700" />
          </div>

          {analytics.workplans.performance.filter((plan) => plan.status === 'Delayed' || (plan.status === 'In Progress' && plan.endDate < today)).length === 0 ? (
            <div className="text-sm text-stone-500">No overdue workplans are currently flagged.</div>
          ) : (
            <div className="space-y-3">
              {analytics.workplans.performance.filter((plan) => plan.status === 'Delayed' || (plan.status === 'In Progress' && plan.endDate < today)).slice(0, 6).map((plan) => (
                <div key={plan.id} className="border border-stone-200 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-stone-900">{plan.activity}</div>
                      <div className="text-[11px] text-stone-500">{plan.staffName} • {plan.startDate} to {plan.endDate}</div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-amber-100 text-amber-800">{plan.status}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-stone-600">Activity completion: {plan.completionPercent}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <details open className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-black text-stone-900">Case management</summary>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {[
            ['Total girls', analytics.cases.totalGirls], ['On holiday / leave', analytics.cases.onLeaveGirls],
            ['Completed / left', analytics.cases.completedOrLeftGirls], ['Open actions', analytics.cases.openActions],
            ['High priority', analytics.cases.highPriorityActions], ['Reviews due', analytics.cases.caseReviewsDue],
            ['Outstanding follow-ups', analytics.cases.outstandingFollowUps], ['Overdue actions', analytics.cases.overdueActions],
          ].map(([label, count]) => <div key={label} className="rounded-lg border border-stone-200 bg-stone-50 p-3"><div className="text-[10px] uppercase font-bold text-stone-500">{label}</div><div className="mt-1 text-xl font-black text-stone-900">{count}</div></div>)}
        </div>
      </details>

      <div className="grid gap-4 xl:grid-cols-2">
        <details open className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-black text-stone-900">Education</summary>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-700"><span>Girls requiring academic support: <strong>{analytics.education.girlsRequiringSupport}</strong></span><span>Outstanding education follow-ups: <strong>{analytics.education.outstandingFollowUps}</strong></span></div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div><h3 className="text-xs font-bold text-stone-700 mb-2">Issues by school</h3>{analytics.education.bySchool.length ? analytics.education.bySchool.slice(0, 8).map((item) => <div key={item.name} className="flex justify-between border-b py-1.5 text-xs"><span>{item.name}</span><strong>{item.count}</strong></div>) : <p className="text-xs text-stone-500">No education issues in this period.</p>}</div>
            <div><h3 className="text-xs font-bold text-stone-700 mb-2">Issues by class/form</h3>{analytics.education.byClass.length ? analytics.education.byClass.slice(0, 8).map((item) => <div key={item.name} className="flex justify-between border-b py-1.5 text-xs"><span>{item.name}</span><strong>{item.count}</strong></div>) : <p className="text-xs text-stone-500">No education issues in this period.</p>}</div>
          </div>
          <div className="mt-4"><h3 className="text-xs font-bold text-stone-700 mb-2">Recent education interventions</h3>{analytics.education.recent.length ? analytics.education.recent.map((item) => <a key={item.id} href={`#/girl/${item.girlId}`} className="flex justify-between gap-2 border-b py-2 text-xs text-teal-900"><span>{item.school} · {item.issue}</span><span>{item.date}</span></a>) : <p className="text-xs text-stone-500">No recent education interventions.</p>}</div>
        </details>

        <details className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-black text-stone-900">Health summary</summary>
          {!canViewHealthRecords ? <p className="mt-3 text-xs text-stone-600">Health metrics are restricted for your account.</p> : <div className="mt-3 grid grid-cols-3 gap-2 text-center">{[['Outstanding', analytics.health.outstandingFollowUps], ['Due', analytics.health.dueFollowUps], ['Recent activity', analytics.health.recentCount]].map(([label, count]) => <div key={label} className="rounded-lg bg-rose-50 p-3"><div className="text-[10px] uppercase font-bold text-rose-800">{label}</div><div className="text-xl font-black text-stone-900">{count}</div></div>)}</div>}
          <p className="mt-3 text-[11px] text-stone-500">Counts only. Medical notes and diagnoses are not shown in this management overview.</p>
        </details>

        <details className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-black text-stone-900">Family and community</summary>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">{[['Family follow-ups', analytics.family.followUps], ['Home visits', analytics.family.homeVisits], ['Community activities', analytics.family.communityActivities], ['Outstanding actions', analytics.family.outstandingActions]].map(([label, count]) => <div key={label} className="rounded-lg border border-stone-200 p-3"><div className="text-[10px] uppercase font-bold text-stone-500">{label}</div><div className="text-xl font-black">{count}</div></div>)}</div>
        </details>

        <details className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-black text-stone-900">Households, rent, and expenditure</summary>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">{[['Rent due', formatMWK(analytics.households.rentDue)], ['Unpaid rent entries', analytics.households.unpaidRent], ['Part-paid rent entries', analytics.households.partiallyPaidRent], ['House expenditure', formatMWK(analytics.households.expenditure)], ['Repairs with recorded notes', analytics.households.repairsRequiringAction]].map(([label, value]) => <div key={label} className="rounded-lg border border-stone-200 p-3"><div className="text-[10px] uppercase font-bold text-stone-500">{label}</div><div className="mt-1 font-black text-stone-900">{value}</div></div>)}</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2"><div><h3 className="text-xs font-bold text-stone-700 mb-2">Residents and recorded expenditure by house</h3>{analytics.households.residentsByHouse.map((house) => <a href={`#/house/${house.id}`} key={house.id} className="flex justify-between gap-3 border-b py-2 text-xs text-teal-900"><span>{house.name} · {house.girls} girls</span><span>{formatMWK(house.expenditure)}</span></a>)}</div><div><h3 className="text-xs font-bold text-stone-700 mb-2">Recent household activities</h3>{analytics.households.recentActivities.length ? analytics.households.recentActivities.map((activity) => <a href={`#/house/${activity.householdId}`} key={activity.id} className="flex justify-between gap-3 border-b py-2 text-xs text-teal-900"><span>{activity.name}{activity.location ? ` · ${activity.location}` : ''}</span><span>{activity.date}</span></a>) : <p className="text-xs text-stone-500">No household activities in this period.</p>}</div></div>
        </details>
      </div>

      <details className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-black text-stone-900">Staff workload</summary>
          <div className="mt-3 flex flex-wrap gap-2 text-xs"><span>Active employees: <strong>{analytics.staff.length}</strong></span>{Array.from(new Set(analytics.staff.map((person) => person.employeeCategory).filter(Boolean))).map((employeeCategory) => <span key={employeeCategory} className="rounded-full bg-stone-100 px-2 py-1">{employeeCategory}: {analytics.staff.filter((person) => person.employeeCategory === employeeCategory).length}</span>)}<span>Contracts nearing expiry: <strong>{analytics.alerts.filter((alert) => alert.type === 'contract').length}</strong></span></div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
          <label className="text-[11px] text-stone-600">Staff member<select className="field mt-1 w-full" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="ALL">All staff</option>{staff.filter((person) => person.status === 'Active').map((person) => <option key={person.uid || person.id} value={person.uid || person.id}>{person.fullName}</option>)}</select></label>
          <label className="text-[11px] text-stone-600">Role<select className="field mt-1 w-full" value={staffRole} onChange={(event) => setStaffRole(event.target.value)}><option value="ALL">All roles</option>{Array.from(new Set(staff.map((person) => person.role))).map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-[11px] text-stone-600">Task status<select className="field mt-1 w-full" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}><option value="ALL">All statuses</option>{['Open', 'In Progress', 'Overdue', 'Completed', 'Cancelled'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-[11px] text-stone-600">Priority<select className="field mt-1 w-full" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)}><option value="ALL">All priorities</option>{['Low', 'Medium', 'High', 'Urgent'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-[11px] text-stone-600">Sort by<select className="field mt-1 w-full" value={staffSort} onChange={(event) => setStaffSort(event.target.value)}><option value="overdue">Overdue tasks</option><option value="open">Open tasks</option><option value="completed">Completed tasks</option><option value="name">Name</option></select></label>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-[850px] w-full text-left text-xs"><thead><tr className="border-b text-stone-500"><th className="py-2">Staff</th><th>Role / position</th><th>Girls</th><th>Households</th><th>Open</th><th>In progress</th><th>Overdue</th><th>High priority</th><th>Upcoming</th><th>Reviews due</th><th>Workplans</th><th>Completed</th></tr></thead><tbody>{visibleStaff.map((person) => <tr key={person.id} className="border-b border-stone-100"><td className="py-2 font-bold">{person.name}</td><td>{person.role}{person.position ? ` · ${person.position}` : ''}</td><td>{person.assignedGirls}</td><td>{person.assignedHouseholds}</td><td>{person.openTasks}</td><td>{person.inProgressTasks}</td><td>{person.overdueTasks}</td><td>{person.highPriorityTasks}</td><td>{person.upcomingTasks}</td><td>{person.reviewsDue}</td><td>{person.workplans}</td><td>{person.completedTasks}</td></tr>)}</tbody></table>{visibleStaff.length === 0 && <p className="py-4 text-center text-xs text-stone-500">No active staff match these filters.</p>}</div>
      </details>

      <details className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-black text-stone-900">Financial management and budget performance</summary>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 text-xs">{[
          ['Approved budget', formatMWK(analytics.finance.approvedBudget)], ['Budget-line actual', formatMWK(analytics.finance.actualExpenditure)],
          ['Remaining approved', formatMWK(analytics.finance.remainingBudget)], ['Variance', `${formatMWK(Math.abs(analytics.finance.variance))} ${analytics.finance.variance > 0 ? 'over' : 'under'}`],
          ['Variance %', analytics.finance.variancePercent === null ? 'Not available' : `${analytics.finance.variancePercent.toFixed(1)}%`],
          ['Payroll expected', formatMWK(analytics.finance.payrollExpected)], ['Payroll paid', formatMWK(analytics.finance.payrollPaid)],
          ['Unpaid payroll records', analytics.finance.unpaidPayroll], ['Part-paid payroll records', analytics.finance.partiallyPaidPayroll],
          ['Rent received', formatMWK(analytics.finance.rent)], ['Household expenditure', formatMWK(analytics.finance.householdExpenditure)],
          ['Programme expenditure', formatMWK(analytics.finance.programmeExpenditure)], ['Education', formatMWK(analytics.finance.educationExpenditure)],
          ['Health', formatMWK(analytics.finance.healthExpenditure)], ['Maintenance', formatMWK(analytics.finance.maintenanceExpenditure)],
          ['Other', formatMWK(analytics.finance.otherExpenditure)], ['Accrued gratuity', currency(analytics.finance.gratuity)],
        ].map(([label, value]) => <div key={label} className="rounded-lg border border-stone-200 bg-stone-50 p-3"><div className="text-[10px] uppercase font-bold text-stone-500">{label}</div><div className="mt-1 font-black text-stone-900">{value}</div></div>)}</div>
        {salaryHistoryError && <p className="mt-2 text-xs text-amber-800">Salary history could not be loaded; gratuity is unavailable.</p>}
        <div className="mt-4"><h3 className="text-xs font-bold text-stone-700 mb-2">Budget performance across programme, category, and period</h3>{analytics.finance.budgetPerformance.length ? <div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-xs"><thead><tr className="border-b text-stone-500"><th className="py-2">Budget key</th><th>Budget</th><th>Actual</th><th>Remaining</th><th>Variance</th><th>Variance %</th><th>Status</th></tr></thead><tbody>{analytics.finance.budgetPerformance.slice(0, 40).map((line) => <tr key={line.key} className="border-b border-stone-100"><td className="py-2">{line.key}</td><td>{formatMWK(line.budget)}</td><td>{formatMWK(line.actual)}</td><td>{formatMWK(line.remaining)}</td><td>{formatMWK(line.variance)}</td><td>{line.variancePercent === null ? 'N/A' : `${line.variancePercent.toFixed(1)}%`}</td><td>{line.status}</td></tr>)}</tbody></table></div> : <p className="text-xs text-stone-500">No budget lines match these filters.</p>}</div>
      </details>

      <details className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-black text-stone-900">Workplan performance</summary>
        <div className="mt-3 flex flex-wrap gap-3 text-xs"><span>Active: <strong>{analytics.workplans.active}</strong></span><span>Planned: <strong>{analytics.workplans.planned}</strong></span><span>Completed: <strong>{analytics.workplans.completed}</strong></span><span>Delayed: <strong>{analytics.workplans.delayed}</strong></span><span>Upcoming assignments: <strong>{analytics.workplans.upcoming}</strong></span></div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-[1000px] w-full text-left text-xs"><thead><tr className="border-b text-stone-500"><th className="py-2">Activity</th><th>Programme</th><th>Responsible staff</th><th>Start</th><th>End</th><th>Status</th><th>Target</th><th>Achievement</th><th>Progress</th><th>Budget</th><th>Actual</th><th>Remaining</th></tr></thead><tbody>{analytics.workplans.performance.map((plan) => <tr key={plan.id} className="border-b border-stone-100"><td className="py-2">{plan.activity}</td><td>{plan.programme || 'Not attributed'}</td><td>{plan.staffName}</td><td>{plan.startDate}</td><td>{plan.endDate}</td><td>{plan.status}</td><td>{plan.plannedActivities}</td><td>{plan.completedActivities}</td><td>{plan.completionPercent}%</td><td>{formatMWK(plan.plannedBudget)}</td><td>{formatMWK(plan.actualExpenditure)}</td><td>{formatMWK(plan.remainingBudget)}</td></tr>)}</tbody></table>{analytics.workplans.performance.length === 0 && <p className="py-4 text-center text-xs text-stone-500">No workplans match these filters.</p>}</div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">{analytics.workplans.byProgramme.map((item) => <span key={item.programme} className="rounded-full bg-teal-50 px-3 py-1 text-teal-900">{item.programme}: {item.count}</span>)}</div>
      </details>

      <details className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-black text-stone-900">Trends</summary>
        {analytics.trends.enoughData ? <div className="mt-3 overflow-x-auto"><table className="min-w-[900px] w-full text-left text-xs"><thead><tr className="border-b text-stone-500"><th className="py-2">Month</th><th>Admissions</th><th>Completed / left</th><th>Education</th><th>Health</th><th>Family</th><th>Activities</th><th>Household spend</th><th>Programme spend</th><th>Payroll</th><th>Budget</th><th>Actual</th></tr></thead><tbody>{analytics.trends.monthly.map((row) => <tr key={row.month} className="border-b border-stone-100"><td className="py-2">{row.month}</td><td>{row.admissions}</td><td>{row.exits ?? 'Not tracked'}</td><td>{row.education}</td><td>{row.health}</td><td>{row.family}</td><td>{row.activities}</td><td>{formatMWK(row.householdSpend)}</td><td>{formatMWK(row.programmeSpend)}</td><td>{formatMWK(row.payroll)}</td><td>{formatMWK(row.budget)}</td><td>{formatMWK(row.actual)}</td></tr>)}</tbody></table><p className="mt-2 text-[11px] text-stone-500">Exit dates are not separately recorded, so exit trends are not inferred from profile edit timestamps.</p></div> : <p className="mt-3 text-xs text-stone-500">Not enough data across multiple months to show meaningful trends.</p>}
      </details>
    </div>
  );
};