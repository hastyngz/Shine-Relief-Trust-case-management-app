import assert from 'node:assert/strict';
import { downloadExcel } from '../src/utils/export';

const originalDocument = globalThis.document;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let downloaded = false;
let href = '';
let filename = '';
let mimeType = '';
let blobSize = 0;
const link = {
  set href(value: string) { href = value; },
  set download(value: string) { filename = value; },
  click: () => { downloaded = true; },
  remove: () => undefined,
};
globalThis.document = { createElement: () => link, body: { appendChild: () => undefined } } as unknown as Document;
URL.createObjectURL = ((blob: Blob) => {
  mimeType = blob.type;
  blobSize = blob.size;
  return 'blob:shine-report-test';
}) as typeof URL.createObjectURL;
URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
try {
  await downloadExcel('synthetic-report', [['Metric', 'Value'], ['Items', 3]]);
} finally {
  globalThis.document = originalDocument;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
}
assert.equal(downloaded, true);
assert.equal(href, 'blob:shine-report-test');
assert.match(filename, /^synthetic-report_\d{4}-\d{2}-\d{2}\.xlsx$/);
assert.equal(mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
assert.ok(blobSize > 0);
console.log('Excel report export test passed: workbook blob, MIME type and filename.');
