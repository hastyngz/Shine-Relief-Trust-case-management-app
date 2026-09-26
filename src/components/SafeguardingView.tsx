import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, LockKeyhole, RefreshCw, ShieldAlert } from 'lucide-react';
import { Girl, SafeguardingCase, SafeguardingCaseStatus, SafeguardingCategory, SafeguardingRiskLevel } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { downloadCSV } from '../utils/export';

interface SafeguardingViewProps {
  girls: Girl[];
}

interface SafeguardingFile {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  createdAt: string;
  uploadedByName: string;
}

const categories: SafeguardingCategory[] = [
  'Protection concern', 'Incident', 'Disclosure', 'Risk concern', 'Referral', 'Intervention', 'Follow-up', 'Other',
];
const risks: SafeguardingRiskLevel[] = ['Low', 'Medium', 'High', 'Urgent'];
const statuses: SafeguardingCaseStatus[] = ['Open', 'Under Review', 'Action Required', 'Referred', 'Monitoring', 'Resolved', 'Closed'];

export const SafeguardingView: React.FC<SafeguardingViewProps> = ({ girls }) => {
  const { currentUser, staffProfile, allStaff, isAdmin, canCreateSafeguarding, canEditSafeguarding, canCloseSafeguarding } = useAuth();
  const [records, setRecords] = useState<SafeguardingCase[]>([]);
  const [filesByCase, setFilesByCase] = useState<Record<string, SafeguardingFile[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [girlId, setGirlId] = useState('');
  const [dateReported, setDateReported] = useState(new Date().toISOString().slice(0, 10));
  const [incidentDate, setIncidentDate] = useState('');
  const [category, setCategory] = useState<SafeguardingCategory | ''>('');
  const [description, setDescription] = useState('');
  const [immediateConcern, setImmediateConcern] = useState('');
  const [riskLevel, setRiskLevel] = useState<SafeguardingRiskLevel | ''>('');
  const [actionTaken, setActionTaken] = useState('');
  const [referralMade, setReferralMade] = useState(false);
  const [referredTo, setReferredTo] = useState('');
  const [responsibleStaffId, setResponsibleStaffId] = useState(currentUser?.uid || '');
  const [followUpDate, setFollowUpDate] = useState('');

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!currentUser) throw new Error('Sign in is required.');
    const token = await currentUser.getIdToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Safeguarding request was denied.');
    return result;
  }, [currentUser]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await request('/api/safeguarding/cases');
      const cases = result.cases || [];
      setRecords(cases);
      const fileEntries = await Promise.all(cases.map(async (record: SafeguardingCase) => {
        try {
          const fileResult = await request(`/api/safeguarding/cases/${encodeURIComponent(record.id)}/files`);
          return [record.id, fileResult.files || []] as const;
        } catch {
          return [record.id, []] as const;
        }
      }));
      setFilesByCase(Object.fromEntries(fileEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!girlId || !category || !riskLevel || !description.trim()) {
      setError('Girl, category, risk level, and description are required.');
      return;
    }
    try {
      await request('/api/safeguarding/cases', {
        method: 'POST',
        body: JSON.stringify({
          girlId, dateReported, incidentDate: incidentDate || undefined, category,
          description: description.trim(), immediateConcern: immediateConcern.trim(), riskLevel,
          actionTaken: actionTaken.trim(), referralMade, referredTo: referredTo.trim() || undefined,
          responsibleStaffId: responsibleStaffId || currentUser?.uid,
          followUpDate: followUpDate || undefined,
          status: referralMade ? 'Referred' : 'Open',
        }),
      });
      setShowForm(false);
      setGirlId('');
      setCategory('');
      setDescription('');
      setImmediateConcern('');
      setRiskLevel('');
      setActionTaken('');
      setReferralMade(false);
      setReferredTo('');
      setFollowUpDate('');
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const updateRecord = async (record: SafeguardingCase, updates: Partial<SafeguardingCase>) => {
    try {
      await request(`/api/safeguarding/cases/${encodeURIComponent(record.id)}`, {
        method: 'PATCH', body: JSON.stringify(updates),
      });
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const uploadFile = async (record: SafeguardingCase, file?: File) => {
    if (!file || !currentUser) return;
    const fileId = `sf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/safeguarding/cases/${encodeURIComponent(record.id)}/files/${fileId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not upload safeguarding file.');
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const downloadFile = async (record: SafeguardingCase, file: SafeguardingFile) => {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/safeguarding/cases/${encodeURIComponent(record.id)}/files/${encodeURIComponent(file.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not download safeguarding document.');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.fileName;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const mayEdit = (record: SafeguardingCase) =>
    isAdmin || canEditSafeguarding || record.authorizedStaffUids?.includes(currentUser?.uid || '');

  return (
    <section className="space-y-4" aria-label="Safeguarding cases">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-rose-800" />Safeguarding</h2>
          <p className="text-xs text-stone-500">Restricted protection records. Access and changes are audited.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadRecords()} className="p-2 border border-stone-300 rounded-md text-stone-700" title="Refresh safeguarding list"><RefreshCw className="w-4 h-4" /></button>
          {records.length > 0 && <button onClick={() => downloadCSV('SHINE_Restricted_Safeguarding_Report', [
            ['Case ID', 'Girl ID', 'Reported', 'Incident Date', 'Category', 'Risk', 'Description', 'Immediate Concern', 'Action Taken', 'Referral Made', 'Referred To', 'Responsible Staff', 'Follow-up Date', 'Outcome', 'Status'],
            ...records.map((record) => [record.id, record.girlId, record.dateReported, record.incidentDate || '', record.category, record.riskLevel, record.description, record.immediateConcern, record.actionTaken, record.referralMade ? 'Yes' : 'No', record.referredTo || '', record.responsibleStaffName, record.followUpDate || '', record.outcome || '', record.status]),
          ])} className="px-3 py-2 border border-rose-300 text-rose-900 rounded-md text-xs font-bold">Export restricted report</button>}
          {canCreateSafeguarding && <button onClick={() => setShowForm((value) => !value)} className="px-3 py-2 bg-rose-900 text-white rounded-md text-xs font-bold">New safeguarding record</button>}
        </div>
      </div>

      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-md p-3 text-xs text-rose-950">
        <LockKeyhole className="w-4 h-4 shrink-0 mt-0.5" />
        <p>Records are loaded only through the permission-checked server endpoint. They are not included in general Firestore snapshots or local backups.</p>
      </div>

      {error && <p role="alert" className="bg-rose-50 border border-rose-200 rounded-md p-3 text-xs text-rose-800">{error}</p>}

      {showForm && canCreateSafeguarding && (
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-white border border-rose-200 rounded-lg">
          <label className="text-xs font-semibold text-stone-700">Girl *
            <select required value={girlId} onChange={(event) => setGirlId(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md p-2">
              <option value="">Choose girl</option>
              {girls.map((girl) => <option key={girl.id} value={girl.id}>{girl.fullName} ({girl.id})</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-700">Date reported *<input required type="date" value={dateReported} onChange={(event) => setDateReported(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md p-2" /></label>
          <label className="text-xs font-semibold text-stone-700">Incident date, if known<input type="date" value={incidentDate} onChange={(event) => setIncidentDate(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md p-2" /></label>
          <label className="text-xs font-semibold text-stone-700">Category *
            <select required value={category} onChange={(event) => setCategory(event.target.value as SafeguardingCategory)} className="mt-1 w-full border border-stone-300 rounded-md p-2"><option value="">Choose category</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-stone-700">Risk level *
            <select required value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as SafeguardingRiskLevel)} className="mt-1 w-full border border-stone-300 rounded-md p-2"><option value="">Choose risk level</option>{risks.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-stone-700">Responsible staff member
            <select value={responsibleStaffId} onChange={(event) => setResponsibleStaffId(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md p-2">
              <option value={currentUser?.uid}>{staffProfile?.fullName || 'Me'}</option>{allStaff.filter((staff) => staff.status === 'Active' && staff.uid !== currentUser?.uid).map((staff) => <option key={staff.uid} value={staff.uid}>{staff.fullName}</option>)}
            </select>
          </label>
          <label className="md:col-span-2 text-xs font-semibold text-stone-700">Description *<textarea required rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md p-2" /></label>
          <label className="md:col-span-2 text-xs font-semibold text-stone-700">Immediate concern<textarea rows={2} value={immediateConcern} onChange={(event) => setImmediateConcern(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md p-2" /></label>
          <label className="md:col-span-2 text-xs font-semibold text-stone-700">Action taken<textarea rows={2} value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md p-2" /></label>
          <label className="flex items-center gap-2 text-xs text-stone-700"><input type="checkbox" checked={referralMade} onChange={(event) => setReferralMade(event.target.checked)} />Referral made</label>
          <label className="text-xs font-semibold text-stone-700">Referred to<input value={referredTo} onChange={(event) => setReferredTo(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md p-2" /></label>
          <label className="text-xs font-semibold text-stone-700">Follow-up date<input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} className="mt-1 w-full border border-stone-300 rounded-md p-2" /></label>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 text-xs">Cancel</button><button type="submit" className="px-4 py-2 bg-rose-900 text-white rounded-md text-xs font-bold">Save restricted record</button></div>
        </form>
      )}

      {loading ? <p className="text-xs text-stone-500 py-6">Loading permission-checked records…</p> : (
        <div className="divide-y divide-rose-100 border-y border-rose-200">
          {records.map((record) => (
            <article key={record.id} className="py-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-stone-900">{record.category} · {record.girlId}</h3>
                  <p className="text-[11px] text-stone-500">Reported {record.dateReported}{record.incidentDate ? ` · Incident ${record.incidentDate}` : ''} · Responsible: {record.responsibleStaffName}</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold">
                  <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-900">{record.riskLevel} risk</span>
                  {mayEdit(record) && <select aria-label={`Status for ${record.id}`} value={record.status} onChange={(event) => void updateRecord(record, { status: event.target.value as SafeguardingCaseStatus })} className="border border-stone-300 rounded-md px-2 py-1.5"><option value="">Select status</option>{statuses.filter((item) => item !== 'Closed' || canCloseSafeguarding || isAdmin).map((item) => <option key={item}>{item}</option>)}</select>}
                  {!mayEdit(record) && <span className="px-2 py-1 rounded-full bg-stone-100 text-stone-700">{record.status}</span>}
                  {!mayEdit(record) && canCloseSafeguarding && record.status !== 'Closed' && <button onClick={() => void updateRecord(record, { status: 'Closed' })} className="px-2 py-1.5 rounded-md bg-stone-900 text-white">Close</button>}
                </div>
              </div>
              <p className="text-xs text-stone-800 whitespace-pre-line">{record.description}</p>
              {record.immediateConcern && <p className="text-xs text-rose-900"><strong>Immediate concern:</strong> {record.immediateConcern}</p>}
              {record.actionTaken && <p className="text-xs text-stone-700"><strong>Action taken:</strong> {record.actionTaken}</p>}
              {record.referredTo && <p className="text-xs text-stone-700"><strong>Referred to:</strong> {record.referredTo}</p>}
              {record.followUpDate && <p className="text-xs text-stone-600">Follow-up: {record.followUpDate}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(filesByCase[record.id] || []).map((file) => <button key={file.id} onClick={() => void downloadFile(record, file)} className="px-2 py-1 border border-rose-200 rounded-md text-rose-900">{file.fileName} · {file.uploadedByName}</button>)}
                {(record.responsibleStaffId === currentUser?.uid || canEditSafeguarding || isAdmin) && <label className="px-2 py-1 bg-stone-100 rounded-md font-semibold cursor-pointer">Add protected document<input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(event) => { void uploadFile(record, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>}
              </div>
              {(canEditSafeguarding || isAdmin) && <label className="block text-xs font-semibold text-stone-700">Outcome
                <textarea defaultValue={record.outcome || ''} rows={2} onBlur={(event) => { if (event.target.value !== (record.outcome || '')) void updateRecord(record, { outcome: event.target.value }); }} className="mt-1 w-full border border-stone-300 rounded-md p-2" />
              </label>}
              <p className="text-[10px] text-stone-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Created by {record.createdBy} · {record.createdAt.slice(0, 10)} · {record.id}</p>
            </article>
          ))}
          {records.length === 0 && !error && <p className="py-8 text-center text-xs text-stone-500">No safeguarding records are available to your account.</p>}
        </div>
      )}
    </section>
  );
};