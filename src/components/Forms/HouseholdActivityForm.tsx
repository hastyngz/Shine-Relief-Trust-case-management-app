import React, { useState } from 'react';
import { Household, Girl, HouseholdActivity, HouseholdActivityType } from '../../types';
import { Sparkles, Save, X } from 'lucide-react';
import { FormPhotoSection, PendingPhoto } from '../Attachments/FormPhotoSection';

interface HouseholdActivityFormProps {
  household: Household;
  houseGirls: Girl[];
  onSave: (
    data: Omit<HouseholdActivity, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => void | Promise<void>;
  onCancel: () => void;
}

export const HouseholdActivityForm: React.FC<HouseholdActivityFormProps> = ({
  household,
  houseGirls,
  onSave,
  onCancel,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [activityName, setActivityName] = useState('');
  const [activityType, setActivityType] = useState<HouseholdActivityType>('Group activity');
  const [location, setLocation] = useState('');
  const [selectedGirlIds, setSelectedGirlIds] = useState<string[]>(houseGirls.map((g) => g.id));
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState('');
  const [challenges, setChallenges] = useState('');
  const [supportProvided, setSupportProvided] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [furtherActionRequired, setFurtherActionRequired] = useState(false);
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [recordedBy, setRecordedBy] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState('');

  const toggleGirl = (id: string) => {
    if (selectedGirlIds.includes(id)) {
      setSelectedGirlIds(selectedGirlIds.filter((gid) => gid !== id));
    } else {
      setSelectedGirlIds([...selectedGirlIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedGirlIds.length === houseGirls.length) {
      setSelectedGirlIds([]);
    } else {
      setSelectedGirlIds(houseGirls.map((g) => g.id));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityName.trim()) {
      setError('Please provide an activity name or title.');
      return;
    }
    if (!description.trim()) {
      setError('Please provide a detailed description of the activity.');
      return;
    }

    onSave(
      {
        householdId: household.id,
        date,
        activityName: activityName.trim(),
        activityType,
        location: location.trim() || undefined,
        participantCount: selectedGirlIds.length > 0 ? selectedGirlIds.length : houseGirls.length,
        participatingGirlIds: selectedGirlIds,
        description: description.trim(),
        outcome: outcome.trim(),
        challenges: challenges.trim(),
        supportProvided: supportProvided.trim(),
        recommendations: recommendations.trim(),
        furtherActionRequired,
        nextFollowUpDate: nextFollowUpDate || undefined,
        recordedBy: recordedBy.trim() || undefined,
      },
      pendingPhotos
    );
  };

  return (
    <div id="household-activity-form" className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
      <div className="bg-teal-900 text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-semibold text-base sm:text-lg">Group Activity / Household Follow-Up</h2>
            <p className="text-xs text-stone-300">
              Recorded once under household: <span className="font-bold text-amber-200">{household.name}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-stone-300 hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900">
          <strong>Staff Note:</strong> Group activities involving multiple or all girls in this home are recorded{' '}
          <strong>once here</strong> at the household level. You do not need to duplicate this record for every girl.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Date of Activity / Follow-Up <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Activity / Follow-Up Type <span className="text-red-500">*</span>
            </label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as HouseholdActivityType)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none bg-white"
            >
              <option value="Group activity">Group activity</option>
              <option value="Household meeting">Household meeting</option>
              <option value="House visit">House visit</option>
              <option value="Repairs/maintenance">Repairs/maintenance</option>
              <option value="Household supplies">Household supplies</option>
              <option value="Utilities">Utilities</option>
              <option value="Groceries">Groceries</option>
              <option value="Rent payment">Rent payment</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Activity / Event Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={activityName}
            onChange={(e) => setActivityName(e.target.value)}
            placeholder="e.g. Life Skills Workshop, Compound Cleaning & Gardening, Sunday Devotion & Goals"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">Activity location</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where the activity took place" className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none" />
        </div>

        {houseGirls.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-stone-700">
                Participating Girls ({selectedGirlIds.length} of {houseGirls.length} selected)
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs text-teal-700 hover:text-teal-900 font-medium"
              >
                {selectedGirlIds.length === houseGirls.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 p-2.5 bg-stone-50 rounded-lg border border-stone-200">
              {houseGirls.map((g) => {
                const isSelected = selectedGirlIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGirl(g.id)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                        : 'bg-white text-stone-700 border-stone-300 hover:border-stone-400'
                    }`}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{g.fullName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Description of Activity (Detailed Text) <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe what was done, discussions held, skills practiced, materials covered in your own words..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Outcome & Group Engagement
          </label>
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            rows={2}
            placeholder="How did the girls participate? What results or decisions were reached?..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Challenges Encountered
          </label>
          <textarea
            value={challenges}
            onChange={(e) => setChallenges(e.target.value)}
            rows={2}
            placeholder="Any conflicts, material shortages, power cuts, or weather issues..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Support / Materials Provided
          </label>
          <textarea
            value={supportProvided}
            onChange={(e) => setSupportProvided(e.target.value)}
            rows={2}
            placeholder="e.g. Hygiene kits, seeds, stationery, snacks, counseling..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-3 rounded-lg border border-stone-200">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Further Action Required?
            </label>
            <div className="flex gap-4 items-center mt-2">
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 cursor-pointer">
                <input
                  type="radio"
                  name="activityActionRequired"
                  checked={furtherActionRequired === true}
                  onChange={() => setFurtherActionRequired(true)}
                  className="text-teal-800 focus:ring-teal-700"
                />
                <span className="text-amber-800 font-semibold">Yes - Action Needed</span>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 cursor-pointer">
                <input
                  type="radio"
                  name="activityActionRequired"
                  checked={furtherActionRequired === false}
                  onChange={() => setFurtherActionRequired(false)}
                  className="text-teal-800 focus:ring-teal-700"
                />
                <span>No - Completed</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Next Action / Follow-Up Date
            </label>
            <input
              type="date"
              value={nextFollowUpDate}
              onChange={(e) => setNextFollowUpDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Recommendations
          </label>
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            rows={2}
            placeholder="Recommendations for House Mum or next team meeting..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Recorded By (Staff Name)
          </label>
          <input
            type="text"
            value={recordedBy}
            onChange={(e) => setRecordedBy(e.target.value)}
            placeholder="e.g. Rachel Gondwe / Wongani Msiska"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        {/* Optional Photo Attachment Section */}
        <FormPhotoSection
          pendingPhotos={pendingPhotos}
          onChange={setPendingPhotos}
          defaultCategory="Group Activity"
          title="Activity Photos & Documentation (Optional)"
          description="Take camera photo or choose file: group activity photos, study sessions, repair progress, chores, or meeting notes."
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Activity
          </button>
        </div>
      </form>
    </div>
  );
};
