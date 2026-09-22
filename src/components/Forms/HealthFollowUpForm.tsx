import React, { useState } from 'react';
import { Girl, HealthFollowUp } from '../../types';
import { HeartPulse, Save, X } from 'lucide-react';
import { FormPhotoSection, PendingPhoto } from '../Attachments/FormPhotoSection';

interface HealthFollowUpFormProps {
  girl: Girl;
  onSave: (
    data: Omit<HealthFollowUp, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => void | Promise<void>;
  onCancel: () => void;
}

export const HealthFollowUpForm: React.FC<HealthFollowUpFormProps> = ({
  girl,
  onSave,
  onCancel,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [healthIssueComplaint, setHealthIssueComplaint] = useState('');
  const [medicalFacility, setMedicalFacility] = useState('Zomba Central Hospital');
  const [treatmentProvided, setTreatmentProvided] = useState('');
  const [outcome, setOutcome] = useState('');
  const [furtherActionRequired, setFurtherActionRequired] = useState(false);
  const [recommendations, setRecommendations] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [recordedBy, setRecordedBy] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonForVisit.trim()) {
      setError('Please provide the reason for the medical visit.');
      return;
    }
    if (!healthIssueComplaint.trim()) {
      setError('Please describe the health issue or symptoms in detail.');
      return;
    }
    if (!medicalFacility.trim()) {
      setError('Please specify the clinic, health centre, or hospital visited.');
      return;
    }

    onSave(
      {
        girlId: girl.id,
        date,
        reasonForVisit: reasonForVisit.trim(),
        healthIssueComplaint: healthIssueComplaint.trim(),
        medicalFacility: medicalFacility.trim(),
        treatmentProvided: treatmentProvided.trim(),
        outcome: outcome.trim(),
        furtherActionRequired,
        recommendations: recommendations.trim(),
        nextFollowUpDate: nextFollowUpDate || undefined,
        recordedBy: recordedBy.trim() || undefined,
      },
      pendingPhotos
    );
  };

  return (
    <div id="health-followup-form" className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
      <div className="bg-rose-900 text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-rose-300" />
          <div>
            <h2 className="font-semibold text-base sm:text-lg">Health & Medical Follow-Up</h2>
            <p className="text-xs text-rose-200">
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
              Date of Medical Visit <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-700 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Medical Facility / Clinic <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={medicalFacility}
              onChange={(e) => setMedicalFacility(e.target.value)}
              placeholder="e.g. Zomba Central Hospital, Pirimiti Community Hospital, Matawale Clinic"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-700 focus:outline-none"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Reason for Visit <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={reasonForVisit}
            onChange={(e) => setReasonForVisit(e.target.value)}
            placeholder="e.g. Fever and body chills, Dental pain, Eye test and spectacles, Routine wellness check"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-700 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Health Issue / Complaint (Detailed Symptoms) <span className="text-red-500">*</span>
          </label>
          <textarea
            value={healthIssueComplaint}
            onChange={(e) => setHealthIssueComplaint(e.target.value)}
            rows={3}
            placeholder="Detailed description of symptoms, duration, pain scale, observed physical signs..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-700 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Treatment / Medication Provided
          </label>
          <textarea
            value={treatmentProvided}
            onChange={(e) => setTreatmentProvided(e.target.value)}
            rows={2}
            placeholder="e.g. Artemether-Lumefantrine (Coartem) 6 doses, Paracetamol 500mg, Amoxicillin, lab tests performed..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-700 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Outcome / Clinical Progress
          </label>
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            rows={2}
            placeholder="e.g. Temperature normalized, full recovery, discharged with rest advice..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-700 focus:outline-none"
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
                  name="healthActionRequired"
                  checked={furtherActionRequired === true}
                  onChange={() => setFurtherActionRequired(true)}
                  className="text-rose-800 focus:ring-rose-700"
                />
                <span className="text-rose-700 font-semibold">Yes - Action Needed</span>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 cursor-pointer">
                <input
                  type="radio"
                  name="healthActionRequired"
                  checked={furtherActionRequired === false}
                  onChange={() => setFurtherActionRequired(false)}
                  className="text-rose-800 focus:ring-rose-700"
                />
                <span>No - Resolved</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Next Medical Follow-Up Date
            </label>
            <input
              type="date"
              value={nextFollowUpDate}
              onChange={(e) => setNextFollowUpDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-700 focus:outline-none bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Staff / Doctor Recommendations
          </label>
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            rows={2}
            placeholder="Dietary instructions, medication schedule supervision by House Mum, bed rest guidelines..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-700 focus:outline-none"
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
            placeholder="e.g. Rachel Gondwe (Health Case Worker)"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-700 focus:outline-none"
          />
        </div>

        {/* Optional Photo Attachment Section */}
        <FormPhotoSection
          pendingPhotos={pendingPhotos}
          onChange={setPendingPhotos}
          defaultCategory="Medical Document"
          title="Medical Documents & Prescriptions (Optional)"
          description="Snap photo with camera or choose file: doctor prescription, clinic health passport pages, lab test results, or pharmacy receipt."
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
            className="px-5 py-2 text-sm font-semibold text-white bg-rose-800 hover:bg-rose-900 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Health Record
          </button>
        </div>
      </form>
    </div>
  );
};
