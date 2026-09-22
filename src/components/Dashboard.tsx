import React from 'react';
import { AppDatabase, Girl, Household } from '../types';
import { formatMWK, formatDate } from '../utils/export';
import {
  Users,
  Home,
  GraduationCap,
  HeartPulse,
  Banknote,
  ShoppingBag,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  PlusCircle,
  TrendingUp,
} from 'lucide-react';

interface DashboardProps {
  db: AppDatabase;
  onNavigateToGirl: (girlId: string) => void;
  onNavigateToHouse: (houseId: string) => void;
  onNavigateToGirlsList: (statusFilter?: string) => void;
  onNavigateToHousesList: () => void;
  onNavigateToReports: () => void;
  onOpenQuickAdd: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  db,
  onNavigateToGirl,
  onNavigateToHouse,
  onNavigateToGirlsList,
  onNavigateToHousesList,
  onNavigateToReports,
  onOpenQuickAdd,
}) => {
  // Girls statistics
  const totalGirls = db.girls.length;
  const activeGirls = db.girls.filter((g) => g.status === 'Active').length;
  const holidayGirls = db.girls.filter((g) => g.status === 'On Holiday').length;
  const completedGirls = db.girls.filter((g) => g.status === 'Completed').length;
  const leftGirls = db.girls.filter((g) => g.status === 'Left SHINE').length;

  // Houses statistics
  const totalHouses = db.households.length;
  const activeHouses = db.households.filter((h) => h.status === 'Active').length;

  // Outstanding follow-ups (Action required)
  const outstandingEdu = db.educationalFollowUps.filter((e) => e.furtherActionRequired);
  const outstandingHlt = db.healthFollowUps.filter((h) => h.furtherActionRequired);
  const outstandingFam = db.familyFollowUps.filter((f) => f.furtherActionRequired);
  const outstandingAct = db.householdActivities.filter((a) => a.furtherActionRequired);
  const totalOutstanding =
    outstandingEdu.length + outstandingHlt.length + outstandingFam.length + outstandingAct.length;

  // Upcoming follow-up dates in the next 30 days
  const today = new Date();
  const next30Days = new Date();
  next30Days.setDate(today.getDate() + 30);

  const upcomingFollowUps: {
    id: string;
    type: 'edu' | 'hlt' | 'fam' | 'act';
    title: string;
    targetName: string;
    targetId: string;
    date: string;
    isOverdue: boolean;
  }[] = [];

  const girlMap = new Map(db.girls.map((g) => [g.id, g.fullName]));
  const houseMap = new Map(db.households.map((h) => [h.id, h.name]));

  db.educationalFollowUps.forEach((e) => {
    if (e.nextFollowUpDate) {
      const d = new Date(e.nextFollowUpDate);
      upcomingFollowUps.push({
        id: e.id,
        type: 'edu',
        title: e.academicIssue,
        targetName: girlMap.get(e.girlId) || 'Girl',
        targetId: e.girlId,
        date: e.nextFollowUpDate,
        isOverdue: d < today,
      });
    }
  });

  db.healthFollowUps.forEach((h) => {
    if (h.nextFollowUpDate) {
      const d = new Date(h.nextFollowUpDate);
      upcomingFollowUps.push({
        id: h.id,
        type: 'hlt',
        title: h.reasonForVisit,
        targetName: girlMap.get(h.girlId) || 'Girl',
        targetId: h.girlId,
        date: h.nextFollowUpDate,
        isOverdue: d < today,
      });
    }
  });

  db.familyFollowUps.forEach((f) => {
    if (f.nextFollowUpDate) {
      const d = new Date(f.nextFollowUpDate);
      upcomingFollowUps.push({
        id: f.id,
        type: 'fam',
        title: `Family: ${f.contactType}`,
        targetName: girlMap.get(f.girlId) || 'Girl',
        targetId: f.girlId,
        date: f.nextFollowUpDate,
        isOverdue: d < today,
      });
    }
  });

  upcomingFollowUps.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Rent payments & arrears
  const unpaidRentList = db.rentPayments.filter(
    (r) => r.paymentStatus === 'Not paid' || r.paymentStatus === 'Partially paid'
  );

  // Total expenditure
  const totalExpenditure = db.expenses.reduce((sum, exp) => sum + exp.totalCost, 0);

  // Recent combined activities stream
  const recentActivities: {
    id: string;
    type: 'edu' | 'hlt' | 'fam' | 'act' | 'exp' | 'rnt';
    date: string;
    title: string;
    details: string;
    targetName: string;
    targetId: string;
  }[] = [
    ...db.educationalFollowUps.map((e) => ({
      id: e.id,
      type: 'edu' as const,
      date: e.date,
      title: `Educational: ${e.academicIssue}`,
      details: e.supportProvided || e.problemsExperienced,
      targetName: girlMap.get(e.girlId) || 'Girl',
      targetId: e.girlId,
    })),
    ...db.healthFollowUps.map((h) => ({
      id: h.id,
      type: 'hlt' as const,
      date: h.date,
      title: `Medical Visit: ${h.reasonForVisit}`,
      details: `${h.medicalFacility} - ${h.treatmentProvided || h.healthIssueComplaint}`,
      targetName: girlMap.get(h.girlId) || 'Girl',
      targetId: h.girlId,
    })),
    ...db.familyFollowUps.map((f) => ({
      id: f.id,
      type: 'fam' as const,
      date: f.date,
      title: `Family Follow-Up (${f.contactType})`,
      details: f.familySituation,
      targetName: girlMap.get(f.girlId) || 'Girl',
      targetId: f.girlId,
    })),
    ...db.householdActivities.map((a) => ({
      id: a.id,
      type: 'act' as const,
      date: a.date,
      title: `House Activity: ${a.activityName}`,
      details: a.description,
      targetName: houseMap.get(a.householdId) || 'House',
      targetId: a.householdId,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 7);

  return (
    <div id="dashboard-view" className="space-y-6 pb-12">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-teal-950 via-teal-900 to-teal-950 rounded-2xl text-white p-5 sm:p-6 shadow-md border border-teal-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-teal-950 uppercase tracking-wider">
                Malawi Field Operations
              </span>
              <span className="text-xs text-teal-200">Zomba & Shire Highlands</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              SHINE Relief Case Management & Monitoring
            </h1>
            <p className="text-xs sm:text-sm text-teal-100/90 mt-1 max-w-2xl">
              Track SHINE Girls and residential households without duplicating records. Log educational progress,
              medical care, family preservation, rent, and household expenditures.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={onOpenQuickAdd}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-teal-950 text-xs font-black rounded-xl shadow-md flex items-center gap-2 transition-transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Record New Entry</span>
            </button>
            <button
              onClick={onNavigateToReports}
              className="px-3.5 py-2.5 bg-teal-900/90 hover:bg-teal-800 text-teal-100 text-xs font-bold rounded-xl border border-teal-700/80 transition-colors"
            >
              Export CSV / Reports
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid: Girls & Houses Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Girls Card */}
        <div
          onClick={() => onNavigateToGirlsList()}
          className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs hover:border-teal-700 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Total SHINE Girls
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center group-hover:bg-teal-800 group-hover:text-white transition-colors">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            {totalGirls}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100">
            <span className="text-emerald-700 font-bold">{activeGirls} Active</span>
            <span>•</span>
            <span className="text-amber-700 font-medium">{holidayGirls} On Holiday</span>
          </div>
        </div>

        {/* Girls Outcomes Card */}
        <div
          onClick={() => onNavigateToGirlsList('Completed')}
          className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs hover:border-teal-700 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Outcomes / Status
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-800 flex items-center justify-center group-hover:bg-blue-800 group-hover:text-white transition-colors">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-900 mt-2">
            {completedGirls}
          </div>
          <div className="flex items-center justify-between text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100">
            <span className="text-blue-700 font-semibold">Completed SHINE</span>
            <span className="text-stone-500">{leftGirls} Reintegrated/Left</span>
          </div>
        </div>

        {/* SHINE Houses Card */}
        <div
          onClick={onNavigateToHousesList}
          className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs hover:border-teal-700 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              SHINE Houses
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center group-hover:bg-amber-800 group-hover:text-white transition-colors">
              <Home className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 mt-2">
            {totalHouses}
          </div>
          <div className="flex items-center justify-between text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100">
            <span className="text-emerald-700 font-bold">{activeHouses} Active Homes</span>
            <span className="text-stone-500">{totalHouses - activeHouses} Under Renovation</span>
          </div>
        </div>

        {/* Total Expenditure Card */}
        <div
          onClick={onNavigateToReports}
          className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs hover:border-teal-700 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Household Spend
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center group-hover:bg-emerald-800 group-hover:text-white transition-colors">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-emerald-950 mt-2 truncate">
            {formatMWK(totalExpenditure)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100">
            <span>{db.expenses.length} Groceries & Bills</span>
            <span className="text-emerald-700 font-semibold">Tracked</span>
          </div>
        </div>
      </div>

      {/* Outstanding Action Alerts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Educational Issues Requiring Action */}
        <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
              <GraduationCap className="w-4 h-4 text-teal-800" />
              <span>Education Action</span>
            </div>
            <span className="px-2 py-0.5 bg-teal-800 text-white rounded-full text-xs font-black">
              {outstandingEdu.length}
            </span>
          </div>
          <p className="text-[11px] text-teal-800 leading-snug">
            {outstandingEdu.length > 0
              ? `${outstandingEdu.length} girls need academic tutoring or textbook support.`
              : 'All academic issues in order.'}
          </p>
        </div>

        {/* Medical Issues Requiring Action */}
        <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
              <HeartPulse className="w-4 h-4 text-rose-800" />
              <span>Medical Action</span>
            </div>
            <span className="px-2 py-0.5 bg-rose-800 text-white rounded-full text-xs font-black">
              {outstandingHlt.length}
            </span>
          </div>
          <p className="text-[11px] text-rose-800 leading-snug">
            {outstandingHlt.length > 0
              ? `${outstandingHlt.length} medical follow-up checks or medicine refills due.`
              : 'All medical cases resolved.'}
          </p>
        </div>

        {/* Family/Guardian Issues Requiring Action */}
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <Users className="w-4 h-4 text-amber-800" />
              <span>Family Concerns</span>
            </div>
            <span className="px-2 py-0.5 bg-amber-800 text-white rounded-full text-xs font-black">
              {outstandingFam.length}
            </span>
          </div>
          <p className="text-[11px] text-amber-800 leading-snug">
            {outstandingFam.length > 0
              ? `${outstandingFam.length} families need emergency food or holiday visits.`
              : 'Family support in order.'}
          </p>
        </div>

        {/* Unpaid / Partial Rent Alert */}
        <div className="bg-stone-50 border border-stone-300 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
              <Banknote className="w-4 h-4 text-emerald-800" />
              <span>Rent Status</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                unpaidRentList.length > 0
                  ? 'bg-amber-700 text-white'
                  : 'bg-emerald-800 text-white'
              }`}
            >
              {unpaidRentList.length > 0 ? `${unpaidRentList.length} Arrears` : 'Clean'}
            </span>
          </div>
          <p className="text-[11px] text-stone-700 leading-snug">
            {unpaidRentList.length > 0
              ? `${unpaidRentList.length} houses have partial or unpaid rent balance.`
              : 'All recorded house rents paid in full.'}
          </p>
        </div>
      </div>

      {/* Two Column Layout: Houses Capacity & Upcoming Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SHINE Houses & Resident Breakdown */}
        <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">SHINE Households & Residents</h2>
              <p className="text-xs text-stone-500">Girls count and monthly rent per house</p>
            </div>
            <button
              onClick={onNavigateToHousesList}
              className="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {db.households.length === 0 ? (
              <div className="text-center py-8 bg-stone-50 rounded-xl border border-dashed border-stone-200 p-5">
                <Home className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-stone-800">No Households Registered Yet</h3>
                <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                  Register residential houses to manage girls, log rent payments, and track household budgets.
                </p>
                <button
                  onClick={onNavigateToHousesList}
                  className="mt-3 px-3.5 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Add First Household
                </button>
              </div>
            ) : (
              db.households.map((house) => {
              const girlsInHouse = db.girls.filter((g) => g.householdId === house.id);
              return (
                <div
                  key={house.id}
                  onClick={() => onNavigateToHouse(house.id)}
                  className="p-3.5 rounded-xl border border-stone-200 hover:border-teal-700 hover:bg-teal-50/30 cursor-pointer transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-900 flex items-center justify-center font-bold text-xs shrink-0">
                      <Home className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-stone-900 truncate">
                          {house.name}
                        </h3>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                            house.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {house.status}
                        </span>
                      </div>
                      <div className="text-xs text-stone-600 truncate">
                        House Mum: <strong>{house.houseMum}</strong> • {house.location}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-amber-800">
                      {girlsInHouse.length} Girls
                    </div>
                    <div className="text-[11px] text-stone-500 font-medium">
                      {formatMWK(house.monthlyRentCost)}/mo
                    </div>
                  </div>
                </div>
              );
            }))}
          </div>
        </div>

        {/* Upcoming & Overdue Follow-ups */}
        <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">Upcoming & Scheduled Follow-ups</h2>
              <p className="text-xs text-stone-500">Scheduled next actions for girls and houses</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
              {upcomingFollowUps.length} Scheduled
            </span>
          </div>

          {upcomingFollowUps.length === 0 ? (
            <div className="text-center py-8 bg-stone-50 rounded-lg text-xs text-stone-500">
              No upcoming follow-up dates scheduled.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {upcomingFollowUps.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  onClick={() => onNavigateToGirl(item.targetId)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    item.isOverdue
                      ? 'bg-rose-50/50 border-rose-200 hover:border-rose-400'
                      : 'bg-stone-50 border-stone-200 hover:border-teal-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full ${
                          item.type === 'edu'
                            ? 'bg-teal-800 text-white'
                            : item.type === 'hlt'
                            ? 'bg-rose-800 text-white'
                            : 'bg-amber-800 text-white'
                        }`}
                      >
                        {item.type.toUpperCase()}
                      </span>
                      <span className="font-bold text-xs text-stone-900 truncate">
                        {item.targetName}
                      </span>
                    </div>
                    <div className="text-xs text-stone-600 truncate mt-0.5">
                      {item.title}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-bold flex items-center gap-1 ${
                        item.isOverdue ? 'text-rose-700' : 'text-stone-800'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(item.date)}</span>
                    </div>
                    {item.isOverdue && (
                      <span className="text-[10px] font-extrabold text-rose-600 block uppercase">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Timeline Stream */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">Recent Follow-Up & Activity Stream</h2>
            <p className="text-xs text-stone-500">
              Latest educational notes, medical visits, family contacts, and group activities
            </p>
          </div>
          <button
            onClick={onNavigateToReports}
            className="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1"
          >
            <span>Full History & Reports</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentActivities.length === 0 ? (
          <div className="text-center py-8 bg-stone-50 rounded-xl border border-dashed border-stone-200 p-5">
            <Clock className="w-8 h-8 text-stone-400 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-stone-800">No Activity Records Logged Yet</h3>
            <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
              Educational updates, medical visits, family contacts, and group activities will appear here in chronological order.
            </p>
            <button
              onClick={onOpenQuickAdd}
              className="mt-3 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-teal-950 rounded-lg text-xs font-black transition-colors"
            >
              Record New Entry
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {recentActivities.map((act) => (
              <div
                key={act.id}
                onClick={() => {
                  if (act.type === 'act') {
                    onNavigateToHouse(act.targetId);
                  } else {
                    onNavigateToGirl(act.targetId);
                  }
                }}
                className="py-3 flex items-start gap-3 hover:bg-stone-50/70 p-2 rounded-lg cursor-pointer transition-colors"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                    act.type === 'edu'
                      ? 'bg-teal-100 text-teal-800'
                      : act.type === 'hlt'
                      ? 'bg-rose-100 text-rose-800'
                      : act.type === 'fam'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {act.type === 'edu' && <GraduationCap className="w-4 h-4" />}
                  {act.type === 'hlt' && <HeartPulse className="w-4 h-4" />}
                  {act.type === 'fam' && <Users className="w-4 h-4" />}
                  {act.type === 'act' && <Sparkles className="w-4 h-4" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-stone-900">{act.title}</span>
                      <span className="text-xs font-medium text-teal-800 bg-teal-50 px-1.5 py-0.2 rounded">
                        {act.targetName}
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-500 font-medium">
                      {formatDate(act.date)}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 truncate mt-0.5">{act.details}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
