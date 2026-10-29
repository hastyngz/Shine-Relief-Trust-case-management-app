import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ProcurementList,
  ProcurementListItem,
  ProcurementQuote,
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
  updateProcurementList,
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
import { expandWorkplanOccurrences, findOverloadedStaff, MAX_WORKPLANS_PER_STAFF_PER_WEEK } from '../../services/workplanRecurrence';
import { calculateBudgetForecast } from '../../services/intelligenceService';
import { filterBudgetLines, filterBudgetLinesByYear } from '../../services/financialCalculations';
import { LEGACY_PROGRAMMES, PROGRAMMES, PROGRAMME_BY_ID, ProgrammeId } from '../../data/programmes';
import type { QualityIssue } from '../../services/qualityRules';
import { PlanningModals } from './PlanningModals';
import { checkProcurementApproval, DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK, selectProcurementQuote } from '../../services/procurementWorkflow';
import { postInventoryMovement } from '../../services/r2StorageClient';
import { filterProcurementLists, type ProcurementStageFilter } from '../../utils/procurementFiltering';
import {
  clearProcurementReceiptIntent,
  NOT_INVENTORY_TRACKED,
  postProcurementReceiptMovements,
  readProcurementReceiptIntent,
} from '../../services/procurementInventoryReceipt';
import { clearProcurementDeliveryIntent, createProcurementDeliveryId, postProcurementDeliveryMovements, readProcurementDeliveryIntent } from '../../services/procurementDelivery';
import { getProcurementOutstandingQuantity, getProcurementPaymentSummary, validateProcurementPayment } from '../../services/procurementLifecycle';

type QualityRecordFocus = Pick<NonNullable<QualityIssue['target']>, 'kind' | 'id'>;

interface BudgetsAndWorkplansViewProps {
  db: AppDatabase;
  onRefresh: () => void;
  qualityRecordFocus?: QualityRecordFocus | null;
  initialProgrammeCreate?: { requestId: number; type: 'budget' | 'workplan'; programmeId: ProgrammeId } | null;
  onProgrammeCreateHandled?: () => void;
}

export const BudgetsAndWorkplansView: React.FC<BudgetsAndWorkplansViewProps> = ({
  db,
  onRefresh,
  qualityRecordFocus,
  initialProgrammeCreate,
  onProgrammeCreateHandled,
}) => {
  const { staffProfile, canEdit, isAdmin } = useAuth();
  const actorName = staffProfile?.fullName || 'SHINE Staff';
  const [activeSubTab, setActiveSubTab] = useState<'budgets' | 'workplans' | 'schedules' | 'procurement'>('budgets');
  const [highlightedQualityId, setHighlightedQualityId] = useState<string | null>(null);

  // Filters
  const [budgetPeriodFilter, setBudgetPeriodFilter] = useState<string>('ALL');
  const [budgetSummaryYear, setBudgetSummaryYear] = useState<string>(String(new Date().getFullYear()));
  const [budgetCategoryFilter, setBudgetCategoryFilter] = useState<string>('ALL');
  const [budgetSummaryGroup, setBudgetSummaryGroup] = useState<'category' | 'period' | 'programme'>('category');
  const [workplanStatusFilter, setWorkplanStatusFilter] = useState<string>('ALL');
  const [budgetProgrammeId, setBudgetProgrammeId] = useState<ProgrammeId | ''>('');
  const [workplanProgrammeId, setWorkplanProgrammeId] = useState<ProgrammeId | ''>('');
  const [seasonalMonthsDraft, setSeasonalMonthsDraft] = useState<number[]>([]);
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, { supplier: string; amount: string }>>({});
  const [purchaseOrderDrafts, setPurchaseOrderDrafts] = useState<Record<string, string>>({});
  const [financeReferenceDrafts, setFinanceReferenceDrafts] = useState<Record<string, string>>({});
  const [procurementSearch, setProcurementSearch] = useState('');
  const [procurementStatusFilter, setProcurementStatusFilter] = useState<'All' | ProcurementList['status']>('All');
  const [procurementStageFilter, setProcurementStageFilter] = useState<ProcurementStageFilter>('All');
  const [receiptLineChoices, setReceiptLineChoices] = useState<Record<string, string>>({});
  const [receiptPosting, setReceiptPosting] = useState<Record<string, boolean>>({});
  const [receiptPostingStatus, setReceiptPostingStatus] = useState<Record<string, string>>({});
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<string, { id: string; date: string; reference: string; quantities: string[] }>>({});
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, { id: string; date: string; amount: string; reference: string; method: 'Cash' | 'Bank transfer' | 'Mobile money' | 'Cheque' | 'Other'; notes: string }>>({});
  const [paymentPosting, setPaymentPosting] = useState<Record<string, boolean>>({});
  const [deliveryPosting, setDeliveryPosting] = useState<Record<string, boolean>>({});
  const canApproveProcurement = isAdmin || staffProfile?.role === 'Manager';
  const focusedQualityKey = useRef('');

  useEffect(() => {
    if (!initialProgrammeCreate) return;
    setBudgetProgrammeId(initialProgrammeCreate.programmeId);
    setWorkplanProgrammeId(initialProgrammeCreate.programmeId);
    setEditingBudget(null);
    setEditingWorkplan(null);
    if (initialProgrammeCreate.type === 'budget') {
      setActiveSubTab('budgets');
      setShowBudgetModal(true);
    } else {
      setActiveSubTab('workplans');
      setShowWorkplanModal(true);
    }
    onProgrammeCreateHandled?.();
  }, [initialProgrammeCreate?.requestId]);

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
  const procurementLists = db.procurementLists || [];
  const filteredProcurementLists = useMemo(() => filterProcurementLists(procurementLists, {
    search: procurementSearch, status: procurementStatusFilter,
    stage: procurementStageFilter,
  }), [procurementLists, procurementSearch, procurementStatusFilter, procurementStageFilter]);

  const saveProcurementList = (list: ProcurementList, updates: Partial<ProcurementList>) => {
    try { const saved = updateProcurementList(list.id, updates, actorName); if (!saved) throw new Error('This procurement list no longer exists. Refresh and try again.'); onRefresh(); return true; }
    catch (error) { window.alert(`Procurement change was not saved: ${error instanceof Error ? error.message : 'storage or sync error'}`); return false; }
  };
  const updateProcurementItem = (list: ProcurementList, itemIndex: number, updates: Partial<ProcurementListItem>) => {
    if (list.status !== 'draft') return;
    const items = list.items.map((item, index) => index === itemIndex ? { ...item, ...updates } : item);
    const totalMWK = items.reduce((sum, item) => sum + (item.totalMWK ?? ((item.unitPriceMWK || 0) * item.quantity)), 0);
    saveProcurementList(list, { items, totalMWK });
  };
  const addProcurementQuote = (list: ProcurementList, itemIndex: number) => {
    if (list.status !== 'draft') return;
    const draftKey = `${list.id}:${itemIndex}`; const draft = quoteDrafts[draftKey];
    const supplier = draft?.supplier.trim() || ''; const amountMWK = Number(draft?.amount);
    if (!supplier || !Number.isFinite(amountMWK) || amountMWK <= 0) { window.alert('Enter a supplier name and a positive quote amount in MWK.'); return; }
    const item = list.items[itemIndex]; const quotes = item.quotes || [];
    if (quotes.length >= 3) { window.alert('Three quotes are already recorded for this item.'); return; }
    if (quotes.some((quote) => quote.supplier.trim().toLocaleLowerCase() === supplier.toLocaleLowerCase())) { window.alert('That supplier already has a quote for this item.'); return; }
    updateProcurementItem(list, itemIndex, { quotes: [...quotes, { supplier, amountMWK, quotedAt: new Date().toISOString().slice(0, 10) }] });
    setQuoteDrafts((current) => ({ ...current, [draftKey]: { supplier: '', amount: '' } }));
  };
  const approveProcurementList = (list: ProcurementList) => {
    if (!canApproveProcurement || list.status !== 'draft') return; const check = checkProcurementApproval(list);
    if (!check.allowed) { window.alert(`Cannot approve this procurement list yet:\n\n• ${check.blockers.join('\n• ')}`); return; }
    saveProcurementList(list, { status: 'approved', approvedAt: new Date().toISOString(), approvedBy: actorName });
  };
  const markProcurementPurchased = (list: ProcurementList) => {
    if (!canApproveProcurement || list.status !== 'approved') return; const purchaseOrderReference = purchaseOrderDrafts[list.id]?.trim() || '';
    if (!purchaseOrderReference) { window.alert('Enter the purchase order or order reference before marking this list purchased.'); return; }
    saveProcurementList(list, { status: 'purchased', purchaseOrderReference, orderedAt: new Date().toISOString(), orderedBy: actorName });
  };
  const confirmProcurementReceipt = async (list: ProcurementList) => {
    if (!canEdit || list.status !== 'purchased' || list.receivedAt || receiptPosting[list.id]) return;
    setReceiptPosting((current) => ({ ...current, [list.id]: true }));
    setReceiptPostingStatus((current) => ({ ...current, [list.id]: '' }));
    try {
      const savedIntent = staffProfile?.uid && typeof window !== 'undefined'
        ? readProcurementReceiptIntent(window.localStorage, staffProfile.uid, list.id)
        : null;
      const choices = list.items.map((_, itemIndex) => {
        const key = `${list.id}:${itemIndex}`;
        const persisted = savedIntent?.lines.find((line) => line.itemIndex === itemIndex);
        const value = persisted
          ? (persisted.inventoryItemId || NOT_INVENTORY_TRACKED)
          : (receiptLineChoices[key] || '');
        return { itemIndex, inventoryItemId: value === NOT_INVENTORY_TRACKED ? null : value || null };
      });
      if (choices.some((choice, index) => !choice.inventoryItemId &&
          !savedIntent?.lines.some((line) => line.itemIndex === index && line.inventoryItemId === null) &&
          receiptLineChoices[`${list.id}:${index}`] !== NOT_INVENTORY_TRACKED)) {
        throw new Error('Choose an inventory item or explicitly mark each line as not inventory tracked.');
      }
      if (!staffProfile?.uid || typeof window === 'undefined') throw new Error('The signed-in staff identity is unavailable; no inventory movement was submitted.');
      const result = await postProcurementReceiptMovements({
        uid: staffProfile.uid,
        list,
        choices,
        inventoryItems: db.inventoryItems || [],
        storage: window.localStorage,
        postMovement: postInventoryMovement,
      });
      const saved = saveProcurementList(list, { receivedAt: new Date().toISOString(), receivedBy: actorName });
      if (!saved) throw new Error('Stock movements were confirmed, but the receipt acknowledgement could not be saved locally. Retry the same receipt; its stable movement IDs prevent duplicate stock additions.');
      clearProcurementReceiptIntent(window.localStorage, staffProfile.uid, list.id);
      setReceiptPostingStatus((current) => ({
        ...current,
        [list.id]: result.movementIds.length
          ? `Receipt recorded and linked to ${result.movementIds.length} inventory movement(s).${result.duplicateCount ? ` ${result.duplicateCount} prior movement(s) were safely confirmed.` : ''}`
          : 'Receipt acknowledgement recorded; all lines were explicitly marked as not inventory tracked.',
      }));
    } catch (error) {
      setReceiptPostingStatus((current) => ({
        ...current,
        [list.id]: error instanceof Error ? error.message : 'The receipt could not be confirmed. Retry the same selections.',
      }));
    } finally {
      setReceiptPosting((current) => ({ ...current, [list.id]: false }));
    }
  };
  const recordProcurementDelivery = async (list: ProcurementList) => {
    if (!canEdit || list.status !== 'purchased' || deliveryPosting[list.id] || !staffProfile?.uid || typeof window === 'undefined') return;
    setDeliveryPosting((current) => ({ ...current, [list.id]: true }));
    try {
      const pending = readProcurementDeliveryIntent(window.localStorage, staffProfile.uid, list.id);
      const draft = deliveryDrafts[list.id];
      const quantities = pending?.quantities || (draft?.quantities || list.items.map(() => '0')).map((value) => Number(value || 0));
      const date = pending?.date || draft?.date || new Date().toISOString().slice(0, 10);
      const reference = pending?.reference || draft?.reference?.trim() || '';
      const deliveryId = pending?.deliveryId || draft?.id || '';
      const choices = list.items.map((_, itemIndex) => {
        const key = `${list.id}:${itemIndex}`;
        const persisted = pending?.choices.find((choice) => choice.itemIndex === itemIndex);
        const value = persisted ? (persisted.inventoryItemId || NOT_INVENTORY_TRACKED) : (receiptLineChoices[key] || '');
        return { itemIndex, inventoryItemId: value === NOT_INVENTORY_TRACKED ? null : value || null };
      });
      if (choices.some((choice, index) => quantities[index] > 0 && !choice.inventoryItemId &&
        !pending?.choices.some((line) => line.itemIndex === index && line.inventoryItemId === null) &&
        receiptLineChoices[`${list.id}:${index}`] !== NOT_INVENTORY_TRACKED)) {
        throw new Error('Choose an inventory item or explicitly mark every received line as not inventory tracked.');
      }
      if (!deliveryId) throw new Error('Start a new delivery attempt before recording quantities.');
      const result = await postProcurementDeliveryMovements({
        uid: staffProfile.uid, list, deliveryId, date, reference, quantities, choices,
        inventoryItems: db.inventoryItems || [], storage: window.localStorage, postMovement: postInventoryMovement,
      });
      const delivery = {
        id: result.intent.deliveryId, date: result.intent.date, reference: result.intent.reference,
        recordedAt: new Date().toISOString(), recordedBy: actorName,
        lines: result.intent.quantities.map((quantity, itemIndex) => ({
          itemIndex, quantity, inventoryItemId: result.intent.choices[itemIndex]?.inventoryItemId ?? null,
          movementId: result.movementIds.find((id) => id.endsWith(`_${itemIndex}`)),
        })).filter((line) => line.quantity > 0),
      };
      const deliveries = [...(list.deliveries || []), delivery];
      const fullyReceived = list.items.every((_, index) => deliveries.reduce((sum, row) => sum + row.lines.filter((line) => line.itemIndex === index).reduce((s, line) => s + line.quantity, 0), 0) >= list.items[index].quantity);
      const saved = saveProcurementList(list, {
        deliveries,
        ...(fullyReceived ? { receivedAt: new Date().toISOString(), receivedBy: actorName } : {}),
      });
      if (!saved) throw new Error('Stock movements were confirmed, but delivery history could not be saved. Retry this exact delivery; stable movement IDs prevent duplicate stock additions.');
      clearProcurementDeliveryIntent(window.localStorage, staffProfile.uid, list.id);
      setDeliveryDrafts((current) => ({ ...current, [list.id]: { id: createProcurementDeliveryId(), date: new Date().toISOString().slice(0, 10), reference: '', quantities: list.items.map(() => '0') } }));
      setReceiptPostingStatus((current) => ({ ...current, [list.id]: `Delivery recorded: ${result.movementIds.length} stock movement(s), ${result.duplicateCount} safely confirmed duplicate(s).` }));
      onRefresh();
    } catch (error) {
      setReceiptPostingStatus((current) => ({ ...current, [list.id]: error instanceof Error ? error.message : 'Delivery could not be recorded. Retry the same delivery details.' }));
    } finally {
      setDeliveryPosting((current) => ({ ...current, [list.id]: false }));
    }
  };
  const recordProcurementPayment = (list: ProcurementList) => {
    if (!canApproveProcurement || paymentPosting[list.id]) return;
    const draft = paymentDrafts[list.id];
    if (!draft) { window.alert('Start a payment record first.'); return; }
    const payment = { id: draft.id, date: draft.date, amountMWK: Number(draft.amount), reference: draft.reference.trim(), method: draft.method, notes: draft.notes.trim() || undefined, recordedAt: new Date().toISOString(), recordedBy: actorName };
    const errors = validateProcurementPayment({ list, date: payment.date, amountMWK: payment.amountMWK, reference: payment.reference, paymentId: payment.id });
    if (errors.length) { window.alert(errors.join('\n')); return; }
    setPaymentPosting((current) => ({ ...current, [list.id]: true }));
    const saved = saveProcurementList(list, { payments: [...(list.payments || []), payment] });
    setPaymentPosting((current) => ({ ...current, [list.id]: false }));
    if (saved) {
      setPaymentDrafts((current) => ({ ...current, [list.id]: { id: `payment_${createProcurementDeliveryId().slice(9)}`, date: new Date().toISOString().slice(0, 10), amount: '', reference: '', method: 'Cash', notes: '' } }));
    }
  };
  const handOverProcurementToFinance = (list: ProcurementList) => {
    if (!canApproveProcurement || !list.receivedAt || list.financeHandedOverAt) return; const financeReference = financeReferenceDrafts[list.id]?.trim() || '';
    if (!financeReference) { window.alert('Enter the invoice, receipt or finance voucher reference before handover.'); return; }
    saveProcurementList(list, { financeHandedOverAt: new Date().toISOString(), financeHandedOverBy: actorName, financeReference });
  };

  // Filtered Budgets
  const filteredBudgets = filterBudgetLines(budgets, budgetPeriodFilter, budgetCategoryFilter);
  const budgetSummaryYears = Array.from(new Set(budgets
    .map((line) => typeof line.period === 'string' ? line.period.slice(0, 4) : '')
    .filter((year) => /^\d{4}$/.test(year)))).sort((a, b) => b.localeCompare(a));
  const effectiveBudgetSummaryYear = budgetPeriodFilter !== 'ALL'
    ? budgetPeriodFilter.slice(0, 4)
    : budgetSummaryYears.includes(budgetSummaryYear)
      ? budgetSummaryYear
      : budgetSummaryYears.includes(String(new Date().getFullYear()))
        ? String(new Date().getFullYear())
        : budgetSummaryYears[0] || String(new Date().getFullYear());
  const summaryBudgets = filterBudgetLinesByYear(filteredBudgets, effectiveBudgetSummaryYear);

  const approvedAnnualBudgetTotal = annualBudgets.reduce((sum, plan) => sum + (plan.approvedAmount || 0), 0);

  // Budget Calculations
  const totalBudgeted = filteredBudgets.reduce((s, b) => s + (b.budgetAmount || 0), 0);
  const totalActual = filteredBudgets.reduce((s, b) => s + (b.actualExpenditure || 0), 0);
  const totalVariance = totalBudgeted - totalActual;
  const executionPercent = totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0;

  const workloadSummary = buildWorkloadSummary(workplans);
  const workplanHealthSummary = summarizeWorkplanHealth(workplans);
  const activityOverview = buildActivityOverview(workplans, schedules);
  const upcomingRangeEnd = useMemo(() => {
    const date = new Date();
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    return date.toISOString().slice(0, 10);
  }, []);
  const overloadedStaffIds = useMemo(
    () => findOverloadedStaff(workplans, new Date().toISOString().slice(0, 10), upcomingRangeEnd),
    [workplans, upcomingRangeEnd]
  );
  const forecastByMonth = calculateBudgetForecast(
    summaryBudgets,
    1 + ((db.forecastSettings?.[0]?.inflationPercent || 0) / 100)
  ).monthlyForecast || [];

  const upcomingActivityItems = [
    ...workplans
      .filter((plan) => !plan.recurrence && normalizeWorkplanStatus(plan.status) !== 'Completed' && normalizeWorkplanStatus(plan.status) !== 'Cancelled')
      .map((plan) => ({
        id: plan.id,
        label: plan.activity,
        when: plan.endDate || plan.startDate || 'TBD',
        owner: plan.responsibleStaffName || 'Unassigned',
        kind: 'workplan' as const,
        workplanId: plan.id,
        completed: (plan.completionDates || []).includes(plan.endDate),
      })),
    ...workplans
      .filter((plan) => plan.recurrence && normalizeWorkplanStatus(plan.status) !== 'Completed' && normalizeWorkplanStatus(plan.status) !== 'Cancelled')
      .flatMap((plan) => expandWorkplanOccurrences([plan], new Date().toISOString().slice(0, 10), upcomingRangeEnd)
        .map((occurrence) => ({
          id: occurrence.occurrenceId,
          label: plan.activity,
          when: occurrence.date,
          owner: plan.responsibleStaffName || 'Unassigned',
          kind: 'workplan' as const,
          workplanId: plan.id,
          completed: occurrence.completed,
        }))),
    ...schedules
      .filter((item) => item.status !== 'Completed' && item.status !== 'Cancelled')
      .map((item) => ({
        id: item.id,
        label: item.title,
        when: item.scheduledDate,
        owner: item.assignedStaffName || 'Unassigned',
        kind: 'schedule' as const,
        workplanId: undefined,
        completed: false,
      })),
  ].sort((a, b) => a.when.localeCompare(b.when));

  // Filtered Workplans
  const filteredWorkplans = workplans.filter((w) => {
    if (workplanStatusFilter !== 'ALL' && normalizeWorkplanStatus(w.status) !== workplanStatusFilter) return false;
    return true;
  });

  useEffect(() => {
    if (!qualityRecordFocus) return;
    if (qualityRecordFocus.kind === 'budget-item') {
      setActiveSubTab('budgets');
      setBudgetPeriodFilter('ALL');
      setBudgetCategoryFilter('ALL');
      setBudgetProgrammeId('');
    } else if (qualityRecordFocus.kind === 'workplan-item' || qualityRecordFocus.kind === 'indicator-result') {
      setActiveSubTab('workplans');
      setWorkplanStatusFilter('ALL');
    }
  }, [qualityRecordFocus?.kind, qualityRecordFocus?.id]);

  useEffect(() => {
    if (!qualityRecordFocus) return;
    const expectedTab = qualityRecordFocus.kind === 'budget-item' ? 'budgets' : 'workplans';
    if (activeSubTab !== expectedTab) return;
    const focusKey = `${qualityRecordFocus.kind}:${qualityRecordFocus.id}`;
    if (focusedQualityKey.current === focusKey) return;
    const recordExists = qualityRecordFocus.kind === 'budget-item'
      ? filteredBudgets.some((item) => item.id === qualityRecordFocus.id)
      : filteredWorkplans.some((item) => item.id === qualityRecordFocus.id);
    if (!recordExists) return;
    let highlightTimeout: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const record = document.getElementById(`quality-record-${encodeURIComponent(qualityRecordFocus.id)}`);
      if (!record) return;
      record.scrollIntoView({ behavior: 'smooth', block: 'center' });
      record.focus({ preventScroll: true });
      setHighlightedQualityId(qualityRecordFocus.id);
      focusedQualityKey.current = focusKey;
      highlightTimeout = window.setTimeout(() => {
        setHighlightedQualityId((current) => current === qualityRecordFocus.id ? null : current);
      }, 2000);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (highlightTimeout !== undefined) window.clearTimeout(highlightTimeout);
    };
  }, [
    qualityRecordFocus?.kind,
    qualityRecordFocus?.id,
    activeSubTab,
    budgetPeriodFilter,
    budgetCategoryFilter,
    workplanStatusFilter,
    budgets,
    workplans,
  ]);

  // Unique Periods and Categories
  const uniquePeriods = Array.from(new Set(budgets.map((b) => b.period).filter(Boolean)));
  const uniqueCategories = Array.from(new Set(budgets.map((b) => b.category).filter(Boolean)));

  const summaryPeriods = Array.from(new Set(summaryBudgets.map((line) => line.period).filter(Boolean)));
  const summaryCategories = Array.from(new Set(summaryBudgets.map((line) => line.category).filter(Boolean)));

  const monthlyBudgetSummary = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthLines = summaryBudgets.filter((line) => line.month === month);
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
    ? summaryCategories.map((key) => budgetSummary(key, summaryBudgets.filter((line) => line.category === key)))
    : budgetSummaryGroup === 'period'
    ? summaryPeriods.map((key) => budgetSummary(key, summaryBudgets.filter((line) => line.period === key)))
    : [...PROGRAMMES, ...LEGACY_PROGRAMMES].map((item) => budgetSummary(
      item.name,
      summaryBudgets.filter((line) => line.programmeId === item.id)
    )).filter((row) => row.budgeted || row.actual);

  const toggleWorkplanOccurrence = (workplanId: string, date: string, currentlyCompleted: boolean) => {
    const item = workplans.find((workplan) => workplan.id === workplanId);
    if (!item) return;
    const completionDates = new Set(item.completionDates || []);
    if (currentlyCompleted) completionDates.delete(date);
    else completionDates.add(date);
    try {
      const updated = updateWorkplanItem(workplanId, { completionDates: Array.from(completionDates).sort() }, actorName);
      if (!updated) {
        window.alert('Workplan was not deleted. It may no longer exist, or device storage may be unavailable. Refresh and retry.');
        return;
      }
      onRefresh();
    } catch (error) {
      window.alert(`Workplan completion was not saved: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
    }
  };

  // Handle Budget Form Submit
  const handleSaveBudget = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const period = (fd.get('period') as string).trim();
    const programme = (fd.get('programme') as string).trim() || 'Education & Support';
    const programmeIdValue = fd.get('programmeId');
    const programmeId = PROGRAMMES.find((item) => item.id === programmeIdValue)?.id;
    const selectedSeasonMonths = fd.getAll('seasonalMonths').map(Number).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);
    const seasonalMonths = selectedSeasonMonths.length ? Array.from(new Set(selectedSeasonMonths)) : undefined;
    const category = (fd.get('category') as BudgetCategory) || 'Education';
    const itemDescription = (fd.get('itemDescription') as string).trim();
    const quantity = parseFloat(fd.get('quantity') as string) || 1;
    const unit = (fd.get('unit') as string).trim() || 'Unit';
    const unitCost = parseFloat(fd.get('unitCost') as string) || 0;
    const budgetAmount = quantity * unitCost;
    const actualExpenditure = parseFloat(fd.get('actualExpenditure') as string) || 0;
    const notes = (fd.get('notes') as string).trim();

    try {
      if (editingBudget) {
        const updated = updateBudgetItem(
          editingBudget.id,
          {
            period,
            periodType: 'quarterly',
            programme,
            programmeId,
            seasonalMonths,
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
        if (!updated) {
          window.alert('Budget line was not deleted. It may no longer exist, or device storage may be unavailable. Refresh and retry.');
          return;
        }
      } else {
        addBudgetItem(
          {
            period,
            periodType: 'quarterly',
            programme,
            programmeId,
            seasonalMonths,
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
    } catch (error) {
      window.alert(`Budget changes were not saved: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
      return;
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

    try {
      if (editingAnnualBudget) {
        const updated = updateAnnualBudgetPlan(
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
        if (!updated) {
          window.alert('This annual budget plan could not be found. Refresh the page and try again.');
          return;
        }
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
    } catch (error) {
      window.alert(`Annual budget changes were not saved: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
      return;
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
    const recurrenceEvery = fd.get('recurrenceEvery') as NonNullable<WorkplanItem['recurrence']>['every'] | '';
    const recurrenceUntil = (fd.get('recurrenceUntil') as string).trim();
    const recurrence = recurrenceEvery ? { every: recurrenceEvery, ...(recurrenceUntil ? { until: recurrenceUntil } : {}) } : undefined;
    const progress = Math.min(100, Math.round((completedCount / targetCount) * 100));
    const responsibleStaffName = (fd.get('responsibleStaffName') as string).trim();
    const responsibleStaffId = staffProfile?.id || staffProfile?.uid || 'staff-1';
    const endDate = (fd.get('endDate') as string).trim();
    if (!endDate) return;
    const startDate = ((fd.get('startDate') as string).trim() || endDate);
    const location = (fd.get('location') as string).trim();
    const notes = (fd.get('notes') as string).trim();

    try {
      if (editingWorkplan) {
        const updated = updateWorkplanItem(
          editingWorkplan.id,
          {
            period,
            periodType: 'quarterly',
            programmeId,
            recurrence,
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
        if (!updated) {
          window.alert('This workplan could not be found. Refresh the page and try again.');
          return;
        }
      } else {
        addWorkplanItem(
          {
            period,
            periodType: 'quarterly',
            programmeId,
            recurrence,
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
    } catch (error) {
      window.alert(`Workplan changes were not saved: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
      return;
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

    try {
      if (editingSchedule) {
        const updated = updateScheduleItem(
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
        if (!updated) {
          window.alert('Schedule item was not deleted. It may no longer exist, or device storage may be unavailable. Refresh and retry.');
          return;
        }
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
    } catch (error) {
      window.alert(`Schedule changes were not saved: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
      return;
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
              <button
                onClick={() => setActiveSubTab('procurement')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeSubTab === 'procurement'
                    ? 'bg-teal-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                <ListTodo className="w-3.5 h-3.5" />
                Procurement ({procurementLists.length})
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
                    setBudgetProgrammeId('');
                    setSeasonalMonthsDraft([]);
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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Monthly budget monitoring · {effectiveBudgetSummaryYear}</p>
                <h3 className="text-base font-black text-stone-900">Budget vs Actual by month</h3>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                Summary year
                <select
                  aria-label="Budget summary year"
                  value={effectiveBudgetSummaryYear}
                  disabled={budgetPeriodFilter !== 'ALL' || budgetSummaryYears.length === 0}
                  onChange={(event) => setBudgetSummaryYear(event.target.value)}
                  className="rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1.5"
                >
                  {budgetSummaryYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {monthlyBudgetSummary.map(({ month, budgeted, actual, variance }) => (
                <div key={month} className="border border-stone-200 rounded-xl p-3 bg-stone-50">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-stone-500">
                    <span>{new Date(Number(effectiveBudgetSummaryYear), month - 1, 1).toLocaleString('en-US', { month: 'short' })}</span>
                    <span className={variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{variance >= 0 ? 'Surplus' : 'Shortfall'}</span>
                  </div>
                  <div className="mt-2 text-sm font-black text-stone-900">MWK {budgeted.toLocaleString()}</div>
                  <div className="mt-1 text-xs text-stone-500">Actual: MWK {actual.toLocaleString()}</div>
                  <div className={`mt-2 text-xs font-bold ${variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {variance >= 0 ? '+' : '-'}MWK {Math.abs(variance).toLocaleString()}
                  </div>
                  <div className="mt-1 text-[10px] text-stone-500">Seasonal forecast: MWK {Math.round(forecastByMonth[month - 1] || 0).toLocaleString()}</div>
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
                        <tr
                          key={b.id}
                          id={`quality-record-${encodeURIComponent(b.id)}`}
                          data-quality-record-id={b.id}
                          tabIndex={-1}
                          className={`hover:bg-stone-50 transition-colors ${highlightedQualityId === b.id ? 'outline outline-2 outline-offset-2 outline-amber-500' : ''}`}
                        >
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
                                    setBudgetProgrammeId(b.programmeId || '');
                                    setSeasonalMonthsDraft(b.seasonalMonths || []);
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
                                      if (!confirm(`Delete budget item "${b.itemDescription}"?`)) return;
                                      try {
                                        if (!deleteBudgetItem(b.id)) {
                                          window.alert('This budget line could not be found. Refresh the page and try again.');
                                          return;
                                        }
                                        onRefresh();
                                      } catch (error) {
                                        window.alert(`Budget line was not deleted: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
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
                    {item.kind === 'workplan' && item.workplanId && item.when !== 'TBD' && (
                      <button
                        type="button"
                        onClick={() => toggleWorkplanOccurrence(item.workplanId!, item.when, item.completed)}
                        className={`min-h-10 rounded-md border px-2 text-[10px] font-bold ${item.completed ? 'border-emerald-300 text-emerald-800' : 'border-stone-300 text-stone-600'}`}
                        title={item.completed ? 'Mark this occurrence incomplete' : 'Mark this occurrence done'}
                      >
                        {item.completed ? 'Done' : 'Mark done'}
                      </button>
                    )}
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
                          <div className="flex items-center gap-1.5 text-sm font-bold text-stone-900">
                            {staff.name}
                            {overloadedStaffIds.has(staff.id) && (
                              <span title={`More than ${MAX_WORKPLANS_PER_STAFF_PER_WEEK} workplan items are due in the same week.`} aria-label="High weekly workplan load">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                              </span>
                            )}
                          </div>
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
                  setWorkplanProgrammeId('');
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
                  <div
                    key={w.id}
                    id={`quality-record-${encodeURIComponent(w.id)}`}
                    data-quality-record-id={w.id}
                    tabIndex={-1}
                    className={`bg-white rounded-xl border border-stone-200 p-4 shadow-xs hover:border-teal-700 transition-all ${highlightedQualityId === w.id ? 'outline outline-2 outline-offset-2 outline-amber-500' : ''}`}
                  >
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
                              setWorkplanProgrammeId(w.programmeId || '');
                              setShowWorkplanModal(true);
                            }}
                            className="text-teal-800 hover:underline font-semibold"
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                if (!confirm(`Delete workplan "${w.activity}"?`)) return;
                                try {
                                  if (!deleteWorkplanItem(w.id)) {
                                    window.alert('This workplan could not be found. Refresh the page and try again.');
                                    return;
                                  }
                                  onRefresh();
                                } catch (error) {
                                  window.alert(`Workplan was not deleted: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
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
      {(activeSubTab === 'schedules' || activeSubTab === 'procurement') && (
        <div className="space-y-5">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                {activeSubTab === 'procurement' ? 'Procurement lists' : 'Operational Field Agenda'}
              </h3>
              <p className="text-xs text-stone-500">
                {activeSubTab === 'procurement'
                  ? 'Review item prices, supplier quotes, and budget attachments.'
                  : 'Upcoming home visits, school monitoring, health consultations and stakeholder activities'}
              </p>
            </div>
            {canEdit && activeSubTab === 'schedules' && (
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

            {activeSubTab === 'procurement' && (
              <section className="space-y-4" aria-label="Procurement lists">
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-stone-900">Imported procurement lists</h3>
                  <p className="mt-1 text-xs text-stone-600">
                    Unclear and missing prices remain flagged. Configure the quote threshold for each list; items above it should have three supplier quotes before approval.
                  </p>
                </div>
                {procurementLists.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                      <label className="text-xs font-semibold text-stone-700">Search procurement
                        <input aria-label="Search procurement lists" value={procurementSearch} onChange={(event) => setProcurementSearch(event.target.value)} placeholder="Title, item, supplier, PO or finance reference" className="field mt-1 w-full" />
                      </label>
                      <label className="text-xs font-semibold text-stone-700">Workflow status
                        <select aria-label="Filter procurement by status" value={procurementStatusFilter} onChange={(event) => setProcurementStatusFilter(event.target.value as 'All' | ProcurementList['status'])} className="field mt-1 w-full">
                          <option value="All">All statuses</option>
                          <option value="draft">Draft</option>
                          <option value="approved">Approved</option>
                          <option value="purchased">Purchased</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-stone-700">
                        Receipt &amp; finance stage
                        <select aria-label="Filter procurement by receipt and finance stage" value={procurementStageFilter} onChange={(event) => setProcurementStageFilter(event.target.value as ProcurementStageFilter)} className="field mt-1 w-full">
                          <option value="All">All receipt stages</option>
                          <option value="Awaiting receipt">Awaiting receipt</option>
                          <option value="Received - finance pending">Received · finance handover pending</option>
                          <option value="Handed to finance">Handed to finance</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p role="status" className="text-xs text-stone-500">{filteredProcurementLists.length} of {procurementLists.length} procurement lists shown</p>
                      {(procurementSearch || procurementStatusFilter !== 'All' || procurementStageFilter !== 'All') && <button type="button" onClick={() => { setProcurementSearch(''); setProcurementStatusFilter('All'); setProcurementStageFilter('All'); }} className="min-h-10 rounded-lg border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50">Clear filters</button>}
                    </div>
                  </div>
                )}
                {procurementLists.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
                    No procurement lists have been imported yet.
                  </div>
                ) : filteredProcurementLists.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-600">
                    No procurement lists match these filters. Clear the filters or try another search.
                  </div>
                ) : filteredProcurementLists.map((list) => (
                  <article key={list.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 p-4">
                      <div>
                        <h4 className="text-sm font-bold text-stone-900">{list.title}</h4>
                        <p className="mt-1 text-xs text-stone-600">{list.purpose} · {list.items.length} items · {list.status}</p>
                      </div>
                      <label className="text-xs font-semibold text-stone-700">
                        Three-quote threshold (MWK)
                        <input
                          type="number"
                          min="0"
                          disabled={!canEdit || list.status !== 'draft'}
                          className="field mt-1 w-44"
                          value={list.quoteThresholdMWK ?? DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK}
                          onChange={(event) => saveProcurementList(list, { quoteThresholdMWK: Math.max(0, Number(event.target.value) || 0) })}
                        />
                      </label>
                    </header>
                    <div className="divide-y divide-stone-100">
                      {list.items.map((item, index) => {
                        const itemTotal = item.totalMWK ?? (
                          item.unitPriceMWK === undefined ? undefined : item.unitPriceMWK * item.quantity
                        );
                        const quoteRequired = (itemTotal !== undefined && itemTotal >= (list.quoteThresholdMWK ?? DEFAULT_PROCUREMENT_QUOTE_THRESHOLD_MWK)) || item.quoteRequirementReason === 'price-unknown';
                        // Unknown/unclear prices need supplier quotes to establish a price even before the threshold can be evaluated.
                        const quoteCollectionAvailable = quoteRequired || item.priceStatus !== 'quoted';
                        const draftKey = `${list.id}:${index}`;
                        const draft = quoteDrafts[draftKey] || { supplier: '', amount: '' };
                        let savedReceiptIntent = null;
                        try {
                          if (staffProfile?.uid && typeof window !== 'undefined') {
                            savedReceiptIntent = readProcurementReceiptIntent(window.localStorage, staffProfile.uid, list.id);
                          }
                        } catch { /* Receipt submission will fail closed if browser storage is unavailable. */ }
                        const savedReceiptLine = savedReceiptIntent?.lines.find((line) => line.itemIndex === index);
                        const receiptChoiceKey = `${list.id}:${index}`;
                        const receiptChoice = receiptLineChoices[receiptChoiceKey] ??
                          (savedReceiptLine ? (savedReceiptLine.inventoryItemId || NOT_INVENTORY_TRACKED) : '');
                        return (
                          <div key={`${list.id}-${item.itemNumber || index}`} className="grid gap-2 p-4 lg:grid-cols-[1.2fr_0.6fr_0.9fr_1fr]">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-stone-900">{item.itemNumber ? `${item.itemNumber}. ` : ''}{item.description}</p>
                              <p className="mt-1 text-[11px] text-stone-600">
                                {item.quantity} {item.unit}{item.specification ? ` · ${item.specification}` : ''}
                              </p>
                              {item.note && <p className="mt-1 text-[11px] font-semibold text-amber-900">{item.note}</p>}
                              {list.status === 'purchased' && !list.receivedAt && (
                                <label className="mt-2 block text-[11px] font-semibold text-stone-700">
                                  Inventory receipt link
                                  <select
                                    aria-label={`Inventory receipt link for ${item.description}`}
                                    className="field mt-1 w-full"
                                    disabled={!canEdit || Boolean(savedReceiptIntent) || Boolean(receiptPosting[list.id])}
                                    value={receiptChoice}
                                    onChange={(event) => setReceiptLineChoices((current) => ({ ...current, [receiptChoiceKey]: event.target.value }))}
                                  >
                                    <option value="">Choose before confirming receipt</option>
                                    <option value={NOT_INVENTORY_TRACKED}>Not inventory tracked</option>
                                    {(db.inventoryItems || []).map((stockItem) => (
                                      <option key={stockItem.id} value={stockItem.id} disabled={stockItem.unit !== item.unit}>{stockItem.stockCode} · {stockItem.name} ({stockItem.unit}){stockItem.unit !== item.unit ? ' · unit mismatch' : ''}</option>
                                    ))}
                                  </select>
                                  {savedReceiptIntent && <span className="mt-1 block font-normal text-amber-900">Saved full-receipt retry intent; keep this selection unchanged until it completes.</span>}
                                </label>
                              )}
                              {list.status === 'purchased' && !list.receivedAt && (
                                <p className="mt-2 text-[11px] text-stone-600">Received so far: {getProcurementDeliveredQuantity(list, index)} / {item.quantity} {item.unit}. Outstanding: {getProcurementOutstandingQuantity(list, index)} {item.unit}.</p>
                              )}
                              )}
                            </div>
                            <div className="text-xs">
                              <p className={`font-bold ${item.priceStatus === 'quoted' ? 'text-stone-800' : 'text-amber-900'}`}>
                                {item.priceStatus === 'quoted' ? formatMWK(itemTotal || 0) : item.priceStatus === 'unclear' ? 'Price unclear' : 'Missing price'}
                              </p>
                              {quoteRequired && <p className="mt-1 text-[11px] text-amber-900">Three quotes required: {item.quotes?.length || 0}/3</p>}
                              {item.priceStatus !== 'quoted' && !quoteRequired && <p className="mt-1 text-[11px] text-amber-900">Collect supplier quotes to establish the price: {item.quotes?.length || 0}/3</p>}
                              {item.priceStatus !== 'quoted' && (item.quotes?.length || 0) >= 3 && <p className="mt-1 text-[11px] text-stone-600">Three supplier prices captured; price selection and approval remain outstanding.</p>}
                            </div>
                            <label className="text-[11px] font-semibold text-stone-700">
                              Attach to budget line
                              <select
                                disabled={!canEdit || list.status !== 'draft'}
                                value={item.budgetLineId || ''}
                                onChange={(event) => updateProcurementItem(list, index, { budgetLineId: event.target.value || undefined })}
                                className="field mt-1 w-full"
                              >
                                <option value="">Not attached</option>
                                {budgets.map((budget) => (
                                  <option key={budget.id} value={budget.id}>{budget.itemDescription} · {budget.period}</option>
                                ))}
                              </select>
                            </label>
                            <div className="space-y-1">
                              {(item.quotes || []).map((quote, quoteIndex) => (
                                <div key={`${quote.supplier}-${quoteIndex}`} className="flex items-center justify-between gap-2 text-[11px] text-stone-700">
                                  <span>{quote.supplier}: {formatMWK(quote.amountMWK)}{item.selectedQuoteSupplier === quote.supplier ? ' · Selected' : ''}</span>
                                  {canEdit && list.status === 'draft' && <button type="button" onClick={() => { try { updateProcurementItem(list, index, selectProcurementQuote(item, quote)); } catch (error) { window.alert(error instanceof Error ? error.message : 'Unable to select this quote.'); } }} className="rounded border border-stone-300 px-2 py-1 font-semibold hover:bg-stone-100">Select</button>}
                                </div>
                              ))}
                              {canEdit && list.status === 'draft' && quoteCollectionAvailable && (item.quotes?.length || 0) < 3 && (
                                <div className="flex gap-1">
                                  <input
                                    aria-label="Quote supplier"
                                    placeholder="Supplier"
                                    className="field min-w-0"
                                    value={draft.supplier}
                                    onChange={(event) => setQuoteDrafts((current) => ({
                                      ...current, [draftKey]: { ...draft, supplier: event.target.value },
                                    }))}
                                  />
                                  <input
                                    aria-label="Quote amount in MWK"
                                    type="number"
                                    min="1"
                                    placeholder="MWK"
                                    className="field w-24"
                                    value={draft.amount}
                                    onChange={(event) => setQuoteDrafts((current) => ({
                                      ...current, [draftKey]: { ...draft, amount: event.target.value },
                                    }))}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => addProcurementQuote(list, index)}
                                    className="rounded-md bg-teal-800 px-2 text-[11px] font-bold text-white"
                                  >
                                    Add
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <footer className="space-y-3 border-t border-stone-200 bg-stone-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-stone-800"><span>Quoted subtotal: {formatMWK(list.items.reduce((sum, item) => sum + (item.totalMWK ?? ((item.unitPriceMWK || 0) * item.quantity)), 0))}</span><span>Workflow: {list.status}{list.approvedBy ? ` · approved by ${list.approvedBy}` : ''}</span></div>
                      {list.status === 'draft' && canApproveProcurement && <div className="space-y-2"><button type="button" onClick={() => approveProcurementList(list)} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white hover:bg-teal-900">Validate &amp; approve</button><p className="text-[11px] text-stone-600">Approval checks item prices, quantities and the three-quote threshold.</p></div>}
                      {list.status === 'approved' && canApproveProcurement && <div className="flex flex-wrap items-end gap-2"><label className="min-w-48 flex-1 text-[11px] font-semibold text-stone-700">Purchase order / order reference<input aria-label="Purchase order reference" className="field mt-1 w-full" value={purchaseOrderDrafts[list.id] ?? list.purchaseOrderReference ?? ''} onChange={(event) => setPurchaseOrderDrafts((current) => ({ ...current, [list.id]: event.target.value }))} /></label><button type="button" onClick={() => markProcurementPurchased(list)} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white hover:bg-teal-900">Record order</button></div>}
                      {list.status === 'purchased' && <div className="space-y-2"><p className="text-[11px] text-stone-700">Order reference: <strong>{list.purchaseOrderReference || 'Not recorded'}</strong>{list.orderedAt ? ` · ordered ${formatDate(list.orderedAt.slice(0, 10))} by ${list.orderedBy || 'staff'}` : ''}</p>
                        {!list.receivedAt ? (canEdit && !(list.deliveries || []).length && <div className="space-y-1"><p className="text-[11px] text-stone-600">Legacy full-receipt option: use only if every ordered quantity has arrived. To record a partial delivery, use the delivery form below; do not mix workflows.</p><button type="button" disabled={Boolean(receiptPosting[list.id])} onClick={() => void confirmProcurementReceipt(list)} className="rounded-lg border border-teal-800 px-3 py-2 text-xs font-bold text-teal-900 hover:bg-teal-50 disabled:opacity-60">{receiptPosting[list.id] ? 'Posting receipt movements…' : 'Confirm full receipt & post stock'}</button>{(list.deliveries || []).length > 0 && <p className="text-[11px] font-semibold text-amber-900">Partial deliveries have started. Continue using the delivery history workflow below.</p>}</div>) : <div><p className="text-[11px] font-semibold text-emerald-800">Received {formatDate(list.receivedAt.slice(0, 10))} · recorded by {list.receivedBy || 'staff'}</p><p className="text-[11px] text-stone-600">Linked inventory movements visible in the synced register: {(db.inventoryItems || []).reduce((count, stockItem) => count + stockItem.movements.filter((movement) => movement.sourceType === 'procurementReceipt' && movement.sourceId === list.id).length, 0)}</p></div>}
                        {receiptPostingStatus[list.id] && <p role="status" className={`text-[11px] ${receiptPostingStatus[list.id].startsWith('Receipt recorded') || receiptPostingStatus[list.id].startsWith('Receipt acknowledgement') ? 'font-semibold text-emerald-800' : 'font-semibold text-rose-800'}`}>{receiptPostingStatus[list.id]}</p>}
                        {list.receivedAt && !list.financeHandedOverAt && canApproveProcurement && <div className="flex flex-wrap items-end gap-2"><label className="min-w-48 flex-1 text-[11px] font-semibold text-stone-700">Invoice / receipt / voucher reference<input aria-label="Finance handover reference" className="field mt-1 w-full" value={financeReferenceDrafts[list.id] ?? ''} onChange={(event) => setFinanceReferenceDrafts((current) => ({ ...current, [list.id]: event.target.value }))} /></label><button type="button" onClick={() => handOverProcurementToFinance(list)} className="rounded-lg bg-stone-800 px-3 py-2 text-xs font-bold text-white hover:bg-stone-900">Hand over to finance</button></div>}
                        {list.financeHandedOverAt && <p className="text-[11px] font-semibold text-emerald-800">Finance handover recorded {formatDate(list.financeHandedOverAt.slice(0, 10))} · {list.financeReference} · {list.financeHandedOverBy}</p>}
                        <section className="mt-3 space-y-2 rounded-lg border border-stone-200 bg-white p-3">
                          <h5 className="text-xs font-bold text-stone-900">Delivery history</h5>
                          {(list.deliveries || []).length === 0 ? <p className="text-[11px] text-stone-600">No partial deliveries recorded yet.</p> : (list.deliveries || []).map((delivery) => (
                            <div key={delivery.id} className="rounded border border-stone-100 p-2 text-[11px] text-stone-700">
                              <p className="font-semibold">{formatDate(delivery.date)} · {delivery.reference} · {delivery.recordedBy}</p>
                              {delivery.lines.map((line) => <p key={line.itemIndex}>{list.items[line.itemIndex]?.description || `Line ${line.itemIndex + 1}`}: {line.quantity} {list.items[line.itemIndex]?.unit || ''}</p>)}
                            </div>
                          ))}
                          {!list.receivedAt && canEdit && <div className="space-y-2 border-t border-stone-200 pt-3">
                            {(() => {
                              let pending = null;
                              try { if (staffProfile?.uid && typeof window !== 'undefined') pending = readProcurementDeliveryIntent(window.localStorage, staffProfile.uid, list.id); } catch { /* Posting fails closed if storage is unavailable. */ }
                              const draft = deliveryDrafts[list.id] || { id: '', date: new Date().toISOString().slice(0, 10), reference: '', quantities: list.items.map(() => '0') };
                              return <>
                                <p className="text-[11px] text-stone-600">Record each delivery separately. Enter zero for lines not received. Quantities cannot exceed each line’s outstanding balance.</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <label className="text-[11px] font-semibold">Delivery date<input type="date" className="field mt-1 w-full" disabled={Boolean(pending) || Boolean(deliveryPosting[list.id])} value={pending?.date || draft.date} onChange={(event) => setDeliveryDrafts((current) => ({ ...current, [list.id]: { ...draft, date: event.target.value } }))} /></label>
                                  <label className="text-[11px] font-semibold">Delivery note / supplier reference<input className="field mt-1 w-full" disabled={Boolean(pending) || Boolean(deliveryPosting[list.id])} value={pending?.reference || draft.reference} onChange={(event) => setDeliveryDrafts((current) => ({ ...current, [list.id]: { ...draft, reference: event.target.value } }))} placeholder="Delivery note number" /></label>
                                </div>
                                {list.items.map((item, index) => <label key={index} className="flex items-center justify-between gap-2 text-[11px]"><span>{item.description}<span className="block text-stone-500">Outstanding: {getProcurementOutstandingQuantity(list, index)} {item.unit}</span></span><input type="number" min="0" max={getProcurementOutstandingQuantity(list, index)} step="any" disabled={Boolean(pending) || Boolean(deliveryPosting[list.id])} className="field w-28" value={pending?.quantities[index] ?? draft.quantities[index] ?? '0'} onChange={(event) => setDeliveryDrafts((current) => ({ ...current, [list.id]: { ...draft, quantities: list.items.map((_, i) => i === index ? event.target.value : (draft.quantities[i] ?? '0')) } }))} /></label>)}
                                {!draft.id && !pending && <button type="button" className="rounded border border-stone-300 px-3 py-2 text-xs font-semibold" onClick={() => setDeliveryDrafts((current) => ({ ...current, [list.id]: { ...draft, id: createProcurementDeliveryId() } }))}>Start delivery record</button>}
                                <button type="button" disabled={Boolean(deliveryPosting[list.id]) || (!pending && !draft.id)} onClick={() => void recordProcurementDelivery(list)} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{deliveryPosting[list.id] ? 'Posting delivery…' : pending ? 'Retry saved delivery' : 'Record delivery & post stock'}</button>
                                {pending && <p className="text-[11px] font-semibold text-amber-900">A saved delivery is awaiting confirmation. Its quantities and reference are locked until the retry completes.</p>}
                              </>;
                            })()}
                          </div>}
                          {list.receivedAt && <p className="text-[11px] font-semibold text-emerald-800">All ordered quantities recorded as received on {formatDate(list.receivedAt.slice(0, 10))}.</p>}
                        </section>
                        <section className="mt-3 space-y-2 rounded-lg border border-stone-200 bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-xs font-bold text-stone-900">Payment reconciliation</h5><span className="text-[11px] font-semibold">Paid: {formatMWK(getProcurementPaymentSummary(list).paidMWK)} · Outstanding: {formatMWK(getProcurementPaymentSummary(list).outstandingMWK)}</span></div>
                          {(list.payments || []).map((payment) => <div key={payment.id} className="rounded border border-stone-100 p-2 text-[11px] text-stone-700"><p className="font-semibold">{formatDate(payment.date)} · {formatMWK(payment.amountMWK)} · {payment.reference}</p><p>{payment.method || 'Method not recorded'} · recorded by {payment.recordedBy}</p>{payment.notes && <p>{payment.notes}</p>}</div>)}
                          {canApproveProcurement && getProcurementPaymentSummary(list).outstandingMWK > 0 && <div className="space-y-2 border-t border-stone-200 pt-3">
                            {(() => {
                              const draft = paymentDrafts[list.id];
                              return !draft ? <button type="button" className="rounded border border-stone-300 px-3 py-2 text-xs font-semibold" onClick={() => setPaymentDrafts((current) => ({ ...current, [list.id]: { id: `payment_${createProcurementDeliveryId().slice(9)}`, date: new Date().toISOString().slice(0, 10), amount: '', reference: '', method: 'Cash', notes: '' } }))}>Start payment record</button> : <>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <label className="text-[11px] font-semibold">Payment date<input type="date" className="field mt-1 w-full" value={draft.date} onChange={(event) => setPaymentDrafts((current) => ({ ...current, [list.id]: { ...draft, date: event.target.value } }))} /></label>
                                  <label className="text-[11px] font-semibold">Amount (MWK)<input type="number" min="1" max={getProcurementPaymentSummary(list).outstandingMWK} className="field mt-1 w-full" value={draft.amount} onChange={(event) => setPaymentDrafts((current) => ({ ...current, [list.id]: { ...draft, amount: event.target.value } }))} /></label>
                                  <label className="text-[11px] font-semibold">Payment reference<input className="field mt-1 w-full" value={draft.reference} onChange={(event) => setPaymentDrafts((current) => ({ ...current, [list.id]: { ...draft, reference: event.target.value } }))} placeholder="Voucher / transaction reference" /></label>
                                  <label className="text-[11px] font-semibold">Method<select className="field mt-1 w-full" value={draft.method} onChange={(event) => setPaymentDrafts((current) => ({ ...current, [list.id]: { ...draft, method: event.target.value as typeof draft.method } }))}><option>Cash</option><option>Bank transfer</option><option>Mobile money</option><option>Cheque</option><option>Other</option></select></label>
                                </div>
                                <label className="block text-[11px] font-semibold">Notes<textarea className="field mt-1 w-full" value={draft.notes} onChange={(event) => setPaymentDrafts((current) => ({ ...current, [list.id]: { ...draft, notes: event.target.value } }))} /></label>
                                <button type="button" disabled={Boolean(paymentPosting[list.id])} onClick={() => recordProcurementPayment(list)} className="rounded-lg bg-stone-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{paymentPosting[list.id] ? 'Saving payment…' : 'Record payment'}</button>
                              </>;
                            })()}
                          </div>}
                          {getProcurementPaymentSummary(list).outstandingMWK === 0 && <p className="text-[11px] font-semibold text-emerald-800">Procurement amount fully reconciled to recorded payments.</p>}
                        </section>
                      </div>}
                    </footer>
                  </article>
                ))}
              </section>
            )}
          </div>

          {activeSubTab === 'schedules' && (
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
                            if (!confirm(`Delete schedule "${s.title}"?`)) return;
                            try {
                              if (!deleteScheduleItem(s.id)) {
                                window.alert('This schedule item could not be found. Refresh the page and try again.');
                                return;
                              }
                              onRefresh();
                            } catch (error) {
                              window.alert(`Schedule item was not deleted: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
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
          )}
        </div>
      )}

      <PlanningModals
        actorName={actorName}
        showAnnualBudgetModal={showAnnualBudgetModal}
        setShowAnnualBudgetModal={setShowAnnualBudgetModal}
        editingAnnualBudget={editingAnnualBudget}
        handleSaveAnnualBudget={handleSaveAnnualBudget}
        showBudgetModal={showBudgetModal}
        setShowBudgetModal={setShowBudgetModal}
        editingBudget={editingBudget}
        handleSaveBudget={handleSaveBudget}
        budgetProgrammeId={budgetProgrammeId}
        setBudgetProgrammeId={setBudgetProgrammeId}
        seasonalMonthsDraft={seasonalMonthsDraft}
        setSeasonalMonthsDraft={setSeasonalMonthsDraft}
        showWorkplanModal={showWorkplanModal}
        setShowWorkplanModal={setShowWorkplanModal}
        editingWorkplan={editingWorkplan}
        handleSaveWorkplan={handleSaveWorkplan}
        workplanProgrammeId={workplanProgrammeId}
        setWorkplanProgrammeId={setWorkplanProgrammeId}
        showScheduleModal={showScheduleModal}
        setShowScheduleModal={setShowScheduleModal}
        editingSchedule={editingSchedule}
        handleSaveSchedule={handleSaveSchedule}
      />
    </div>
  );
};
