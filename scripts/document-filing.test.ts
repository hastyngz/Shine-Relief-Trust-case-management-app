import assert from 'node:assert/strict';
import { filterFilingAttachments, sortFilingAttachmentsNewestFirst } from '../src/utils/documentFiling';
import type { PhotoAttachment } from '../src/types';

const makeAttachment = (overrides: Partial<PhotoAttachment> = {}): PhotoAttachment => ({
  id: 'att-1', targetType: 'household', targetId: 'house-1', fileName: 'receipt.pdf',
  fileSize: 100, contentType: 'application/pdf', storagePath: 'synthetic/receipt.pdf',
  downloadUrl: '', category: 'Receipt', date: '2026-10-20',
  uploadedBy: { uid: 'staff-1', name: 'Test Staff', email: 'test@example.invalid' },
  createdAt: '2026-10-20T00:00:00Z',
  ...overrides,
});
const receipt = makeAttachment();
const photo = makeAttachment({ id: 'att-2', fileName: 'office.jpg', contentType: 'image/jpeg', category: 'Profile Photo', targetType: 'girl', targetId: 'girl-synthetic' });
const school = makeAttachment({ id: 'att-3', fileName: 'report-card.pdf', category: 'Report Card', targetType: 'educationalFollowUp' });
const attachments = [receipt, photo, school];
const base = { search: '', fileFilter: 'All files' as const, categoryFilter: 'All categories', recordTypeFilter: 'All record types' as const };
assert.deepEqual(filterFilingAttachments(attachments, base).map((a) => a.id), ['att-1', 'att-2', 'att-3']);
assert.deepEqual(filterFilingAttachments(attachments, { ...base, fileFilter: 'Images' }).map((a) => a.id), ['att-2']);
assert.deepEqual(filterFilingAttachments(attachments, { ...base, fileFilter: 'Documents' }).map((a) => a.id), ['att-1', 'att-3']);
assert.deepEqual(filterFilingAttachments(attachments, { ...base, categoryFilter: 'Report Card' }).map((a) => a.id), ['att-3']);
assert.deepEqual(filterFilingAttachments(attachments, { ...base, recordTypeFilter: 'educationalFollowUp' }).map((a) => a.id), ['att-3']);
assert.deepEqual(filterFilingAttachments(attachments, { ...base, search: 'TEST STAFF' }).map((a) => a.id), ['att-1', 'att-2', 'att-3']);
assert.deepEqual(filterFilingAttachments(attachments, { ...base, search: 'no-match' }), []);
assert.deepEqual(filterFilingAttachments([], base), []);

const older = makeAttachment({ id: 'att-older', createdAt: '2026-10-18T00:00:00Z' });
const newer = makeAttachment({ id: 'att-newer', createdAt: '2026-10-22T00:00:00Z' });
const invalidDate = makeAttachment({ id: 'att-invalid', createdAt: 'not-a-date' });
const unsorted = [older, newer, invalidDate, receipt];
assert.deepEqual(sortFilingAttachmentsNewestFirst(unsorted).map((a) => a.id), ['att-newer', 'att-1', 'att-older', 'att-invalid']);
assert.deepEqual(unsorted.map((a) => a.id), ['att-older', 'att-newer', 'att-invalid', 'att-1'], 'sorting must not mutate the source array');
console.log('Document filing tests passed: filters, empty states, newest-first ordering and invalid legacy dates.');
