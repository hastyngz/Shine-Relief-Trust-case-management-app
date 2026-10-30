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
