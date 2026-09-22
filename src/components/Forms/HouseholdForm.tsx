import React, { useState } from 'react';
import { Household, HouseStatus } from '../../types';
import { generateHouseholdId } from '../../utils/storage';
import { Home, Save, X } from 'lucide-react';
import { FormPhotoSection, PendingPhoto } from '../Attachments/FormPhotoSection';

interface HouseholdFormProps {
  initialData?: Household | null;
  existingHouses: Household[];
  onSave: (
    householdData: Omit<Household, 'createdAt' | 'updatedAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => void | Promise<void>;
  onCancel: () => void;
}

export const HouseholdForm: React.FC<HouseholdFormProps> = ({
  initialData,
  existingHouses,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [location, setLocation] = useState(initialData?.location || '');
  const [monthlyRentCost, setMonthlyRentCost] = useState(
    initialData?.monthlyRentCost ? String(initialData.monthlyRentCost) : '150000'
  );
  const [houseMum, setHouseMum] = useState(initialData?.houseMum || '');
  const [houseMumPhone, setHouseMumPhone] = useState(initialData?.houseMumPhone || '');
  const [status, setStatus] = useState<HouseStatus>(initialData?.status || 'Active');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a house name (e.g. Grace Cottage, Bethany House).');
      return;
    }
    if (!location.trim()) {
      setError('Please provide the physical location.');
      return;
    }
    if (!houseMum.trim()) {
      setError('Please provide the House Mum in charge.');
      return;
    }

    const rentNum = parseFloat(monthlyRentCost) || 0;
    const id = initialData?.id || generateHouseholdId(existingHouses);

    onSave(
      {
        id,
        name: name.trim(),
        location: location.trim(),
        monthlyRentCost: rentNum,
        houseMum: houseMum.trim(),
        houseMumPhone: houseMumPhone.trim(),
        status,
        notes: notes.trim(),
      },
      pendingPhotos
    );
  };

  return (
    <div id="household-registration-form" className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
      <div className="bg-teal-900 text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home className="w-5 h-5 text-amber-400" />
          <h2 className="font-semibold text-lg">
            {initialData ? `Edit House: ${initialData.name}` : 'Register New SHINE Household'}
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

      <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            House Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Grace Cottage, Bethany House, Joy Home"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Physical Location / Area <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Zomba, Chikowi Area / Mulunguzi"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              House Status <span className="text-red-500">*</span>
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as HouseStatus)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none bg-white"
            >
              <option value="Active">Active</option>
              <option value="Not in use">Not in use</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              House Mum in Charge <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={houseMum}
              onChange={(e) => setHouseMum(e.target.value)}
              placeholder="e.g. Mai Agnes Phiri"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              House Mum Contact Number
            </label>
            <input
              type="tel"
              value={houseMumPhone}
              onChange={(e) => setHouseMumPhone(e.target.value)}
              placeholder="e.g. +265 888 123 456"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Monthly Expected Rent Cost (Malawi Kwacha - MWK) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm font-medium text-stone-500">MWK</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={monthlyRentCost}
                onChange={(e) => setMonthlyRentCost(e.target.value)}
                placeholder="160000"
                className="w-full pl-14 pr-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
                required
              />
            </div>
            <p className="text-xs text-stone-500 mt-1">
              This baseline expected rent will be compared each month against actual rent payments.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Household Notes & Environment Description
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Property description, bedroom capacity, compound security, proximity to schools..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        {/* Optional Photo Attachment Section */}
        <FormPhotoSection
          pendingPhotos={pendingPhotos}
          onChange={setPendingPhotos}
          defaultCategory="Household Condition"
          title="Household Photos & Facilities (Optional)"
          description="Take camera photo or choose image: house exterior, bedrooms, kitchen, sanitation facilities, compound gate."
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
            {initialData ? 'Update Household' : 'Save Household'}
          </button>
        </div>
      </form>
    </div>
  );
};
