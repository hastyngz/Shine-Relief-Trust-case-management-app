import React, { useState } from 'react';
import { Activity, Wallet } from 'lucide-react';
import type { AppDatabase } from '../types';
import { getLocalDateInputValue, isValidInventoryDate } from '../utils/inventory';
import { useAuth } from '../contexts/AuthContext';
import { updateExpense } from '../utils/storage';

interface Props { db: AppDatabase; mode: 'performance' | 'finance'; }
const card = 'rounded-2xl border border-stone-200 bg-white p-4';
const mwk = (n: number) => 'MWK ' + Math.round(n || 0).toLocaleString();

export const AdministrationOversightView: React.FC<Props> = ({ db, mode }) => {
  const { isAdmin, staffProfile, currentUser } = useAuth();
  const managerOrAdmin = Boolean(isAdmin || staffProfile?.role === 'Manager');
  const today = getLocalDateInputValue();
  const period = today.slice(0, 7);
  const [settlingExpenseId, setSettlingExpenseId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [settlementError, setSettlementError] = useState('');
  const [settlementNotice, setSettlementNotice] = useState('');

  const schedules = db.schedules || [];
  const completed = schedules.filter((item) => item.status === 'Completed').length;
  const open = schedules.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).length;
  const overdue = schedules.filter((item) => item.scheduledDate < today && !['Completed', 'Cancelled'].includes(item.status)).length;
  const completion = schedules.length ? Math.round((completed / schedules.length) * 100) : null;
  const activeStaff = (db.employees || []).filter((employee) => employee.employmentStatus === 'Active').length;
  const budgets = (db.budgets || []).filter((item) => item.period === period);
  const budget = budgets.reduce((total, item) => total + (Number(item.budgetAmount) || 0), 0);
  const budgetActual = budgets.reduce((total, item) => total + (Number(item.actualExpenditure) || 0), 0);
  const expenses = (db.expenses || []).filter((expense) => expense.date.startsWith(period));
  const expenseActual = expenses.reduce((total, expense) => total + (Number(expense.totalCost) || 0), 0);
  const assetMaintenanceExpenses = expenses.filter((expense) => expense.sourceType === 'asset_maintenance');
  const assetMaintenanceTotal = assetMaintenanceExpenses.reduce((total, expense) => total + (Number(expense.totalCost) || 0), 0);
  const unpaid = (db.expenses || []).filter((expense) => expense.paymentStatus === 'Payment Outstanding');
  const unpaidTotal = unpaid.reduce((total, expense) => total + (Number(expense.amountDue ?? expense.totalCost) || 0), 0);
  const registerIds = new Set(expenses.map((expense) => expense.id));
  const financeRegister = [
    ...expenses,
    ...unpaid.filter((expense) => !registerIds.has(expense.id)),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const handover = (db.procurementLists || []).filter((item) => item.status === 'purchased' && !item.financeHandedOverAt);
  const transportTrips = schedules.filter((item) => item.type === 'transport_trip' && item.scheduledDate.startsWith(period));
  const transportFuel = transportTrips.reduce((total, item) => total + (item.transportDetails?.fuelCostMWK || 0), 0);

  const settleExpense = (expenseId: string) => {
    if (!isValidInventoryDate(paymentDate) || paymentDate > today) {
      setSettlementError('Enter a valid payment date that is not in the future.');
      return;
    }
    if (!paymentMethod.trim()) {
      setSettlementError('Select a payment method.');
      return;
    }
    const expense = (db.expenses || []).find((item) => item.id === expenseId);
    if (!expense || expense.paymentStatus !== 'Payment Outstanding') {
      setSettlementError('This outstanding expense has changed. Refresh the Finance view before trying again.');
      return;
    }
    const actor = staffProfile?.fullName || currentUser?.displayName || currentUser?.email || 'SHINE Finance';
    try {
      const updated = updateExpense(expenseId, {
        paymentStatus: 'Paid',
        amountDue: 0,
        datePaid: paymentDate,
        paymentMethod: paymentMethod.trim(),
        paymentReference: paymentReference.trim() || undefined,
      }, actor);
      if (!updated) throw new Error('This expense could not be found. Refresh the Finance view and try again.');
      setSettlementError('');
      setSettlementNotice('Payment details saved on this device. Check the Sync indicator for server confirmation.');
      setSettlingExpenseId(null);
      setPaymentReference('');
      setPaymentMethod('');
    } catch (error) {
      setSettlementError(error instanceof Error ? error.message : 'Could not update the payment record.');
    }
  };

  if (!managerOrAdmin) return <main className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">This administration summary is restricted to managers and administrators.</main>;

  if (mode === 'performance') return <main className="mx-auto max-w-6xl space-y-5 px-1 pb-8">
    <header className="rounded-3xl bg-gradient-to-r from-teal-950 to-emerald-800 p-5 text-white">
      <div className="flex items-center gap-3"><Activity className="h-7 w-7 text-amber-300" /><div><p className="text-xs font-bold uppercase tracking-widest text-amber-200">Administration · Oversight</p><h1 className="text-2xl font-bold">Administrative Performance</h1></div></div>
      <p className="mt-2 text-sm text-teal-50">Record-based operational indicators from SHINE data currently loaded on this device. These are not independently verified staff appraisals.</p>
    </header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ['Active employees', activeStaff], ['Completed tasks', completed], ['Open tasks', open], ['Overdue tasks', overdue],
      ].map(([label, value]) => <div key={String(label)} className={card}><p className="text-xs text-stone-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
    </div>
    <section className={card}>
      <h2 className="font-bold">Operational performance indicators</h2>
      <div className="mt-3 divide-y divide-stone-100">
        {[
          ['Schedule completion rate', completion === null ? 'Not available — no schedule records' : completion + '%'],
          ['Meetings recorded', (db.meetings || []).length],
          ['Workplans recorded', (db.workplans || []).length],
          ['Household activities recorded', db.householdActivities.length],
          ['Compliance obligations overdue', schedules.filter((item) => Boolean(item.complianceCategory) && item.scheduledDate < today && !['Completed', 'Cancelled'].includes(item.status)).length],
        ].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3 py-3 text-sm"><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Coverage warning: indicators use entered records only. Unsynchronised, missing or unrecorded work can distort results. Targets, denominators and weighting must be approved by management before formal performance assessment.</p>
    </section>
  </main>;

  return <main className="mx-auto max-w-6xl space-y-5 px-1 pb-8">
    <header className="rounded-3xl bg-gradient-to-r from-teal-950 to-emerald-800 p-5 text-white">
      <div className="flex items-center gap-3"><Wallet className="h-7 w-7 text-amber-300" /><div><p className="text-xs font-bold uppercase tracking-widest text-amber-200">Administration · Finance</p><h1 className="text-2xl font-bold">Finance Administration</h1></div></div>
      <p className="mt-2 text-sm text-teal-50">Review budget allocations, expense records, unpaid commitments and procurement handovers. Managers and Administrators can record a payment after checking its supporting evidence; this does not independently verify a bank or mobile-money transaction.</p>
    </header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ['Monthly budget', mwk(budget)], ['Budget actuals', mwk(budgetActual)],
        ['Expense entries', expenses.length], ['Outstanding invoices', mwk(unpaidTotal)],
      ].map(([label, value]) => <div key={String(label)} className={card}><p className="text-xs text-stone-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}
    </div>
    <section className={card}>
      <h2 className="font-bold">Finance follow-up · {period}</h2>
      <div className="mt-3 divide-y divide-stone-100">
        {[
          ['Expense actuals this month (includes asset maintenance)', mwk(expenseActual)],
          ['Asset maintenance entries', assetMaintenanceExpenses.length],
          ['Asset maintenance costs (included above)', mwk(assetMaintenanceTotal)],
          ['Transport fuel recorded this month', mwk(transportFuel)],
          ['Transport trips recorded this month', transportTrips.length],
          ['Purchased lists awaiting finance handover', handover.length],
          ['Invoices requiring payment follow-up', unpaid.length],
          ['Budget variance (budget actuals less budget)', mwk(budgetActual - budget)],
        ].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3 py-3 text-sm"><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </section>
    <section className={card}>
      <h2 className="font-bold">Expense and invoice register</h2>
      <p className="mt-1 text-xs text-stone-500">Shows this month's expenses plus older unpaid entries. Asset maintenance expenses are included once in the monthly expense total above. Records without an invoice reference remain visible as expense entries and are not assumed to have supporting invoices.</p>
      {settlementNotice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">{settlementNotice}</p>}
      {financeRegister.length === 0 ? <p className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No expense entries were recorded for this month and there are no older unpaid expenses.</p> :
        <div className="mt-3 divide-y divide-stone-100">
          {financeRegister.map((expense) => <div key={expense.id} className="py-3 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{expense.itemDescription}</p>
                <p className="text-xs text-stone-500">
                  {expense.date}{expense.supplier ? ' · ' + expense.supplier : ''}
                  {expense.invoiceReference ? ' · Invoice ' + expense.invoiceReference : ' · No invoice reference'}
                  {expense.sourceType === 'asset_maintenance' ? ' · Asset maintenance' : ''}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="font-bold">{mwk(expense.totalCost)}</p>
                <p className={expense.paymentStatus === 'Paid' ? 'text-xs text-emerald-800' : expense.paymentStatus === 'Payment Outstanding' ? 'text-xs text-amber-800' : 'text-xs text-stone-500'}>{expense.paymentStatus || 'Payment status not recorded'}</p>
                {expense.paymentStatus === 'Paid' && expense.datePaid && <p className="text-xs text-stone-500">Paid {expense.datePaid}{expense.paymentReference ? ' · ' + expense.paymentReference : ''}</p>}
              </div>
            </div>
            {expense.paymentStatus === 'Payment Outstanding' && (settlingExpenseId === expense.id ?
              <form className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); settleExpense(expense.id); }}>
                <label className="text-xs font-semibold text-stone-600">Payment date<input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm" /></label>
                <label className="text-xs font-semibold text-stone-600">Payment method
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm">
                    <option value="">Select payment method</option><option>Bank transfer</option><option>Cash</option><option>Mobile money</option><option>Cheque</option><option>Other</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-stone-600 sm:col-span-2">Payment / bank / voucher reference (recommended)<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Receipt, transaction or voucher reference" className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm" /></label>
                {settlementError && <p role="alert" className="text-xs text-red-700 sm:col-span-2">{settlementError}</p>}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" className="min-h-10 rounded-lg bg-teal-800 px-3 text-xs font-bold text-white">Confirm payment recorded</button>
                  <button type="button" onClick={() => { setSettlingExpenseId(null); setSettlementError(''); }} className="min-h-10 rounded-lg border border-stone-300 px-3 text-xs font-semibold">Cancel</button>
                </div>
              </form> :
              <button type="button" onClick={() => { setSettlingExpenseId(expense.id); setPaymentDate(today); setPaymentMethod(''); setSettlementError(''); setSettlementNotice(''); }} className="mt-2 min-h-9 rounded-lg border border-teal-200 px-3 text-xs font-semibold text-teal-900">Record payment</button>
            )}
          </div>)}
        </div>
      }
      <p className="mt-3 text-xs text-stone-500">Only record a payment after checking the receipt, bank transaction or cash voucher. Payment-status changes are recorded in the expense history and follow the offline sync queue.</p>
    </section>
    <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Budget actuals and expense entries are separate source figures and must not be added together. Compare them with supporting invoices, receipts and bank/cash records. Procurement receipts are not proof of payment. This view is an operational reconciliation aid, not a signed financial statement, petty-cash book or bank reconciliation.</p>
  </main>;
};
