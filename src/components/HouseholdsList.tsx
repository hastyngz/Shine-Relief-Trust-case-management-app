import React, { useState } from 'react';
import { Household, Girl, AppDatabase } from '../types';
import { formatMWK } from '../utils/export';
import { useAuth } from '../contexts/AuthContext';
import { PROGRAMME_BY_ID } from '../data/programmes';
import {
  Home,
  Users,
  Search,
  Plus,
  MapPin,
  Phone,
  Banknote,
  ShoppingBag,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface HouseholdsListProps {
  households: Household[];
  girls: Girl[];
  db: AppDatabase;
  onSelectHouse: (houseId: string) => void;
  onAddHouse: () => void;
  onAddRent: (house: Household) => void;
  onAddExpense: (house: Household) => void;
  onAddActivity: (house: Household) => void;
}

export const HouseholdsList: React.FC<HouseholdsListProps> = ({
  households,
  girls,
  db,
  onSelectHouse,
  onAddHouse,
  onAddRent,
  onAddExpense,
  onAddActivity,
}) => {
  const { isViewOnly } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const filteredHouses = households.filter((h) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matches =
        h.name.toLowerCase().includes(q) ||
        h.location.toLowerCase().includes(q) ||
        h.houseMum.toLowerCase().includes(q) ||
        h.id.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (statusFilter !== 'All' && h.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div id="households-list-view" className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-teal-950 tracking-tight">
            SHINE Girls Houses & Households
          </h1>
          <p className="text-xs text-stone-500">
            Manage residential houses, house mums, group activities, rent payments, and grocery expenses
          </p>
        </div>

        {!isViewOnly && (
          <button
            onClick={onAddHouse}
            className="px-4 py-2.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-95 self-start sm:self-center"
          >
            <Plus className="w-4 h-4 text-amber-300" />
            <span>Add New Household</span>
          </button>
        )}
      </div>

      <aside className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-teal-950">
        <h2 className="font-bold">About {PROGRAMME_BY_ID['child-house'].name}</h2>
        <p className="mt-1 text-xs leading-relaxed text-teal-900">{PROGRAMME_BY_ID['child-house'].background}</p>
      </aside>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by house name, location, or House Mum..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Houses Grid */}
      {filteredHouses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-stone-200 p-6">
          <Home className="w-10 h-10 text-stone-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-stone-800">
            {households.length === 0 ? 'No Households Registered Yet' : 'No Households Found'}
          </h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            {households.length === 0
              ? 'Add your first SHINE household to start housing girls, recording house activities, rent, and household expenditures.'
              : 'Try adjusting your search criteria or filters.'}
          </p>
          {households.length === 0 ? (
            <button
              onClick={onAddHouse}
              className="mt-4 px-4 py-2 text-xs font-bold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-sm transition-colors"
            >
              Add First Household
            </button>
          ) : (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('All');
              }}
              className="mt-3 px-3.5 py-1.5 text-xs font-bold text-teal-800 bg-teal-50 rounded-lg border border-teal-200"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredHouses.map((house) => {
          const houseGirls = girls.filter((g) => g.householdId === house.id);
          const houseRent = db.rentPayments.filter((r) => r.householdId === house.id);
          const houseExpenses = db.expenses.filter((e) => e.householdId === house.id);
          const totalSpent = houseExpenses.reduce((sum, e) => sum + e.totalCost, 0);

          return (
            <div
              key={house.id}
              className="bg-white rounded-xl border border-stone-200 shadow-xs hover:border-teal-700 hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-5 border-b border-stone-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-900 flex items-center justify-center font-bold shadow-2xs shrink-0">
                      <Home className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3
                          onClick={() => onSelectHouse(house.id)}
                          className="font-black text-base text-stone-900 hover:text-teal-900 cursor-pointer"
                        >
                          {house.name}
                        </h3>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            house.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              : 'bg-stone-100 text-stone-700 border-stone-200'
                          }`}
                        >
                          {house.status}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-stone-400" />
                        <span>{house.location}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                      Monthly Rent
                    </span>
                    <span className="text-sm font-extrabold text-stone-900">
                      {formatMWK(house.monthlyRentCost)}
                    </span>
                  </div>
                </div>

                {/* House Mum Details */}
                <div className="mt-4 p-3 bg-stone-50 rounded-lg border border-stone-200/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider block">
                      House Mum
                    </span>
                    <span className="font-bold text-stone-800">{house.houseMum}</span>
                  </div>
                  {house.houseMumPhone && (
                    <div className="flex items-center gap-1 text-stone-600 font-medium">
                      <Phone className="w-3 h-3 text-stone-400" />
                      <span>{house.houseMumPhone}</span>
                    </div>
                  )}
                </div>

                {/* Resident Girls Quick Avatars */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold text-stone-700">
                      Residents: <strong className="text-amber-800 font-black">{houseGirls.length} Girls</strong>
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {totalSpent > 0 ? `Spend: ${formatMWK(totalSpent)}` : 'No spend recorded'}
                    </span>
                  </div>

                  {houseGirls.length === 0 ? (
                    <p className="text-xs text-stone-400 italic">No girls assigned yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {houseGirls.slice(0, 5).map((g) => (
                        <span
                          key={g.id}
                          className="inline-flex items-center text-xs px-2 py-1 bg-stone-100 text-stone-800 rounded-md border border-stone-200"
                        >
                          {g.fullName}
                        </span>
                      ))}
                      {houseGirls.length > 5 && (
                        <span className="inline-flex items-center text-xs px-2 py-1 bg-teal-50 text-teal-800 rounded-md border border-teal-200 font-bold">
                          +{houseGirls.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="p-3 bg-stone-50/70 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onAddRent(house)}
                    className="p-1.5 px-2.5 rounded-lg text-xs font-semibold bg-white border border-stone-200 text-emerald-900 hover:bg-emerald-50 flex items-center gap-1 transition-colors"
                    title="Record rent payment for this house"
                  >
                    <Banknote className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Rent</span>
                  </button>

                  <button
                    onClick={() => onAddExpense(house)}
                    className="p-1.5 px-2.5 rounded-lg text-xs font-semibold bg-white border border-stone-200 text-teal-900 hover:bg-teal-50 flex items-center gap-1 transition-colors"
                    title="Add groceries or supplies"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-teal-700" />
                    <span>Groceries</span>
                  </button>

                  <button
                    onClick={() => onAddActivity(house)}
                    className="p-1.5 px-2.5 rounded-lg text-xs font-semibold bg-white border border-stone-200 text-amber-900 hover:bg-amber-50 flex items-center gap-1 transition-colors"
                    title="Record group activity or follow-up"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    <span>Activity</span>
                  </button>
                </div>

                <button
                  onClick={() => onSelectHouse(house.id)}
                  className="px-3 py-1.5 text-xs font-bold text-teal-900 hover:text-white hover:bg-teal-800 rounded-lg flex items-center gap-1 transition-all"
                >
                  <span>View House Profile</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
