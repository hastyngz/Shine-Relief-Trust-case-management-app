import React, { useState, useEffect } from 'react';
import {
  Household,
  Girl,
  HouseholdRentPayment,
  HouseholdExpense,
  HouseholdActivity,
  PhotoAttachment,
} from '../types';
import { formatMWK, formatDate } from '../utils/export';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft,
  Home,
  Users,
  Banknote,
  ShoppingBag,
  Sparkles,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  Edit,
  Phone,
  MapPin,
  FileSpreadsheet,
  Trash2,
  ShieldAlert,
  Camera,
  Bot,
} from 'lucide-react';
import { PhotoGallery } from './Attachments/PhotoGallery';
import { PhotoUploadModal } from './Attachments/PhotoUploadModal';
import { RecordAttachmentBar } from './Attachments/RecordAttachmentBar';
import { subscribeAllHouseholdAttachments } from '../services/attachmentService';

interface HouseholdProfileProps {
  household: Household;
  residentGirls: Girl[];
  rentPayments: HouseholdRentPayment[];
  expenses: HouseholdExpense[];
  activities: HouseholdActivity[];
  onBack: () => void;
  onNavigateToGirl: (girlId: string) => void;
  onEditHousehold: (household: Household) => void;
  onDeleteHousehold?: (houseId: string) => void;
  onDeleteRentPayment?: (paymentId: string) => void;
  onDeleteExpense?: (expenseId: string) => void;
  onDeleteActivity?: (activityId: string) => void;
  onAddRentPayment: (household: Household) => void;
  onAddExpense: (household: Household) => void;
  onAddActivity: (household: Household) => void;
  onAskAI?: (houseId: string) => void;
}

type HouseTab = 'overview' | 'rent' | 'expenses' | 'activities' | 'photos';

export const HouseholdProfile: React.FC<HouseholdProfileProps> = ({
  household,
  residentGirls,
  rentPayments,
  expenses,
  activities,
  onBack,
  onNavigateToGirl,
  onEditHousehold,
  onDeleteHousehold,
  onDeleteRentPayment,
  onDeleteExpense,
  onDeleteActivity,
  onAddRentPayment,
  onAddExpense,
  onAddActivity,
  onAskAI,
}) => {
  const { isViewOnly } = useAuth();
  const [activeTab, setActiveTab] = useState<HouseTab>('overview');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('All');
  const [householdAttachments, setHouseholdAttachments] = useState<PhotoAttachment[]>([]);
  const [isHousePhotoModalOpen, setIsHousePhotoModalOpen] = useState(false);

  // Subscribe to all attachments linked to this household or its activities/expenses/rent
  useEffect(() => {
    const linkedRecordIds = [
      ...rentPayments.map((r) => r.id),
      ...expenses.map((e) => e.id),
      ...activities.map((a) => a.id),
    ];
    const unsub = subscribeAllHouseholdAttachments(household.id, linkedRecordIds, (list) => {
      setHouseholdAttachments(list);
    });
    return () => unsub();
  }, [household.id, rentPayments, expenses, activities]);

  // Rent analytics
  const totalRentPaid = rentPayments.reduce((acc, curr) => acc + curr.amountPaid, 0);
  const paidCount = rentPayments.filter((r) => r.paymentStatus === 'Paid').length;
  const partialCount = rentPayments.filter((r) => r.paymentStatus === 'Partially paid').length;
  const unpaidCount = rentPayments.filter((r) => r.paymentStatus === 'Not paid').length;

  // Expenses analytics
  const totalExpenses = expenses.reduce((acc, curr) => acc + curr.totalCost, 0);
  const filteredExpenses = expenses.filter((e) => {
    if (expenseCategoryFilter === 'All') return true;
    return e.category === expenseCategoryFilter;
  });

  // Outstanding actions in this house
  const outstandingActivities = activities.filter((a) => a.furtherActionRequired);

  return (
    <div id="household-profile-view" className="space-y-6 pb-12">
      {/* Top Bar with Back and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-teal-900 bg-white border border-stone-200 px-3 py-2 rounded-lg shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Households</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {onAskAI && (
            <button
              onClick={() => onAskAI(household.id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
              title={`Ask SHINE AI Assistant about ${household.name}`}
            >
              <Bot className="w-4 h-4 text-teal-800" />
              <span>Ask AI About Household</span>
            </button>
          )}

          {!isViewOnly && (
            <>
              <button
                onClick={() => onEditHousehold(household)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-teal-900 bg-white border border-stone-200 px-3 py-2 rounded-lg shadow-xs transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit House Details</span>
              </button>

              {onDeleteHousehold && (
                <button
                  onClick={() => onDeleteHousehold(household.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-900 hover:bg-red-50 bg-white border border-red-200 px-3 py-2 rounded-lg shadow-xs transition-colors"
                  title="Delete household"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span className="hidden sm:inline">Delete House</span>
                </button>
              )}

              <button
                onClick={() => onAddRentPayment(household)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-3 py-2 rounded-lg shadow-xs transition-colors"
              >
                <Banknote className="w-3.5 h-3.5 text-emerald-800" />
                <span>+ Rent Payment</span>
              </button>

              <button
                onClick={() => onAddExpense(household)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-950 bg-teal-100 hover:bg-teal-200 border border-teal-300 px-3 py-2 rounded-lg shadow-xs transition-colors"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-teal-800" />
                <span>+ Expense / Groceries</span>
              </button>

              <button
                onClick={() => onAddActivity(household)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-2 rounded-lg shadow-xs transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-800" />
                <span>+ Group Activity</span>
              </button>
            </>
          )}
          {isViewOnly && (
            <span className="text-xs font-bold text-stone-500 bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-stone-400" />
              View-Only Mode
            </span>
          )}
        </div>
      </div>

      {/* Household Header Card */}
      <div className="overflow-hidden">
        <div className="shine-hero rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-4">
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-400 text-teal-950 flex items-center justify-center font-black text-xl sm:text-2xl shadow-md shrink-0 overflow-hidden group border-2 border-white/20">
                {household.photoUrl ? (
                  <img
                    src={household.photoUrl}
                    alt={household.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Home className="w-8 h-8" />
                )}

                {!isViewOnly && (
                  <button
                    type="button"
                    onClick={() => setIsHousePhotoModalOpen(true)}
                    className="absolute inset-0 bg-stone-900/70 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[9px] font-bold"
                    title="Update house photo"
                  >
                    <Camera className="w-4 h-4 text-amber-400 mb-0.5" />
                    <span>Photo</span>
                  </button>
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    {household.name}
                  </h1>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                      household.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-stone-200 text-stone-800 border-stone-300'
                    }`}
                  >
                    {household.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-teal-100 mt-1">
                  <span>House ID: <strong className="text-amber-300">{household.id}</strong></span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-amber-400" />
                    {household.location}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats Pill */}
            <div className="flex items-center gap-3 bg-teal-900/60 p-3 rounded-xl border border-teal-800 text-xs">
              <div>
                <div className="text-stone-300 text-[10px] uppercase tracking-wider">Residents</div>
                <div className="font-extrabold text-amber-300 text-base">{residentGirls.length} Girls</div>
              </div>
              <div className="w-px h-7 bg-teal-800" />
              <div>
                <div className="text-stone-300 text-[10px] uppercase tracking-wider">Expected Rent</div>
                <div className="font-extrabold text-white text-base">{formatMWK(household.monthlyRentCost)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Details Row */}
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-stone-200 bg-stone-50/50">
          <div className="bg-white p-3 rounded-lg border border-stone-200">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block mb-1">
              House Mum in Charge
            </span>
            <div className="text-sm font-bold text-stone-900">{household.houseMum}</div>
            {household.houseMumPhone && (
              <div className="text-xs text-stone-600 flex items-center gap-1 mt-1">
                <Phone className="w-3 h-3 text-stone-400" />
                <span>{household.houseMumPhone}</span>
              </div>
            )}
          </div>

          <div className="bg-white p-3 rounded-lg border border-stone-200">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block mb-1">
              Rent Tracking Summary
            </span>
            <div className="text-sm font-bold text-emerald-900">
              {paidCount} Paid Months
            </div>
            <div className="text-xs text-stone-600 mt-0.5">
              {partialCount > 0 && <span className="text-amber-700 font-medium mr-2">{partialCount} Partial</span>}
              {unpaidCount > 0 && <span className="text-red-700 font-medium">{unpaidCount} Unpaid</span>}
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-stone-200">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block mb-1">
              Total Recorded Spend
            </span>
            <div className="text-sm font-bold text-teal-900">
              {formatMWK(totalExpenses)}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              {expenses.length} expenditure entries
            </div>
          </div>
        </div>

        {household.notes && (
          <div className="px-5 py-3 text-xs text-stone-600 bg-stone-50 border-b border-stone-200">
            <strong>House Notes: </strong>{household.notes}
          </div>
        )}

        {/* Audit Trail Metadata */}
        {(household.createdBy || household.createdAt || household.updatedBy || household.updatedAt) && (
          <div className="px-5 py-2.5 bg-stone-50 border-t border-stone-200 text-[11px] text-stone-500 flex flex-wrap items-center justify-between gap-2">
            <span>
              Recorded: {household.createdAt ? formatDate(household.createdAt) : 'Initial setup'}
              {household.createdBy ? ` by ${household.createdBy}` : ''}
            </span>
            {household.updatedAt && (
              <span>
                Last updated: {formatDate(household.updatedAt)}
                {household.updatedBy ? ` by ${household.updatedBy}` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Outstanding Actions Banner if any */}
      {outstandingActivities.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                Household Outstanding Actions ({outstandingActivities.length})
              </h3>
              <ul className="text-xs space-y-1 mt-1.5">
                {outstandingActivities.map((act) => (
                  <li key={act.id} className="text-stone-800">
                    • <strong>{act.activityName}</strong>: {act.recommendations || act.description} (
                    {act.nextFollowUpDate ? `Due: ${formatDate(act.nextFollowUpDate)}` : 'Pending'}
                    )
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="border-b border-stone-200 flex flex-wrap gap-1 p-2 bg-stone-50">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Resident Girls ({residentGirls.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('rent')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'rent'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Banknote className="w-4 h-4" />
            <span>Rent Tracker ({rentPayments.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'expenses'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Groceries & Expenses ({expenses.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('activities')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'activities'
                ? 'bg-amber-800 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Household Activities & Follow-ups ({activities.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('photos')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'photos'
                ? 'bg-teal-900 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Camera className="w-4 h-4 text-amber-400" />
            <span>Photos & Documents ({householdAttachments.length})</span>
          </button>
        </div>

        {/* Tab 1: Resident Girls List */}
        {activeTab === 'overview' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Girls Living at {household.name}
                </h3>
                <p className="text-xs text-stone-500">
                  Click any girl to view her individual profile and educational/health records.
                </p>
              </div>
            </div>

            {residentGirls.length === 0 ? (
              <div className="text-center py-8 bg-stone-50 rounded-lg border border-dashed border-stone-300">
                <Users className="w-8 h-8 text-stone-400 mx-auto mb-1" />
                <p className="text-sm font-semibold text-stone-700">No girls assigned to this house currently</p>
                <p className="text-xs text-stone-500">Assign girls when registering or editing their profile.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {residentGirls.map((girl) => (
                  <div
                    key={girl.id}
                    onClick={() => onNavigateToGirl(girl.id)}
                    className="p-3.5 rounded-xl border border-stone-200 hover:border-teal-700 bg-white hover:shadow-sm cursor-pointer transition-all flex items-center gap-3 group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-teal-100 text-teal-900 group-hover:bg-amber-400 group-hover:text-teal-950 font-black text-sm flex items-center justify-center shrink-0 transition-colors">
                      {girl.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-sm text-stone-900 truncate">
                          {girl.fullName}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {girl.status}
                        </span>
                      </div>
                      <div className="text-xs text-stone-600 truncate mt-0.5">
                        {girl.school}
                      </div>
                      <div className="text-[11px] text-teal-800 font-medium">
                        {girl.classLevel} • ID: {girl.id}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Rent Tracker */}
        {activeTab === 'rent' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/70 p-4 rounded-xl border border-emerald-200">
              <div>
                <span className="text-xs font-semibold text-emerald-900 uppercase tracking-wider block">
                  Expected Normal Rent vs Actual Payments
                </span>
                <div className="text-lg font-black text-emerald-950 mt-0.5">
                  Expected Monthly: {formatMWK(household.monthlyRentCost)}
                </div>
                <p className="text-xs text-emerald-800 mt-1">
                  Total rent paid across all recorded months: <strong>{formatMWK(totalRentPaid)}</strong>
                </p>
              </div>

              <button
                onClick={() => onAddRentPayment(household)}
                className="self-start sm:self-center px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Record Rent Payment</span>
              </button>
            </div>

            {rentPayments.length === 0 ? (
              <div className="text-center py-8 bg-stone-50 rounded-lg border border-dashed border-stone-300">
                <Banknote className="w-8 h-8 text-stone-400 mx-auto mb-1" />
                <p className="text-sm font-semibold text-stone-700">No rent payment records yet</p>
                <p className="text-xs text-stone-500">Record rent payments monthly to track payments vs expected rent.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-700 uppercase tracking-wider font-semibold border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2.5">Date Paid</th>
                      <th className="px-3 py-2.5">Month Covered</th>
                      <th className="px-3 py-2.5">Amount Paid</th>
                      <th className="px-3 py-2.5">Expected Rent</th>
                      <th className="px-3 py-2.5">Variance</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {rentPayments.map((r) => {
                      const diff = r.amountPaid - household.monthlyRentCost;
                      return (
                        <tr key={r.id} className="hover:bg-stone-50/80">
                          <td className="px-3 py-2.5 font-medium text-stone-900">
                            {formatDate(r.datePaid)}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-teal-950">
                            {r.monthCovered}
                          </td>
                          <td className="px-3 py-2.5 font-extrabold text-stone-900">
                            {formatMWK(r.amountPaid)}
                          </td>
                          <td className="px-3 py-2.5 text-stone-600">
                            {formatMWK(household.monthlyRentCost)}
                          </td>
                          <td className="px-3 py-2.5 font-semibold">
                            {diff === 0 ? (
                              <span className="text-emerald-700">Exact</span>
                            ) : diff < 0 ? (
                              <span className="text-amber-700">-{formatMWK(Math.abs(diff))}</span>
                            ) : (
                              <span className="text-blue-700">+{formatMWK(diff)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                r.paymentStatus === 'Paid'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : r.paymentStatus === 'Partially paid'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-red-100 text-red-900 border-red-300'
                              }`}
                            >
                              {r.paymentStatus}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-stone-600 max-w-xs truncate">
                            {r.receiptNumber && (
                              <span className="font-semibold text-stone-700 mr-1">
                                [{r.receiptNumber}]
                              </span>
                            )}
                            {r.notes || '—'}
                          </td>
                          {onDeleteRentPayment && (
                            <td className="px-2 py-2.5 text-right">
                              <button
                                onClick={() => onDeleteRentPayment(r.id)}
                                className="text-stone-400 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                title="Delete rent record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Groceries and Household Expenditure */}
        {activeTab === 'expenses' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Groceries & Household Expenses
                </h3>
                <p className="text-xs text-stone-500">
                  Total Recorded: <strong className="text-teal-900 font-bold">{formatMWK(totalExpenses)}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={expenseCategoryFilter}
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white"
                >
                  <option value="All">All Categories</option>
                  <option value="Groceries">Groceries</option>
                  <option value="Food">Food</option>
                  <option value="Household supplies">Household supplies</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Rent">Rent</option>
                  <option value="Repairs">Repairs</option>
                  <option value="Clothing/social support">Clothing/social support</option>
                  <option value="Other">Other</option>
                </select>

                <button
                  onClick={() => onAddExpense(household)}
                  className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Record Expense</span>
                </button>
              </div>
            </div>

            {filteredExpenses.length === 0 ? (
              <div className="text-center py-8 bg-stone-50 rounded-lg border border-dashed border-stone-300">
                <ShoppingBag className="w-8 h-8 text-stone-400 mx-auto mb-1" />
                <p className="text-sm font-semibold text-stone-700">No expense records found</p>
                <p className="text-xs text-stone-500">Record food, utilities, repairs, or household items.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-700 uppercase tracking-wider font-semibold border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Category</th>
                      <th className="px-3 py-2.5">Item / Description</th>
                      <th className="px-3 py-2.5">Quantity</th>
                      <th className="px-3 py-2.5">Unit Cost</th>
                      <th className="px-3 py-2.5">Total Cost</th>
                      <th className="px-3 py-2.5">Supplier / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {filteredExpenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-stone-50/80">
                        <td className="px-3 py-2.5 font-medium text-stone-900 whitespace-nowrap">
                          {formatDate(exp.date)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-800 border border-stone-300">
                            {exp.category}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-bold text-stone-900">
                          {exp.itemDescription}
                        </td>
                        <td className="px-3 py-2.5 text-stone-600">
                          {exp.quantity}
                        </td>
                        <td className="px-3 py-2.5 text-stone-600">
                          {formatMWK(exp.unitCost)}
                        </td>
                        <td className="px-3 py-2.5 font-extrabold text-teal-900">
                          {formatMWK(exp.totalCost)}
                        </td>
                        <td className="px-3 py-2.5 text-stone-600 max-w-xs truncate">
                          {exp.supplier && <strong className="mr-1 text-stone-700">{exp.supplier}</strong>}
                          {exp.notes}
                        </td>
                        {onDeleteExpense && (
                          <td className="px-2 py-2.5 text-right">
                            <button
                              onClick={() => onDeleteExpense(exp.id)}
                              className="text-stone-400 hover:text-red-700 p-1 rounded hover:bg-red-50"
                              title="Delete expense entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Group Activities & Household Follow-ups */}
        {activeTab === 'activities' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Household Group Activities & Follow-ups
                </h3>
                <p className="text-xs text-stone-500">
                  Recorded once at household level for activities involving multiple girls.
                </p>
              </div>

              <button
                onClick={() => onAddActivity(household)}
                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-center"
              >
                <Plus className="w-4 h-4" />
                <span>Record Group Activity</span>
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="text-center py-8 bg-stone-50 rounded-lg border border-dashed border-stone-300">
                <Sparkles className="w-8 h-8 text-stone-400 mx-auto mb-1" />
                <p className="text-sm font-semibold text-stone-700">No household activities recorded yet</p>
                <p className="text-xs text-stone-500">
                  Record house meetings, workshops, repairs, or communal activities here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((act) => (
                  <div
                    key={act.id}
                    className={`p-4 rounded-xl border ${
                      act.furtherActionRequired
                        ? 'border-amber-300 bg-amber-50/30'
                        : 'border-stone-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-800 text-white">
                            {act.activityType}
                          </span>
                          <span className="text-xs text-stone-500 font-medium">
                            {formatDate(act.date)}
                          </span>
                          <span className="text-xs font-semibold text-stone-700">
                            • {act.participantCount} Participants
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-stone-900 mt-1">
                          {act.activityName}
                        </h4>
                      </div>

                      <div>
                        {act.furtherActionRequired ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            Action Required
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Completed
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2 text-xs text-stone-700">
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

                      {act.challenges && (
                        <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200">
                          <span className="font-semibold text-stone-800 block mb-0.5">Challenges:</span>
                          <p>{act.challenges}</p>
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
                        <div className="flex items-center gap-3">
                          {act.nextFollowUpDate && (
                            <span className="flex items-center gap-1 text-amber-900 font-semibold">
                              <Clock className="w-3 h-3 text-amber-700" />
                              Next Follow-up Date: {formatDate(act.nextFollowUpDate)}
                            </span>
                          )}
                          {act.recordedBy && <span>Staff: {act.recordedBy}</span>}
                        </div>

                        {onDeleteActivity && (
                          <button
                            onClick={() => onDeleteActivity(act.id)}
                            className="text-stone-400 hover:text-red-700 p-1 rounded hover:bg-red-50"
                            title="Delete activity record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Attached photos / receipts for this activity */}
                      <RecordAttachmentBar
                        targetType="householdActivity"
                        targetId={act.id}
                        targetTitle={`${household.name} - ${act.activityName}`}
                        defaultCategory="Group Activity"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Photos & Attached Documentation Gallery */}
        {activeTab === 'photos' && (
          <div className="p-4 sm:p-5">
            <PhotoGallery
              attachments={householdAttachments}
              targetType="household"
              targetId={household.id}
              targetTitle={household.name}
              title={`Photos & Documentation for ${household.name}`}
              subtitle="Household physical condition, maintenance repairs, communal activities, grocery receipts, and utility bills stored in Firebase Storage"
              defaultCategory="Household Condition"
            />
          </div>
        )}
      </div>

      {/* Modal for setting or updating household main portrait photo */}
      <PhotoUploadModal
        isOpen={isHousePhotoModalOpen}
        onClose={() => setIsHousePhotoModalOpen(false)}
        targetType="household"
        targetId={household.id}
        targetTitle={household.name}
        defaultCategory="Profile Photo"
      />
    </div>
  );
};
