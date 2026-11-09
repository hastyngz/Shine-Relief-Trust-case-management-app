export const MAX_STORAGE_UPLOAD_BYTES = 50 * 1024 * 1024;

const ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const REPORT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]);

function baseMimeType(contentType: string): string {
  return contentType.split(';', 1)[0].trim().toLowerCase();
}

function hasAscii(bytes: Uint8Array, text: string, offset = 0): boolean {
  if (bytes.length < offset + text.length) return false;
  return [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

function hasBytes(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function signatureMatches(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === 'image/jpeg') return hasBytes(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === 'image/png') return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === 'image/webp') return hasAscii(bytes, 'RIFF') && hasAscii(bytes, 'WEBP', 8);
  if (mimeType === 'application/pdf') return hasAscii(bytes, '%PDF-');
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return hasBytes(bytes, [0x50, 0x4b, 0x03, 0x04]);
  }
  if (mimeType === 'text/csv') {
    if (bytes.includes(0)) return false;
    const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512)))
      .replace(/^\uFEFF/, '').trimStart().toLowerCase();
    return !prefix.startsWith('<!doctype html') && !prefix.startsWith('<html') && !prefix.startsWith('<svg');
  }
  return false;
}

/** Client-side early validation. The server repeats validation against the actual bytes. */
export function getAttachmentFileValidationError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return 'The selected file is empty.';
  if (file.size > MAX_STORAGE_UPLOAD_BYTES) return 'Choose a file that is 50 MB or smaller.';
  if (!ATTACHMENT_MIME_TYPES.has(baseMimeType(file.type))) {
    return 'Use a JPEG, PNG, WebP image, or PDF document.';
  }
  return null;
}

/** Validate the final upload at the trusted server boundary, including its signature. */
export function getStorageUploadValidationError(
  storagePath: string,
  contentType: string,
  bytes: Uint8Array,
): string | null {
  if (bytes.length === 0) return 'Choose a non-empty file to upload.';
  if (bytes.length > MAX_STORAGE_UPLOAD_BYTES) return 'Choose a file that is 50 MB or smaller.';

  const isReport = /^reports\/[^/]+\/[^/]+\/[^/]+$/.test(storagePath);
  const isAttachment = /^attachments\/[^/]+\/[^/]+\/[^/]+$/.test(storagePath);
  if (!isReport && !isAttachment) return 'The storage path is invalid.';

  const mimeType = baseMimeType(contentType);
  const supportedTypes = isReport ? REPORT_MIME_TYPES : ATTACHMENT_MIME_TYPES;
  if (!supportedTypes.has(mimeType)) {
    return isReport
      ? 'Reports must be PDF, DOCX, XLSX, or CSV files.'
      : 'Attachments must be JPEG, PNG, WebP, or PDF files.';
  }
  if (!signatureMatches(mimeType, bytes)) return 'The file content does not match its declared file type.';
  return null;
}
