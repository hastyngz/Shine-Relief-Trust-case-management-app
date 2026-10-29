import React, { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Image as ImageIcon, LoaderCircle, Paperclip, Search, ShieldCheck } from 'lucide-react';
import type { AppDatabase, PhotoAttachment } from '../types';
import { filterFilingAttachments, type FilingRecordType } from '../utils/documentFiling';
import { useAuth } from '../contexts/AuthContext';
import { getFilingAttachmentMetadata } from '../services/attachmentService';
import { getStoredFile } from '../services/r2StorageClient';

interface DocumentsFilingViewProps {
  db: AppDatabase;
  onOpenTarget: (targetType: string, targetId: string) => void;
}

type FileFilter = 'All files' | 'Images' | 'Documents';

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Size unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const targetLabels: Record<string, string> = {
  girl: 'Girl record',
  household: 'Household record',
  educationalFollowUp: 'Education follow-up',
  healthFollowUp: 'Health follow-up',
  familyFollowUp: 'Family follow-up',
  householdActivity: 'Household activity',
  programme: 'Programme',
  programmeLog: 'Programme log',
  importBatch: 'Import record',
  rentPayment: 'Rent payment',
  expense: 'Expense record',
};
const targetLabel = (type: string) => targetLabels[type] || type;

const isImage = (attachment: PhotoAttachment) => attachment.contentType?.startsWith('image/');

export const DocumentsFilingView: React.FC<DocumentsFilingViewProps> = ({ db, onOpenTarget }) => {
  const { canViewHealthRecords, currentUser } = useAuth();
  const [attachments, setAttachments] = useState<PhotoAttachment[]>([]);
  const [search, setSearch] = useState('');
  const [fileFilter, setFileFilter] = useState<FileFilter>('All files');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [recordTypeFilter, setRecordTypeFilter] = useState<FilingRecordType>('All record types');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = await getFilingAttachmentMetadata(canViewHealthRecords);
      setAttachments(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Documents could not be loaded. Check your connection and access.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // Re-fetch when the signed-in user or health-record permission changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid, canViewHealthRecords]);

  const categories = useMemo(() => [...new Set(attachments.map((item) => item.category).filter(Boolean))].sort(), [attachments]);
  const recordTypes = useMemo(() => [...new Set(attachments.map((item) => item.targetType).filter(Boolean))].sort() as FilingRecordType[], [attachments]);
  const filtered = useMemo(() => filterFilingAttachments(attachments, {
    search, fileFilter, categoryFilter, recordTypeFilter,
  }), [attachments, search, fileFilter, categoryFilter, recordTypeFilter]);

  const openFile = async (attachment: PhotoAttachment) => {
    setDownloadingId(attachment.id);
    setNotice('');
    setError('');
    try {
      const blob = await getStoredFile(attachment.storagePath);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.fileName || 'shine-document';
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice(`Download started: ${attachment.fileName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file could not be downloaded. It may have been removed or your access may have changed.');
    } finally {
      setDownloadingId(null);
    }
  };

  const openLinkedRecord = (attachment: PhotoAttachment) => {
    onOpenTarget(attachment.targetType, attachment.targetId);
  };

  const linkedName = (attachment: PhotoAttachment) => {
    if (attachment.targetType === 'girl') {
      return db.girls.find((girl) => girl.id === attachment.targetId)?.fullName || attachment.targetId;
    }
    if (attachment.targetType === 'household') {
      return db.households.find((house) => house.id === attachment.targetId)?.name || attachment.targetId;
    }
    if (attachment.targetType === 'educationalFollowUp') {
      const record = db.educationalFollowUps.find((item) => item.id === attachment.targetId);
      return record ? db.girls.find((girl) => girl.id === record.girlId)?.fullName || attachment.targetId : attachment.targetId;
    }
    if (attachment.targetType === 'familyFollowUp') {
      const record = db.familyFollowUps.find((item) => item.id === attachment.targetId);
      return record ? db.girls.find((girl) => girl.id === record.girlId)?.fullName || attachment.targetId : attachment.targetId;
    }
    if (attachment.targetType === 'healthFollowUp' && canViewHealthRecords) {
      const record = db.healthFollowUps.find((item) => item.id === attachment.targetId);
      return record ? db.girls.find((girl) => girl.id === record.girlId)?.fullName || attachment.targetId : attachment.targetId;
    }
    if (['rentPayment', 'expense', 'householdActivity'].includes(attachment.targetType)) {
      const houseId = attachment.targetType === 'rentPayment'
        ? db.rentPayments.find((item) => item.id === attachment.targetId)?.householdId
        : attachment.targetType === 'expense'
          ? db.expenses.find((item) => item.id === attachment.targetId)?.householdId
          : db.householdActivities.find((item) => item.id === attachment.targetId)?.householdId;
      return db.households.find((house) => house.id === houseId)?.name || attachment.targetId;
    }
    return attachment.targetId;
  };

  return (
    <section className="mx-auto max-w-7xl space-y-5 px-1 pb-8" aria-labelledby="documents-filing-title">
      <header className="fx-card rounded-3xl border border-stone-200 bg-white p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-teal-50 p-3 text-teal-900"><Paperclip className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-800">Administration · Phase 1</p>
            <h1 id="documents-filing-title" className="mt-1 text-2xl font-bold text-stone-900">Document index</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">Search existing attachments, identify the record they belong to, and download a file when needed. This view indexes existing private files; it does not duplicate uploads or pretend that version control and compliance tracking are already implemented.</p>
          </div>
          <button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="fx-press inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60" aria-label="Refresh document index">
            <LoaderCircle className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-stone-50 p-3"><p className="text-2xl font-bold text-stone-900">{attachments.length}</p><p className="text-xs text-stone-600">Accessible indexed files</p></div>
          <div className="rounded-2xl bg-stone-50 p-3"><p className="text-2xl font-bold text-stone-900">{attachments.filter(isImage).length}</p><p className="text-xs text-stone-600">Images</p></div>
          <div className="col-span-2 rounded-2xl bg-emerald-50 p-3 sm:col-span-1"><p className="flex items-center gap-2 text-sm font-bold text-emerald-900"><ShieldCheck className="h-4 w-4" /> Access-aware</p><p className="mt-1 text-xs leading-5 text-emerald-800">Health files follow your current permission. Safeguarding attachments are not included in general search.</p></div>
        </div>
      </header>

      <div className="fx-card space-y-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="field min-h-11 w-full pl-10" placeholder="Search filename, caption, category, linked record or uploader…" aria-label="Search documents" />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter files">
          {(['All files', 'Images', 'Documents'] as FileFilter[]).map((filter) => (
            <button key={filter} type="button" onClick={() => setFileFilter(filter)} aria-pressed={fileFilter === filter} className={`fx-press min-h-10 rounded-full border px-4 py-2 text-sm font-semibold ${fileFilter === filter ? 'border-teal-800 bg-teal-800 text-white' : 'border-stone-200 text-stone-700 hover:bg-stone-50'}`}>{filter}</button>
          ))}
          <span className="ml-auto self-center text-xs text-stone-500">{filtered.length} shown</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-stone-700">Document category
            <select aria-label="Filter by document category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="field mt-1 min-h-10 w-full">
              <option>All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-stone-700">Linked record type
            <select aria-label="Filter by linked record type" value={recordTypeFilter} onChange={(event) => setRecordTypeFilter(event.target.value as FilingRecordType)} className="field mt-1 min-h-10 w-full">
              <option>All record types</option>{recordTypes.map((type) => <option key={type} value={type}>{targetLabel(type)}</option>)}
            </select>
          </label>
        </div>
        {(search || fileFilter !== 'All files' || categoryFilter !== 'All categories' || recordTypeFilter !== 'All record types') && <button type="button" onClick={() => { setSearch(''); setFileFilter('All files'); setCategoryFilter('All categories'); setRecordTypeFilter('All record types'); }} className="min-h-10 rounded-xl border border-stone-200 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50">Clear all filters</button>}
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}

      {loading ? (
        <div className="fx-skeleton h-36 rounded-2xl" role="status" aria-label="Loading document index" />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-stone-400" />
          <h2 className="mt-3 font-bold text-stone-800">{attachments.length ? 'No matching files' : 'No accessible attachments found'}</h2>
          <p className="mt-1 text-sm text-stone-500">{attachments.length ? 'Try a different search or filter.' : 'Files added to supported SHINE records will appear here when your account is allowed to view them.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((attachment) => (
            <article key={attachment.id} className="fx-card min-w-0 rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-xl bg-stone-100 p-3 text-stone-700">{isImage(attachment) ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-bold text-stone-900">{attachment.caption?.trim() || attachment.fileName}</h2>
                  {attachment.caption && <p className="mt-1 break-words text-xs text-stone-500">{attachment.fileName}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-900">{attachment.category || 'Uncategorised'}</span>
                    <span className="rounded-full bg-stone-100 px-2 py-1 text-[11px] text-stone-700">{targetLabel(attachment.targetType)}</span>
                  </div>
                  <p className="mt-2 break-words text-xs leading-5 text-stone-600">Linked record: <span className="font-semibold">{linkedName(attachment)}</span></p>
                  <p className="mt-1 text-xs text-stone-500">{attachment.date || 'Date not recorded'} · {formatBytes(attachment.fileSize)} · Uploaded by {attachment.uploadedBy?.name || 'Staff'}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                <button type="button" onClick={() => void openFile(attachment)} disabled={downloadingId === attachment.id} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
                  {downloadingId === attachment.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
                </button>
                <button type="button" onClick={() => openLinkedRecord(attachment)} className="fx-press inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                  <ExternalLink className="h-4 w-4" /> Open linked record
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
