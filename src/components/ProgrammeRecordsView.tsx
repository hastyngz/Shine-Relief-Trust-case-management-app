import React, { useState } from 'react';
import { AppDatabase, AttendanceStatus, GirlLeaveStatus, LeaveType } from '../types';
import { addAttendanceRecord, addGirlLeaveRecord, updateAttendanceRecord, updateGirlLeaveRecord } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { CalendarCheck2, Plane, Plus, RotateCcw } from 'lucide-react';

interface ProgrammeRecordsViewProps {
  db: AppDatabase;
  onRefresh: () => void;
}

const attendanceStatuses: AttendanceStatus[] = ['Present', 'Absent', 'Excused', 'Late'];
const leaveTypes: LeaveType[] = ['On Holiday', 'Medical Leave', 'Family Leave', 'School Leave', 'Temporarily Away', 'Other'];

export const ProgrammeRecordsView: React.FC<ProgrammeRecordsViewProps> = ({ db, onRefresh }) => {
  const { staffProfile, auditActor } = useAuth();
  const [tab, setTab] = useState<'attendance' | 'leave'>('attendance');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [activityName, setActivityName] = useState('');
  const [activityType, setActivityType] = useState('Training');
  const [location, setLocation] = useState('');
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedGirlIds, setSelectedGirlIds] = useState<string[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus | ''>>({});
  const [attendanceNotes, setAttendanceNotes] = useState('');
  const [leaveGirlId, setLeaveGirlId] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('On Holiday');
  const [startDate, setStartDate] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [leaveNotes, setLeaveNotes] = useState('');
  const [error, setError] = useState('');

  const activities = db.householdActivities || [];
  const attendanceRecords = db.attendanceRecords || [];
  const leaveRecords = db.girlLeaves || [];
  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId);
  const toggleGirl = (girlId: string) => setSelectedGirlIds((current) =>
    current.includes(girlId) ? current.filter((id) => id !== girlId) : [...current, girlId]
  );

  const selectActivity = (activityId: string) => {
    setSelectedActivityId(activityId);
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) return;
    setActivityName(activity.activityName);
    setActivityType(activity.activityType);
    setLocation(activity.location || '');
    setActivityDate(activity.date);
    setSelectedGirlIds(activity.participatingGirlIds || []);
    setAttendance(Object.fromEntries(
      attendanceRecords
        .filter((record) => record.activityId === activityId)
        .map((record) => [record.girlId, record.status])
    ));
  };

  const saveAttendance = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!activityName.trim() || !activityDate || selectedGirlIds.length === 0) {
      setError('Activity, date, and at least one participant are required.');
      return;
    }
    const missingStatus = selectedGirlIds.some((girlId) => !attendance[girlId]);
    if (missingStatus) {
      setError('Choose an attendance status for each selected girl.');
      return;
    }
    const activityId = selectedActivityId || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    selectedGirlIds.forEach((girlId) => {
      const data = {
        activityId,
        activityName: activityName.trim(),
        activityType,
        location: location.trim() || undefined,
        date: activityDate,
        girlId,
        status: attendance[girlId] as AttendanceStatus,
        notes: attendanceNotes.trim() || undefined,
        recordedBy: auditActor,
      };
      const existing = attendanceRecords.find((record) => record.activityId === activityId && record.girlId === girlId);
      if (existing) updateAttendanceRecord(existing.id, data, auditActor);
      else addAttendanceRecord(data, auditActor);
    });
    setSelectedActivityId('');
    setActivityName('');
    setActivityType('Training');
    setLocation('');
    setSelectedGirlIds([]);
    setAttendance({});
    setAttendanceNotes('');
    onRefresh();
  };

  const saveLeave = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!leaveGirlId || !startDate || !expectedReturnDate || !leaveReason.trim() || !approvedBy.trim()) {
      setError('Girl, start date, expected return, reason, and approver are required.');
      return;
    }
    addGirlLeaveRecord({
      girlId: leaveGirlId,
      leaveType,
      startDate,
      expectedReturnDate,
      reason: leaveReason.trim(),
      approvedBy: approvedBy.trim(),
      notes: leaveNotes.trim() || undefined,
      status: 'Active',
    }, auditActor);
    setLeaveGirlId('');
    setStartDate('');
    setExpectedReturnDate('');
    setLeaveReason('');
    setApprovedBy('');
    setLeaveNotes('');
    onRefresh();
  };

  const markReturned = (id: string) => {
    updateGirlLeaveRecord(id, { status: 'Returned', actualReturnDate: new Date().toISOString().slice(0, 10) }, auditActor);
    onRefresh();
  };
  const girlName = (girlId: string) => db.girls.find((girl) => girl.id === girlId)?.fullName || girlId;
  const currentLeaves = leaveRecords.filter((record) => record.status === 'Active');

  return (
    <section className="space-y-4" aria-label="Programme attendance and leave">
      <div>
        <h2 className="text-lg font-black text-stone-900">Attendance & Leave</h2>
        <p className="text-xs text-stone-500">Separate programme attendance and temporary absences from permanent case status</p>
      </div>
      <div className="flex gap-1 border-b border-stone-200">
        <button onClick={() => setTab('attendance')} className={`inline-flex gap-1.5 items-center px-3 py-2 text-xs font-bold ${tab === 'attendance' ? 'border-b-2 border-teal-800 text-teal-900' : 'text-stone-500'}`}><CalendarCheck2 className="w-4 h-4" />Attendance</button>
        <button onClick={() => setTab('leave')} className={`inline-flex gap-1.5 items-center px-3 py-2 text-xs font-bold ${tab === 'leave' ? 'border-b-2 border-teal-800 text-teal-900' : 'text-stone-500'}`}><Plane className="w-4 h-4" />Leave</button>
      </div>
      {error && <p role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 rounded-md p-2.5 text-xs">{error}</p>}

      {tab === 'attendance' && <>
        <form onSubmit={saveAttendance} className="space-y-3 bg-white border border-stone-200 rounded-md p-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <select value={selectedActivityId} onChange={(event) => selectActivity(event.target.value)} className="border rounded-md p-2 text-xs"><option value="">New programme activity</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.date} · {activity.activityName}</option>)}</select>
            <input required value={activityName} onChange={(event) => setActivityName(event.target.value)} placeholder="Activity / programme *" className="border rounded-md p-2 text-xs" />
            <select value={activityType} onChange={(event) => setActivityType(event.target.value)} className="border rounded-md p-2 text-xs">{['Group activity', 'Training', 'Workshop', 'Camp', 'Meeting', 'Educational support', 'Other'].map((item) => <option key={item}>{item}</option>)}</select>
            <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="border rounded-md p-2 text-xs" />
            <input required type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} className="border rounded-md p-2 text-xs" />
            <input value={attendanceNotes} onChange={(event) => setAttendanceNotes(event.target.value)} placeholder="Attendance note (optional)" className="border rounded-md p-2 text-xs" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {db.girls.map((girl) => {
              const checked = selectedGirlIds.includes(girl.id);
              return <div key={girl.id} className="flex items-center gap-2 border border-stone-200 rounded-md p-2">
                <input type="checkbox" checked={checked} onChange={() => toggleGirl(girl.id)} aria-label={`Include ${girl.fullName}`} />
                <span className="min-w-0 flex-1 truncate text-xs">{girl.fullName}</span>
                {checked && <select required value={attendance[girl.id] || ''} onChange={(event) => setAttendance((current) => ({ ...current, [girl.id]: event.target.value as AttendanceStatus }))} aria-label={`Attendance status for ${girl.fullName}`} className="border rounded-md p-1.5 text-[11px]"><option value="">Status</option>{attendanceStatuses.map((item) => <option key={item}>{item}</option>)}</select>}
              </div>;
            })}
          </div>
          <button className="inline-flex items-center gap-1.5 bg-teal-900 text-white rounded-md px-3 py-2 text-xs font-bold"><Plus className="w-3.5 h-3.5" />Save attendance</button>
        </form>
        <div className="divide-y divide-stone-200 border-y border-stone-200">{attendanceRecords.slice().sort((a, b) => b.date.localeCompare(a.date)).map((record) => <article key={record.id} className="py-2.5 flex flex-wrap justify-between gap-2 text-xs"><div><strong>{record.activityName}</strong> · {girlName(record.girlId)}<div className="text-stone-500">{record.date} · {record.activityType}{record.location ? ` · ${record.location}` : ''}</div>{record.notes && <div className="text-stone-600">{record.notes}</div>}</div><span className={`h-fit px-2 py-1 rounded-full font-bold ${record.status === 'Present' ? 'bg-emerald-50 text-emerald-800' : record.status === 'Absent' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}>{record.status}</span></article>)}{attendanceRecords.length === 0 && <p className="py-6 text-center text-xs text-stone-500">No attendance records yet.</p>}</div>
      </>}

      {tab === 'leave' && <>
        <form onSubmit={saveLeave} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 bg-white border border-stone-200 p-3 rounded-md">
          <select required value={leaveGirlId} onChange={(event) => setLeaveGirlId(event.target.value)} className="border rounded-md p-2 text-xs"><option value="">Girl *</option>{db.girls.map((girl) => <option key={girl.id} value={girl.id}>{girl.fullName}</option>)}</select>
          <select value={leaveType} onChange={(event) => setLeaveType(event.target.value as LeaveType)} className="border rounded-md p-2 text-xs">{leaveTypes.map((item) => <option key={item}>{item}</option>)}</select>
          <input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Leave start date" className="border rounded-md p-2 text-xs" />
          <input required type="date" value={expectedReturnDate} onChange={(event) => setExpectedReturnDate(event.target.value)} aria-label="Expected return date" className="border rounded-md p-2 text-xs" />
          <input required value={leaveReason} onChange={(event) => setLeaveReason(event.target.value)} placeholder="Reason *" className="border rounded-md p-2 text-xs" />
          <input required value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} placeholder="Approved by *" className="border rounded-md p-2 text-xs" />
          <input value={leaveNotes} onChange={(event) => setLeaveNotes(event.target.value)} placeholder="Notes" className="border rounded-md p-2 text-xs" />
          <button className="inline-flex items-center gap-1.5 bg-teal-900 text-white rounded-md px-3 py-2 text-xs font-bold"><Plus className="w-3.5 h-3.5" />Record leave</button>
        </form>
        <div className="space-y-4">
          <div><h3 className="text-xs font-bold text-stone-700 mb-2">Currently away ({currentLeaves.length})</h3><div className="divide-y border-y border-stone-200">{currentLeaves.map((record) => <article key={record.id} className="py-3 flex flex-wrap justify-between gap-2 text-xs"><div><strong>{girlName(record.girlId)} · {record.leaveType}</strong><div className="text-stone-500">{record.startDate} – expected {record.expectedReturnDate}</div><div>{record.reason}</div></div><button onClick={() => markReturned(record.id)} className="inline-flex items-center gap-1.5 h-fit px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-900 font-bold"><RotateCcw className="w-3.5 h-3.5" />Record return</button></article>)}</div></div>
          <div><h3 className="text-xs font-bold text-stone-700 mb-2">Leave history</h3><div className="divide-y border-y border-stone-200">{leaveRecords.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).map((record) => <article key={record.id} className="py-2.5 text-xs"><strong>{girlName(record.girlId)} · {record.leaveType}</strong><span className="ml-2 text-stone-500">{record.status}</span><div className="text-stone-600">{record.startDate} – {record.actualReturnDate || record.expectedReturnDate}{record.actualReturnDate ? ` · returned ${record.actualReturnDate}` : ''}</div><div>{record.reason}</div></article>)}{leaveRecords.length === 0 && <p className="py-5 text-center text-xs text-stone-500">No leave records yet.</p>}</div></div>
        </div>
      </>}
    </section>
  );
};