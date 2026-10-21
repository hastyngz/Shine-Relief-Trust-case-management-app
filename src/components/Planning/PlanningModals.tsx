import React from 'react';
import {
  BudgetItem,
  WorkplanItem,
  ScheduleItem,
  AnnualBudgetPlan,
} from '../../types';
import { LEGACY_PROGRAMMES, PROGRAMMES, ProgrammeId } from '../../data/programmes';
import { normalizeWorkplanStatus } from '../../services/workload';

/**
 * The annual budget, budget, workplan and schedule modals for the Planning
 * view. Extracted from BudgetsAndWorkplansView.tsx with no logic or UI changes.
 */

export interface PlanningModalsProps {
  actorName: string;
  showAnnualBudgetModal: boolean;
  setShowAnnualBudgetModal: (open: boolean) => void;
  editingAnnualBudget: AnnualBudgetPlan | null;
  handleSaveAnnualBudget: (e: React.FormEvent<HTMLFormElement>) => void;
  showBudgetModal: boolean;
  setShowBudgetModal: (open: boolean) => void;
  editingBudget: BudgetItem | null;
  handleSaveBudget: (e: React.FormEvent<HTMLFormElement>) => void;
  budgetProgrammeId: ProgrammeId | '';
  setBudgetProgrammeId: (id: ProgrammeId | '') => void;
  seasonalMonthsDraft: number[];
  setSeasonalMonthsDraft: React.Dispatch<React.SetStateAction<number[]>>;
  showWorkplanModal: boolean;
  setShowWorkplanModal: (open: boolean) => void;
  editingWorkplan: WorkplanItem | null;
  handleSaveWorkplan: (e: React.FormEvent<HTMLFormElement>) => void;
  workplanProgrammeId: ProgrammeId | '';
  setWorkplanProgrammeId: (id: ProgrammeId | '') => void;
  showScheduleModal: boolean;
  setShowScheduleModal: (open: boolean) => void;
  editingSchedule: ScheduleItem | null;
  handleSaveSchedule: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function PlanningModals({
  actorName,
  showAnnualBudgetModal, setShowAnnualBudgetModal, editingAnnualBudget, handleSaveAnnualBudget,
  showBudgetModal, setShowBudgetModal, editingBudget, handleSaveBudget,
  budgetProgrammeId, setBudgetProgrammeId, seasonalMonthsDraft, setSeasonalMonthsDraft,
  showWorkplanModal, setShowWorkplanModal, editingWorkplan, handleSaveWorkplan,
  workplanProgrammeId, setWorkplanProgrammeId,
  showScheduleModal, setShowScheduleModal, editingSchedule, handleSaveSchedule,
}: PlanningModalsProps) {
  return (
    <>
      {/* ------------------------------------------------------------- */}
      {/* ANNUAL BUDGET MODAL */}
      {/* ------------------------------------------------------------- */}
      {showAnnualBudgetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-4">
              {editingAnnualBudget ? 'Edit Annual Budget Plan' : 'New Annual Budget Plan'}
            </h3>
            <form onSubmit={handleSaveAnnualBudget} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Financial year</label>
                  <input
                    name="financialYear"
                    required
                    defaultValue={editingAnnualBudget?.financialYear || '2026'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingAnnualBudget?.status || 'Draft'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Approved">Approved</option>
                    <option value="Active">Active</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Plan title</label>
                <input
                  name="title"
                  required
                  defaultValue={editingAnnualBudget?.title || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Budget area</label>
                  <input
                    name="programme"
                    defaultValue={editingAnnualBudget?.programme || 'General programme'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Approved amount (MWK)</label>
                  <input
                    name="approvedAmount"
                    type="number"
                    step="any"
                    defaultValue={editingAnnualBudget?.approvedAmount || 0}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Approval date</label>
                <input
                  name="approvalDate"
                  type="date"
                  defaultValue={editingAnnualBudget?.approvalDate || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Description</label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editingAnnualBudget?.description || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editingAnnualBudget?.notes || ''}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowAnnualBudgetModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900"
                >
                  {editingAnnualBudget ? 'Save plan' : 'Add plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BUDGET MODAL */}
      {/* ------------------------------------------------------------- */}
      {showBudgetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-4">
              {editingBudget ? 'Edit Budget Item' : 'New Budget Line Allocation'}
            </h3>
            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Period / Quarter</label>
                  <input
                    name="period"
                    required
                    defaultValue={editingBudget?.period || 'Term 1 2026'}
                    placeholder="e.g. Term 1 2026, Q2 2026"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Programme</label>
                  <select
                    name="programme"
                    defaultValue={editingBudget?.programme || 'Education'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Education">Education & School Fees</option>
                    <option value="Households">Households & Sustenance</option>
                    <option value="Healthcare">Healthcare & Emergency</option>
                    <option value="Operations">Operations & Fieldwork</option>
                    <option value="General Support">General Support</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">SHINE programme</label>
                <select
                  name="programmeId"
                  value={budgetProgrammeId}
                  onChange={(event) => setBudgetProgrammeId(event.target.value as ProgrammeId | '')}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                >
                  <option value="">Unassigned</option>
                  {[...PROGRAMMES, ...LEGACY_PROGRAMMES].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>

              {['fish-farming', 'chicken-farming', 'fish-chicken', 'rice-maize-mill', 'tomato-farming'].includes(budgetProgrammeId) && (
                <fieldset className="rounded-lg border border-stone-200 p-3">
                  <legend className="px-1 text-xs font-semibold text-stone-700">Seasonal forecast months</legend>
                  <p className="mb-2 text-[11px] text-stone-500">Select the months when this line is expected. You can change these selections whenever needed.</p>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                      <label key={month} className="flex min-h-10 items-center gap-1.5 text-xs text-stone-700">
                        <input
                          type="checkbox"
                          name="seasonalMonths"
                          value={month}
                          checked={seasonalMonthsDraft.includes(month)}
                          onChange={(event) => setSeasonalMonthsDraft((current) =>
                            event.target.checked ? [...current, month].sort((a, b) => a - b) : current.filter((value) => value !== month)
                          )}
                        />
                        {new Date(2026, month - 1, 1).toLocaleString('en-US', { month: 'short' })}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Category</label>
                  <input
                    name="category"
                    required
                    defaultValue={editingBudget?.category || 'School Fees'}
                    placeholder="e.g. Groceries, School Fees"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Unit of Measure</label>
                  <input
                    name="unit"
                    defaultValue={editingBudget?.unit || 'Terms'}
                    placeholder="e.g. Months, Terms, Bags"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Item Description</label>
                <input
                  name="itemDescription"
                  required
                  defaultValue={editingBudget?.itemDescription || ''}
                  placeholder="e.g. Secondary School Tuition fees for Form 4 girls"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Quantity</label>
                  <input
                    name="quantity"
                    type="number"
                    step="any"
                    required
                    defaultValue={editingBudget?.quantity || 1}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Unit Cost (MWK)</label>
                  <input
                    name="unitCost"
                    type="number"
                    step="any"
                    required
                    defaultValue={editingBudget?.unitCost || 0}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Actual Spent (MWK)</label>
                  <input
                    name="actualExpenditure"
                    type="number"
                    step="any"
                    defaultValue={editingBudget?.actualExpenditure || 0}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Notes / Budget Justification</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editingBudget?.notes || ''}
                  placeholder="Optional supplier notes, terms or remarks"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900"
                >
                  {editingBudget ? 'Save Changes' : 'Add Line Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* WORKPLAN MODAL */}
      {/* ------------------------------------------------------------- */}
      {showWorkplanModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-4">
              {editingWorkplan ? 'Edit Workplan Target' : 'New Strategic Workplan Objective'}
            </h3>
            <form onSubmit={handleSaveWorkplan} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Period</label>
                  <input
                    name="period"
                    required
                    defaultValue={editingWorkplan?.period || 'Q1 2026'}
                    placeholder="e.g. Q1 2026, Annual 2026"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={normalizeWorkplanStatus(editingWorkplan?.status || 'In Progress')}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Planned">Planned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Delayed">Delayed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Programme</label>
                <select
                  name="programmeId"
                  value={workplanProgrammeId}
                  onChange={(event) => setWorkplanProgrammeId(event.target.value as ProgrammeId | '')}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                >
                  <option value="">Unassigned</option>
                  {[...PROGRAMMES, ...LEGACY_PROGRAMMES].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Activity Title</label>
                <input
                  name="activity"
                  required
                  defaultValue={editingWorkplan?.activity || ''}
                  placeholder="e.g. Secondary School Term Monitoring & Fee Payments"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Strategic Objective</label>
                <textarea
                  name="objective"
                  rows={2}
                  required
                  defaultValue={editingWorkplan?.objective || ''}
                  placeholder="e.g. Ensure 100% of sponsored girls attend all terms and have required learning materials"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Target Count</label>
                  <input
                    name="targetCount"
                    type="number"
                    required
                    defaultValue={editingWorkplan?.targetCount || 10}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Unit</label>
                  <input
                    name="unit"
                    defaultValue={editingWorkplan?.unit || 'Visits'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Completed Count</label>
                  <input
                    name="completedCount"
                    type="number"
                    defaultValue={editingWorkplan?.completedCount || 0}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Responsible Staff</label>
                  <input
                    name="responsibleStaffName"
                    required
                    defaultValue={editingWorkplan?.responsibleStaffName || actorName}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Location / Target</label>
                  <input
                    name="location"
                    defaultValue={editingWorkplan?.location || 'Zomba District'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Start Date (optional)</label>
                  <input
                    type="date"
                    name="startDate"
                    defaultValue={editingWorkplan?.startDate || ''}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    name="endDate"
                    required
                    defaultValue={editingWorkplan?.endDate || ''}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Repeat</label>
                  <select
                    name="recurrenceEvery"
                    defaultValue={editingWorkplan?.recurrence?.every || ''}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="">Does not repeat</option>
                    <option value="week">Every week</option>
                    <option value="month">Every month</option>
                    <option value="term">Every term (3 months)</option>
                    <option value="year">Every year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Repeat until (optional)</label>
                  <input
                    type="date"
                    name="recurrenceUntil"
                    min={editingWorkplan?.endDate || undefined}
                    defaultValue={editingWorkplan?.recurrence?.until || ''}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>
              <p className="text-[11px] text-stone-500">The due date is the first occurrence. Future occurrences are generated for the agenda and calendar without adding extra workplan records.</p>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowWorkplanModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900"
                >
                  {editingWorkplan ? 'Save Changes' : 'Create Objective'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SCHEDULE MODAL */}
      {/* ------------------------------------------------------------- */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-4">
              {editingSchedule ? 'Edit Scheduled Activity' : 'Schedule Field Activity'}
            </h3>
            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    name="scheduledDate"
                    required
                    defaultValue={editingSchedule?.scheduledDate || new Date().toISOString().slice(0, 10)}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Time (Optional)</label>
                  <input
                    type="time"
                    name="scheduledTime"
                    defaultValue={editingSchedule?.scheduledTime || '09:00'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Activity Type</label>
                  <select
                    name="type"
                    defaultValue={editingSchedule?.type || 'Home visit'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Home visit">Home visit</option>
                    <option value="School visit">School visit</option>
                    <option value="Medical check-up">Medical check-up</option>
                    <option value="Family meeting">Family meeting</option>
                    <option value="Group activity">Group activity</option>
                    <option value="Review">Review</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingSchedule?.status || 'Upcoming'}
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Upcoming">Upcoming</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Rescheduled">Rescheduled</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Activity Title</label>
                <input
                  name="title"
                  required
                  defaultValue={editingSchedule?.title || ''}
                  placeholder="e.g. Standard 8 Mock Exam Review with Headteacher"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Target Person / Entity</label>
                  <input
                    name="targetName"
                    defaultValue={editingSchedule?.targetName || ''}
                    placeholder="e.g. Grace Banda / House 1"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Location</label>
                  <input
                    name="location"
                    defaultValue={editingSchedule?.location || 'Zomba'}
                    placeholder="e.g. Likangala CDSS"
                    className="w-full text-xs border border-stone-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Assigned Staff</label>
                <input
                  name="assignedStaffName"
                  required
                  defaultValue={editingSchedule?.assignedStaffName || actorName}
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Field Agenda & Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editingSchedule?.notes || ''}
                  placeholder="Transport details, items to bring, specific discussion topics"
                  className="w-full text-xs border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900"
                >
                  {editingSchedule ? 'Save Changes' : 'Schedule Activity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
