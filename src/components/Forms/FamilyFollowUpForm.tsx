import React, { useState } from 'react';
import { Girl, FamilyFollowUp, ContactType } from '../../types';
import { Users, Save, X } from 'lucide-react';
import { FormPhotoSection, PendingPhoto } from '../Attachments/FormPhotoSection';

interface FamilyFollowUpFormProps {
  girl: Girl;
  onSave: (
    data: Omit<FamilyFollowUp, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => void | Promise<void>;
  onCancel: () => void;
}

export const FamilyFollowUpForm: React.FC<FamilyFollowUpFormProps> = ({
  girl,
  onSave,
  onCancel,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [contactType, setContactType] = useState<ContactType>('Home visit');
  const [familySituation, setFamilySituation] = useState('');
  const [challengesOrConcerns, setChallengesOrConcerns] = useState('');
  const [supportProvided, setSupportProvided] = useState('');
  const [furtherActionRequired, setFurtherActionRequired] = useState(false);
  const [recommendations, setRecommendations] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [recordedBy, setRecordedBy] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!familySituation.trim()) {
      setError('Please provide details on the family/guardian situation.');
      return;
    }

    onSave(
      {
        girlId: girl.id,
        date,
        contactType,
        familySituation: familySituation.trim(),
        challengesOrConcerns: challengesOrConcerns.trim(),
        supportProvided: supportProvided.trim(),
        furtherActionRequired,
        recommendations: recommendations.trim(),
        nextFollowUpDate: nextFollowUpDate || undefined,
        recordedBy: recordedBy.trim() || undefined,
      },
      pendingPhotos
    );
  };

  return (
    <div id="family-followup-form" className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
      <div className="bg-amber-900 text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-300" />
          <div>
            <h2 className="font-semibold text-base sm:text-lg">Family & Guardian Follow-Up</h2>
            <p className="text-xs text-amber-200">
              For: <span className="font-bold">{girl.fullName}</span> ({girl.id})
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Date of Contact <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-700 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Type of Contact <span className="text-red-500">*</span>
            </label>
            <select
              value={contactType}
              onChange={(e) => setContactType(e.target.value as ContactType)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-700 focus:outline-none bg-white"
            >
              <option value="Home visit">Home visit</option>
              <option value="Phone call">Phone call</option>
              <option value="Family meeting">Family meeting</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Guardian / Family Situation (Detailed Text) <span className="text-red-500">*</span>
          </label>
          <textarea
            value={familySituation}
            onChange={(e) => setFamilySituation(e.target.value)}
            rows={3}
            placeholder="Describe living conditions, economic situation, harvest, health of guardian, family atmosphere observed during visit..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-700 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Challenges or Concerns Identified
          </label>
          <textarea
            value={challengesOrConcerns}
            onChange={(e) => setChallengesOrConcerns(e.target.value)}
            rows={2}
            placeholder="e.g. Low food supply at home, health issues of guardian, holiday accommodation concerns..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-700 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Support / Assistance Provided by SHINE
          </label>
          <textarea
            value={supportProvided}
            onChange={(e) => setSupportProvided(e.target.value)}
            rows={2}
            placeholder="e.g. Emergency food hamper provided, counseling, transport subsidy for holiday visit..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-700 focus:outline-none"
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
                  name="familyActionRequired"
                  checked={furtherActionRequired === true}
                  onChange={() => setFurtherActionRequired(true)}
                  className="text-amber-800 focus:ring-amber-700"
                />
                <span className="text-amber-800 font-semibold">Yes - Action Needed</span>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 cursor-pointer">
                <input
                  type="radio"
                  name="familyActionRequired"
                  checked={furtherActionRequired === false}
                  onChange={() => setFurtherActionRequired(false)}
                  className="text-amber-800 focus:ring-amber-700"
                />
                <span>No - In Order</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Next Follow-Up Date
            </label>
            <input
              type="date"
              value={nextFollowUpDate}
              onChange={(e) => setNextFollowUpDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-700 focus:outline-none bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Staff Recommendations
          </label>
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            rows={2}
            placeholder="Recommendations for ongoing family preservation and support..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-700 focus:outline-none"
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
            placeholder="e.g. Chisomo Phiri (Family Support Officer)"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-700 focus:outline-none"
          />
        </div>

        {/* Optional Photo Attachment Section */}
        <FormPhotoSection
          pendingPhotos={pendingPhotos}
          onChange={setPendingPhotos}
          defaultCategory="Family Visit"
          title="Family Visit Documentation (Optional)"
          description="Take camera photo or choose file: guardian meeting photos, home living conditions, handwritten guardian letters, or identity cards."
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
            className="px-5 py-2 text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Family Record
          </button>
        </div>
      </form>
    </div>
  );
};
