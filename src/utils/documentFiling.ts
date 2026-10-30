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
