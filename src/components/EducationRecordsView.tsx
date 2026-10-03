import React, { useMemo, useState } from 'react';
import { AppDatabase, EducationHistoryStatus } from '../types';
import { addAcademicSupportRecord, addEducationHistoryRecord, addExaminationRecord, updateEducationHistoryRecord, updateGirl } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, ClipboardCheck, FileCheck2, GraduationCap, Plus } from 'lucide-react';

interface EducationRecordsViewProps {
  db: AppDatabase;
  onRefresh: () => void;
}

export const EducationRecordsView: React.FC<EducationRecordsViewProps> = ({ db, onRefresh }) => {
  const { staffProfile, auditActor } = useAuth();
  const [tab, setTab] = useState<'history' | 'support' | 'exams'>('history');
  const [schoolFilter, setSchoolFilter] = useState('All');
  const [classFilter, setClassFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const histories = db.educationHistory || [];
  const supports = db.academicSupports || [];
  const examinations = db.examinationRecords || [];
  const schoolOptions = [...new Set([...db.girls.map((girl) => girl.school), ...histories.map((record) => record.school)].filter(Boolean))];
  const classOptions = [...new Set([...db.girls.map((girl) => girl.classLevel), ...histories.map((record) => record.classLevel)].filter(Boolean))];
  const yearOptions = [...new Set(histories.map((record) => record.academicYear).filter(Boolean))].sort();
  const filteredHistory = histories.filter((record) =>
    (schoolFilter === 'All' || record.school === schoolFilter) &&
    (classFilter === 'All' || record.classLevel === classFilter) &&
    (yearFilter === 'All' || record.academicYear === yearFilter) &&
    (statusFilter === 'All' || record.status === statusFilter)
  ).sort((a, b) => (b.startDate || b.createdAt).localeCompare(a.startDate || a.createdAt));

  const outstandingEducation = db.educationalFollowUps.filter((record) => record.furtherActionRequired).length;
  const supportedGirls = new Set(supports.filter((record) => record.furtherActionRequired).map((record) => record.girlId)).size;
  const preparingGirls = new Set(examinations.filter((record) => record.supportRequired?.trim()).map((record) => record.girlId)).size;
  const recentChanges = useMemo(() => [...histories].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [histories]);

  const onHistorySubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const girlId = String(data.get('girlId') || '');
    const academicYear = String(data.get('academicYear') || '').trim();
    const school = String(data.get('school') || '').trim();
    const classLevel = String(data.get('classLevel') || '').trim();
    const status = String(data.get('status') || 'Current') as EducationHistoryStatus;
    const startDate = String(data.get('startDate') || '') || undefined;
    const girl = db.girls.find((item) => item.id === girlId);
    if (!girl || !school || !classLevel) return;

    if (status === 'Current') {
      const currentEntries = histories.filter((record) => record.girlId === girlId && record.status === 'Current');
      currentEntries.forEach((record) => {
        updateEducationHistoryRecord(record.id, {
          status: 'Transferred',
          endDate: record.endDate || startDate || new Date().toISOString().slice(0, 10),
          reasonForChange: record.reasonForChange || 'Current school or class updated',
        }, auditActor);
      });
      if (currentEntries.length === 0 && (girl.school || girl.classLevel)) {
        addEducationHistoryRecord({
          girlId,
          academicYear: '',
          school: girl.school,
          classLevel: girl.classLevel,
          endDate: startDate || new Date().toISOString().slice(0, 10),
          status: 'Transferred',
          reasonForChange: String(data.get('reasonForChange') || '').trim() || 'Current school or class updated',
          source: 'Girl profile before education history update',
        }, auditActor);
      }
    }

    addEducationHistoryRecord({
      girlId,
      academicYear,
      school,
      classLevel,
      startDate,
      endDate: String(data.get('endDate') || '') || undefined,
      status,
      reasonForChange: String(data.get('reasonForChange') || '').trim() || undefined,
      notes: String(data.get('notes') || '').trim() || undefined,
      source: String(data.get('source') || '').trim() || undefined,
    }, auditActor);
    if (status === 'Current') updateGirl(girlId, { school, classLevel }, auditActor);
    event.currentTarget.reset();
    onRefresh();
  };

  const onSupportSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const girlId = String(data.get('girlId') || '');
    const areaOfConcern = String(data.get('areaOfConcern') || '').trim();
    if (!girlId || !areaOfConcern) return;
    addAcademicSupportRecord({
      girlId,
      subject: String(data.get('subject') || '').trim(),
      areaOfConcern,
      problemIdentified: String(data.get('problemIdentified') || '').trim(),
      supportProvided: String(data.get('supportProvided') || '').trim(),
      responsiblePerson: String(data.get('responsiblePerson') || '').trim() || undefined,
      date: String(data.get('date') || ''),
      outcome: String(data.get('outcome') || '').trim() || undefined,
      furtherActionRequired: data.get('furtherActionRequired') === 'on',
      nextFollowUpDate: String(data.get('nextFollowUpDate') || '') || undefined,
    }, auditActor);
    event.currentTarget.reset();
    onRefresh();
  };

  const onExamSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const girlId = String(data.get('girlId') || '');
    const examinationType = String(data.get('examinationType') || '').trim();
    const examinationYear = String(data.get('examinationYear') || '').trim();
    if (!girlId || !examinationType || !examinationYear) return;
    const subjects = String(data.get('subjects') || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const separator = line.indexOf(':');
      return separator < 0 ? { subject: line } : { subject: line.slice(0, separator).trim(), result: line.slice(separator + 1).trim() || undefined };
    });
    addExaminationRecord({
      girlId,
      examinationType,
      examinationYear,
      subjects,
      overallOutcome: String(data.get('overallOutcome') || '').trim() || undefined,
      supportRequired: String(data.get('supportRequired') || '').trim() || undefined,
      notes: String(data.get('notes') || '').trim() || undefined,
      sourceDocument: String(data.get('sourceDocument') || '').trim() || undefined,
    }, auditActor);
    event.currentTarget.reset();
    onRefresh();
  };

  const girlName = (girlId: string) => db.girls.find((girl) => girl.id === girlId)?.fullName || girlId;

  return (
    <section className="space-y-4" aria-label="Education records">
      <div>
        <h2 className="text-lg font-black text-stone-900 flex items-center gap-2"><GraduationCap className="w-5 h-5 text-teal-800" />Education</h2>
        <p className="text-xs text-stone-500">Current schooling, preserved school history, academic support, and examination records</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Girls by school', count: new Set(db.girls.map((girl) => girl.school).filter(Boolean)).size, icon: BookOpen, color: 'blue' },
          { label: 'Academic support', count: supportedGirls, icon: GraduationCap, color: 'teal' },
          { label: 'Outstanding follow-ups', count: outstandingEducation, icon: ClipboardCheck, color: 'amber' },
          { label: 'Exam support recorded', count: preparingGirls, icon: FileCheck2, color: 'violet' },
        ].map(({ label, count, icon: Icon, color }) => (
          <div key={label} className={`education-metric-card education-metric-card--${color} flex items-center justify-between gap-2 border p-3 rounded-xl`}>
            <div className="min-w-0">
              <div className="text-[10px] text-stone-600 uppercase font-bold leading-snug">{label}</div>
              <div className="mt-1 text-2xl font-black leading-none">{count}</div>
            </div>
            <span className="education-metric-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-stone-200">
        {(['history', 'support', 'exams'] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`px-3 py-2 text-xs font-bold capitalize ${tab === item ? 'border-b-2 border-teal-800 text-teal-900' : 'text-stone-500'}`}>{item === 'exams' ? 'Examinations' : item === 'support' ? 'Academic support' : 'Education history'}</button>)}
      </div>

      {tab === 'history' && <>
        <form onSubmit={onHistorySubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 bg-white border border-stone-200 p-3 rounded-md">
          <select name="girlId" required className="border border-stone-300 rounded-md px-2 py-2 text-xs"><option value="">Girl *</option>{db.girls.map((girl) => <option key={girl.id} value={girl.id}>{girl.fullName}</option>)}</select>
          <input name="academicYear" placeholder="Academic year" className="border border-stone-300 rounded-md px-2 py-2 text-xs" />
          <input name="school" required placeholder="School *" className="border border-stone-300 rounded-md px-2 py-2 text-xs" />
          <input name="classLevel" required placeholder="Class / Form / Grade *" className="border border-stone-300 rounded-md px-2 py-2 text-xs" />
          <input name="startDate" type="date" aria-label="Start date" className="border border-stone-300 rounded-md px-2 py-2 text-xs" />
          <input name="endDate" type="date" aria-label="End date" className="border border-stone-300 rounded-md px-2 py-2 text-xs" />
          <select name="status" className="border border-stone-300 rounded-md px-2 py-2 text-xs"><option>Current</option><option>Completed</option><option>Transferred</option><option>Other</option></select>
          <input name="reasonForChange" placeholder="Reason for change" className="border border-stone-300 rounded-md px-2 py-2 text-xs" />
          <input name="source" placeholder="Source / document" className="border border-stone-300 rounded-md px-2 py-2 text-xs" />
          <input name="notes" placeholder="Notes" className="border border-stone-300 rounded-md px-2 py-2 text-xs" />
          <button className="inline-flex justify-center items-center gap-1 bg-teal-900 text-white rounded-md px-3 py-2 text-xs font-bold"><Plus className="w-3.5 h-3.5" />Add education record</button>
        </form>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Filter by school" value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)} className="border rounded-md px-2 py-1.5 text-xs"><option>All</option>{schoolOptions.map((value) => <option key={value}>{value}</option>)}</select>
          <select aria-label="Filter by class" value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="border rounded-md px-2 py-1.5 text-xs"><option>All</option>{classOptions.map((value) => <option key={value}>{value}</option>)}</select>
          <select aria-label="Filter by academic year" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="border rounded-md px-2 py-1.5 text-xs"><option>All</option>{yearOptions.map((value) => <option key={value}>{value}</option>)}</select>
          <select aria-label="Filter by education status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="border rounded-md px-2 py-1.5 text-xs"><option>All</option><option>Current</option><option>Completed</option><option>Transferred</option><option>Other</option></select>
        </div>
        <div className="divide-y divide-stone-200 border-y border-stone-200">
          {filteredHistory.map((record) => <article key={record.id} className="py-3 flex flex-wrap justify-between gap-2 text-xs"><div><strong>{girlName(record.girlId)}</strong><span className="text-stone-500"> · {record.academicYear || 'Year not recorded'}</span><div className="mt-0.5 text-stone-700">{record.school} · {record.classLevel}</div><div className="text-[11px] text-stone-500">{record.startDate || 'Start date not recorded'} – {record.endDate || (record.status === 'Current' ? 'Current' : 'End date not recorded')} · {record.status}</div>{record.reasonForChange && <div className="text-[11px] text-stone-600">{record.reasonForChange}</div>}{record.source && <div className="text-[10px] text-stone-500">Source: {record.source}</div>}</div><div className="text-[10px] text-stone-500">Recorded by {record.createdBy}</div></article>)}
          {filteredHistory.length === 0 && <p className="py-6 text-center text-xs text-stone-500">No education history matches these filters.</p>}
        </div>
        <div className="pt-2 border-t border-stone-200"><h3 className="text-xs font-bold text-stone-700 mb-2">Current education overview</h3><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{db.girls.map((girl) => <div key={girl.id} className="bg-white border border-stone-200 rounded-md p-2.5 text-xs"><strong>{girl.fullName}</strong><div className="text-stone-600">{girl.school} · {girl.classLevel}</div></div>)}</div></div>
        {recentChanges.length > 0 && <p className="text-[10px] text-stone-500">Recent school history entries: {recentChanges.length}</p>}
      </>}

      {tab === 'support' && <>
        <form onSubmit={onSupportSubmit} className="grid sm:grid-cols-2 gap-2 bg-white border border-stone-200 p-3 rounded-md">
          <select name="girlId" required className="border rounded-md p-2 text-xs"><option value="">Girl *</option>{db.girls.map((girl) => <option key={girl.id} value={girl.id}>{girl.fullName}</option>)}</select>
          <input name="subject" placeholder="Subject (any subject)" className="border rounded-md p-2 text-xs" />
          <input name="areaOfConcern" required placeholder="Area of concern *" className="border rounded-md p-2 text-xs" />
          <input name="problemIdentified" placeholder="Problem identified" className="border rounded-md p-2 text-xs" />
          <input name="supportProvided" placeholder="Support provided" className="border rounded-md p-2 text-xs" />
          <input name="responsiblePerson" placeholder="Responsible person" className="border rounded-md p-2 text-xs" />
          <input name="date" type="date" required className="border rounded-md p-2 text-xs" />
          <input name="outcome" placeholder="Outcome" className="border rounded-md p-2 text-xs" />
          <input name="nextFollowUpDate" type="date" aria-label="Next follow-up date" className="border rounded-md p-2 text-xs" />
          <label className="flex items-center gap-2 text-xs"><input name="furtherActionRequired" type="checkbox" />Further action required</label>
          <button className="bg-teal-900 text-white rounded-md px-3 py-2 text-xs font-bold">Record support</button>
        </form>
        <div className="divide-y divide-stone-200 border-y border-stone-200">{supports.map((record) => <article key={record.id} className="py-3 text-xs"><strong>{girlName(record.girlId)} · {record.subject || 'Subject not specified'}</strong><div className="text-stone-600">{record.date} · {record.areaOfConcern}</div><div>{record.supportProvided}</div>{record.outcome && <div className="text-stone-600">Outcome: {record.outcome}</div>}</article>)}</div>
      </>}

      {tab === 'exams' && <>
        <form onSubmit={onExamSubmit} className="grid sm:grid-cols-2 gap-2 bg-white border border-stone-200 p-3 rounded-md">
          <select name="girlId" required className="border rounded-md p-2 text-xs"><option value="">Girl *</option>{db.girls.map((girl) => <option key={girl.id} value={girl.id}>{girl.fullName}</option>)}</select>
          <input name="examinationType" required placeholder="Examination type *" className="border rounded-md p-2 text-xs" />
          <input name="examinationYear" required placeholder="Examination year *" className="border rounded-md p-2 text-xs" />
          <textarea name="subjects" rows={2} placeholder="Subjects and recorded results, one per line (e.g. Mathematics: B)" className="border rounded-md p-2 text-xs" />
          <input name="overallOutcome" placeholder="Overall outcome, if recorded" className="border rounded-md p-2 text-xs" />
          <input name="supportRequired" placeholder="Support required" className="border rounded-md p-2 text-xs" />
          <input name="sourceDocument" placeholder="Source document / certificate reference" className="border rounded-md p-2 text-xs" />
          <input name="notes" placeholder="Notes" className="border rounded-md p-2 text-xs" />
          <button className="bg-teal-900 text-white rounded-md px-3 py-2 text-xs font-bold">Record examination</button>
        </form>
        <div className="divide-y divide-stone-200 border-y border-stone-200">{examinations.map((record) => <article key={record.id} className="py-3 text-xs"><strong>{girlName(record.girlId)} · {record.examinationType} ({record.examinationYear})</strong><div className="text-stone-600">{record.subjects?.map((subject) => subject.result ? `${subject.subject}: ${subject.result}` : subject.subject).join(' · ') || 'No subject results recorded'}</div>{record.overallOutcome && <div>Outcome: {record.overallOutcome}</div>}{record.supportRequired && <div className="text-amber-800">Support required: {record.supportRequired}</div>}{record.sourceDocument && <div className="text-[10px] text-stone-500">Source: {record.sourceDocument}</div>}</article>)}</div>
      </>}
    </section>
  );
};