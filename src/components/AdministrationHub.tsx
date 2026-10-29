import React from 'react';
import {
  Archive, Boxes, ClipboardCheck, FileText, Users, CalendarDays, Truck, AlertTriangle,
  ShoppingCart, ShieldCheck, ClipboardList, BarChart3, Wallet, BriefcaseBusiness,
  ArrowUpRight, CheckCircle2, Clock3,
} from 'lucide-react';
import type { AppDatabase } from '../types';
import type { AppView } from '../routing/appRoutes';
import { useAuth } from '../contexts/AuthContext';
import { getLocalDateInputValue } from '../utils/inventory';
import { getAdministrationAttention } from '../utils/administrationOverview';

interface AdministrationHubProps {
  db: AppDatabase;
  onNavigate: (view: AppView) => void;
}

type ModuleCard = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'Available now' | 'Build next';
  view?: AppView;
  group: string;
};

const modules: ModuleCard[] = [
  { title: 'Staff & Personnel', description: 'Staff directory, employee records and contracts. Attendance, leave and onboarding checklists are not yet available.', icon: Users, status: 'Available now', view: 'staff', group: 'People' },
  { title: 'Payroll & Contracts', description: 'Open payroll records and review employee contract information.', icon: Wallet, status: 'Available now', view: 'payroll', group: 'People' },
  { title: 'Meetings & Minutes', description: 'Record meetings, minutes, decisions and follow-up actions.', icon: CalendarDays, status: 'Available now', view: 'operations', group: 'Coordination' },
  { title: 'Tasks & Planning', description: 'Review workplans, schedules and operational follow-ups.', icon: ClipboardList, status: 'Available now', view: 'planning', group: 'Coordination' },
  { title: 'Reports & Accountability', description: 'Generate organisational reports and export existing records.', icon: BarChart3, status: 'Available now', view: 'reports', group: 'Records' },
  { title: 'Document Ingestion', description: 'Bring supported documents into SHINE’s existing import workflow.', icon: FileText, status: 'Available now', view: 'import', group: 'Records' },
  { title: 'Documents & Filing (Phase 1)', description: 'Search existing accessible attachments, download files and return to linked records. Filing references, expiry metadata and controlled version history are not yet available.', icon: FileText, status: 'Available now', view: 'documents', group: 'Records' },
  { title: 'Inventory & Stores', description: 'Register stock, record receipts and issues, monitor minimum levels and review movement history.', icon: Boxes, status: 'Available now', view: 'inventory', group: 'Resources' },
  { title: 'Asset Register', description: 'Register equipment and property, locations, assigned users, condition, warranties and service dates.', icon: Archive, status: 'Available now', view: 'assets', group: 'Resources' },
  { title: 'Procurement Lists & Quotations', description: 'Create procurement lists, collect and compare supplier quotes, route for manager approval, record purchase orders and receipts, and hand supporting references to finance. A supplier master register, partial-delivery reconciliation and payment reconciliation remain planned.', icon: ShoppingCart, status: 'Available now', view: 'planning', group: 'Resources' },
  
  { title: 'Compliance Calendar', description: 'Register obligations, assign an owner, track deadlines and completion evidence. Independent management verification is not yet available.', icon: ShieldCheck, status: 'Available now', view: 'compliance', group: 'Compliance' },
  { title: 'Transport & Logistics', description: 'Coordinate journeys, vehicle records, fuel, servicing and activity logistics.', icon: Truck, status: 'Build next', group: 'Operations' },
  { title: 'Administrative Performance', description: 'Measure agreed service targets using verified records and clear calculation rules.', icon: ClipboardCheck, status: 'Build next', group: 'Oversight' },
  { title: 'Finance Documentation', description: 'Track supporting documents and connect procurement records with existing finance workflows.', icon: BriefcaseBusiness, status: 'Build next', group: 'Finance' },
];

export const AdministrationHub: React.FC<AdministrationHubProps> = ({ db, onNavigate }) => {
  const { isAdmin } = useAuth();
  const visibleModules = modules.filter((item) => item.title !== 'Staff & Personnel' || isAdmin);
  const availableCount = visibleModules.filter((item) => item.status === 'Available now').length;
  const upcomingCount = visibleModules.length - availableCount;
  const staffCount = db.employees?.length || 0;
  const meetingCount = db.meetings?.length || 0;
  const scheduleCount = db.schedules?.length || 0;
  const groups = Array.from(new Set(visibleModules.map((item) => item.group)));
  const attention = getAdministrationAttention(db, getLocalDateInputValue());
  const attentionCards = [
    { label: 'Low-stock items', count: attention.lowStockItems, detail: 'At or below minimum stock', view: 'inventory' as AppView, icon: Boxes },
    { label: 'Stock expiry alerts', count: attention.stockExpiryAlerts, detail: 'Expired or due within 30 days', view: 'inventory' as AppView, icon: AlertTriangle },
    { label: 'Assets needing follow-up', count: attention.assetsNeedingAttention, detail: 'Missing, repair, warranty or service', view: 'assets' as AppView, icon: Archive },
    { label: 'Overdue compliance', count: attention.overdueCompliance, detail: 'Open obligations past their due date', view: 'compliance' as AppView, icon: ShieldCheck },
    { label: 'Open procurement lists', count: attention.openProcurementLists, detail: 'Draft or approved lists not yet received', view: 'planning' as AppView, icon: ShoppingCart },
  ];

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-1 pb-8" aria-labelledby="admin-hub-title">
      <div className="fx-card overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <div className="bg-gradient-to-r from-teal-950 via-teal-900 to-emerald-800 px-5 py-6 text-white sm:px-8 sm:py-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15"><BriefcaseBusiness className="h-7 w-7 text-amber-300" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">SHINE Relief Trust</p>
              <h1 id="admin-hub-title" className="mt-1 text-2xl font-bold sm:text-3xl">Administration &amp; Operations</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-teal-50">A central place to coordinate people, organisational resources, records, deadlines and operational accountability.</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-6">
          <div className="rounded-2xl bg-stone-50 p-4"><Users className="h-5 w-5 text-teal-800" /><p className="mt-3 text-2xl font-bold text-stone-900">{staffCount}</p><p className="text-xs text-stone-600">Employee records</p></div>
          <div className="rounded-2xl bg-stone-50 p-4"><CalendarDays className="h-5 w-5 text-teal-800" /><p className="mt-3 text-2xl font-bold text-stone-900">{meetingCount}</p><p className="text-xs text-stone-600">Meeting records</p></div>
          <div className="rounded-2xl bg-stone-50 p-4"><Clock3 className="h-5 w-5 text-teal-800" /><p className="mt-3 text-2xl font-bold text-stone-900">{scheduleCount}</p><p className="text-xs text-stone-600">Scheduled items</p></div>
          <div className="rounded-2xl bg-stone-50 p-4"><CheckCircle2 className="h-5 w-5 text-teal-800" /><p className="mt-3 text-2xl font-bold text-stone-900">{availableCount}/{visibleModules.length}</p><p className="text-xs text-stone-600">Existing app links</p></div>
        </div>
      </div>

      <section aria-labelledby="admin-attention-title" className="space-y-3">
        <div><h2 id="admin-attention-title" className="text-lg font-bold text-stone-900">Operational attention</h2><p className="mt-1 text-sm text-stone-600">Live counts from the records currently loaded on this device. A zero count is not proof that unrecorded or unsynchronised work does not exist.</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {attentionCards.map((item) => {
            const Icon = item.icon;
            return <button key={item.label} type="button" onClick={() => onNavigate(item.view)} className="fx-press flex min-h-24 items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left hover:border-teal-700 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700">
              <span className="rounded-xl bg-amber-50 p-2 text-amber-900"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-stone-900">{item.label}</span><span className="mt-1 block text-xs leading-5 text-stone-600">{item.detail}</span></span>
              <span className="text-2xl font-black tabular-nums text-stone-900">{item.count}</span>
            </button>;
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold text-stone-900">Administration workspace</h2><p className="mt-1 text-sm text-stone-600">Open an existing SHINE workflow or review the next modules planned from the Administration Officer ToR.</p></div>
        <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"><Boxes className="h-4 w-4" /> {upcomingCount} modules to build</div>
      </div>

      {groups.map((group) => (
        <div key={group} className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500">{group}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleModules.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              const available = item.status === 'Available now';
              return (
                <article key={item.title} className={`fx-card rounded-2xl border bg-white p-4 sm:p-5 ${available ? 'border-stone-200' : 'border-dashed border-amber-300 bg-amber-50/40'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`rounded-xl p-2.5 ${available ? 'bg-teal-50 text-teal-800' : 'bg-amber-100 text-amber-900'}`}><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-stone-900">{item.title}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${available ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{item.status}</span>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-stone-600">{item.description}</p>
                    </div>
                  </div>
                  {available && item.view ? (
                    <button type="button" onClick={() => onNavigate(item.view!)} className="fx-press mt-4 inline-flex min-h-10 w-full items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700">
                      Open section <ArrowUpRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="mt-4 flex min-h-10 items-center gap-2 rounded-xl border border-amber-200/80 px-3 py-2 text-xs font-medium text-amber-900"><Clock3 className="h-4 w-4 shrink-0" /> Planned for implementation</div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ))}
      <p className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs leading-5 text-stone-600">Inventory & Stores, the Asset Register, Document Index and Compliance Calendar now open functional workflows. Other planned modules remain clearly marked and do not collect or save data yet.</p>
    </section>
  );
};
