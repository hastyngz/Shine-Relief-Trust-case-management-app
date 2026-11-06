import type { PhotoAttachment } from '../types';

export type FilingFileFilter = 'All files' | 'Images' | 'Documents';
export type FilingRecordType = PhotoAttachment['targetType'] | 'All record types';
export interface FilingAttachmentFilters {
  search: string;
  fileFilter: FilingFileFilter;
  categoryFilter: string;
  recordTypeFilter: FilingRecordType;
}

/** Filters only the accessible attachment set provided by the permission-aware filing service. */
export function filterFilingAttachments(
  attachments: PhotoAttachment[],
  filters: FilingAttachmentFilters,
): PhotoAttachment[] {
  const term = filters.search.trim().toLowerCase();
  return attachments.filter((item) => {
    const image = item.contentType?.startsWith('image/');
    if (filters.fileFilter === 'Images' && !image) return false;
    if (filters.fileFilter === 'Documents' && image) return false;
    if (filters.categoryFilter !== 'All categories' && item.category !== filters.categoryFilter) return false;
    if (filters.recordTypeFilter !== 'All record types' && item.targetType !== filters.recordTypeFilter) return false;
    if (!term) return true;
    return [
      item.fileName, item.caption, item.category, item.targetType, item.targetId,
      item.uploadedBy?.name, item.uploadedBy?.email, item.date,
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });
}

/** Sorts an already permission-filtered set by upload time; invalid legacy dates stay last. */
export function sortFilingAttachmentsNewestFirst(attachments: PhotoAttachment[]): PhotoAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index, timestamp: Date.parse(attachment.createdAt) }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.timestamp);
      const bValid = Number.isFinite(b.timestamp);
      if (aValid && bValid && a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ attachment }) => attachment);
}

export type FilingExpiryStatus = 'Expired' | 'Due within 30 days' | 'Current' | 'No expiry date' | 'Invalid date';

/** Evaluate a date-only expiry value without relying on JavaScript date normalization. */
export function getFilingExpiryStatus(expiryDate: string | undefined, today: string): FilingExpiryStatus {
  if (!expiryDate) return 'No expiry date';
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!valid(expiryDate) || !valid(today)) return 'Invalid date';
  if (expiryDate < today) return 'Expired';
  const due = new Date(`${today}T00:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() + 30);
  return expiryDate <= due.toISOString().slice(0, 10) ? 'Due within 30 days' : 'Current';
}
