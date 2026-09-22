import React, { useState } from 'react';
import { Girl, Household, GirlStatus } from '../../types';
import { generateGirlId } from '../../utils/storage';
import { UserPlus, Save, X } from 'lucide-react';
import { FormPhotoSection, PendingPhoto } from '../Attachments/FormPhotoSection';

interface GirlFormProps {
  initialData?: Girl | null;
  existingGirls: Girl[];
  households: Household[];
  onSave: (
    girlData: Omit<Girl, 'createdAt' | 'updatedAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => void | Promise<void>;
  onCancel: () => void;
}

export const GirlForm: React.FC<GirlFormProps> = ({
  initialData,
  existingGirls,
  households,
  onSave,
  onCancel,
}) => {
  const [fullName, setFullName] = useState(initialData?.fullName || '');
  const [dateOfBirth, setDateOfBirth] = useState(initialData?.dateOfBirth || '2010-01-01');
  const [gender, setGender] = useState(initialData?.gender || 'Female');
  const [dateAdmitted, setDateAdmitted] = useState(
    initialData?.dateAdmitted || new Date().toISOString().slice(0, 10)
  );
  const [school, setSchool] = useState(initialData?.school || '');
  const [classLevel, setClassLevel] = useState(initialData?.classLevel || 'Form 1');
  const [householdId, setHouseholdId] = useState(
    initialData?.householdId || (households[0]?.id ?? '')
  );
  const [status, setStatus] = useState<GirlStatus>(initialData?.status || 'Active');

  // Guardian details
  const [guardianName, setGuardianName] = useState(initialData?.guardianInfo.name || '');
  const [guardianRelationship, setGuardianRelationship] = useState(
    initialData?.guardianInfo.relationship || 'Grandmother'
  );
  const [guardianPhone, setGuardianPhone] = useState(initialData?.guardianInfo.phone || '');
  const [guardianVillage, setGuardianVillage] = useState(
    initialData?.guardianInfo.villageOrLocation || ''
  );
  const [situationNotes, setSituationNotes] = useState(
    initialData?.guardianInfo.situationNotes || ''
  );
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please provide the full name of the girl.');
      return;
    }
    if (!school.trim()) {
      setError('Please provide the current school.');
      return;
    }
    if (!householdId) {
      setError('Please assign the girl to a SHINE household.');
      return;
    }

    const id = initialData?.id || generateGirlId(existingGirls);

    onSave(
      {
        id,
        fullName: fullName.trim(),
        dateOfBirth,
        gender,
        dateAdmitted,
        school: school.trim(),
        classLevel: classLevel.trim(),
        householdId,
        status,
        photoUrl: initialData?.photoUrl,
        guardianInfo: {
          name: guardianName.trim() || 'Not specified',
          relationship: guardianRelationship.trim() || 'Guardian',
          phone: guardianPhone.trim(),
          villageOrLocation: guardianVillage.trim(),
          situationNotes: situationNotes.trim(),
        },
        notes: notes.trim(),
      },
      pendingPhotos
    );
  };

  return (
    <div id="girl-registration-form" className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
      <div className="bg-teal-900 text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-amber-400" />
          <h2 className="font-semibold text-lg">
            {initialData ? `Edit Profile: ${initialData.fullName}` : 'Register New SHINE Girl'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-stone-300 hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="border-b border-stone-200 pb-2">
            <h3 className="text-sm font-bold tracking-wide uppercase text-teal-900">
              1. Individual Profile Information
            </h3>
            <p className="text-xs text-stone-500">Record baseline information once during registration.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Chimwemwe Banda"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Current Status <span className="text-red-500">*</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as GirlStatus)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none bg-white"
              >
                <option value="Active">Active</option>
                <option value="On Holiday">On Holiday</option>
                <option value="Completed">Completed</option>
                <option value="Left SHINE">Left SHINE</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Gender
              </label>
              <input
                type="text"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Date Admitted to SHINE <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dateAdmitted}
                onChange={(e) => setDateAdmitted(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Assigned SHINE House / Household <span className="text-red-500">*</span>
              </label>
              <select
                value={householdId}
                onChange={(e) => setHouseholdId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none bg-white"
                required
              >
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.location}) - House Mum: {h.houseMum}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="border-b border-stone-200 pb-2">
            <h3 className="text-sm font-bold tracking-wide uppercase text-teal-900">
              2. Educational Details
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                School <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="e.g. St. Mary's Secondary School"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Class / Level <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                placeholder="e.g. Standard 8, Form 2, College"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="border-b border-stone-200 pb-2">
            <h3 className="text-sm font-bold tracking-wide uppercase text-teal-900">
              3. Family & Guardian Information
            </h3>
            <p className="text-xs text-stone-500">Contact person outside SHINE residential home.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Guardian Full Name
              </label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="e.g. Mrs. Enelesi Banda"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Relationship to Girl
              </label>
              <input
                type="text"
                value={guardianRelationship}
                onChange={(e) => setGuardianRelationship(e.target.value)}
                placeholder="e.g. Grandmother, Aunt, Uncle, Older Sister"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Guardian Phone Number
              </label>
              <input
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="e.g. +265 888 000 000"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Village / Home Location
              </label>
              <input
                type="text"
                value={guardianVillage}
                onChange={(e) => setGuardianVillage(e.target.value)}
                placeholder="e.g. Kumpama Village, Traditional Authority Mbiza"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Family & Background Situation (Detailed Text)
            </label>
            <textarea
              value={situationNotes}
              onChange={(e) => setSituationNotes(e.target.value)}
              rows={3}
              placeholder="Describe the family context, vulnerability factors, reasons for admission to SHINE, living conditions of relatives..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Additional General Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any special talents, aspirations, personality traits..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            />
          </div>

          {/* Optional Photo Attachment Section */}
          <FormPhotoSection
            pendingPhotos={pendingPhotos}
            onChange={setPendingPhotos}
            defaultCategory="Profile Photo"
            title="Girl Photos & Documents (Optional)"
            description="Take or choose photos directly from your phone camera or gallery (profile picture, admission paperwork, or birth certificate)."
          />
        </div>

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
            {initialData ? 'Update Profile' : 'Save Registration'}
          </button>
        </div>
      </form>
    </div>
  );
};
