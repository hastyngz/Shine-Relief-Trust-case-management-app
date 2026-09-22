import React, { useState, useMemo } from 'react';
import { Girl, Household, GirlStatus, AppDatabase } from '../types';
import { formatDate } from '../utils/export';
import { useAuth } from '../contexts/AuthContext';
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Home,
  GraduationCap,
  AlertTriangle,
  ArrowUpDown,
  X,
} from 'lucide-react';

interface GirlsListProps {
  girls: Girl[];
  households: Household[];
  db: AppDatabase;
  initialStatusFilter?: string;
  onSelectGirl: (girlId: string) => void;
  onRegisterGirl: () => void;
}

export const GirlsList: React.FC<GirlsListProps> = ({
  girls,
  households,
  db,
  initialStatusFilter,
  onSelectGirl,
  onRegisterGirl,
}) => {
  const { isViewOnly } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHouseId, setSelectedHouseId] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatusFilter || 'All');
  const [selectedSchool, setSelectedSchool] = useState<string>('All');
  const [selectedClass, setSelectedClass] = useState<string>('All');
  const [actionRequiredOnly, setActionRequiredOnly] = useState(false);

  const houseMap = useMemo(() => new Map(households.map((h) => [h.id, h.name])), [households]);

  // Unique schools and classes for dropdowns
  const uniqueSchools = useMemo(() => {
    return Array.from(new Set(girls.map((g) => g.school))).filter(Boolean);
  }, [girls]);

  const uniqueClasses = useMemo(() => {
    return Array.from(new Set(girls.map((g) => g.classLevel))).filter(Boolean);
  }, [girls]);

  // Map of girlId to boolean indicating if they have any follow-ups requiring action
  const girlActionMap = useMemo(() => {
    const map = new Set<string>();
    db.educationalFollowUps.forEach((e) => {
      if (e.furtherActionRequired) map.add(e.girlId);
    });
    db.healthFollowUps.forEach((h) => {
      if (h.furtherActionRequired) map.add(h.girlId);
    });
    db.familyFollowUps.forEach((f) => {
      if (f.furtherActionRequired) map.add(f.girlId);
    });
    return map;
  }, [db]);

  const filteredGirls = useMemo(() => {
    return girls.filter((girl) => {
      // Search term
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const houseName = houseMap.get(girl.householdId)?.toLowerCase() || '';
        const matches =
          girl.fullName.toLowerCase().includes(query) ||
          girl.id.toLowerCase().includes(query) ||
          girl.school.toLowerCase().includes(query) ||
          girl.classLevel.toLowerCase().includes(query) ||
          houseName.includes(query) ||
          girl.guardianInfo.name.toLowerCase().includes(query);
        if (!matches) return false;
      }

      // House filter
      if (selectedHouseId !== 'All' && girl.householdId !== selectedHouseId) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'All' && girl.status !== selectedStatus) {
        return false;
      }

      // School filter
      if (selectedSchool !== 'All' && girl.school !== selectedSchool) {
        return false;
      }

      // Class filter
      if (selectedClass !== 'All' && girl.classLevel !== selectedClass) {
        return false;
      }

      // Action required filter
      if (actionRequiredOnly && !girlActionMap.has(girl.id)) {
        return false;
      }

      return true;
    });
  }, [
    girls,
    searchQuery,
    selectedHouseId,
    selectedStatus,
    selectedSchool,
    selectedClass,
    actionRequiredOnly,
    houseMap,
    girlActionMap,
  ]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedHouseId('All');
    setSelectedStatus('All');
    setSelectedSchool('All');
    setSelectedClass('All');
    setActionRequiredOnly(false);
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    selectedHouseId !== 'All' ||
    selectedStatus !== 'All' ||
    selectedSchool !== 'All' ||
    selectedClass !== 'All' ||
    actionRequiredOnly;

  return (
    <div id="girls-list-view" className="space-y-6 pb-12">
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-teal-950 tracking-tight">
            SHINE Girls Directory
          </h1>
          <p className="text-xs text-stone-500">
            Individual girl profiles, educational progress, and medical follow-up history
          </p>
        </div>

        {!isViewOnly && (
          <button
            onClick={onRegisterGirl}
            className="px-4 py-2.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-95 self-start sm:self-center"
          >
            <UserPlus className="w-4 h-4 text-amber-300" />
            <span>Register New Girl</span>
          </button>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by girl's name, ID, school, class, house, or guardian..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 pt-1">
          {/* Household Filter */}
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Household
            </label>
            <select
              value={selectedHouseId}
              onChange={(e) => setSelectedHouseId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white"
            >
              <option value="All">All Houses</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="On Holiday">On Holiday</option>
              <option value="Completed">Completed</option>
              <option value="Left SHINE">Left SHINE</option>
            </select>
          </div>

          {/* School Filter */}
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              School
            </label>
            <select
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white truncate"
            >
              <option value="All">All Schools</option>
              {uniqueSchools.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Class Filter */}
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Class
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white"
            >
              <option value="All">All Classes</option>
              {uniqueClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Action Required Toggle */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-end">
            <label className="w-full flex items-center gap-2 p-1.5 border border-stone-300 rounded-lg cursor-pointer hover:bg-stone-50 text-xs font-semibold text-stone-700">
              <input
                type="checkbox"
                checked={actionRequiredOnly}
                onChange={(e) => setActionRequiredOnly(e.target.checked)}
                className="text-amber-600 rounded focus:ring-amber-500"
              />
              <span className="text-amber-900">Action Needed</span>
            </label>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs pt-2 border-t border-stone-100">
            <span className="text-stone-600">
              Showing <strong>{filteredGirls.length}</strong> of {girls.length} girls
            </span>
            <button
              onClick={resetFilters}
              className="text-teal-800 hover:text-teal-950 font-semibold"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Girls Cards Grid */}
      {filteredGirls.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-stone-200 p-6">
          <Users className="w-10 h-10 text-stone-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-stone-800">
            {girls.length === 0 ? 'No SHINE Girls Registered Yet' : 'No Girls Found'}
          </h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            {girls.length === 0
              ? 'Begin by registering your first SHINE girl. You will be able to record her school, class, guardian details, household assignment, and all longitudinal follow-ups.'
              : 'Try adjusting your search criteria or filters.'}
          </p>
          {girls.length === 0 ? (
            <button
              onClick={onRegisterGirl}
              className="mt-4 px-4 py-2 text-xs font-bold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-sm transition-colors"
            >
              Register First SHINE Girl
            </button>
          ) : (
            <button
              onClick={resetFilters}
              className="mt-3 px-3.5 py-1.5 text-xs font-bold text-teal-800 bg-teal-50 rounded-lg border border-teal-200"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGirls.map((girl) => {
            const hasActionRequired = girlActionMap.has(girl.id);
            const houseName = houseMap.get(girl.householdId) || 'Unassigned';

            return (
              <div
                key={girl.id}
                onClick={() => onSelectGirl(girl.id)}
                className={`p-4 rounded-xl border bg-white hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group ${
                  hasActionRequired
                    ? 'border-amber-300 hover:border-amber-400'
                    : 'border-stone-200 hover:border-teal-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-900 group-hover:bg-amber-400 group-hover:text-teal-950 font-black text-base flex items-center justify-center shrink-0 transition-colors shadow-2xs">
                        {girl.fullName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-stone-900 group-hover:text-teal-900 truncate">
                          {girl.fullName}
                        </h3>
                        <div className="text-[11px] font-semibold text-teal-800">
                          ID: {girl.id}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        girl.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          : girl.status === 'On Holiday'
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : girl.status === 'Completed'
                          ? 'bg-blue-50 text-blue-900 border-blue-200'
                          : 'bg-stone-100 text-stone-700 border-stone-200'
                      }`}
                    >
                      {girl.status}
                    </span>
                  </div>

                  <div className="mt-3.5 space-y-1.5 text-xs text-stone-600">
                    <div className="flex items-center gap-1.5 truncate">
                      <GraduationCap className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span className="truncate">{girl.school}</span>
                      <span className="font-bold text-teal-900 shrink-0">• {girl.classLevel}</span>
                    </div>

                    <div className="flex items-center gap-1.5 truncate">
                      <Home className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate">{houseName}</span>
                    </div>

                    <div className="text-[11px] text-stone-500 truncate pt-1">
                      Guardian: {girl.guardianInfo.name} ({girl.guardianInfo.relationship})
                    </div>
                  </div>
                </div>

                {/* Bottom Card Footer */}
                <div className="mt-4 pt-2.5 border-t border-stone-100 flex items-center justify-between text-xs">
                  {hasActionRequired ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Action Required</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-stone-400 font-medium">Up to date</span>
                  )}
                  <span className="font-bold text-teal-800 group-hover:translate-x-0.5 transition-transform text-xs">
                    View Profile →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
