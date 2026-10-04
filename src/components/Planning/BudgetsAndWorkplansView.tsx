import React, { useState } from 'react';
import {
  BudgetItem,
  WorkplanItem,
  ScheduleItem,
  StaffUser,
  AppDatabase,
  BudgetCategory,
  BudgetPeriodType,
  WorkplanPeriodType,
  WorkplanStatus,
  ScheduleType,
  ScheduleStatus,
  AnnualBudgetPlan,
  AnnualBudgetStatus,
} from '../../types';
import {
  addBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  addAnnualBudgetPlan,
  updateAnnualBudgetPlan,
  addWorkplanItem,
  updateWorkplanItem,
  deleteWorkplanItem,
  addScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
} from '../../utils/storage';
import { formatMWK, formatDate } from '../../utils/export';
import { useAuth } from '../../contexts/AuthContext';
import {
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit2,
  Filter,
  Layers,
  ListTodo,
  PieChart,
  Plus,
  Trash2,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { buildActivityOverview, buildWorkloadSummary, normalizeWorkplanStatus, summarizeWorkplanHealth } from '../../services/workload';
import { PROGRAMMES, PROGRAMME_BY_ID } from '../../data/programmes';

interface BudgetsAndWorkplansViewProps {
  db: AppDatabase;
  onRefresh: () => void;
}

export const BudgetsAndWorkplansView: React.FC<BudgetsAndWorkplansViewProps> = ({
  db,
  onRefresh,
}) => {
  const { staffProfile, canEdit, isAdmin } = useAuth();
  const actorName = staffProfile?.fullName || 'SHINE Staff';
  const [activeSubTab, setActiveSubTab] = useState<'budgets' | 'workplans' | 'schedules'>('budgets');

  // Filters
  const [budgetPeriodFilter, setBudgetPeriodFilter] = useState<string>('ALL');
  const [budgetCategoryFilter, setBudgetCategoryFilter] = useState<string>('ALL');
  const [budgetSummaryGroup, setBudgetSummaryGroup] = useState<'category' | 'period' | 'programme'>('category');
  const [workplanStatusFilter, setWorkplanStatusFilter] = useState<string>('ALL');

  // Modal States
  const [showBudgetModal, setShowBudgetModal] = useState<boolean>(false);
  const [editingBudget, setEditingBudget] = useState<BudgetItem | null>(null);

  const [showAnnualBudgetModal, setShowAnnualBudgetModal] = useState<boolean>(false);
  const [editingAnnualBudget, setEditingAnnualBudget] = useState<AnnualBudgetPlan | null>(null);

  const [showWorkplanModal, setShowWorkplanModal] = useState<boolean>(false);
  const [editingWorkplan, setEditingWorkplan] = useState<WorkplanItem | null>(null);

  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);

  const budgets = db.budgets || [];
  const annualBudgets = db.annualBudgets || [];
  const workplans = db.workplans || [];
  const schedules = db.schedules || [];

  // Filtered Budgets
  const filteredBudgets = budgets.filter((b) => {
    if (budgetPeriodFilter !== 'ALL' && b.period !== budgetPeriodFilter) return false;
    if (budgetCategoryFilter !== 'ALL' && b.category !== budgetCategoryFilter) return false;
    return true;
  });

  const approvedAnnualBudgetTotal = annualBudgets.reduce((sum, plan) => sum + (plan.approvedAmount || 0), 0);

  // Budget Calculations
  const totalBudgeted = filteredBudgets.reduce((s, b) => s + (b.budgetAmount || 0), 0);
  const totalActual = filteredBudgets.reduce((s, b) => s + (b.actualExpenditure || 0), 0);
  const totalVariance = totalBudgeted - totalActual;
  const executionPercent = totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0;

  const workloadSummary = buildWorkloadSummary(workplans);
  const workplanHealthSummary = summarizeWorkplanHealth(workplans);
  const activityOverview = buildActivityOverview(workplans, schedules);

  const upcomingActivityItems = [
    ...workplans
      .filter((plan) => normalizeWorkplanStatus(plan.status) !== 'Completed' && normalizeWorkplanStatus(plan.status) !== 'Cancelled')
      .map((plan) => ({
        id: plan.id,
        label: plan.activity,
        when: plan.endDate || plan.startDate || 'TBD',
        owner: plan.responsibleStaffName || 'Unassigned',
        kind: 'workplan' as const,
      })),
    ...schedules
      .filter((item) => item.status !== 'Completed' && item.status !== 'Cancelled')
      .map((item) => ({
        id: item.id,
        label: item.title,
        when: item.scheduledDate,
        owner: item.assignedStaffName || 'Unassigned',
        kind: 'schedule' as const,
      })),
  ].sort((a, b) => a.when.localeCompare(b.when));

  // Filtered Workplans
  const filteredWorkplans = workplans.filter((w) => {
    if (workplanStatusFilter !== 'ALL' && normalizeWorkplanStatus(w.status) !== workplanStatusFilter) return false;
    return true;
  });

  // Unique Periods and Categories
  const uniquePeriods = Array.from(new Set(budgets.map((b) => b.period).filter(Boolean)));
  const uniqueCategories = Array.from(new Set(budgets.map((b) => b.category).filter(Boolean)));

  const monthlyBudgetSummary = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthLines = budgets.filter((b) => b.month === month);
    const budgeted = monthLines.reduce((sum, line) => sum + (line.budgetAmount || 0), 0);
    const actual = monthLines.reduce((sum, line) => sum + (line.actualExpenditure || 0), 0);
    const variance = budgeted - actual;
    return { month, budgeted, actual, variance };
  });

  const budgetSummary = (key: string, lines: BudgetItem[]) => {
    const budgeted = lines.reduce((sum, line) => sum + (line.budgetAmount || 0), 0);
    const actual = lines.reduce((sum, line) => sum + (line.actualExpenditure || 0), 0);
    return { key, budgeted, actual, variance: budgeted - actual };
  };
  const groupedBudgetSummary = budgetSummaryGroup === 'category'
    ? uniqueCategories.map((key) => budgetSummary(key, budgets.filter((line) => line.category === key)))
    : budgetSummaryGroup === 'period'
    ? uniquePeriods.map((key) => budgetSummary(key, budgets.filter((line) => line.period === key)))
    : PROGRAMMES.map((item) => budgetSummary(
      item.name,
      budgets.filter((line) => line.programmeId === item.id)
    )).filter((row) => row.budgeted || row.actual);

  // Handle Budget Form Submit
  const handleSaveBudget = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const period = (fd.get('period') as string).trim();
    const programme = (fd.get('programme') as string).trim() || 'Education & Support';
    const programmeIdValue = fd.get('programmeId');
    const programmeId = PROGRAMMES.find((item) => item.id === programmeIdValue)?.id;
    const category = (fd.get('category') as BudgetCategory) || 'Education';
    const itemDescription = (fd.get('itemDescription') as string).trim();
    const quantity = parseFloat(fd.get('quantity') as string) || 1;
    const unit = (fd.get('unit') as string).trim() || 'Unit';
    const unitCost = parseFloat(fd.get('unitCost') as string) || 0;
    const budgetAmount = quantity * unitCost;
    const actualExpenditure = parseFloat(fd.get('actualExpenditure') as string) || 0;
    const notes = (fd.get('notes') as string).trim();

    if (editingBudget) {
      updateBudgetItem(
        editingBudget.id,
        {
          period,
          periodType: 'quarterly',
          programme,
          programmeId,
          category,
          itemDescription,
          quantity,
          unit,
          unitCost,
          budgetAmount,
          actualExpenditure,
          notes,
        },
        actorName
      );
    } else {
      addBudgetItem(
        {
          period,
          periodType: 'quarterly',
          programme,
          programmeId,
          category,
          itemDescription,
          quantity,
          unit,
          unitCost,
          budgetAmount,
          actualExpenditure,
          notes,
        },
        actorName
      );
    }

    setShowBudgetModal(false);
    setEditingBudget(null);
    onRefresh();
  };

  // Handle Workplan Form Submit
  const handleSaveAnnualBudget = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const financialYear = (fd.get('financialYear') as string).trim();
    const title = (fd.get('title') as string).trim();
    const programme = (fd.get('programme') as string).trim() || 'General programme';
    const description = (fd.get('description') as string).trim();
    const status = (fd.get('status') as AnnualBudgetStatus) || 'Draft';
    const approvedAmount = Number(fd.get('approvedAmount') as string) || 0;
    const approvalDate = (fd.get('approvalDate') as string) || '';
    const notes = (fd.get('notes') as string).trim();

    if (!financialYear || !title) {
      return;
    }

    if (editingAnnualBudget) {
      updateAnnualBudgetPlan(
        editingAnnualBudget.id,
        {
          financialYear,
          title,
          programme,
          description,
          status,
          approvedAmount,
          approvalDate,
          notes,
        },
        actorName
      );
    } else {
      addAnnualBudgetPlan(
        {
          financialYear,
          title,
          programme,
          description,
          status,
          approvedAmount,
          approvalDate,
          notes,
          createdBy: actorName,
          updatedBy: actorName,
        },
        actorName
      );
    }

    setShowAnnualBudgetModal(false);
    setEditingAnnualBudget(null);
    onRefresh();
  };

  const handleSaveWorkplan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const period = (fd.get('period') as string).trim();
    const activity = (fd.get('activity') as string).trim();
    const objective = (fd.get('objective') as string).trim();
    const description = objective;
    const targetCount = parseInt(fd.get('targetCount') as string, 10) || 1;
    const unit = (fd.get('unit') as string).trim() || 'Sessions';
    const completedCount = parseInt(fd.get('completedCount') as string, 10) || 0;
    const rawStatus = (fd.get('status') as string) || 'In Progress';
    const normalizedStatus = normalizeWorkplanStatus(rawStatus) as WorkplanStatus;
    const programmeIdValue = fd.get('programmeId');
    const programmeId = PROGRAMMES.find((item) => item.id === programmeIdValue)?.id;
    const progress = Math.min(100, Math.round((completedCount / targetCount) * 100));
    const responsibleStaffName = (fd.get('responsibleStaffName') as string).trim();
    const responsibleStaffId = staffProfile?.id || staffProfile?.uid || 'staff-1';
    const endDate = (fd.get('endDate') as string).trim();
    if (!endDate) return;
    const startDate = ((fd.get('startDate') as string).trim() || endDate);
    const location = (fd.get('location') as string).trim();
    const notes = (fd.get('notes') as string).trim();

    if (editingWorkplan) {
      updateWorkplanItem(
        editingWorkplan.id,
        {
          period,
          periodType: 'quarterly',
          programmeId,
          activity,
          objective,
          description,
          targetCount,
          unit,
          completedCount,
          progress,
          status: normalizedStatus,
          responsibleStaffId,
          responsibleStaffName,
          startDate,
          endDate,
          dueDatePeriod: `date:${endDate}`,
          location,
          notes,
        },
        actorName
      );
    } else {
      addWorkplanItem(
        {
          period,
          periodType: 'quarterly',
          programmeId,
          activity,
          objective,
          description,
          targetCount,
          unit,
          completedCount,
          progress,
          status: normalizedStatus,
          responsibleStaffId,
          responsibleStaffName,
          startDate,
          endDate,
          dueDatePeriod: `date:${endDate}`,
          location,
          notes,
        },
        actorName
      );
    }

    setShowWorkplanModal(false);
    setEditingWorkplan(null);
    onRefresh();
  };

  // Handle Schedule Form Submit
  const handleSaveSchedule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const scheduledDate = fd.get('scheduledDate') as string;
    const scheduledTime = fd.get('scheduledTime') as string;
    const type = (fd.get('type') as ScheduleType) || 'household_visit';
    const title = (fd.get('title') as string).trim();
    const targetName = (fd.get('targetName') as string).trim();
    const location = (fd.get('location') as string).trim();
    const assignedStaffName = (fd.get('assignedStaffName') as string).trim();
    const assignedStaffId = staffProfile?.id || staffProfile?.uid || 'staff-1';
    const status = (fd.get('status') as ScheduleStatus) || 'Upcoming';
    const notes = (fd.get('notes') as string).trim();

    const normalizedScheduleStatus: ScheduleStatus =
      status === 'Scheduled' || status === 'Upcoming' || status === 'In Progress' || status === 'Rescheduled' || status === 'Completed' || status === 'Cancelled'
        ? status
        : 'Upcoming';

    if (editingSchedule) {
      updateScheduleItem(
        editingSchedule.id,
        {
          scheduledDate,
          scheduledTime,
          type,
          title,
          targetName,
          location,
          assignedStaffId,
          assignedStaffName,
          status: normalizedScheduleStatus,
          notes,
        },
        actorName
      );
    } else {
      addScheduleItem(
        {
          scheduledDate,
          scheduledTime,
          type,
          title,
          targetName,
          location,
          assignedStaffId,
          assignedStaffName,
          status: normalizedScheduleStatus,
          notes,
        },
        actorName
      );
    }

    setShowScheduleModal(false);
    setEditingSchedule(null);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Tab Selector */}
      <div className="bg-white rounded-xl shadow-xs border border-stone-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
              <Layers className="w-6 h-6 text-teal-700" />
              Budgets, Workplans & Operational Schedules
            </h2>
            <p className="text-xs text-stone-600 mt-1">
              Track multi-quarter budget allocations, compare actual expenditure, and monitor field targets across Zomba District.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-1">
              <button
                onClick={() => setActiveSubTab('budgets')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeSubTab === 'budgets'
                    ? 'bg-teal-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                Budgets & Variance ({budgets.length})
              </button>
              <button
                onClick={() => setActiveSubTab('workplans')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeSubTab === 'workplans'
                    ? 'bg-teal-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                <ListTodo className="w-3.5 h-3.5" />
                Workplans ({workplans.length})
              </button>
              <button
                onClick={() => setActiveSubTab('schedules')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeSubTab === 'schedules'
                    ? 'bg-teal-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Schedules ({schedules.length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. BUDGETS TAB */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'budgets' && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-xs font-medium text-stone-500">Total Budget Allocation</p>
              <p className="text-xl font-extrabold text-teal-900 mt-1">{formatMWK(totalBudgeted)}</p>
              <span className="text-[11px] text-stone-500 mt-1 block">{filteredBudgets.length} budget line items</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-xs font-medium text-stone-500">Actual Expenditure Disbursed</p>
              <p className="text-xl font-extrabold text-stone-900 mt-1">{formatMWK(totalActual)}</p>
              <span className="text-[11px] text-amber-700 mt-1 font-semibold block">{executionPercent}% of total budget utilized</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-xs font-medium text-stone-500">Net Budget Variance</p>
              <p className={`text-xl font-extrabold mt-1 ${totalVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatMWK(Math.abs(totalVariance))}
              </p>
              <span className="text-[11px] text-stone-500 mt-1 block">
                {totalVariance >= 0 ? 'Surplus / Available balance' : 'Over budget'}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500">Execution Status</p>
                <p className="text-lg font-bold text-teal-800 mt-1">
                  {executionPercent > 100 ? 'Overspent' : executionPercent > 80 ? 'Near Limit' : 'On Track'}
                </p>
                <div className="w-32 bg-stone-200 rounded-full h-2 mt-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${
                      executionPercent > 100 ? 'bg-rose-600' : executionPercent > 80 ? 'bg-amber-500' : 'bg-teal-600'
                    }`}
                    style={{ width: `${Math.min(100, executionPercent)}%` }}
                  />
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => {
                    setEditingBudget(null);
                    setShowBudgetModal(true);
                  }}
                  className="px-3 py-2 bg-teal-800 text-white rounded-lg text-xs font-bold hover:bg-teal-900 transition-all flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add Line
                </button>
              )}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Annual budget plans</p>
                <p className="text-lg font-black text-stone-900 mt-1">MWK {approvedAnnualBudgetTotal.toLocaleString()}</p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAnnualBudget(null);
                    setShowAnnualBudgetModal(true);
                  }}
                  className="px-3 py-2 bg-teal-800 text-white rounded-lg text-xs font-bold hover:bg-teal-900 transition-all flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add annual plan
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {annualBudgets.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3 border border-dashed border-stone-300 rounded-xl p-4 text-sm text-stone-500">
                  No annual budget plans recorded yet. Add the first annual budget to begin planning.
                </div>
              ) : (
                annualBudgets.map((plan) => (
                  <div key={plan.id} className="border border-stone-200 rounded-xl p-3 bg-stone-50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-stone-900">{plan.title}</div>
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-teal-100 text-teal-800 px-2 py-1 rounded-full">
                        {plan.status}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-stone-600">{plan.programme}</div>
                    <div className="mt-2 text-xs text-stone-500">{plan.financialYear}</div>
                    <div className="mt-3 text-sm font-black text-stone-900">MWK {plan.approvedAmount.toLocaleString()}</div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAnnualBudget(plan);
                          setShowAnnualBudgetModal(true);
                        }}
                        className="mt-3 text-xs font-semibold text-teal-700 hover:text-teal-900"
                      >
                        Edit plan
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Monthly budget monitoring</p>
                <h3 className="text-base font-black text-stone-900">Budget vs Actual by month</h3>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {monthlyBudgetSummary.map(({ month, budgeted, actual, variance }) => (
                <div key={month} className="border border-stone-200 rounded-xl p-3 bg-stone-50">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-stone-500">
                    <span>{new Date(2026, month - 1, 1).toLocaleString('en-US', { month: 'short' })}</span>
                    <span className={variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{variance >= 0 ? 'Surplus' : 'Shortfall'}</span>
                  </div>
                  <div className="mt-2 text-sm font-black text-stone-900">MWK {budgeted.toLocaleString()}</div>
                  <div className="mt-1 text-xs text-stone-500">Actual: MWK {actual.toLocaleString()}</div>
                  <div className={`mt-2 text-xs font-bold ${variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {variance >= 0 ? '+' : '-'}MWK {Math.abs(variance).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Budget vs actual summary</p>
              <h3 className="text-base font-black text-stone-900">Budget variance grouping</h3>
              <div className="flex gap-1" role="group" aria-label="Group budget variance by">
                {(['category', 'period', 'programme'] as const).map((group) => (
                  <button
                    key={group}
                    type="button"
                    aria-pressed={budgetSummaryGroup === group}
                    onClick={() => setBudgetSummaryGroup(group)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize ${
                      budgetSummaryGroup === group ? 'bg-teal-800 text-white' : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    By {group}
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-stone-200 rounded-xl overflow-hidden">
              <div className="bg-stone-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-stone-600">
                By {budgetSummaryGroup}
              </div>
              <div className="divide-y divide-stone-200">
                {groupedBudgetSummary.map(({ key, budgeted, actual, variance }) => (
                  <div key={key} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-stone-700">{key}</span>
                    <div className="text-right">
                      <div className="font-bold text-stone-900">{formatMWK(budgeted)}</div>
                      <div className="text-stone-500">Actual {formatMWK(actual)} • {variance >= 0 ? 'Surplus' : 'Over'} {formatMWK(Math.abs(variance))}</div>
                    </div>
                  </div>
                ))}
                {groupedBudgetSummary.length === 0 && <p className="p-3 text-xs text-stone-500">No attributed budget lines yet.</p>}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-stone-600 font-semibold mr-1">
                <Filter className="w-3.5 h-3.5 text-teal-700" /> Filter:
              </div>
              <select
                value={budgetPeriodFilter}
                onChange={(e) => setBudgetPeriodFilter(e.target.value)}
                className="text-xs border border-stone-300 rounded-lg px-2.5 py-1.5 bg-stone-50 focus:ring-1 focus:ring-teal-700 outline-hidden"
              >
                <option value="ALL">All Periods ({budgets.length})</option>
                {uniquePeriods.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              <select
                value={budgetCategoryFilter}
                onChange={(e) => setBudgetCategoryFilter(e.target.value)}
                className="text-xs border border-stone-300 rounded-lg px-2.5 py-1.5 bg-stone-50 focus:ring-1 focus:ring-teal-700 outline-hidden"
              >
                <option value="ALL">All Categories</option>
                {uniqueCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-stone-500">
              Showing {filteredBudgets.length} of {budgets.length} items
            </div>
          </div>

          {/* Budgets Table */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-teal-900 text-white text-xs font-bold tracking-wider">
                    <th className="p-3">Period</th>
                    <th className="p-3">Programme</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Qty & Unit</th>
                    <th className="p-3 text-right">Budget (MWK)</th>
                    <th className="p-3 text-right">Actual (MWK)</th>
                    <th className="p-3 text-right">Variance (MWK)</th>
                    <th className="p-3 text-center">% Spent</th>
                    {canEdit && <th className="p-3 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 text-xs">
                  {filteredBudgets.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-stone-500 italic">
                        No budget line items recorded yet. Click "Add Line" above to start budgeting.
                      </td>
                    </tr>
                  ) : (
                    filteredBudgets.map((b) => {
                      const pct = b.budgetAmount > 0 ? Math.round(((b.actualExpenditure || 0) / b.budgetAmount) * 100) : 0;
                      const varAmt = (b.budgetAmount || 0) - (b.actualExpenditure || 0);
                      return (
                        <tr key={b.id} className="hover:bg-stone-50 transition-colors">
                          <td className="p-3 font-semibold text-stone-900 whitespace-nowrap">{b.period}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-200">
                              {b.programme}
                            </span>
                            <span className="mt-1 block text-[10px] text-stone-500">
                              {b.programmeId ? PROGRAMME_BY_ID[b.programmeId].name : 'Unassigned'}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-stone-700 whitespace-nowrap">{b.category}</td>
                          <td className="p-3 text-stone-900 font-medium">
                            {b.itemDescription}
                            {b.notes && <p className="text-[11px] text-stone-500 mt-0.5">{b.notes}</p>}
                          </td>
                          <td className="p-3 text-right text-stone-600 whitespace-nowrap">
                            {b.quantity} {b.unit}
                          </td>
                          <td className="p-3 text-right font-bold text-stone-900 whitespace-nowrap">
                            {formatMWK(b.budgetAmount)}
                          </td>
                          <td className="p-3 text-right font-semibold text-stone-800 whitespace-nowrap">
                            {formatMWK(b.actualExpenditure || 0)}
                          </td>
                          <td className="p-3 text-right font-bold whitespace-nowrap">
                            <span className={varAmt >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                              {varAmt >= 0 ? '+' : ''}{formatMWK(varAmt)}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                pct > 100
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : pct > 80
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {pct}%
                            </span>
                          </td>
                          {canEdit && (
                            <td className="p-3 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingBudget(b);
                                    setShowBudgetModal(true);
                                  }}
                                  className="p-1 hover:bg-stone-200 rounded-md text-stone-600 hover:text-teal-900"
                                  title="Edit budget line"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => {
                                      if (confirm(`Delete budget item "${b.itemDescription}"?`)) {
                                        deleteBudgetItem(b.id);
                                        onRefresh();
                                      }
                                    }}
                                    className="p-1 hover:bg-rose-100 rounded-md text-rose-600 hover:text-rose-800"
                                    title="Delete line"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. WORKPLANS TAB */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'workplans' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-[11px] uppercase tracking-[0.12em] text-stone-500">Active plans</p>
              <p className="mt-2 text-2xl font-black text-stone-900">{workloadSummary.activePlans}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-[11px] uppercase tracking-[0.12em] text-stone-500">Completed</p>
              <p className="mt-2 text-2xl font-black text-emerald-700">{workplanHealthSummary.completedCount}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-[11px] uppercase tracking-[0.12em] text-stone-500">Delayed</p>
              <p className="mt-2 text-2xl font-black text-amber-700">{workloadSummary.delayedCount}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-[11px] uppercase tracking-[0.12em] text-stone-500">Overdue</p>
              <p className="mt-2 text-2xl font-black text-rose-700">{workplanHealthSummary.overdueCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-[11px] uppercase tracking-[0.12em] text-stone-500">Upcoming activities</p>
              <p className="mt-2 text-2xl font-black text-teal-800">{activityOverview.upcomingCount}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-[11px] uppercase tracking-[0.12em] text-stone-500">Today</p>
              <p className="mt-2 text-2xl font-black text-blue-700">{activityOverview.todayCount}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <p className="text-[11px] uppercase tracking-[0.12em] text-stone-500">Overdue activities</p>
              <p className="mt-2 text-2xl font-black text-rose-700">{activityOverview.overdueCount}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-stone-500">Workload watchlist</p>
                <h3 className="text-base font-black text-stone-900">Upcoming workplans and field activities</h3>
              </div>
            </div>
            <div className="space-y-2">
              {upcomingActivityItems.length === 0 ? (
                <div className="text-sm text-stone-500 italic">No active work or field activity is pending.</div>
              ) : (
                upcomingActivityItems.slice(0, 6).map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs">
                    <div>
                      <div className="font-bold text-stone-900">{item.label}</div>
                      <div className="text-stone-500">{item.owner}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-stone-700">{formatDate(item.when)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-stone-500">{item.kind}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-stone-500">Staff workload summary</p>
              <h3 className="text-base font-black text-stone-900">Responsibility load by staff member</h3>
            </div>
            <div className="space-y-3">
              {Object.values(workloadSummary.byStaff).length === 0 ? (
                <div className="text-sm text-stone-500 italic">No assigned workplan activity yet.</div>
              ) : (
                Object.values(workloadSummary.byStaff)
                  .sort((a, b) => b.plannedCount - a.plannedCount)
                  .map((staff) => (
                    <div key={staff.id} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-stone-900">{staff.name}</div>
                          <div className="text-[11px] text-stone-500">{staff.plannedCount} planned • {staff.activeCount} active • {staff.delayedCount} delayed</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-teal-800">{staff.averageProgress}% avg</div>
                          <div className="text-[10px] text-stone-500">{staff.completedCount} completed</div>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-600 font-semibold flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-teal-700" /> Filter Status:
              </span>
              <select
                value={workplanStatusFilter}
                onChange={(e) => setWorkplanStatusFilter(e.target.value)}
                className="text-xs border border-stone-300 rounded-lg px-2.5 py-1.5 bg-stone-50 focus:ring-1 focus:ring-teal-700 outline-hidden"
              >
                <option value="ALL">All Statuses ({workplans.length})</option>
                <option value="Planned">Planned</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Delayed">Delayed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {canEdit && (
              <button
                onClick={() => {
                  setEditingWorkplan(null);
                  setShowWorkplanModal(true);
                }}
                className="px-3 py-2 bg-teal-800 text-white rounded-lg text-xs font-bold hover:bg-teal-900 transition-all flex items-center gap-1 shadow-xs"
              >
                <Plus className="w-4 h-4" /> Add Workplan Objective
              </button>
            )}
          </div>

          {/* Workplans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredWorkplans.length === 0 ? (
              <div className="col-span-2 bg-white p-8 rounded-xl border border-stone-200 text-center text-stone-500 italic">
                No workplan items found. Click "Add Workplan Objective" to record key activity targets.
              </div>
            ) : (
              filteredWorkplans.map((w) => {
                const status = normalizeWorkplanStatus(w.status);
                return (
                  <div key={w.id} className="bg-white rounded-xl border border-stone-200 p-4 shadow-xs hover:border-teal-700 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                          {w.period}
                        </span>
                        <h3 className="text-sm font-bold text-stone-900 mt-1.5">{w.activity}</h3>
                        <p className="text-[10px] font-semibold text-stone-500">{w.programmeId ? PROGRAMME_BY_ID[w.programmeId].name : 'Unassigned'}</p>
                        <p className="text-xs text-stone-600 mt-0.5">{w.objective}</p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                          status === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : status === 'In Progress'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : status === 'Delayed'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-stone-100 text-stone-700 border border-stone-300'
                        }`}
                      >
                        {status}
                      </span>
                    </div>

                    <div className="mt-3 bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-xs space-y-1">
                      <div className="flex justify-between text-stone-700">
                        <span>Target Milestone:</span>
                        <span className="font-bold">
                          {w.completedCount || 0} / {w.targetCount} {w.unit}
                        </span>
                      </div>
                      <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-teal-700 h-2 rounded-full transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, Number(w.progress) || 0))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-stone-500 pt-1">
                        <span>Responsible: <strong>{w.responsibleStaffName}</strong></span>
                        <span>{Math.max(0, Math.min(100, Number(w.progress) || 0))}% Complete</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-stone-500 pt-2 border-t border-stone-100">
                      <span>
                        Timeline: {w.startDate ? formatDate(w.startDate) : 'TBD'} - {w.endDate ? formatDate(w.endDate) : 'Ongoing'}
                      </span>
                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingWorkplan(w);
                              setShowWorkplanModal(true);
                            }}
                            className="text-teal-800 hover:underline font-semibold"
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                if (confirm(`Delete workplan "${w.activity}"?`)) {
                                  deleteWorkplanItem(w.id);
                                  onRefresh();
                                }
                              }}
                              className="text-rose-600 hover:underline font-semibold"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. SCHEDULES TAB */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'schedules' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Operational Field Agenda</h3>
              <p className="text-xs text-stone-500">Upcoming home visits, school monitoring, health consultations and stakeholder activities</p>
            </div>
            {canEdit && (
              <button
                onClick={() => {
                  setEditingSchedule(null);
                  setShowScheduleModal(true);
                }}
                className="px-3 py-2 bg-teal-800 text-white rounded-lg text-xs font-bold hover:bg-teal-900 transition-all flex items-center gap-1 shadow-xs"
              >
                <Plus className="w-4 h-4" /> Schedule Field Activity
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs divide-y divide-stone-200">
            {schedules.length === 0 ? (
              <div className="p-8 text-center text-stone-500 italic">
                No field visits or agendas scheduled. Click "Schedule Field Activity" above.
              </div>
            ) : (
              schedules.map((s) => (
                <div key={s.id} className="p-4 hover:bg-stone-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-center min-w-[65px]">
                      <span className="text-[10px] font-bold block uppercase">{formatDate(s.scheduledDate).slice(3, 6)}</span>
                      <span className="text-lg font-black block leading-none">{formatDate(s.scheduledDate).slice(0, 2)}</span>
                      {s.scheduledTime && <span className="text-[9px] block text-stone-500 mt-0.5">{s.scheduledTime}</span>}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          {s.type}
                        </span>
                        <h4 className="text-sm font-bold text-stone-900">{s.title}</h4>
                      </div>
                      <p className="text-xs text-stone-600 mt-1">
                        Target: <strong>{s.targetName || 'All Units'}</strong> • Location: <strong>{s.location || 'Zomba'}</strong> • Assigned: <strong>{s.assignedStaffName}</strong>
                      </p>
                      {s.notes && <p className="text-xs text-stone-500 mt-1 italic">{s.notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        s.status === 'Completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : s.status === 'Cancelled'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {s.status}
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingSchedule(s);
                            setShowScheduleModal(true);
                          }}
                          className="p-1 hover:bg-stone-200 rounded-md text-stone-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete schedule "${s.title}"?`)) {
                              deleteScheduleItem(s.id);
                              onRefresh();
                            }
                          }}
                          className="p-1 hover:bg-rose-100 rounded-md text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ANNUAL BUDGET MODAL */}
      {/* ------------------------------------------------------------- */}
      {showAnnualBudgetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-4">
              {editingAnnualBudget ? 'Edit Annual Budget Plan' : 'New Annual Budget Plan'}
            </h3>
            <form onSubmit={handleSaveAnnualBudget} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Financial year</label>
                  <input
                    name="financialYear"
                    required
                    defaultValue={editingAnnualBudget?.financialYear || '2026'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingAnnualBudget?.status || 'Draft'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Approved">Approved</option>
                    <option value="Active">Active</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Plan title</label>
                <input
                  name="title"
                  required
                  defaultValue={editingAnnualBudget?.title || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Programme</label>
                  <input
                    name="programme"
                    defaultValue={editingAnnualBudget?.programme || 'General programme'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Approved amount (MWK)</label>
                  <input
                    name="approvedAmount"
                    type="number"
                    step="any"
                    defaultValue={editingAnnualBudget?.approvedAmount || 0}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Approval date</label>
                <input
                  name="approvalDate"
                  type="date"
                  defaultValue={editingAnnualBudget?.approvalDate || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Description</label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editingAnnualBudget?.description || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editingAnnualBudget?.notes || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowAnnualBudgetModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900"
                >
                  {editingAnnualBudget ? 'Save plan' : 'Add plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BUDGET MODAL */}
      {/* ------------------------------------------------------------- */}
      {showBudgetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-4">
              {editingBudget ? 'Edit Budget Item' : 'New Budget Line Allocation'}
            </h3>
            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Period / Quarter</label>
                  <input
                    name="period"
                    required
                    defaultValue={editingBudget?.period || 'Term 1 2026'}
                    placeholder="e.g. Term 1 2026, Q2 2026"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Programme</label>
                  <select
                    name="programme"
                    defaultValue={editingBudget?.programme || 'Education'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Education">Education & School Fees</option>
                    <option value="Households">Households & Sustenance</option>
                    <option value="Healthcare">Healthcare & Emergency</option>
                    <option value="Operations">Operations & Fieldwork</option>
                    <option value="General Support">General Support</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Programme attribution</label>
                <select
                  name="programmeId"
                  defaultValue={editingBudget?.programmeId || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                >
                  <option value="">Unassigned</option>
                  {PROGRAMMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Category</label>
                  <input
                    name="category"
                    required
                    defaultValue={editingBudget?.category || 'School Fees'}
                    placeholder="e.g. Groceries, School Fees"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Unit of Measure</label>
                  <input
                    name="unit"
                    defaultValue={editingBudget?.unit || 'Terms'}
                    placeholder="e.g. Months, Terms, Bags"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Item Description</label>
                <input
                  name="itemDescription"
                  required
                  defaultValue={editingBudget?.itemDescription || ''}
                  placeholder="e.g. Secondary School Tuition fees for Form 4 girls"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Quantity</label>
                  <input
                    name="quantity"
                    type="number"
                    step="any"
                    required
                    defaultValue={editingBudget?.quantity || 1}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Unit Cost (MWK)</label>
                  <input
                    name="unitCost"
                    type="number"
                    step="any"
                    required
                    defaultValue={editingBudget?.unitCost || 0}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Actual Spent (MWK)</label>
                  <input
                    name="actualExpenditure"
                    type="number"
                    step="any"
                    defaultValue={editingBudget?.actualExpenditure || 0}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Notes / Budget Justification</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editingBudget?.notes || ''}
                  placeholder="Optional supplier notes, terms or remarks"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900"
                >
                  {editingBudget ? 'Save Changes' : 'Add Line Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* WORKPLAN MODAL */}
      {/* ------------------------------------------------------------- */}
      {showWorkplanModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-4">
              {editingWorkplan ? 'Edit Workplan Target' : 'New Strategic Workplan Objective'}
            </h3>
            <form onSubmit={handleSaveWorkplan} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Period</label>
                  <input
                    name="period"
                    required
                    defaultValue={editingWorkplan?.period || 'Q1 2026'}
                    placeholder="e.g. Q1 2026, Annual 2026"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={normalizeWorkplanStatus(editingWorkplan?.status || 'In Progress')}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Planned">Planned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Delayed">Delayed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Programme</label>
                <select
                  name="programmeId"
                  defaultValue={editingWorkplan?.programmeId || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                >
                  <option value="">Unassigned</option>
                  {PROGRAMMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Activity Title</label>
                <input
                  name="activity"
                  required
                  defaultValue={editingWorkplan?.activity || ''}
                  placeholder="e.g. Secondary School Term Monitoring & Fee Payments"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Strategic Objective</label>
                <textarea
                  name="objective"
                  rows={2}
                  required
                  defaultValue={editingWorkplan?.objective || ''}
                  placeholder="e.g. Ensure 100% of sponsored girls attend all terms and have required learning materials"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Target Count</label>
                  <input
                    name="targetCount"
                    type="number"
                    required
                    defaultValue={editingWorkplan?.targetCount || 10}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Unit</label>
                  <input
                    name="unit"
                    defaultValue={editingWorkplan?.unit || 'Visits'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Completed Count</label>
                  <input
                    name="completedCount"
                    type="number"
                    defaultValue={editingWorkplan?.completedCount || 0}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Responsible Staff</label>
                  <input
                    name="responsibleStaffName"
                    required
                    defaultValue={editingWorkplan?.responsibleStaffName || actorName}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Location / Target</label>
                  <input
                    name="location"
                    defaultValue={editingWorkplan?.location || 'Zomba District'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Start Date (optional)</label>
                  <input
                    type="date"
                    name="startDate"
                    defaultValue={editingWorkplan?.startDate || ''}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    name="endDate"
                    required
                    defaultValue={editingWorkplan?.endDate || ''}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowWorkplanModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900"
                >
                  {editingWorkplan ? 'Save Changes' : 'Create Objective'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SCHEDULE MODAL */}
      {/* ------------------------------------------------------------- */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-4">
              {editingSchedule ? 'Edit Scheduled Activity' : 'Schedule Field Activity'}
            </h3>
            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    name="scheduledDate"
                    required
                    defaultValue={editingSchedule?.scheduledDate || new Date().toISOString().slice(0, 10)}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Time (Optional)</label>
                  <input
                    type="time"
                    name="scheduledTime"
                    defaultValue={editingSchedule?.scheduledTime || '09:00'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Activity Type</label>
                  <select
                    name="type"
                    defaultValue={editingSchedule?.type || 'Home visit'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Home visit">Home visit</option>
                    <option value="School visit">School visit</option>
                    <option value="Medical check-up">Medical check-up</option>
                    <option value="Family meeting">Family meeting</option>
                    <option value="Group activity">Group activity</option>
                    <option value="Review">Review</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingSchedule?.status || 'Upcoming'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Upcoming">Upcoming</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Rescheduled">Rescheduled</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Activity Title</label>
                <input
                  name="title"
                  required
                  defaultValue={editingSchedule?.title || ''}
                  placeholder="e.g. Standard 8 Mock Exam Review with Headteacher"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Target Person / Entity</label>
                  <input
                    name="targetName"
                    defaultValue={editingSchedule?.targetName || ''}
                    placeholder="e.g. Grace Banda / House 1"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Location</label>
                  <input
                    name="location"
                    defaultValue={editingSchedule?.location || 'Zomba'}
                    placeholder="e.g. Likangala CDSS"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Assigned Staff</label>
                <input
                  name="assignedStaffName"
                  required
                  defaultValue={editingSchedule?.assignedStaffName || actorName}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Field Agenda & Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editingSchedule?.notes || ''}
                  placeholder="Transport details, items to bring, specific discussion topics"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900"
                >
                  {editingSchedule ? 'Save Changes' : 'Schedule Activity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
