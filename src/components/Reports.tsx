import React, { useState } from 'react';
import { AppDatabase } from '../types';
import {
  exportGirlsToCSV,
  exportHouseholdsToCSV,
  exportEducationalFollowUpsToCSV,
  exportHealthFollowUpsToCSV,
  exportFamilyFollowUpsToCSV,
  exportHouseholdActivitiesToCSV,
  exportRentPaymentsToCSV,
  exportExpensesToCSV,
  formatMWK,
  formatDate,
} from '../utils/export';
import {
  FileSpreadsheet,
  Download,
  GraduationCap,
  Home,
  HeartPulse,
  Users,
  Banknote,
  ShoppingBag,
  Sparkles,
  BarChart3,
  Calendar,
} from 'lucide-react';

interface ReportsProps {
  db: AppDatabase;
  onSelectGirl: (girlId: string) => void;
  onSelectHouse: (houseId: string) => void;
}

type ReportTab =
  | 'schools'
  | 'classes'
  | 'households'
  | 'followups'
  | 'rent'
  | 'expenses'
  | 'exports';

export const Reports: React.FC<ReportsProps> = ({ db, onSelectGirl, onSelectHouse }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('schools');

  const houseMap = new Map(db.households.map((h) => [h.id, h.name]));
  const girlMap = new Map(db.girls.map((g) => [g.id, g.fullName]));

  // 1. Girls by School
  const schoolCounts = db.girls.reduce<Record<string, { total: number; active: number }>>((acc, g) => {
    const s = g.school || 'Unspecified School';
    if (!acc[s]) acc[s] = { total: 0, active: 0 };
    acc[s].total += 1;
    if (g.status === 'Active') acc[s].active += 1;
    return acc;
  }, {});

  // 2. Girls by Class
  const classCounts = db.girls.reduce<Record<string, { total: number; active: number }>>((acc, g) => {
    const c = g.classLevel || 'Unspecified Class';
    if (!acc[c]) acc[c] = { total: 0, active: 0 };
    acc[c].total += 1;
    if (g.status === 'Active') acc[c].active += 1;
    return acc;
  }, {});

  // 3. Girls by Household
  const houseDistribution = db.households.map((h) => {
    const residents = db.girls.filter((g) => g.householdId === h.id);
    const activeResidents = residents.filter((g) => g.status === 'Active');
    const expenses = db.expenses.filter((e) => e.householdId === h.id);
    const totalSpent = expenses.reduce((s, e) => s + e.totalCost, 0);
    return {
      house: h,
      residents,
      activeCount: activeResidents.length,
      totalCount: residents.length,
      totalSpent,
    };
  });

  // 4. Expenses by Category
  const expenseByCategory = db.expenses.reduce<Record<string, { total: number; count: number }>>(
    (acc, exp) => {
      const cat = exp.category;
      if (!acc[cat]) acc[cat] = { total: 0, count: 0 };
      acc[cat].total += exp.totalCost;
      acc[cat].count += 1;
      return acc;
    },
    {}
  );
  const grandTotalExpenses = db.expenses.reduce((s, e) => s + e.totalCost, 0);

  // 5. Rent & Arrears
  const rentSummary = db.rentPayments.map((r) => {
    const house = db.households.find((h) => h.id === r.householdId);
    const expected = house ? house.monthlyRentCost : 0;
    const variance = r.amountPaid - expected;
    return {
      record: r,
      houseName: house ? house.name : 'Unknown House',
      expected,
      variance,
    };
  });

  return (
    <div id="reports-view" className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-teal-950 tracking-tight">
            Programme Analytics & Summary Reports
          </h1>
          <p className="text-xs text-stone-500">
            Export official reports and review girl distribution, educational progress, and household spending
          </p>
        </div>

        <button
          onClick={() => setActiveTab('exports')}
          className="px-4 py-2.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-95 self-start sm:self-center"
        >
          <Download className="w-4 h-4 text-amber-300" />
          <span>Export All Data (CSV)</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="border-b border-stone-200 flex flex-wrap gap-1 p-2 bg-stone-50">
          <button
            onClick={() => setActiveTab('schools')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'schools'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>By School</span>
          </button>

          <button
            onClick={() => setActiveTab('classes')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'classes'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>By Class</span>
          </button>

          <button
            onClick={() => setActiveTab('households')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'households'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>By Household</span>
          </button>

          <button
            onClick={() => setActiveTab('followups')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'followups'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Follow-Ups Summary</span>
          </button>

          <button
            onClick={() => setActiveTab('rent')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'rent'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Banknote className="w-4 h-4" />
            <span>Rent & Arrears</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'expenses'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Expenses Breakdown</span>
          </button>

          <button
            onClick={() => setActiveTab('exports')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'exports'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'text-amber-900 bg-amber-50 hover:bg-amber-100'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>CSV Export Centre</span>
          </button>
        </div>

        <div className="p-5">
          {/* TAB 1: SCHOOLS */}
          {activeTab === 'schools' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-900">Girls Enrolled by School</h3>
                  <p className="text-xs text-stone-500">Distribution across secondary schools in Malawi</p>
                </div>
                <button
                  onClick={() => exportGirlsToCSV(db.girls, db.households)}
                  className="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Girls CSV</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-700 uppercase font-semibold border-b border-stone-200">
                    <tr>
                      <th className="px-4 py-2.5">School Name</th>
                      <th className="px-4 py-2.5">Total Enrolled</th>
                      <th className="px-4 py-2.5">Active Girls</th>
                      <th className="px-4 py-2.5">% of Beneficiaries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {Object.keys(schoolCounts).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-stone-500 font-medium">
                          No girls enrolled in the system yet.
                        </td>
                      </tr>
                    ) : (
                      Object.entries(schoolCounts).map(([school, stats]) => (
                        <tr key={school} className="hover:bg-stone-50">
                          <td className="px-4 py-3 font-bold text-stone-900">{school}</td>
                          <td className="px-4 py-3 font-extrabold text-teal-900">{stats.total}</td>
                          <td className="px-4 py-3 font-semibold text-emerald-800">{stats.active}</td>
                          <td className="px-4 py-3 text-stone-600">
                            {((stats.total / (db.girls.length || 1)) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CLASSES */}
          {activeTab === 'classes' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">Girls Enrolled by Class / Form</h3>
                <p className="text-xs text-stone-500">Secondary school grade levels (Form 1 to Form 4)</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-700 uppercase font-semibold border-b border-stone-200">
                    <tr>
                      <th className="px-4 py-2.5">Class / Level</th>
                      <th className="px-4 py-2.5">Total Count</th>
                      <th className="px-4 py-2.5">Active Status</th>
                      <th className="px-4 py-2.5">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {Object.keys(classCounts).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-stone-500 font-medium">
                          No girls enrolled in the system yet.
                        </td>
                      </tr>
                    ) : (
                      Object.entries(classCounts).map(([classLevel, stats]) => (
                        <tr key={classLevel} className="hover:bg-stone-50">
                          <td className="px-4 py-3 font-bold text-stone-900">{classLevel}</td>
                          <td className="px-4 py-3 font-extrabold text-teal-900">{stats.total}</td>
                          <td className="px-4 py-3 font-semibold text-emerald-800">{stats.active}</td>
                          <td className="px-4 py-3 text-stone-600">
                            {((stats.total / (db.girls.length || 1)) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: HOUSEHOLDS */}
          {activeTab === 'households' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">Household Occupancy & Operations</h3>
                <p className="text-xs text-stone-500">Resident girls and spend breakdown per house</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-700 uppercase font-semibold border-b border-stone-200">
                    <tr>
                      <th className="px-4 py-2.5">Household Name</th>
                      <th className="px-4 py-2.5">Location</th>
                      <th className="px-4 py-2.5">House Mum</th>
                      <th className="px-4 py-2.5">Active Residents</th>
                      <th className="px-4 py-2.5">Monthly Rent</th>
                      <th className="px-4 py-2.5">Total Spend Recorded</th>
                      <th className="px-4 py-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {houseDistribution.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-stone-500 font-medium">
                          No households registered in the system yet.
                        </td>
                      </tr>
                    ) : (
                      houseDistribution.map(({ house, activeCount, totalSpent }) => (
                        <tr key={house.id} className="hover:bg-stone-50">
                          <td className="px-4 py-3 font-bold text-teal-950">{house.name}</td>
                          <td className="px-4 py-3 text-stone-600">{house.location}</td>
                          <td className="px-4 py-3 font-medium text-stone-900">{house.houseMum}</td>
                          <td className="px-4 py-3 font-black text-amber-800">{activeCount} Girls</td>
                          <td className="px-4 py-3 text-stone-700">{formatMWK(house.monthlyRentCost)}</td>
                          <td className="px-4 py-3 font-bold text-emerald-900">{formatMWK(totalSpent)}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => onSelectHouse(house.id)}
                              className="text-xs font-bold text-teal-800 hover:text-teal-950"
                            >
                              View →
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: FOLLOW-UPS SUMMARY */}
          {activeTab === 'followups' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-stone-900">Follow-Ups & Interventions Summary</h3>
                <p className="text-xs text-stone-500">Record volume and outstanding action items by category</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-teal-950">
                    <span>Educational Records</span>
                    <GraduationCap className="w-4 h-4 text-teal-700" />
                  </div>
                  <div className="text-2xl font-black text-teal-900 mt-2">
                    {db.educationalFollowUps.length}
                  </div>
                  <div className="text-xs text-teal-800 mt-1">
                    {db.educationalFollowUps.filter((e) => e.furtherActionRequired).length} Require Action
                  </div>
                </div>

                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-rose-950">
                    <span>Medical / Health Visits</span>
                    <HeartPulse className="w-4 h-4 text-rose-700" />
                  </div>
                  <div className="text-2xl font-black text-rose-900 mt-2">
                    {db.healthFollowUps.length}
                  </div>
                  <div className="text-xs text-rose-800 mt-1">
                    {db.healthFollowUps.filter((h) => h.furtherActionRequired).length} Require Action
                  </div>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                    <span>Family / Guardian Contacts</span>
                    <Users className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="text-2xl font-black text-amber-900 mt-2">
                    {db.familyFollowUps.length}
                  </div>
                  <div className="text-xs text-amber-800 mt-1">
                    {db.familyFollowUps.filter((f) => f.furtherActionRequired).length} Require Action
                  </div>
                </div>

                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-950">
                    <span>House Group Activities</span>
                    <Sparkles className="w-4 h-4 text-purple-700" />
                  </div>
                  <div className="text-2xl font-black text-purple-900 mt-2">
                    {db.householdActivities.length}
                  </div>
                  <div className="text-xs text-purple-800 mt-1">
                    {db.householdActivities.filter((a) => a.furtherActionRequired).length} Require Action
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: RENT & ARREARS */}
          {activeTab === 'rent' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-900">Rent Payments & Variance Tracker</h3>
                  <p className="text-xs text-stone-500">Comparison of expected rent vs actual payments</p>
                </div>
                <button
                  onClick={() => exportRentPaymentsToCSV(db.rentPayments, db.households)}
                  className="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Rent CSV</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-700 uppercase font-semibold border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2.5">Date Paid</th>
                      <th className="px-3 py-2.5">Household</th>
                      <th className="px-3 py-2.5">Month Covered</th>
                      <th className="px-3 py-2.5">Amount Paid</th>
                      <th className="px-3 py-2.5">Expected Rent</th>
                      <th className="px-3 py-2.5">Variance</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {rentSummary.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-stone-500 font-medium">
                          No rent payment records logged yet.
                        </td>
                      </tr>
                    ) : (
                      rentSummary.map(({ record, houseName, expected, variance }) => (
                        <tr key={record.id} className="hover:bg-stone-50">
                          <td className="px-3 py-3 font-medium text-stone-900">
                            {formatDate(record.datePaid)}
                          </td>
                          <td className="px-3 py-3 font-bold text-teal-950">{houseName}</td>
                          <td className="px-3 py-3 font-semibold">{record.monthCovered}</td>
                          <td className="px-3 py-3 font-black text-stone-900">
                            {formatMWK(record.amountPaid)}
                          </td>
                          <td className="px-3 py-3 text-stone-600">{formatMWK(expected)}</td>
                          <td className="px-3 py-3 font-semibold">
                            {variance === 0 ? (
                              <span className="text-emerald-700">Balanced</span>
                            ) : variance < 0 ? (
                              <span className="text-amber-700">Short -{formatMWK(Math.abs(variance))}</span>
                            ) : (
                              <span className="text-blue-700">+{formatMWK(variance)}</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                record.paymentStatus === 'Paid'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : record.paymentStatus === 'Partially paid'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-red-100 text-red-900 border-red-300'
                              }`}
                            >
                              {record.paymentStatus}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: EXPENSES BREAKDOWN */}
          {activeTab === 'expenses' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-900">Household Expenditure by Category</h3>
                  <p className="text-xs text-stone-500">
                    Total recorded spending: <strong className="text-teal-900">{formatMWK(grandTotalExpenses)}</strong>
                  </p>
                </div>
                <button
                  onClick={() => exportExpensesToCSV(db.expenses, db.households)}
                  className="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Expenses CSV</span>
                </button>
              </div>

              {Object.keys(expenseByCategory).length === 0 ? (
                <div className="p-8 text-center text-stone-500 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                  No household expenses logged yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {Object.entries(expenseByCategory).map(([cat, stats]) => (
                    <div key={cat} className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                        {cat}
                      </span>
                      <div className="text-lg font-black text-teal-950 mt-1">
                        {formatMWK(stats.total)}
                      </div>
                      <div className="text-xs text-stone-500 mt-1">
                        {stats.count} purchases • {((stats.total / (grandTotalExpenses || 1)) * 100).toFixed(0)}% of budget
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: CSV EXPORTS CENTRE */}
          {activeTab === 'exports' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-stone-900">Official CSV Data Export Centre</h3>
                <p className="text-xs text-stone-500">
                  Export complete historical records for donor reporting, auditing, or offline analysis in Excel/Sheets.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Girls */}
                <div className="p-4 rounded-xl border border-stone-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-teal-800" />
                    <div>
                      <h4 className="font-bold text-sm text-stone-900">SHINE Girls Directory</h4>
                      <p className="text-[11px] text-stone-500">{db.girls.length} individual profiles</p>
                    </div>
                  </div>
                  <button
                    onClick={() => exportGirlsToCSV(db.girls, db.households)}
                    className="w-full py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Girls CSV</span>
                  </button>
                </div>

                {/* 2. Households */}
                <div className="p-4 rounded-xl border border-stone-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <Home className="w-5 h-5 text-teal-800" />
                    <div>
                      <h4 className="font-bold text-sm text-stone-900">SHINE Houses & Homes</h4>
                      <p className="text-[11px] text-stone-500">{db.households.length} residential locations</p>
                    </div>
                  </div>
                  <button
                    onClick={() => exportHouseholdsToCSV(db.households, db.girls)}
                    className="w-full py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Houses CSV</span>
                  </button>
                </div>

                {/* 3. Educational Follow-ups */}
                <div className="p-4 rounded-xl border border-stone-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-teal-800" />
                    <div>
                      <h4 className="font-bold text-sm text-stone-900">Educational Follow-Ups</h4>
                      <p className="text-[11px] text-stone-500">{db.educationalFollowUps.length} academic logs</p>
                    </div>
                  </div>
                  <button
                    onClick={() => exportEducationalFollowUpsToCSV(db.educationalFollowUps, db.girls)}
                    className="w-full py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Education CSV</span>
                  </button>
                </div>

                {/* 4. Health Follow-ups */}
                <div className="p-4 rounded-xl border border-stone-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <HeartPulse className="w-5 h-5 text-rose-800" />
                    <div>
                      <h4 className="font-bold text-sm text-stone-900">Health & Medical Visits</h4>
                      <p className="text-[11px] text-stone-500">{db.healthFollowUps.length} clinical records</p>
                    </div>
                  </div>
                  <button
                    onClick={() => exportHealthFollowUpsToCSV(db.healthFollowUps, db.girls)}
                    className="w-full py-2 bg-rose-800 hover:bg-rose-900 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Medical CSV</span>
                  </button>
                </div>

                {/* 5. Family Follow-ups */}
                <div className="p-4 rounded-xl border border-stone-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-amber-800" />
                    <div>
                      <h4 className="font-bold text-sm text-stone-900">Family & Guardian Logs</h4>
                      <p className="text-[11px] text-stone-500">{db.familyFollowUps.length} family contacts</p>
                    </div>
                  </div>
                  <button
                    onClick={() => exportFamilyFollowUpsToCSV(db.familyFollowUps, db.girls)}
                    className="w-full py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Family CSV</span>
                  </button>
                </div>

                {/* 6. Group Activities */}
                <div className="p-4 rounded-xl border border-stone-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-800" />
                    <div>
                      <h4 className="font-bold text-sm text-stone-900">Household Group Activities</h4>
                      <p className="text-[11px] text-stone-500">{db.householdActivities.length} communal events</p>
                    </div>
                  </div>
                  <button
                    onClick={() => exportHouseholdActivitiesToCSV(db.householdActivities, db.households)}
                    className="w-full py-2 bg-purple-800 hover:bg-purple-900 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Activities CSV</span>
                  </button>
                </div>

                {/* 7. Rent Payments */}
                <div className="p-4 rounded-xl border border-stone-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-emerald-800" />
                    <div>
                      <h4 className="font-bold text-sm text-stone-900">Rent Payments & Variance</h4>
                      <p className="text-[11px] text-stone-500">{db.rentPayments.length} monthly payments</p>
                    </div>
                  </div>
                  <button
                    onClick={() => exportRentPaymentsToCSV(db.rentPayments, db.households)}
                    className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Rent CSV</span>
                  </button>
                </div>

                {/* 8. Expenses */}
                <div className="p-4 rounded-xl border border-stone-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-teal-800" />
                    <div>
                      <h4 className="font-bold text-sm text-stone-900">Groceries & Expenses</h4>
                      <p className="text-[11px] text-stone-500">{db.expenses.length} expenditure entries</p>
                    </div>
                  </div>
                  <button
                    onClick={() => exportExpensesToCSV(db.expenses, db.households)}
                    className="w-full py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Expenses CSV</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
