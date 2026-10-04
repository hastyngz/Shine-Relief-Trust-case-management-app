import React, { useState } from 'react';
import { HouseholdActivity, Household, Girl, HouseholdActivityType } from '../types';
import { formatDate } from '../utils/export';
import { Sparkles, Home, Users, AlertTriangle, CheckCircle2, Clock, Plus, Filter, Search } from 'lucide-react';
import { RecordAttachmentBar } from './Attachments/RecordAttachmentBar';

interface ActivitiesListProps {
  activities: HouseholdActivity[];
  households: Household[];
  girls: Girl[];
  onSelectHouse: (houseId: string) => void;
  onAddActivity: () => void;
}

export const ActivitiesList: React.FC<ActivitiesListProps> = ({
  activities,
  households,
  girls,
  onSelectHouse,
  onAddActivity,
}) => {
  const [selectedHouseId, setSelectedHouseId] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionRequiredOnly, setActionRequiredOnly] = useState(false);

  const houseMap = new Map(households.map((h) => [h.id, h.name]));
  const girlMap = new Map(girls.map((g) => [g.id, g.fullName]));
  const activityCategories = Array.from(new Set(activities.map((activity) => activity.activityCategory).filter((category): category is string => Boolean(category))));

  const filteredActivities = activities
    .filter((act) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const houseName = houseMap.get(act.householdId)?.toLowerCase() || '';
        const matches =
          act.activityName.toLowerCase().includes(q) ||
          act.description.toLowerCase().includes(q) ||
          houseName.includes(q);
        if (!matches) return false;
      }
      if (selectedHouseId !== 'All' && act.householdId !== selectedHouseId) {
        return false;
      }
      if (selectedType !== 'All' && (act.activityCategory || act.activityType) !== selectedType) {
        return false;
      }
      if (actionRequiredOnly && !act.furtherActionRequired) {
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div id="activities-list-view" className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-teal-950 tracking-tight">
            Household Group Activities & Follow-ups
          </h1>
          <p className="text-xs text-stone-500">
            Communal events, workshops, house meetings, and visits recorded once per household
          </p>
        </div>

        <button
          onClick={onAddActivity}
          className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-95 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>Record Group Activity</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search activities by title, description, or house..."
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={selectedHouseId}
              onChange={(e) => setSelectedHouseId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white"
            >
              <option value="All">All Houses</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white"
            >
              <option value="All">All Activity Types</option>
              <option value="Group activity">Group activity</option>
              <option value="Household meeting">Household meeting</option>
              <option value="House visit">House visit</option>
              <option value="Repairs/maintenance">Repairs/maintenance</option>
              <option value="Household supplies">Household supplies</option>
              <option value="Utilities">Utilities</option>
              <option value="Groceries">Groceries</option>
              <option value="Rent payment">Rent payment</option>
              <option value="Other">Other</option>
              {activityCategories.filter((category) => ![
                'Group activity', 'Household meeting', 'House visit', 'Repairs/maintenance',
                'Household supplies', 'Utilities', 'Groceries', 'Rent payment', 'Other',
              ].includes(category)).map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Activities Feed */}
      {filteredActivities.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-stone-200 p-6">
          <Sparkles className="w-10 h-10 text-stone-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-stone-800">No Group Activities Found</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search or record a new activity for any household.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredActivities.map((act) => {
            const houseName = act.householdId ? houseMap.get(act.householdId) || 'Unknown House' : '';
            return (
              <div
                key={act.id}
                className={`p-5 rounded-xl border bg-white shadow-xs ${
                  act.furtherActionRequired ? 'border-amber-300' : 'border-stone-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-800 text-white">
                          {act.activityCategory || act.activityType}
                        </span>
                        <span className="text-xs text-stone-500 font-medium">
                          {formatDate(act.date)}
                        </span>
                        {act.householdId && (
                          <button
                            onClick={() => onSelectHouse(act.householdId)}
                            className="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1 bg-teal-50 px-2 py-0.5 rounded"
                          >
                            <Home className="w-3 h-3" />
                            <span>{houseName}</span>
                          </button>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-stone-900 mt-1">
                        {act.activityName}
                      </h3>
                      <p className="text-xs text-stone-500 font-medium">
                        {act.participantCount == null ? 'Participant count not recorded' : `${act.participantCount} Girls Participated`}
                      </p>
                      {act.location && <p className="text-[11px] text-stone-500">Location: {act.location}</p>}
                    </div>
                  </div>

                  <div>
                    {act.furtherActionRequired ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Action Needed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Completed
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pl-0 sm:pl-13 space-y-2 text-xs text-stone-700">
                  <div className="bg-stone-50 p-3 rounded-lg border border-stone-200">
                    <span className="font-semibold text-stone-900 block mb-1">Description:</span>
                    <p className="whitespace-pre-line leading-relaxed">{act.description}</p>
                  </div>

                  {act.outcome && (
                    <div className="p-2.5 bg-white rounded-lg border border-stone-200">
                      <span className="font-semibold text-stone-900 block mb-0.5">Outcome:</span>
                      <p>{act.outcome}</p>
                    </div>
                  )}

                  {act.supportProvided && (
                    <div className="p-2.5 bg-teal-50/60 rounded-lg border border-teal-200/80 text-teal-950">
                      <span className="font-semibold block mb-0.5">Support Provided:</span>
                      <p>{act.supportProvided}</p>
                    </div>
                  )}

                  {act.recommendations && (
                    <div className="p-2.5 bg-amber-50/50 rounded-lg border border-amber-200/60 text-stone-800">
                      <span className="font-semibold block mb-0.5">Recommendations:</span>
                      <p className="italic">{act.recommendations}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-stone-500 border-t border-stone-200">
                    {act.nextFollowUpDate && (
                      <span className="flex items-center gap-1 text-amber-900 font-semibold">
                        <Clock className="w-3 h-3 text-amber-700" />
                        Next Action Date: {formatDate(act.nextFollowUpDate)}
                      </span>
                    )}
                    {act.recordedBy && <span>Staff: {act.recordedBy}</span>}
                  </div>

                  <RecordAttachmentBar
                    targetType="householdActivity"
                    targetId={act.id}
                    targetTitle={`${houseName} - ${act.activityName}`}
                    defaultCategory="Group Activity"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
