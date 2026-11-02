import React from 'react';
import { Activity, Wallet } from 'lucide-react';
import type { AppDatabase } from '../types';

interface Props { db: AppDatabase; mode: 'performance' | 'finance'; }
const card='rounded-2xl border border-stone-200 bg-white p-4';
const mwk=(n:number)=>'MWK '+Math.round(n||0).toLocaleString();

export const AdministrationOversightView: React.FC<Props> = ({db,mode}) => {
 const today=new Date().toISOString().slice(0,10), period=today.slice(0,7);
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
 const unpaid=(db.expenses||[]).filter(e=>e.paymentStatus==='Payment Outstanding');
 const unpaidTotal=unpaid.reduce((n,e)=>n+(Number(e.amountDue??e.totalCost)||0),0);
 const handover=(db.procurementLists||[]).filter(p=>p.status==='purchased'&&!p.financeHandedOverAt);
 if(mode==='performance') return <main className="mx-auto max-w-6xl space-y-5 px-1 pb-8">
  <header className="rounded-3xl bg-gradient-to-r from-teal-950 to-emerald-800 p-5 text-white"><div className="flex items-center gap-3"><Activity className="h-7 w-7 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-widest text-amber-200">Administration · Oversight</p><h1 className="text-2xl font-bold">Administrative Performance</h1></div></div><p className="mt-2 text-sm text-teal-50">Record-based operational indicators from SHINE data currently loaded on this device. These are not independently verified staff appraisals.</p></header>
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Active employees',activeStaff],['Completed tasks',completed],['Open tasks',open],['Overdue tasks',overdue]].map(([l,v])=><div key={String(l)} className={card}><p className="text-xs text-stone-500">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>)}</div>
  <section className={card}><h2 className="font-bold">Operational performance indicators</h2><div className="mt-3 divide-y divide-stone-100">{[['Schedule completion rate',completion===null?'Not available — no schedule records':completion+'%'],['Meetings recorded',(db.meetings||[]).length],['Workplans recorded',(db.workplans||[]).length],['Household activities recorded',db.householdActivities.length],['Compliance obligations overdue',schedules.filter(s=>Boolean(s.complianceCategory)&&s.scheduledDate<today&&!['Completed','Cancelled'].includes(s.status)).length]].map(([l,v])=><div key={String(l)} className="flex justify-between gap-3 py-3 text-sm"><span>{l}</span><strong>{v}</strong></div>)}</div><p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Coverage warning: indicators use entered records only. Unsynchronised, missing or unrecorded work can distort results. Targets, denominators and weighting must be approved by management before formal performance assessment.</p></section>
 </main>;
 return <main className="mx-auto max-w-6xl space-y-5 px-1 pb-8">
  <header className="rounded-3xl bg-gradient-to-r from-teal-950 to-emerald-800 p-5 text-white"><div className="flex items-center gap-3"><Wallet className="h-7 w-7 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-widest text-amber-200">Administration · Finance</p><h1 className="text-2xl font-bold">Finance Administration</h1></div></div><p className="mt-2 text-sm text-teal-50">Read-only reconciliation view of current budgets, expenses and procurement handovers. This screen does not approve expenditure or authorise payments.</p></header>
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Monthly budget',mwk(budget)],['Budget actuals',mwk(budgetActual)],['Expense entries',expenses.length],['Outstanding invoices',mwk(unpaidTotal)]].map(([l,v])=><div key={String(l)} className={card}><p className="text-xs text-stone-500">{l}</p><p className="mt-1 text-lg font-bold">{v}</p></div>)}</div>
  <section className={card}><h2 className="font-bold">Finance follow-up · {period}</h2><div className="mt-3 divide-y divide-stone-100">{[['Expense actuals this month',mwk(expenseActual)],['Purchased lists awaiting finance handover',handover.length],['Invoices requiring payment follow-up',unpaid.length],['Budget variance (actual less budget)',mwk(budgetActual-budget)]].map(([l,v])=><div key={String(l)} className="flex justify-between gap-3 py-3 text-sm"><span>{l}</span><strong>{v}</strong></div>)}</div></section>
  <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Budget actuals and expense entries are displayed separately to avoid double-counting. Reconcile them against invoices, receipts and bank/cash records. This is not a signed financial statement or an accounting ledger.</p>
 </main>;
};
