import React, { useState, useMemo } from 'react';
import { AppDatabase, Girl, Household } from '../types';
import { formatDate } from '../utils/export';
import { Search, X, Users, Home, GraduationCap, HeartPulse, Sparkles, ArrowRight } from 'lucide-react';

interface SearchModalProps {
  db: AppDatabase;
  isOpen: boolean;
  onClose: () => void;
  onSelectGirl: (girlId: string) => void;
  onSelectHouse: (houseId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  db,
  isOpen,
  onClose,
  onSelectGirl,
  onSelectHouse,
}) => {
  const [query, setQuery] = useState('');

  const girlMap = useMemo(() => new Map(db.girls.map((g) => [g.id, g.fullName])), [db.girls]);
  const houseMap = useMemo(() => new Map(db.households.map((h) => [h.id, h.name])), [db.households]);

  const results = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) {
      return { girls: [], houses: [], edu: [], hlt: [], fam: [], act: [] };
    }
    const q = query.toLowerCase();

    const matchedGirls = db.girls.filter(
      (g) =>
        g.fullName.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q) ||
        g.school.toLowerCase().includes(q) ||
        g.classLevel.toLowerCase().includes(q) ||
        g.guardianInfo.name.toLowerCase().includes(q)
    );

    const matchedHouses = db.households.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.location.toLowerCase().includes(q) ||
        h.houseMum.toLowerCase().includes(q) ||
        h.id.toLowerCase().includes(q)
    );

    const matchedEdu = db.educationalFollowUps.filter(
      (e) =>
        e.academicIssue.toLowerCase().includes(q) ||
        e.problemsExperienced.toLowerCase().includes(q) ||
        (e.supportProvided && e.supportProvided.toLowerCase().includes(q))
    );

    const matchedHlt = db.healthFollowUps.filter(
      (h) =>
        h.reasonForVisit.toLowerCase().includes(q) ||
        h.healthIssueComplaint.toLowerCase().includes(q) ||
        h.medicalFacility.toLowerCase().includes(q) ||
        (h.treatmentProvided && h.treatmentProvided.toLowerCase().includes(q))
    );

    const matchedFam = db.familyFollowUps.filter(
      (f) =>
        f.contactType.toLowerCase().includes(q) ||
        f.familySituation.toLowerCase().includes(q)
    );

    const matchedAct = db.householdActivities.filter(
      (a) =>
        a.activityName.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.activityType.toLowerCase().includes(q)
    );

    return {
      girls: matchedGirls,
      houses: matchedHouses,
      edu: matchedEdu,
      hlt: matchedHlt,
      fam: matchedFam,
      act: matchedAct,
    };
  }, [query, db]);

  if (!isOpen) return null;

  const totalResults =
    results.girls.length +
    results.houses.length +
    results.edu.length +
    results.hlt.length +
    results.fam.length +
    results.act.length;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-start justify-center pt-10 sm:pt-20 px-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Input Box */}
        <div className="p-4 border-b border-stone-200 flex items-center gap-3 bg-stone-50">
          <Search className="w-5 h-5 text-teal-800 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search girls, houses, schools, medical symptoms, guardian..."
            className="w-full text-base bg-transparent border-none outline-none text-stone-900 placeholder-stone-400"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-stone-400 hover:text-stone-600 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-200/80 rounded-lg"
          >
            Esc
          </button>
        </div>

        {/* Results Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {query.trim().length < 2 ? (
            <div className="text-center py-10 text-stone-400 text-xs">
              Type at least 2 characters to search across all case files and household records.
            </div>
          ) : totalResults === 0 ? (
            <div className="text-center py-10 text-stone-500 text-xs">
              No matching records found for "{query}".
            </div>
          ) : (
            <div className="space-y-4">
              {/* Girls Results */}
              {results.girls.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-teal-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>SHINE Girls ({results.girls.length})</span>
                  </div>
                  <div className="space-y-1">
                    {results.girls.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => {
                          onSelectGirl(g.id);
                          onClose();
                        }}
                        className="p-2.5 rounded-lg border border-stone-200 hover:border-teal-700 hover:bg-teal-50/50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs text-stone-900">{g.fullName}</div>
                          <div className="text-[11px] text-stone-500">
                            {g.school} • {g.classLevel} • {houseMap.get(g.householdId)}
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-teal-800">Profile →</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Household Results */}
              {results.houses.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-stone-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Home className="w-3.5 h-3.5 text-teal-800" />
                    <span>Households ({results.houses.length})</span>
                  </div>
                  <div className="space-y-1">
                    {results.houses.map((h) => (
                      <div
                        key={h.id}
                        onClick={() => {
                          onSelectHouse(h.id);
                          onClose();
                        }}
                        className="p-2.5 rounded-lg border border-stone-200 hover:border-teal-700 hover:bg-teal-50/50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs text-stone-900">{h.name}</div>
                          <div className="text-[11px] text-stone-500">
                            House Mum: {h.houseMum} • {h.location}
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-teal-800">View House →</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Educational Follow-ups */}
              {results.edu.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-teal-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>Educational Logs ({results.edu.length})</span>
                  </div>
                  <div className="space-y-1">
                    {results.edu.map((e) => (
                      <div
                        key={e.id}
                        onClick={() => {
                          onSelectGirl(e.girlId);
                          onClose();
                        }}
                        className="p-2.5 rounded-lg border border-stone-200 hover:border-teal-700 hover:bg-teal-50/50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs text-stone-900">
                            {e.academicIssue} ({girlMap.get(e.girlId)})
                          </div>
                          <div className="text-[11px] text-stone-500 truncate max-w-md">
                            {e.problemsExperienced}
                          </div>
                        </div>
                        <span className="text-[11px] font-medium text-stone-400">
                          {formatDate(e.date)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Health Records */}
              {results.hlt.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-rose-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <HeartPulse className="w-3.5 h-3.5" />
                    <span>Medical Records ({results.hlt.length})</span>
                  </div>
                  <div className="space-y-1">
                    {results.hlt.map((h) => (
                      <div
                        key={h.id}
                        onClick={() => {
                          onSelectGirl(h.girlId);
                          onClose();
                        }}
                        className="p-2.5 rounded-lg border border-stone-200 hover:border-rose-400 hover:bg-rose-50/50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs text-stone-900">
                            {h.reasonForVisit} ({girlMap.get(h.girlId)})
                          </div>
                          <div className="text-[11px] text-stone-500 truncate max-w-md">
                            {h.medicalFacility} • {h.healthIssueComplaint}
                          </div>
                        </div>
                        <span className="text-[11px] font-medium text-stone-400">
                          {formatDate(h.date)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Group Activities */}
              {results.act.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Group Activities ({results.act.length})</span>
                  </div>
                  <div className="space-y-1">
                    {results.act.map((a) => (
                      <div
                        key={a.id}
                        onClick={() => {
                          onSelectHouse(a.householdId);
                          onClose();
                        }}
                        className="p-2.5 rounded-lg border border-stone-200 hover:border-amber-400 hover:bg-amber-50/50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs text-stone-900">
                            {a.activityName} ({houseMap.get(a.householdId)})
                          </div>
                          <div className="text-[11px] text-stone-500 truncate max-w-md">
                            {a.description}
                          </div>
                        </div>
                        <span className="text-[11px] font-medium text-stone-400">
                          {formatDate(a.date)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
