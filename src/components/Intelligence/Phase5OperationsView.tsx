import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, DollarSign, LineChart, ListPlus, Mic, Plus, Save, Search, Sparkles, Utensils, X } from 'lucide-react';
import type { AppDatabase, FeedingProgramLog, MarketPriceRecord, MeetingRecord, WhatIfScenario } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { addEarlyYearsRecord, addFeedingProgramLog, addMarketPrice, addMeetingRecord, addScheduleItem, addWhatIfScenario, addWorkplanItem, updateWorkplanItem, saveAISettings, saveIntelligenceSuggestion } from '../../utils/storage';
import { AudioDataInput } from './AudioDataInput';
import { DocumentIntelligencePanel } from './DocumentIntelligencePanel';
import { calculateBudgetForecast, calculateFeedingCostInsight, calculateMarketPriceInsight, calculateWhatIfScenario, searchOperationalRecords } from '../../services/intelligenceService';
import { buildIntelligentCaseSummary, detectIntelligenceSuggestions, findPotentialDuplicates, scanDataQuality } from '../../services/caseIntelligenceService';
import { expandWorkplanOccurrences } from '../../services/workplanRecurrence';

interface Phase5OperationsViewProps { db: AppDatabase; onRefresh: () => void; }
type Phase5Tab = 'overview' | 'meetings' | 'calendar' | 'feeding' | 'prices' | 'early-years' | 'review' | 'search' | 'what-if';
type OperationsAgendaItem = {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  status: string;
  workplanId?: string;
  occurrenceDate?: string;
  completed?: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

export const Phase5OperationsView: React.FC<Phase5OperationsViewProps> = ({ db, onRefresh }) => {
  const { canEdit, isAdmin, role, staffProfile, currentUser } = useAuth();
  const [tab, setTab] = useState<Phase5Tab>('overview');
  const [calendarMode, setCalendarMode] = useState<'month' | 'week' | 'day' | 'agenda'>('agenda');
  const [calendarDate, setCalendarDate] = useState(today());
  const [reviewStatuses, setReviewStatuses] = useState<Record<string, 'accepted' | 'dismissed' | 'edited'>>({});
  const [duplicateDecisions, setDuplicateDecisions] = useState<Record<string, 'use_existing' | 'keep_both'>>({});
  const [summaryGirlId, setSummaryGirlId] = useState('');
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showFeedingForm, setShowFeedingForm] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [showEarlyYearsForm, setShowEarlyYearsForm] = useState(false);
  const [search, setSearch] = useState('');
  const [askQuestion, setAskQuestion] = useState('');
  const [message, setMessage] = useState('');
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [meetingAudioText, setMeetingAudioText] = useState('');
  const [meetingForm, setMeetingForm] = useState({ title: '', dateTime: `${today()}T10:00`, location: '', attendees: '', minutesText: '', summaryAndOutcomes: '' });
  const [feedingForm, setFeedingForm] = useState({ date: today(), studentsPresent: '', mealsServed: '', foodItems: '', quantities: '', estimatedCost: '', actualCost: '', notes: '' });
  const [priceForm, setPriceForm] = useState({ itemName: '', category: 'Food', unit: '', price: '', currency: 'MWK', dateRecorded: today(), locationOrShop: '' });
  const [earlyYearsForm, setEarlyYearsForm] = useState({ studentName: '', dateOfBirth: '', guardianName: '', enrollmentDate: today(), classGroup: '', attendanceStatus: 'Present' as 'Present' | 'Absent' | 'Late' | 'Excused', studentStatus: 'Active' as 'Active' | 'Completed' | 'Transferred' | 'Inactive', notes: '' });
  const [scenario, setScenario] = useState<WhatIfScenario>({ id: 'draft', name: 'Scenario', foodPricePercent: 10, fuelPricePercent: 0, transportPercent: 0, studentPopulationPercent: 0, feedingDaysChange: 0, increasedEnrollmentPercent: 0, createdBy: '', createdAt: '' });
  const [aiSettings, setAISettings] = useState(() => db.aiSettings?.[0] || { id: 'default', enabled: true, speechToText: true, textToSpeech: true, documentAnalysis: true, naturalLanguageSearch: true, dailyUsageLimit: 100, updatedByUid: currentUser?.uid || '', updatedAt: new Date().toISOString() });

  useEffect(() => {
    setUpdatedAt(new Date());
  }, [db]);

  const meetings = db.meetings || [];
  const feedingLogs = db.feedingProgramLogs || [];
  const marketPrices = db.marketPrices || [];
  const earlyYearsRecords = db.earlyYearsRecords || [];
  const forecast = useMemo(
    () => calculateBudgetForecast(db.budgets || [], 1 + ((db.forecastSettings?.[0]?.inflationPercent || 0) / 100)),
    [db.budgets, db.forecastSettings]
  );
  const feedingInsight = useMemo(() => calculateFeedingCostInsight(feedingLogs), [feedingLogs]);
  const scenarioResult = useMemo(() => calculateWhatIfScenario(forecast.forecast, scenario), [forecast.forecast, scenario]);
  const budgetCategoryRows = useMemo(() => Array.from(new Set((db.budgets || []).map((item) => item.category))).map((category) => {
    const lines = (db.budgets || []).filter((item) => item.category === category);
    const approved = lines.reduce((sum, item) => sum + item.budgetAmount, 0);
    const actual = lines.reduce((sum, item) => sum + (item.actualExpenditure || 0), 0);
    return { category, approved, actual, ratio: approved ? Math.min(100, (actual / approved) * 100) : 0 };
  }), [db.budgets]);
  const searchResults = useMemo(() => searchOperationalRecords(db, search), [db, search]);
  const suggestions = useMemo(() => detectIntelligenceSuggestions(db).map((suggestion) => db.intelligenceSuggestions?.find((saved) => saved.id === suggestion.id) || suggestion), [db]);
  const qualityIssues = useMemo(() => scanDataQuality(db), [db]);
  const duplicateCandidates = useMemo(() => findPotentialDuplicates(db), [db]);
  const pendingReviewCount = useMemo(() => {
    const pendingSuggestions = suggestions.filter((suggestion) =>
      !reviewStatuses[suggestion.id] && suggestion.reviewStatus === 'suggested'
    ).length;
    const pendingDuplicates = qualityIssues.filter((issue) =>
      issue.type === 'duplicate_candidate' && !duplicateDecisions[issue.id]
    ).length;
    const pendingQualityIssues = qualityIssues.filter((issue) => issue.type !== 'duplicate_candidate').length;
    return pendingSuggestions + pendingDuplicates + pendingQualityIssues;
  }, [suggestions, qualityIssues, reviewStatuses, duplicateDecisions]);
  const askAnswer = useMemo(() => {
    if (askQuestion === 'which houses are over budget') {
      const byHouse = new Map<string, { budget: number; actual: number }>();
      (db.budgets || []).filter((line) => line.householdId).forEach((line) => {
        const householdId = line.householdId || '';
        const totals = byHouse.get(householdId) || { budget: 0, actual: 0 };
        totals.budget += line.budgetAmount || 0;
        totals.actual += line.actualExpenditure || 0;
        byHouse.set(householdId, totals);
      });
      const rows = Array.from(byHouse, ([id, totals]) => ({
        name: db.households.find((house) => house.id === id)?.name || id,
        ...totals,
      })).filter((item) => item.actual > item.budget);
      return rows.length
        ? rows.map((item) => `${item.name}: MWK ${item.actual.toLocaleString()} actual vs MWK ${item.budget.toLocaleString()} budget`).join('; ')
        : 'No household-linked budget lines are over budget.';
    }
    if (askQuestion === 'which workplans are overdue') {
      const overdue = (db.workplans || []).filter((item) =>
        item.endDate < today() && !['Completed', 'Cancelled'].includes(item.status)
      );
      return overdue.length ? overdue.map((item) => `${item.activity} (due ${item.endDate})`).join('; ') : 'No workplans are overdue.';
    }
    if (askQuestion === 'how many girls per school') {
      const counts = new Map<string, number>();
      db.girls.forEach((girl) => {
        const school = girl.school || 'Unspecified school';
        counts.set(school, (counts.get(school) || 0) + 1);
      });
      return counts.size
        ? Array.from(counts, ([school, count]) => `${school}: ${count}`).join('; ')
        : 'No girls are recorded.';
    }
    return '';
  }, [db, askQuestion]);
  const caseSummary = useMemo(() => summaryGirlId ? buildIntelligentCaseSummary(db, summaryGirlId) : null, [db, summaryGirlId]);

  const workplanAgenda = useMemo(() => {
    const selectedYear = Number(calendarDate.slice(0, 4));
    const rangeStart = `${selectedYear}-01-01`;
    const rangeEnd = `${selectedYear + 1}-12-31`;
    return (db.workplans || []).flatMap((item) => {
      if (!item.recurrence) {
        return [{ id: item.id, date: item.endDate, time: '', title: item.activity, type: 'Workplan deadline', status: item.status, workplanId: item.id, occurrenceDate: item.endDate, completed: (item.completionDates || []).includes(item.endDate) }];
      }
      return expandWorkplanOccurrences([item], rangeStart, rangeEnd).map((occurrence) => ({
        id: occurrence.occurrenceId,
        date: occurrence.date,
        time: '',
        title: item.activity,
        type: 'Workplan deadline',
        status: item.status,
        workplanId: item.id,
        occurrenceDate: occurrence.date,
        completed: occurrence.completed,
      }));
    });
  }, [db.workplans, calendarDate]);
  const agenda = useMemo<OperationsAgendaItem[]>(() => [
    ...meetings.map((item) => ({ id: item.id, date: item.dateTime.slice(0, 10), time: item.dateTime.slice(11, 16), title: item.title, type: 'Meeting', status: item.status })),
    ...(db.schedules || []).map((item) => ({ id: item.id, date: item.scheduledDate, time: item.scheduledTime || '', title: item.title, type: 'Schedule', status: item.status })),
    ...workplanAgenda,
    ...feedingLogs.map((item) => ({ id: item.id, date: item.date, time: '', title: `School feeding: ${item.mealsServed} meals`, type: 'Feeding', status: 'Recorded' })),
  ].sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`)), [db.schedules, feedingLogs, meetings, workplanAgenda]);
  const visibleAgenda = useMemo(() => {
    if (calendarMode === 'agenda') return agenda;
    if (calendarMode === 'month') return agenda.filter((item) => item.date.slice(0, 7) === calendarDate.slice(0, 7));
    if (calendarMode === 'day') return agenda.filter((item) => item.date === calendarDate);
    const selected = new Date(`${calendarDate}T00:00:00.000Z`);
    const day = selected.getUTCDay() || 7;
    const weekStart = new Date(selected.getTime() - (day - 1) * 86400000).toISOString().slice(0, 10);
    const weekEnd = new Date(selected.getTime() + (7 - day) * 86400000).toISOString().slice(0, 10);
    return agenda.filter((item) => item.date >= weekStart && item.date <= weekEnd);
  }, [agenda, calendarDate, calendarMode]);

  const saveMeeting = (event: React.FormEvent) => {
    event.preventDefault();
    if (!meetingForm.title || !meetingForm.dateTime) return;
    addMeetingRecord({ title: meetingForm.title, dateTime: meetingForm.dateTime, attendees: meetingForm.attendees.split(',').map((item) => item.trim()).filter(Boolean), location: meetingForm.location || undefined, status: 'Planned', minutesText: meetingForm.minutesText || meetingAudioText, transcriptionText: meetingAudioText || undefined, summaryAndOutcomes: meetingForm.summaryAndOutcomes, createdBy: staffProfile?.fullName || 'SHINE Staff' }, staffProfile?.fullName);
    setMeetingForm({ title: '', dateTime: `${today()}T10:00`, location: '', attendees: '', minutesText: '', summaryAndOutcomes: '' });
    setMeetingAudioText(''); setShowMeetingForm(false); setMessage('Meeting saved. Minutes remain editable for review.'); onRefresh();
  };

  const saveFeeding = (event: React.FormEvent) => {
    event.preventDefault();
    const studentsPresent = Number(feedingForm.studentsPresent); const mealsServed = Number(feedingForm.mealsServed); const estimatedCost = Number(feedingForm.estimatedCost);
    if (!feedingForm.date || studentsPresent < 0 || mealsServed < 0 || estimatedCost < 0) return;
    const quantities: Record<string, number> = {};
    feedingForm.quantities.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => { const [name, value] = item.split(':'); quantities[name.trim()] = Number(value) || 0; });
    addFeedingProgramLog({ date: feedingForm.date, studentsPresent, mealsServed, foodItems: feedingForm.foodItems.split(',').map((item) => item.trim()).filter(Boolean), quantities, estimatedCost, actualCost: feedingForm.actualCost ? Number(feedingForm.actualCost) : undefined, notes: feedingForm.notes || undefined, createdBy: staffProfile?.fullName || 'SHINE Staff' });
    setShowFeedingForm(false); setMessage('Feeding log saved and included in cost intelligence.'); onRefresh();
  };

  const savePrice = (event: React.FormEvent) => {
    event.preventDefault();
    if (!priceForm.itemName || Number(priceForm.price) <= 0) return;
    addMarketPrice({ ...priceForm, price: Number(priceForm.price), sourceType: 'manual', createdBy: staffProfile?.fullName || 'SHINE Staff' });
    setShowPriceForm(false); setPriceForm({ ...priceForm, itemName: '', price: '' }); setMessage('Market price saved.'); onRefresh();
  };

  const saveScenario = () => {
    const saved = addWhatIfScenario({ ...scenario, createdBy: staffProfile?.fullName || 'SHINE Staff' });
    setScenario(saved); setMessage('Scenario saved separately from approved budgets.'); onRefresh();
  };

  const saveSettings = () => {
    if (!isAdmin || !currentUser) return;
    saveAISettings({ ...aiSettings, updatedByUid: currentUser.uid, updatedAt: new Date().toISOString() });
    setMessage('AI settings saved by Administrator.');
    onRefresh();
  };

  const markWorkplanOccurrence = (workplanId: string, date: string, completed: boolean) => {
    const item = (db.workplans || []).find((workplan) => workplan.id === workplanId);
    if (!item) return;
    const completionDates = new Set(item.completionDates || []);
    if (completed) completionDates.delete(date);
    else completionDates.add(date);
    updateWorkplanItem(workplanId, { completionDates: Array.from(completionDates).sort() }, staffProfile?.fullName || 'SHINE Staff');
    onRefresh();
  };

  const reviewSuggestion = (suggestion: typeof suggestions[number], reviewStatus: 'accepted' | 'dismissed' | 'edited') => {
    const reviewed = { ...suggestion, reviewStatus, reviewedByUid: currentUser?.uid, reviewedAt: new Date().toISOString() };
    saveIntelligenceSuggestion(reviewed);
    setReviewStatuses({ ...reviewStatuses, [suggestion.id]: reviewStatus });
    onRefresh();
  };

  const convertSuggestionToWorkplan = (suggestion: typeof suggestions[number]) => {
    if (!currentUser || !staffProfile) return;
    addWorkplanItem({ period: 'Phase 5 operational review', periodType: 'monthly', activity: suggestion.title, objective: suggestion.explanation, description: suggestion.suggestedAction || suggestion.explanation, responsibleStaffId: suggestion.assignedStaffId || currentUser.uid, responsibleStaffName: staffProfile.fullName, startDate: today(), endDate: suggestion.suggestedDueDate || today(), targetCount: 1, unit: 'task', completedCount: 0, budget: 0, location: 'SHINE operations', status: 'Planned', progress: 0, notes: `Created from reviewed intelligence suggestion ${suggestion.id}`, linkedActivityIds: suggestion.sourceRecordIds }, staffProfile.fullName);
    reviewSuggestion(suggestion, 'accepted');
    setMessage('Suggestion converted to a workplan item after confirmation.');
    onRefresh();
  };

  const scheduleSuggestion = (suggestion: typeof suggestions[number]) => {
    if (!currentUser || !staffProfile) return;
    addScheduleItem({ type: 'other', title: suggestion.title, description: suggestion.explanation, scheduledDate: suggestion.suggestedDueDate || today(), targetType: 'general', assignedStaffId: suggestion.assignedStaffId || currentUser.uid, assignedStaffName: staffProfile.fullName, status: 'Scheduled', notes: `Created from reviewed intelligence suggestion ${suggestion.id}` }, staffProfile.fullName);
    reviewSuggestion(suggestion, 'accepted');
    setMessage('Suggestion scheduled on the operational calendar after confirmation.');
    onRefresh();
  };

  const saveEarlyYears = (event: React.FormEvent) => {
    event.preventDefault();
    if (!earlyYearsForm.studentName.trim()) return;
    addEarlyYearsRecord({ ...earlyYearsForm, reportingPeriod: earlyYearsForm.enrollmentDate.slice(0, 7), sourceDocument: 'Phase 5 manual entry', createdBy: staffProfile?.fullName || 'SHINE Staff' });
    setShowEarlyYearsForm(false); setEarlyYearsForm({ ...earlyYearsForm, studentName: '', dateOfBirth: '', guardianName: '', notes: '' }); setMessage('Early-years record saved.'); onRefresh();
  };

  const tabGroups: Array<{ label: string; tabs: Array<[Phase5Tab, string, React.ComponentType<{ className?: string }>]> }> = [
    { label: 'Today', tabs: [['overview', 'Overview', Sparkles], ['calendar', 'Calendar', CalendarDays], ['meetings', 'Meetings', ListPlus], ['review', 'Review', CheckCircle2]] },
    { label: 'Insights', tabs: [['feeding', 'Feeding', Utensils], ['prices', 'Market prices', LineChart], ['early-years', 'Early years', ListPlus], ['search', 'Search', Search], ['what-if', 'What-if', DollarSign]] },
  ];
  return <div className="space-y-5 pb-12">
    <header className="flex flex-col gap-3 rounded-2xl bg-teal-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">Phase 5 operations</p><h1 className="mt-1 text-2xl font-black">Intelligence & operational management</h1><p className="mt-1 max-w-2xl text-xs text-teal-100">Meetings, schedules, feeding, market prices, forecasts, and searchable operational records in one place.</p></div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs"><CheckCircle2 className="h-4 w-4 text-emerald-300" />{role || 'Staff'} access</div>
        <span className="text-[10px] text-teal-100">Updated {updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
    </header>
    <nav className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
      {tabGroups.map((group) => <div key={group.label}>
        <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">{group.label}</p>
        <div className="flex gap-2 overflow-x-auto">{group.tabs.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${tab === id ? 'bg-teal-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}><Icon className="h-4 w-4" />{label}{id === 'review' && pendingReviewCount > 0 && <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">{pendingReviewCount}</span>}</button>)}</div>
      </div>)}
    </nav>
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{message}</p>}

    {tab === 'overview' && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Meetings" value={meetings.length} /><Metric label="Feeding cost" value={`MWK ${feedingInsight.actualCost.toLocaleString()}`} /><Metric label="Market prices" value={marketPrices.length} /><Metric label="Budget forecast" value={`MWK ${forecast.forecast.toLocaleString()}`} /></div>
      <section className="grid gap-4 lg:grid-cols-2"><Panel title="Natural-language operational search"><div className="flex gap-2"><Search className="mt-2 h-4 w-4 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search girls, houses, meetings, prices, schedules..." className="field w-full" /></div><div className="mt-3 space-y-2">{search && searchResults.map((result) => <div key={`${result.recordType}-${result.recordId}`} className="rounded-lg border border-stone-200 p-2 text-xs"><strong>{result.title}</strong><span className="ml-2 text-stone-500">{result.detail}</span></div>)}{search && !searchResults.length && <p className="text-xs text-stone-500">No matching SHINE records found.</p>}</div></Panel><Panel title="Forecast and what-if"><div className="grid grid-cols-2 gap-3 text-xs"><Metric label="Approved" value={`MWK ${forecast.approved.toLocaleString()}`} /><Metric label="Actual" value={`MWK ${forecast.actual.toLocaleString()}`} /><Metric label="Forecast" value={`MWK ${forecast.forecast.toLocaleString()}`} /><Metric label="Scenario" value={`MWK ${scenarioResult.scenarioForecast.toLocaleString()}`} /></div>{(isAdmin || role === 'Manager') && <div className="mt-3 grid grid-cols-2 gap-2">{(['foodPricePercent', 'fuelPricePercent', 'transportPercent', 'studentPopulationPercent'] as const).map((key) => <label key={key} className="text-[11px] text-stone-600">{key.replace('Percent', '').replace(/([A-Z])/g, ' $1')} %<input type="number" className="field mt-1" value={scenario[key]} onChange={(event) => setScenario({ ...scenario, [key]: Number(event.target.value) })} /></label>)}</div>}{(isAdmin || role === 'Manager') && <button type="button" onClick={saveScenario} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-teal-950"><Save className="h-4 w-4" />Save scenario</button>}</Panel></section>
      <Panel title="Authorized case summary"><div className="flex flex-wrap gap-2"><select className="field" value={summaryGirlId} onChange={(event) => setSummaryGirlId(event.target.value)}><option value="">Select a girl</option>{db.girls.map((girl) => <option key={girl.id} value={girl.id}>{girl.fullName} ({girl.id})</option>)}</select></div>{caseSummary && <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><div><strong>Recent developments</strong>{caseSummary.recentDevelopments.map((item) => <p key={item} className="mt-1 text-stone-600">{item}</p>)}</div><div><strong>Outstanding follow-ups</strong>{caseSummary.outstandingFollowUps.map((item) => <p key={item.id} className="mt-1 text-amber-800">{item.type}: {item.detail} {item.date ? `(due ${item.date})` : ''}</p>)}{!caseSummary.outstandingFollowUps.length && <p className="mt-1 text-stone-500">No outstanding follow-ups recorded.</p>}</div><div><strong>Recorded recommendations</strong>{caseSummary.recommendations.map((item) => <p key={item} className="mt-1 text-stone-600">{item}</p>)}</div><div><strong>Missing information</strong>{caseSummary.missingInformation.map((item) => <p key={item} className="mt-1 text-rose-700">{item}</p>)}{!caseSummary.missingInformation.length && <p className="mt-1 text-stone-500">No missing profile fields detected.</p>}</div></div>}</Panel>
      <Panel title="Ask"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_2fr]"><select className="field" value={askQuestion} onChange={(event) => setAskQuestion(event.target.value)}><option value="">Choose a question</option><option value="which houses are over budget">Which houses are over budget?</option><option value="which workplans are overdue">Which workplans are overdue?</option><option value="how many girls per school">How many girls per school?</option></select><p aria-live="polite" className="self-center text-xs text-stone-700">{askAnswer || 'Answers use locally available records only.'}</p></div></Panel>
      {isAdmin && <Panel title="Administrator AI settings"><div className="grid gap-2 sm:grid-cols-2">{(['enabled', 'speechToText', 'textToSpeech', 'documentAnalysis', 'naturalLanguageSearch'] as const).map((key) => <label key={key} className="flex items-center gap-2 text-xs text-stone-700"><input type="checkbox" checked={aiSettings[key]} onChange={(event) => setAISettings({ ...aiSettings, [key]: event.target.checked })} />{key.replace(/([A-Z])/g, ' $1')}</label>)}<label className="text-xs text-stone-600">Daily usage limit<input type="number" min="1" className="field mt-1" value={aiSettings.dailyUsageLimit} onChange={(event) => setAISettings({ ...aiSettings, dailyUsageLimit: Number(event.target.value) })} /></label></div><button type="button" onClick={saveSettings} className="button-primary mt-3"><Save className="h-4 w-4" />Save AI settings</button></Panel>}
      <section className="grid gap-4 lg:grid-cols-2"><Panel title="Budget vs actual"><div className="space-y-3">{budgetCategoryRows.map((row) => <div key={row.category}><div className="mb-1 flex justify-between text-xs"><strong>{row.category}</strong><span>MWK {row.actual.toLocaleString()} / {row.approved.toLocaleString()}</span></div><div className="h-2 overflow-hidden rounded-full bg-stone-200"><div className={`h-full ${row.actual > row.approved ? 'bg-rose-600' : 'bg-teal-700'}`} style={{ width: `${row.ratio}%` }} /></div></div>)}{!budgetCategoryRows.length && <Empty text="No budget lines available for visualization." />}</div></Panel><Panel title="Feeding coverage"><div className="grid grid-cols-3 gap-2 text-center"><Metric label="Days" value={feedingInsight.days} /><Metric label="Students" value={feedingInsight.studentsPresent} /><Metric label="Meals" value={feedingInsight.mealsServed} /></div>{feedingInsight.days > 0 ? <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Average daily cost: MWK {Math.round(feedingInsight.averageDailyCost).toLocaleString()} · Cost per meal: MWK {Math.round(feedingInsight.costPerMeal).toLocaleString()}</div> : <p className="mt-3 text-xs text-stone-500">No feeding records available for visualization.</p>}</Panel></section>
    </>}

    {tab === 'search' && <Panel title="Search operational records"><div className="flex gap-2"><Search className="mt-2 h-4 w-4 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search girls, houses, meetings, prices, schedules..." className="field w-full" /></div><div className="mt-3 space-y-2">{search && searchResults.map((result) => <div key={`${result.recordType}-${result.recordId}`} className="rounded-lg border border-stone-200 p-2 text-xs"><strong>{result.title}</strong><span className="ml-2 text-stone-500">{result.detail}</span></div>)}{search && !searchResults.length && <p className="text-xs text-stone-500">No matching SHINE records found.</p>}</div></Panel>}
    {tab === 'what-if' && <Panel title="Forecast and what-if"><div className="grid grid-cols-2 gap-3 text-xs"><Metric label="Approved" value={`MWK ${forecast.approved.toLocaleString()}`} /><Metric label="Actual" value={`MWK ${forecast.actual.toLocaleString()}`} /><Metric label="Forecast" value={`MWK ${forecast.forecast.toLocaleString()}`} /><Metric label="Scenario" value={`MWK ${scenarioResult.scenarioForecast.toLocaleString()}`} /></div>{(isAdmin || role === 'Manager') && <div className="mt-3 grid grid-cols-2 gap-2">{(['foodPricePercent', 'fuelPricePercent', 'transportPercent', 'studentPopulationPercent'] as const).map((key) => <label key={key} className="text-[11px] text-stone-600">{key.replace('Percent', '').replace(/([A-Z])/g, ' $1')} %<input type="number" className="field mt-1" value={scenario[key]} onChange={(event) => setScenario({ ...scenario, [key]: Number(event.target.value) })} /></label>)}</div>}{(isAdmin || role === 'Manager') && <button type="button" onClick={saveScenario} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-teal-950"><Save className="h-4 w-4" />Save scenario</button>}</Panel>}

    {tab === 'review' && <section className="grid gap-4 lg:grid-cols-2"><Panel title={`Intelligence review queue (${pendingReviewCount})`}><div className="space-y-2">{suggestions.map((suggestion) => { const status = reviewStatuses[suggestion.id] || (suggestion.reviewStatus === 'suggested' ? undefined : suggestion.reviewStatus); return <div key={suggestion.id} className={`rounded-lg border p-3 text-xs ${status === 'dismissed' ? 'border-stone-200 bg-stone-50 opacity-60' : 'border-amber-200 bg-amber-50/50'}`}><div className="flex justify-between gap-2"><strong>{suggestion.title}</strong><span className="text-[10px] uppercase text-stone-500">{status || suggestion.reviewStatus}</span></div><p className="mt-1 text-stone-700">{suggestion.explanation}</p><p className="mt-1 text-stone-500">Sources: {suggestion.sourceRecordIds.join(', ')}</p>{!status && <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => reviewSuggestion(suggestion, 'accepted')} className="rounded bg-teal-800 px-2 py-1 text-[11px] font-bold text-white">Accept suggestion</button><button type="button" onClick={() => reviewSuggestion(suggestion, 'edited')} className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-bold">Edit before use</button><button type="button" onClick={() => reviewSuggestion(suggestion, 'dismissed')} className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-bold">Dismiss</button></div>}{status === 'accepted' && <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => convertSuggestionToWorkplan(suggestion)} className="rounded bg-teal-800 px-2 py-1 text-[11px] font-bold text-white">Convert to workplan</button><button type="button" onClick={() => scheduleSuggestion(suggestion)} className="rounded border border-teal-700 bg-white px-2 py-1 text-[11px] font-bold text-teal-900">Schedule on calendar</button></div>}</div>; })}{!suggestions.length && <Empty text="No factual intelligence suggestions currently require review." />}</div></Panel><Panel title={`Data quality (${qualityIssues.length})`}><div className="space-y-2">{qualityIssues.map((issue) => <div key={issue.id} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs"><strong>{issue.title}</strong><p className="mt-1 text-rose-800">{issue.detail}</p><p className="mt-1 text-[11px] text-stone-500">{issue.recordType} · {issue.recordId} · {issue.severity}</p>{issue.type === 'duplicate_candidate' && <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setDuplicateDecisions({ ...duplicateDecisions, [issue.id]: 'use_existing' })} className="rounded bg-teal-800 px-2 py-1 text-[11px] font-bold text-white">Use existing record</button><button type="button" onClick={() => setDuplicateDecisions({ ...duplicateDecisions, [issue.id]: 'keep_both' })} className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-bold">Keep both records</button>{duplicateDecisions[issue.id] && <span className="self-center text-[11px] text-stone-600">Decision recorded for review: {duplicateDecisions[issue.id]}</span>}</div>}</div>)}{!qualityIssues.length && !duplicateCandidates.length && <Empty text="No data-quality issues detected." />}</div></Panel><DocumentIntelligencePanel /></section>}

    {tab === 'meetings' && <Panel title="Meetings and minutes" action={canEdit ? <button type="button" onClick={() => setShowMeetingForm(true)} className="button-primary"><Plus className="h-4 w-4" />New meeting</button> : undefined}><div className="space-y-2">{meetings.map((meeting) => <div key={meeting.id} className="rounded-lg border border-stone-200 p-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{meeting.title}</strong><span className="text-xs text-stone-500">{meeting.dateTime.replace('T', ' ')} · {meeting.status}</span></div><p className="mt-1 text-xs text-stone-600">{meeting.summaryAndOutcomes || meeting.minutesText || 'No minutes recorded yet.'}</p></div>)}{!meetings.length && <Empty text="No meetings recorded yet." />}</div></Panel>}

    {tab === 'calendar' && <Panel title="Central operational calendar"><div className="mb-4 flex flex-wrap items-center gap-2"><div className="flex overflow-x-auto rounded-lg border border-stone-200 p-1">{(['month', 'week', 'day', 'agenda'] as const).map((mode) => <button key={mode} type="button" onClick={() => setCalendarMode(mode)} className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize ${calendarMode === mode ? 'bg-teal-900 text-white' : 'text-stone-600'}`}>{mode}</button>)}</div><input type="date" value={calendarDate} onChange={(event) => setCalendarDate(event.target.value)} className="field" /></div><div className="space-y-2">{visibleAgenda.map((item) => <div key={`${item.type}-${item.id}`} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 rounded-lg border border-stone-200 p-3 text-xs"><div className="font-bold text-teal-900">{item.date}<br /><span className="font-normal text-stone-500">{item.time}</span></div><div><strong>{item.title}</strong><div className="text-stone-500">{item.type}</div></div><div className="flex items-center gap-2"><span className="text-stone-500">{item.status}</span>{item.workplanId && item.occurrenceDate && <button type="button" onClick={() => markWorkplanOccurrence(item.workplanId!, item.occurrenceDate!, item.completed || false)} className={`min-h-10 rounded-md border px-2 text-[10px] font-bold ${item.completed ? 'border-emerald-300 text-emerald-800' : 'border-stone-300 text-stone-600'}`} aria-label={item.completed ? 'Mark occurrence incomplete' : 'Mark occurrence done'}>{item.completed ? 'Done' : 'Mark done'}</button>}</div></div>)}{!visibleAgenda.length && <Empty text="No calendar activity is recorded for this view." />}</div></Panel>}

    {tab === 'feeding' && <Panel title="School feeding management" action={canEdit ? <button type="button" onClick={() => setShowFeedingForm(true)} className="button-primary"><Plus className="h-4 w-4" />Record feeding log</button> : undefined}><div className="grid gap-3 sm:grid-cols-4"><Metric label="Days" value={feedingInsight.days} /><Metric label="Meals" value={feedingInsight.mealsServed} /><Metric label="Daily cost" value={`MWK ${Math.round(feedingInsight.averageDailyCost).toLocaleString()}`} /><Metric label="Cost / meal" value={`MWK ${Math.round(feedingInsight.costPerMeal).toLocaleString()}`} /></div><div className="mt-4 space-y-2">{feedingLogs.map((log) => <div key={log.id} className="rounded-lg border border-stone-200 p-3 text-xs"><strong>{log.date}</strong><span className="ml-3">{log.studentsPresent} students · {log.mealsServed} meals · MWK {(log.actualCost ?? log.estimatedCost).toLocaleString()}</span><div className="text-stone-500">{log.foodItems.join(', ')}</div></div>)}</div></Panel>}

    {tab === 'prices' && <Panel title="Market price intelligence" action={canEdit ? <button type="button" onClick={() => setShowPriceForm(true)} className="button-primary"><Plus className="h-4 w-4" />Record price</button> : undefined}><div className="space-y-2">{Array.from(new Set(marketPrices.map((item) => `${item.itemName}|${item.locationOrShop || ''}`))).map((key) => { const [itemName, location] = key.split('|'); const insight = calculateMarketPriceInsight(marketPrices, itemName, location || undefined); return insight ? <div key={key} className="grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-5 text-xs"><strong>{insight.itemName}</strong><span>Current: MWK {insight.currentPrice.toLocaleString()}</span><span>Average: MWK {Math.round(insight.averagePrice).toLocaleString()}</span><span>Range: {insight.minimumPrice.toLocaleString()} - {insight.maximumPrice.toLocaleString()}</span><span className={insight.trend === 'increasing' ? 'text-rose-700' : 'text-emerald-700'}>{insight.trend}{insight.percentageChange === undefined ? '' : ` (${insight.percentageChange.toFixed(1)}%)`}</span></div> : null; })}{!marketPrices.length && <Empty text="No market prices recorded yet." />}</div></Panel>}
    {tab === 'early-years' && <Panel title="Early years students and attendance" action={canEdit ? <button type="button" onClick={() => setShowEarlyYearsForm(true)} className="button-primary"><Plus className="h-4 w-4" />Add student record</button> : undefined}><div className="space-y-2">{earlyYearsRecords.map((record) => <div key={record.id} className="grid gap-2 rounded-lg border border-stone-200 p-3 text-xs sm:grid-cols-5"><strong>{record.studentName || 'Unnamed student'}</strong><span>{record.classGroup || 'Group not set'}</span><span>{record.attendanceStatus || 'Attendance not recorded'}</span><span>{record.studentStatus || 'Active'}</span><span className="text-stone-500">Guardian: {record.guardianName || 'Not recorded'}</span></div>)}{!earlyYearsRecords.length && <Empty text="No early-years records recorded yet." />}</div></Panel>}

    {showMeetingForm && <Modal title="Create meeting" onClose={() => setShowMeetingForm(false)}><form onSubmit={saveMeeting} className="space-y-3"><Input label="Title" value={meetingForm.title} onChange={(value) => setMeetingForm({ ...meetingForm, title: value })} required /><Input label="Date and time" type="datetime-local" value={meetingForm.dateTime} onChange={(value) => setMeetingForm({ ...meetingForm, dateTime: value })} required /><Input label="Location" value={meetingForm.location} onChange={(value) => setMeetingForm({ ...meetingForm, location: value })} /><Input label="Attendees, comma separated" value={meetingForm.attendees} onChange={(value) => setMeetingForm({ ...meetingForm, attendees: value })} /><AudioDataInput label="Meeting audio" onTranscriptionChange={setMeetingAudioText} /><label className="text-xs text-stone-600">Minutes<textarea value={meetingForm.minutesText} onChange={(event) => setMeetingForm({ ...meetingForm, minutesText: event.target.value })} rows={4} className="field mt-1 w-full" /></label><label className="text-xs text-stone-600">Summary and outcomes<textarea value={meetingForm.summaryAndOutcomes} onChange={(event) => setMeetingForm({ ...meetingForm, summaryAndOutcomes: event.target.value })} rows={3} className="field mt-1 w-full" /></label><button className="button-primary" type="submit"><Save className="h-4 w-4" />Save meeting</button></form></Modal>}
    {showFeedingForm && <Modal title="Record feeding log" onClose={() => setShowFeedingForm(false)}><form onSubmit={saveFeeding} className="space-y-3"><Input label="Date" type="date" value={feedingForm.date} onChange={(value) => setFeedingForm({ ...feedingForm, date: value })} required /><div className="grid grid-cols-2 gap-2"><Input label="Students present" type="number" value={feedingForm.studentsPresent} onChange={(value) => setFeedingForm({ ...feedingForm, studentsPresent: value })} required /><Input label="Meals served" type="number" value={feedingForm.mealsServed} onChange={(value) => setFeedingForm({ ...feedingForm, mealsServed: value })} required /><Input label="Estimated cost" type="number" value={feedingForm.estimatedCost} onChange={(value) => setFeedingForm({ ...feedingForm, estimatedCost: value })} required /><Input label="Actual cost" type="number" value={feedingForm.actualCost} onChange={(value) => setFeedingForm({ ...feedingForm, actualCost: value })} /></div><Input label="Food items, comma separated" value={feedingForm.foodItems} onChange={(value) => setFeedingForm({ ...feedingForm, foodItems: value })} /><Input label="Quantities, e.g. maize:2, beans:1" value={feedingForm.quantities} onChange={(value) => setFeedingForm({ ...feedingForm, quantities: value })} /><Input label="Notes" value={feedingForm.notes} onChange={(value) => setFeedingForm({ ...feedingForm, notes: value })} /><AudioDataInput label="Feeding audio" /><button className="button-primary" type="submit"><Save className="h-4 w-4" />Save feeding log</button></form></Modal>}
    {showPriceForm && <Modal title="Record market price" onClose={() => setShowPriceForm(false)}><form onSubmit={savePrice} className="space-y-3"><Input label="Item name" value={priceForm.itemName} onChange={(value) => setPriceForm({ ...priceForm, itemName: value })} required /><div className="grid grid-cols-2 gap-2"><Input label="Category" value={priceForm.category} onChange={(value) => setPriceForm({ ...priceForm, category: value })} /><Input label="Unit" value={priceForm.unit} onChange={(value) => setPriceForm({ ...priceForm, unit: value })} /><Input label="Price" type="number" value={priceForm.price} onChange={(value) => setPriceForm({ ...priceForm, price: value })} required /><Input label="Currency" value={priceForm.currency} onChange={(value) => setPriceForm({ ...priceForm, currency: value })} /><Input label="Date" type="date" value={priceForm.dateRecorded} onChange={(value) => setPriceForm({ ...priceForm, dateRecorded: value })} /><Input label="Location or shop" value={priceForm.locationOrShop} onChange={(value) => setPriceForm({ ...priceForm, locationOrShop: value })} /></div><AudioDataInput label="Price audio entry" /><button className="button-primary" type="submit"><Save className="h-4 w-4" />Save price</button></form></Modal>}
    {showEarlyYearsForm && <Modal title="Add early-years student record" onClose={() => setShowEarlyYearsForm(false)}><form onSubmit={saveEarlyYears} className="space-y-3"><Input label="Student name" value={earlyYearsForm.studentName} onChange={(value) => setEarlyYearsForm({ ...earlyYearsForm, studentName: value })} required /><div className="grid grid-cols-2 gap-2"><Input label="Date of birth" type="date" value={earlyYearsForm.dateOfBirth} onChange={(value) => setEarlyYearsForm({ ...earlyYearsForm, dateOfBirth: value })} /><Input label="Enrollment date" type="date" value={earlyYearsForm.enrollmentDate} onChange={(value) => setEarlyYearsForm({ ...earlyYearsForm, enrollmentDate: value })} /><Input label="Guardian" value={earlyYearsForm.guardianName} onChange={(value) => setEarlyYearsForm({ ...earlyYearsForm, guardianName: value })} /><Input label="Class / group" value={earlyYearsForm.classGroup} onChange={(value) => setEarlyYearsForm({ ...earlyYearsForm, classGroup: value })} /></div><label className="text-xs text-stone-600">Attendance<select className="field mt-1 w-full" value={earlyYearsForm.attendanceStatus} onChange={(event) => setEarlyYearsForm({ ...earlyYearsForm, attendanceStatus: event.target.value as typeof earlyYearsForm.attendanceStatus })}><option>Present</option><option>Absent</option><option>Late</option><option>Excused</option></select></label><Input label="Notes" value={earlyYearsForm.notes} onChange={(value) => setEarlyYearsForm({ ...earlyYearsForm, notes: value })} /><button className="button-primary" type="submit"><Save className="h-4 w-4" />Save student record</button></form></Modal>}
  </div>;
};

const Metric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => <div className="rounded-xl border border-stone-200 bg-white p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-stone-500">{label}</div><div className="mt-1 text-lg font-black text-teal-950">{value}</div></div>;
const Panel: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black text-stone-900">{title}</h2>{action}</div>{children}</section>;
const Empty: React.FC<{ text: string }> = ({ text }) => <p className="rounded-lg bg-stone-50 p-4 text-center text-xs text-stone-500">{text}</p>;
const Input: React.FC<{ label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }> = ({ label, value, onChange, type = 'text', required }) => <label className="block text-xs text-stone-600">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="field mt-1 w-full" /></label>;
const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"><div className="my-4 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-stone-900">{title}</h2><button type="button" onClick={onClose} title="Close" className="rounded-lg p-2 hover:bg-stone-100"><X className="h-5 w-5" /></button></div>{children}</div></div>;
