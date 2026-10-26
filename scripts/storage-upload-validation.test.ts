import assert from 'node:assert/strict';
import {
  getAttachmentFileValidationError,
  getStorageUploadValidationError,
  MAX_STORAGE_UPLOAD_BYTES,
} from '../src/services/storageUploadValidation';

const bytes = (text: string) => new TextEncoder().encode(text);
const attachmentPath = 'attachments/expense/EXP-TEST/att_test_receipt.pdf';
const reportPath = 'reports/user-test/report-test/export.docx';

assert.equal(getStorageUploadValidationError(attachmentPath, 'application/pdf', bytes('%PDF-1.7\nsynthetic test')), null);
assert.equal(getStorageUploadValidationError('attachments/girl/G-TEST/file.jpg', 'image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0x01])), null);
assert.equal(getStorageUploadValidationError('attachments/girl/G-TEST/file.png', 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), null);
assert.equal(getStorageUploadValidationError('attachments/girl/G-TEST/file.webp', 'image/webp', new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), null);
assert.equal(getStorageUploadValidationError(reportPath, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', new Uint8Array([0x50, 0x4b, 0x03, 0x04])), null);
assert.equal(getStorageUploadValidationError('reports/user-test/report-test/export.csv', 'text/csv; charset=utf-8', bytes('Date,Amount\n2026-01-01,100')), null);

assert.match(getStorageUploadValidationError(attachmentPath, 'text/html', bytes('<html>synthetic</html>')) || '', /Attachments must/);
assert.match(getStorageUploadValidationError(attachmentPath, 'image/jpeg', bytes('<svg>synthetic</svg>')) || '', /does not match/);
assert.match(getStorageUploadValidationError('reports/user-test/report-test/export.pdf', 'application/pdf', bytes('<html>synthetic</html>')) || '', /does not match/);
assert.match(getStorageUploadValidationError('attachments/../file.pdf', 'application/pdf', bytes('%PDF-1.7')) || '', /path is invalid/);
assert.match(getStorageUploadValidationError(attachmentPath, 'application/pdf', new Uint8Array()) || '', /non-empty/);
assert.match(getStorageUploadValidationError(attachmentPath, 'application/pdf', new Uint8Array(MAX_STORAGE_UPLOAD_BYTES + 1)) || '', /50 MB/);

assert.equal(getAttachmentFileValidationError({ type: 'image/jpeg', size: 100 }), null);
assert.equal(getAttachmentFileValidationError({ type: 'application/pdf', size: 100 }), null);
assert.match(getAttachmentFileValidationError({ type: 'image/svg+xml', size: 100 }) || '', /JPEG, PNG, WebP image, or PDF document/);
assert.match(getAttachmentFileValidationError({ type: 'application/pdf', size: MAX_STORAGE_UPLOAD_BYTES + 1 }) || '', /50 MB/);

console.log('Storage upload validation tests passed.');
