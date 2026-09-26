import React, { useState, useMemo, useEffect } from 'react';
import { AppDatabase, Girl, Household } from '../types';
import { formatDate } from '../utils/export';
import { Search, X, Users, Home, GraduationCap, HeartPulse, Sparkles, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface SearchModalProps {
  db: AppDatabase;
  isOpen: boolean;
  onClose: () => void;
  onSelectGirl: (girlId: string) => void;
  onSelectHouse: (houseId: string) => void;
  onNavigateToCaseManagement: () => void;
}

interface AdvancedSearchResult {
  id: string;
  type: string;
  title: string;
  details: string;
  girlId?: string;
  householdId?: string;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  db,
  isOpen,
  onClose,
  onSelectGirl,
  onSelectHouse,
  onNavigateToCaseManagement,
}) => {
  const [query, setQuery] = useState('');
  const [safeguardingResults, setSafeguardingResults] = useState<Array<{ id: string; girlId: string; category: string; dateReported: string; status: string }>>([]);
  const { currentUser } = useAuth();

  const girlMap = useMemo(() => new Map(db.girls.map((g) => [g.id, g.fullName])), [db.girls]);
  const houseMap = useMemo(() => new Map(db.households.map((h) => [h.id, h.name])), [db.households]);

  const results = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) {
      return { girls: [], houses: [], edu: [], hlt: [], fam: [], act: [], advanced: [] };
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

    const advanced: AdvancedSearchResult[] = [
      ...(db.caseActions || []).filter((item) => `${item.title} ${item.description} ${item.status}`.toLowerCase().includes(q)).map((item) => ({ id: item.id, type: 'Case action', title: item.title, details: `${item.status} · ${item.priority} · Due ${item.dueDate}`, girlId: item.girlId, householdId: item.householdId })),
      ...(db.educationHistory || []).filter((item) => `${item.school} ${item.classLevel} ${item.academicYear} ${item.reasonForChange || ''}`.toLowerCase().includes(q)).map((item) => ({ id: item.id, type: 'Education history', title: `${item.school} · ${item.classLevel}`, details: `${item.academicYear || 'Year not recorded'} · ${item.status}`, girlId: item.girlId })),
      ...(db.academicSupports || []).filter((item) => `${item.subject} ${item.areaOfConcern} ${item.problemIdentified} ${item.supportProvided}`.toLowerCase().includes(q)).map((item) => ({ id: item.id, type: 'Academic support', title: item.subject || item.areaOfConcern, details: item.areaOfConcern, girlId: item.girlId })),
      ...(db.examinationRecords || []).filter((item) => `${item.examinationType} ${item.examinationYear} ${item.overallOutcome || ''}`.toLowerCase().includes(q)).map((item) => ({ id: item.id, type: 'Examination', title: `${item.examinationType} · ${item.examinationYear}`, details: item.overallOutcome || 'Outcome not recorded', girlId: item.girlId })),
      ...(db.attendanceRecords || []).filter((item) => `${item.activityName} ${item.activityType} ${item.status} ${item.location || ''}`.toLowerCase().includes(q)).map((item) => ({ id: item.id, type: 'Attendance', title: item.activityName, details: `${item.status} · ${item.date}`, girlId: item.girlId })),
      ...(db.girlLeaves || []).filter((item) => `${item.leaveType} ${item.reason} ${item.status}`.toLowerCase().includes(q)).map((item) => ({ id: item.id, type: 'Leave', title: item.leaveType, details: `${item.status} · ${item.startDate} – ${item.expectedReturnDate}`, girlId: item.girlId })),
      ...(db.caseReviews || []).filter((item) => `${item.currentSituation || ''} ${item.progress || ''} ${item.actionPlan || ''}`.toLowerCase().includes(q)).map((item) => ({ id: item.id, type: 'Case review', title: `Review · ${item.reviewDate}`, details: item.currentSituation || item.progress || '', girlId: item.girlId })),
      ...(db.people || []).filter((item) => `${item.fullName} ${item.personType} ${item.phoneNumber || ''} ${item.organisation || ''}`.toLowerCase().includes(q)).map((item) => ({ id: item.id, type: 'Contact', title: item.fullName, details: `${item.personType}${item.phoneNumber ? ` · ${item.phoneNumber}` : ''}` })),
    ];

    return {
      girls: matchedGirls,
      houses: matchedHouses,
      edu: matchedEdu,
      hlt: matchedHlt,
      fam: matchedFam,
      act: matchedAct,
      advanced,
    };
  }, [query, db]);

  useEffect(() => {
    if (!isOpen || query.trim().length < 2 || !currentUser) {
      setSafeguardingResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      currentUser.getIdToken().then((token) => fetch(`/api/safeguarding/cases?search=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })).then(async (response) => response.ok ? response.json() : { cases: [] })
        .then((result) => setSafeguardingResults(result.cases || []))
        .catch((error) => { if (error.name !== 'AbortError') setSafeguardingResults([]); });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, query, currentUser?.uid]);

  if (!isOpen) return null;

  const totalResults =
    results.girls.length +
    results.houses.length +
    results.edu.length +
    results.hlt.length +
    results.fam.length +
    results.act.length;
  const totalVisibleResults = totalResults + results.advanced.length + safeguardingResults.length;

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
            placeholder="Search girls, houses, cases, actions, education, activities, contacts..."
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
          ) : totalVisibleResults === 0 ? (
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

              {results.advanced.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-stone-800 uppercase tracking-wider mb-1.5">Case management records ({results.advanced.length})</div>
                  <div className="space-y-1">
                    {results.advanced.map((item) => (
                      <button key={`${item.type}-${item.id}`} onClick={() => {
                        if (item.girlId) onSelectGirl(item.girlId);
                        else if (item.householdId) onSelectHouse(item.householdId);
                        else onNavigateToCaseManagement();
                        onClose();
                      }} className="w-full text-left p-2.5 rounded-lg border border-stone-200 hover:border-teal-700 hover:bg-teal-50/50 flex items-center justify-between gap-2">
                        <span><strong className="block text-xs text-stone-900">{item.title}</strong><span className="text-[10px] text-stone-500">{item.type} · {item.girlId ? girlMap.get(item.girlId) || item.girlId : item.householdId ? houseMap.get(item.householdId) || item.householdId : item.details}</span></span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0 text-stone-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {safeguardingResults.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-rose-900 uppercase tracking-wider mb-1.5">Safeguarding · authorized results ({safeguardingResults.length})</div>
                  <div className="space-y-1">
                    {safeguardingResults.map((item) => <button key={item.id} onClick={() => { onSelectGirl(item.girlId); onClose(); }} className="w-full text-left p-2.5 rounded-lg border border-rose-200 hover:bg-rose-50 flex items-center justify-between"><span><strong className="block text-xs">{item.category} · {girlMap.get(item.girlId) || item.girlId}</strong><span className="text-[10px] text-stone-500">{item.dateReported} · {item.status}</span></span><ArrowRight className="w-3.5 h-3.5 text-rose-700" /></button>)}
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
