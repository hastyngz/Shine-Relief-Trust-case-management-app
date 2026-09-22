import React, { useState } from 'react';
import { Girl, EducationalFollowUp } from '../../types';
import { GraduationCap, Save, X } from 'lucide-react';
import { FormPhotoSection, PendingPhoto } from '../Attachments/FormPhotoSection';

interface EducationalFollowUpFormProps {
  girl: Girl;
  onSave: (
    data: Omit<EducationalFollowUp, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => void | Promise<void>;
  onCancel: () => void;
}

export const EducationalFollowUpForm: React.FC<EducationalFollowUpFormProps> = ({
  girl,
  onSave,
  onCancel,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [school, setSchool] = useState(girl.school);
  const [classLevel, setClassLevel] = useState(girl.classLevel);
  const [academicIssue, setAcademicIssue] = useState('');
  const [problemsExperienced, setProblemsExperienced] = useState('');
  const [subjectsNeedingSupport, setSubjectsNeedingSupport] = useState('');
  const [supportProvided, setSupportProvided] = useState('');
  const [progressOutcome, setProgressOutcome] = useState('');
  const [furtherActionRequired, setFurtherActionRequired] = useState(false);
  const [recommendations, setRecommendations] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [recordedBy, setRecordedBy] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!academicIssue.trim()) {
      setError('Please state the academic issue or area of concern.');
      return;
    }
    if (!problemsExperienced.trim()) {
      setError('Please describe the problems the girl is experiencing in detail.');
      return;
    }

    onSave(
      {
        girlId: girl.id,
        date,
        school: school.trim(),
        classLevel: classLevel.trim(),
        academicIssue: academicIssue.trim(),
        problemsExperienced: problemsExperienced.trim(),
        subjectsNeedingSupport: subjectsNeedingSupport.trim(),
        supportProvided: supportProvided.trim(),
        progressOutcome: progressOutcome.trim(),
        furtherActionRequired,
        recommendations: recommendations.trim(),
        nextFollowUpDate: nextFollowUpDate || undefined,
        recordedBy: recordedBy.trim() || undefined,
      },
      pendingPhotos
    );
  };

  return (
    <div id="educational-followup-form" className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
      <div className="bg-teal-900 text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-semibold text-base sm:text-lg">Educational Follow-Up</h2>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Date of Follow-Up <span className="text-red-500">*</span>
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
            <label className="block text-xs font-semibold text-stone-700 mb-1">School</label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Class / Level</label>
            <input
              type="text"
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Academic Issue / Area of Concern <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={academicIssue}
            onChange={(e) => setAcademicIssue(e.target.value)}
            placeholder="e.g. Difficulty with Mathematics, Low midterm test score in English"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Problems the Girl is Experiencing (Detailed Text) <span className="text-red-500">*</span>
          </label>
          <textarea
            value={problemsExperienced}
            onChange={(e) => setProblemsExperienced(e.target.value)}
            rows={3}
            placeholder='e.g. "The girl is struggling with Mathematics, particularly fractions and algebra. She feels nervous during exams and lacks revision materials."'
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            required
          />
          <p className="text-xs text-stone-500 mt-1">
            Describe the situation in your own words rather than relying on predefined categories.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Specific Subjects Needing Support
          </label>
          <input
            type="text"
            value={subjectsNeedingSupport}
            onChange={(e) => setSubjectsNeedingSupport(e.target.value)}
            placeholder="e.g. Mathematics, Biology, Physical Science, Chichewa"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Support / Intervention Provided
          </label>
          <textarea
            value={supportProvided}
            onChange={(e) => setSupportProvided(e.target.value)}
            rows={2}
            placeholder="e.g. Arranged weekend peer tutoring, met with subject teacher, provided geometry set and exercise notebooks..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Progress / Outcome Observed
          </label>
          <textarea
            value={progressOutcome}
            onChange={(e) => setProgressOutcome(e.target.value)}
            rows={2}
            placeholder="e.g. Improved homework completion, teacher reported higher classroom engagement..."
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
                  name="actionRequired"
                  checked={furtherActionRequired === true}
                  onChange={() => setFurtherActionRequired(true)}
                  className="text-teal-800 focus:ring-teal-700"
                />
                <span className="text-amber-700 font-semibold">Yes - Action Needed</span>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 cursor-pointer">
                <input
                  type="radio"
                  name="actionRequired"
                  checked={furtherActionRequired === false}
                  onChange={() => setFurtherActionRequired(false)}
                  className="text-teal-800 focus:ring-teal-700"
                />
                <span>No - Resolved / In Order</span>
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
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none bg-white"
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
            placeholder="Recommendations for House Mum, teachers, or caseworkers..."
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
            placeholder="e.g. Wongani Msiska (Education Coordinator)"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        {/* Optional Photo Attachment Section */}
        <FormPhotoSection
          pendingPhotos={pendingPhotos}
          onChange={setPendingPhotos}
          defaultCategory="School Document"
          title="School Documents & Report Cards (Optional)"
          description="Snap photo with camera or choose file: term report card, exam results, school letters, fee invoices."
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
            Save Educational Record
          </button>
        </div>
      </form>
    </div>
  );
};
