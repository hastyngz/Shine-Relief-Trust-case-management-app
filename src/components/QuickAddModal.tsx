import React, { useState } from 'react';
import { AppDatabase, Girl, Household } from '../types';
import {
  X,
  UserPlus,
  Home,
  GraduationCap,
  HeartPulse,
  Users,
  Banknote,
  ShoppingBag,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

export type ActionType =
  | 'register-girl'
  | 'register-house'
  | 'add-edu'
  | 'add-health'
  | 'add-family'
  | 'add-rent'
  | 'add-expense'
  | 'add-activity';

interface QuickAddModalProps {
  db: AppDatabase;
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (
    action: ActionType,
    girl?: Girl,
    house?: Household
  ) => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  db,
  isOpen,
  onClose,
  onSelectAction,
}) => {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [targetGirlId, setTargetGirlId] = useState<string>('');
  const [targetHouseId, setTargetHouseId] = useState<string>('');

  if (!isOpen) return null;

  const handleActionClick = (action: ActionType) => {
    if (action === 'register-girl' || action === 'register-house') {
      onSelectAction(action);
      onClose();
      return;
    }
    setSelectedAction(action);
    if (action === 'add-edu' || action === 'add-health' || action === 'add-family') {
      setTargetGirlId(db.girls[0]?.id || '');
    } else {
      setTargetHouseId(db.households[0]?.id || '');
    }
  };

  const handleConfirmTarget = () => {
    if (!selectedAction) return;

    if (
      selectedAction === 'add-edu' ||
      selectedAction === 'add-health' ||
      selectedAction === 'add-family'
    ) {
      const girl = db.girls.find((g) => g.id === targetGirlId);
      if (girl) {
        onSelectAction(selectedAction, girl);
        onClose();
        setSelectedAction(null);
      }
    } else {
      const house = db.households.find((h) => h.id === targetHouseId);
      if (house) {
        onSelectAction(selectedAction, undefined, house);
        onClose();
        setSelectedAction(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="bg-teal-950 text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">Record New Information</h2>
            <p className="text-xs text-stone-300">SHINE Relief Trust Case Monitoring</p>
          </div>
          <button
            onClick={() => {
              setSelectedAction(null);
              onClose();
            }}
            className="text-stone-300 hover:text-white p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Selection */}
        <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
          {!selectedAction ? (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-1">
                Registrations
              </div>

              <button
                onClick={() => handleActionClick('register-girl')}
                className="w-full p-3 rounded-xl border border-stone-200 hover:border-teal-700 hover:bg-teal-50/50 flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-stone-900">Register New SHINE Girl</div>
                    <div className="text-[11px] text-stone-500">Admit a girl, guardian, school & house</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>

              <button
                onClick={() => handleActionClick('register-house')}
                className="w-full p-3 rounded-xl border border-stone-200 hover:border-teal-700 hover:bg-teal-50/50 flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                    <Home className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-stone-900">Add New Household / House</div>
                    <div className="text-[11px] text-stone-500">Location, House Mum, rent agreement</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>

              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-1 pt-2">
                Girl Follow-Up Records
              </div>

              <button
                onClick={() => handleActionClick('add-edu')}
                className="w-full p-3 rounded-xl border border-stone-200 hover:border-teal-700 hover:bg-teal-50/50 flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-stone-900">Educational Follow-Up</div>
                    <div className="text-[11px] text-stone-500">Academic issues, support & progress</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>

              <button
                onClick={() => handleActionClick('add-health')}
                className="w-full p-3 rounded-xl border border-stone-200 hover:border-rose-400 hover:bg-rose-50/50 flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-stone-900">Health / Medical Visit</div>
                    <div className="text-[11px] text-stone-500">Clinic visit, treatment & medication</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>

              <button
                onClick={() => handleActionClick('add-family')}
                className="w-full p-3 rounded-xl border border-stone-200 hover:border-amber-400 hover:bg-amber-50/50 flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-stone-900">Family / Guardian Follow-Up</div>
                    <div className="text-[11px] text-stone-500">Home visit, contact & welfare</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>

              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-1 pt-2">
                Household Logs & Finance
              </div>

              <button
                onClick={() => handleActionClick('add-activity')}
                className="w-full p-3 rounded-xl border border-stone-200 hover:border-purple-400 hover:bg-purple-50/50 flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-stone-900">Group Activity / Follow-Up</div>
                    <div className="text-[11px] text-stone-500">Record ONCE under household for all girls</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>

              <button
                onClick={() => handleActionClick('add-rent')}
                className="w-full p-3 rounded-xl border border-stone-200 hover:border-emerald-400 hover:bg-emerald-50/50 flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-stone-900">Rent Payment</div>
                    <div className="text-[11px] text-stone-500">Track paid vs expected rent</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>

              <button
                onClick={() => handleActionClick('add-expense')}
                className="w-full p-3 rounded-xl border border-stone-200 hover:border-teal-700 hover:bg-teal-50/50 flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-stone-900">Groceries / Household Expense</div>
                    <div className="text-[11px] text-stone-500">Food, utilities, supplies & repairs</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>
            </div>
          ) : (
            /* Target Selector Screen */
            <div className="space-y-4 py-2">
              <div>
                <button
                  onClick={() => setSelectedAction(null)}
                  className="text-xs font-semibold text-stone-500 hover:text-stone-800 mb-2"
                >
                  ← Back to Options
                </button>
                <h3 className="font-bold text-sm text-stone-900">
                  {selectedAction === 'add-edu' ||
                  selectedAction === 'add-health' ||
                  selectedAction === 'add-family'
                    ? 'Select Girl for Follow-Up'
                    : 'Select Household'}
                </h3>
              </div>

              {selectedAction === 'add-edu' ||
              selectedAction === 'add-health' ||
              selectedAction === 'add-family' ? (
                db.girls.length === 0 ? (
                  <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-center space-y-2">
                    <p className="text-xs text-stone-600">
                      No SHINE girls are registered in the system yet. Please register a girl first before recording follow-up cases.
                    </p>
                    <button
                      onClick={() => {
                        onSelectAction('register-girl');
                        onClose();
                        setSelectedAction(null);
                      }}
                      className="px-3.5 py-2 text-xs font-bold text-white bg-teal-800 hover:bg-teal-900 rounded-lg"
                    >
                      Register SHINE Girl Now
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Choose SHINE Girl:
                    </label>
                    <select
                      value={targetGirlId}
                      onChange={(e) => setTargetGirlId(e.target.value)}
                      className="w-full p-2.5 text-sm border border-stone-300 rounded-lg bg-white"
                    >
                      {db.girls.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.fullName} ({g.school}, {g.classLevel})
                        </option>
                      ))}
                    </select>
                  </div>
                )
              ) : (
                db.households.length === 0 ? (
                  <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-center space-y-2">
                    <p className="text-xs text-stone-600">
                      No households are registered yet. Please add a household first before recording house activities or finances.
                    </p>
                    <button
                      onClick={() => {
                        onSelectAction('register-house');
                        onClose();
                        setSelectedAction(null);
                      }}
                      className="px-3.5 py-2 text-xs font-bold text-white bg-teal-800 hover:bg-teal-900 rounded-lg"
                    >
                      Add Household Now
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Choose Household:
                    </label>
                    <select
                      value={targetHouseId}
                      onChange={(e) => setTargetHouseId(e.target.value)}
                      className="w-full p-2.5 text-sm border border-stone-300 rounded-lg bg-white"
                    >
                      {db.households.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} (House Mum: {h.houseMum})
                        </option>
                      ))}
                    </select>
                  </div>
                )
              )}

              {((selectedAction === 'add-edu' ||
                selectedAction === 'add-health' ||
                selectedAction === 'add-family') &&
                db.girls.length > 0) ||
              ((selectedAction === 'add-activity' ||
                selectedAction === 'add-rent' ||
                selectedAction === 'add-expense') &&
                db.households.length > 0) ? (
                <div className="pt-3 flex gap-2">
                  <button
                    onClick={() => setSelectedAction(null)}
                    className="flex-1 py-2 text-xs font-semibold text-stone-700 bg-stone-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmTarget}
                    className="flex-1 py-2 text-xs font-bold text-white bg-teal-800 hover:bg-teal-900 rounded-lg"
                  >
                    Continue to Form
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
