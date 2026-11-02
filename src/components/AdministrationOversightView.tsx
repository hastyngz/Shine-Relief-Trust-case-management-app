import React, { useState } from 'react';
import { Activity, Wallet } from 'lucide-react';
import type { AppDatabase } from '../types';
import { getLocalDateInputValue } from '../utils/inventory';
import { useAuth } from '../contexts/AuthContext';
import { updateExpense } from '../utils/storage';
import { isValidInventoryDate } from '../utils/inventory';

interface Props { db: AppDatabase; mode: 'performance' | 'finance'; }
const card='rounded-2xl border border-stone-200 bg-white p-4';
const mwk=(n:number)=>'MWK '+Math.round(n||0).toLocaleString();

export const AdministrationOversightView: React.FC<Props> = ({db,mode}) => {
 const { isAdmin, staffProfile, currentUser } = useAuth();
 const managerOrAdmin = Boolean(isAdmin || staffProfile?.role === 'Manager');
 const today=getLocalDateInputValue(), period=today.slice(0,7);
 const [settlingExpenseId,setSettlingExpenseId]=useState<string|null>(null);
 const [paymentDate,setPaymentDate]=useState(today);
 const [paymentMethod,setPaymentMethod]=useState('Bank transfer');
 const [paymentReference,setPaymentReference]=useState('');
 const [settlementError,setSettlementError]=useState('');
 const schedules=db.schedules||[], completed=schedules.filter(s=>s.status==='Completed').length;
 const open=schedules.filter(s=>!['Completed','Cancelled'].includes(s.status)).length;
 const overdue=schedules.filter(s=>s.scheduledDate<today&&!['Completed','Cancelled'].includes(s.status)).length;
 const completion=schedules.length?Math.round(completed/schedules.length*100):null;
 const activeStaff=(db.employees||[]).filter(e=>e.employmentStatus==='Active').length;
 const budgets=(db.budgets||[]).filter(b=>b.period===period||b.period.startsWith(period));
 const budget=budgets.reduce((n,b)=>n+(Number(b.budgetAmount)||0),0);
 const budgetActual=budgets.reduce((n,b)=>n+(Number(b.actualExpenditure)||0),0);
 const expenses=(db.expenses||[]).filter(e=>e.date.startsWith(period));
 const expenseActual=expenses.reduce((n,e)=>n+(Number(e.totalCost)||0),0);
 const assetMaintenanceExpenses=expenses.filter(e=>e.sourceType==='asset_maintenance');
 const assetMaintenanceTotal=assetMaintenanceExpenses.reduce((n,e)=>n+(Number(e.totalCost)||0),0);
 const unpaid=(db.expenses||[]).filter(e=>e.paymentStatus==='Payment Outstanding');
 const unpaidTotal=unpaid.reduce((n,e)=>n+(Number(e.amountDue??e.totalCost)||0),0);
 const handover=(db.procurementLists||[]).filter(p=>p.status==='purchased'&&!p.financeHandedOverAt);
 const transportTrips=(db.schedules||[]).filter(s=>s.type==='transport_trip'&&s.scheduledDate.startsWith(period));
 const transportFuel=transportTrips.reduce((n,s)=>n+(s.transportDetails?.fuelCostMWK||0),0);
 const settleMaintenanceExpense=(expenseId:string)=>{
  if(!isValidInventoryDate(paymentDate)){setSettlementError('Enter a valid payment date.');return;}
  if(!paymentMethod.trim()){setSettlementError('Select or enter the payment method.');return;}
  const actor=staffProfile?.fullName||currentUser?.displayName||currentUser?.email||'SHINE Finance';
  try{
   const updated=updateExpense(expenseId,{paymentStatus:'Paid',amountDue:0,datePaid:paymentDate,paymentMethod:paymentMethod.trim(),paymentReference:paymentReference.trim()||undefined},actor);
   if(!updated) throw new Error('This expense could not be found. Refresh the Finance view and try again.');
   setSettlementError('');setSettlingExpenseId(null);setPaymentReference('');
  }catch(error){setSettlementError(error instanceof Error?error.message:'Could not update the payment record.');}
 };
 if (!managerOrAdmin) return <main className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">This administration summary is restricted to managers and administrators.</main>;
 if(mode==='performance') return <main className="mx-auto max-w-6xl space-y-5 px-1 pb-8">
  <header className="rounded-3xl bg-gradient-to-r from-teal-950 to-emerald-800 p-5 text-white"><div className="flex items-center gap-3"><Activity className="h-7 w-7 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-widest text-amber-200">Administration · Oversight</p><h1 className="text-2xl font-bold">Administrative Performance</h1></div></div><p className="mt-2 text-sm text-teal-50">Record-based operational indicators from SHINE data currently loaded on this device. These are not independently verified staff appraisals.</p></header>
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Active employees',activeStaff],['Completed tasks',completed],['Open tasks',open],['Overdue tasks',overdue]].map(([l,v])=><div key={String(l)} className={card}><p className="text-xs text-stone-500">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>)}</div>
  <section className={card}><h2 className="font-bold">Operational performance indicators</h2><div className="mt-3 divide-y divide-stone-100">{[['Schedule completion rate',completion===null?'Not available — no schedule records':completion+'%'],['Meetings recorded',(db.meetings||[]).length],['Workplans recorded',(db.workplans||[]).length],['Household activities recorded',db.householdActivities.length],['Compliance obligations overdue',schedules.filter(s=>Boolean(s.complianceCategory)&&s.scheduledDate<today&&!['Completed','Cancelled'].includes(s.status)).length]].map(([l,v])=><div key={String(l)} className="flex justify-between gap-3 py-3 text-sm"><span>{l}</span><strong>{v}</strong></div>)}</div><p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Coverage warning: indicators use entered records only. Unsynchronised, missing or unrecorded work can distort results. Targets, denominators and weighting must be approved by management before formal performance assessment.</p></section>
 </main>;
 return <main className="mx-auto max-w-6xl space-y-5 px-1 pb-8">
  <header className="rounded-3xl bg-gradient-to-r from-teal-950 to-emerald-800 p-5 text-white"><div className="flex items-center gap-3"><Wallet className="h-7 w-7 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-widest text-amber-200">Administration · Finance</p><h1 className="text-2xl font-bold">Finance Administration</h1></div></div><p className="mt-2 text-sm text-teal-50">Read-only reconciliation view of current budgets, expenses and procurement handovers. This screen does not approve expenditure or authorise payments.</p></header>
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Monthly budget',mwk(budget)],['Budget actuals',mwk(budgetActual)],['Expense entries',expenses.length],['Outstanding invoices',mwk(unpaidTotal)]].map(([l,v])=><div key={String(l)} className={card}><p className="text-xs text-stone-500">{l}</p><p className="mt-1 text-lg font-bold">{v}</p></div>)}</div>
  <section className={card}><h2 className="font-bold">Finance follow-up · {period}</h2><div className="mt-3 divide-y divide-stone-100">{[['Expense actuals this month (includes asset maintenance)',mwk(expenseActual)],['Asset maintenance entries',assetMaintenanceExpenses.length],['Asset maintenance costs (included above)',mwk(assetMaintenanceTotal)],['Transport fuel recorded this month',mwk(transportFuel)],['Transport trips recorded this month',transportTrips.length],['Purchased lists awaiting finance handover',handover.length],['Invoices requiring payment follow-up',unpaid.length],['Budget variance (actual less budget)',mwk(budgetActual-budget)]].map(([l,v])=><div key={String(l)} className="flex justify-between gap-3 py-3 text-sm"><span>{l}</span><strong>{v}</strong></div>)}</div></section>
  {assetMaintenanceExpenses.length>0 && <section className={card}>
   <h2 className="font-bold">Asset maintenance expenses · {period}</h2>
   <p className="mt-1 text-xs text-stone-500">Automatically posted from Asset Register maintenance records. These entries are already included in expense actuals above.</p>
   <div className="mt-3 divide-y divide-stone-100">{assetMaintenanceExpenses.map((expense)=><div key={expense.id} className="py-3 text-sm">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{expense.itemDescription}</p><p className="text-xs text-stone-500">{expense.date}{expense.supplier ? ' · '+expense.supplier : ''}{expense.invoiceReference ? ' · Ref '+expense.invoiceReference : ''}</p></div><div className="sm:text-right"><p className="font-bold">{mwk(expense.totalCost)}</p><p className={expense.paymentStatus==='Paid'?'text-xs text-emerald-800':'text-xs text-amber-800'}>{expense.paymentStatus||'Payment status not recorded'}</p></div></div>
    {expense.paymentStatus!=='Paid' && (settlingExpenseId===expense.id ? <form className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-2" onSubmit={(event)=>{event.preventDefault();settleMaintenanceExpense(expense.id);}}>
     <label className="text-xs font-semibold text-stone-600">Payment date<input type="date" value={paymentDate} onChange={event=>setPaymentDate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm"/></label>
     <label className="text-xs font-semibold text-stone-600">Payment method<select value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm"><option>Bank transfer</option><option>Cash</option><option>Mobile money</option><option>Cheque</option><option>Other</option></select></label>
     <label className="text-xs font-semibold text-stone-600 sm:col-span-2">Payment / bank reference<input value={paymentReference} onChange={event=>setPaymentReference(event.target.value)} placeholder="Receipt, transaction or bank reference" className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm"/></label>
     {settlementError&&<p role="alert" className="text-xs text-red-700 sm:col-span-2">{settlementError}</p>}
     <div className="flex gap-2 sm:col-span-2"><button type="submit" className="min-h-10 rounded-lg bg-teal-800 px-3 text-xs font-bold text-white">Confirm payment recorded</button><button type="button" onClick={()=>{setSettlingExpenseId(null);setSettlementError('');}} className="min-h-10 rounded-lg border border-stone-300 px-3 text-xs font-semibold">Cancel</button></div>
    </form> : <button type="button" onClick={()=>{setSettlingExpenseId(expense.id);setPaymentDate(today);setSettlementError('');}} className="mt-2 min-h-9 rounded-lg border border-teal-200 px-3 text-xs font-semibold text-teal-900">Record payment</button>)}
   </div>)}</div>
   <p className="mt-2 text-xs text-stone-500">Only record payment after checking the receipt, bank transaction or cash voucher. Payment updates are audit-trailed.</p>
  </section>}
  <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Budget actuals and expense entries are displayed separately to avoid double-counting. Reconcile them against invoices, receipts and bank/cash records. This is not a signed financial statement or an accounting ledger.</p>
 </main>;
};
