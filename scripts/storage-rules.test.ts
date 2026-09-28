import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const projectId = 'demo-shine-storage-rules';
const databaseId = 'ai-studio-shinerelieftrust-3031a4c1-ab6c-4458-95a6-63205996e291';
let testEnvironment: RulesTestEnvironment;

async function run() {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8') },
    storage: { rules: fs.readFileSync(path.resolve('storage.rules'), 'utf8') },
  });

  try {
    for (const [uid, role] of [['staff', 'Staff'], ['manager', 'Manager'], ['viewer', 'View Only']]) {
      const response = await fetch(`http://127.0.0.1:8080/v1/projects/${projectId}/databases/${databaseId}/documents/staffUsers/${uid}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { role: { stringValue: role }, status: { stringValue: 'Active' } } }),
      });
      if (!response.ok) throw new Error(`Could not seed ${role} test profile: ${await response.text()}`);
    }

    const staffStorage = testEnvironment.authenticatedContext('staff', { email: 'staff@example.test' }).storage();
    const managerStorage = testEnvironment.authenticatedContext('manager', { email: 'manager@example.test' }).storage();
    const viewerStorage = testEnvironment.authenticatedContext('viewer', { email: 'viewer@example.test' }).storage();
    const payload = new Uint8Array([137, 80, 78, 71]);
    const medicalPath = 'attachments/girl/girl-1/medical.png';
    const medicalMetadata = { contentType: 'image/png', customMetadata: { category: 'Medical Document' } };
    const upload = (task: { on: (event: string, next: undefined, error: (error: Error) => void, complete: () => void) => unknown }) => new Promise<void>((resolve, reject) => {
      task.on('state_changed', undefined, reject, resolve);
    });

    await assertFails(upload(staffStorage.ref(medicalPath).put(payload, medicalMetadata)));
    await assertSucceeds(upload(managerStorage.ref(medicalPath).put(payload, medicalMetadata)));
    await assertFails(viewerStorage.ref(medicalPath).getDownloadURL());
    await assertSucceeds(managerStorage.ref(medicalPath).getDownloadURL());
    await assertSucceeds(upload(staffStorage.ref('attachments/girl/girl-1/profile.png').put(payload, {
      contentType: 'image/png',
      customMetadata: { category: 'Profile Photo' },
    })));

    const reportPath = 'reports/staff/report-1/report.pdf';
    const reportMetadata = { contentType: 'application/pdf', customMetadata: { ownerUid: 'staff', reportId: 'report-1', fileType: 'pdf' } };
    await assertSucceeds(upload(staffStorage.ref(reportPath).put(payload, reportMetadata)));
    await assertSucceeds(staffStorage.ref(reportPath).getDownloadURL());
    await assertFails(viewerStorage.ref(reportPath).getDownloadURL());
    await assertSucceeds(managerStorage.ref(reportPath).getDownloadURL());
    await assertFails(upload(viewerStorage.ref('reports/viewer/report-2/report.pdf').put(payload, {
      contentType: 'application/pdf',
      customMetadata: { ownerUid: 'viewer', reportId: 'report-2', fileType: 'pdf' },
    })));

    console.log('Storage rules tests passed.');
  } finally {
    await testEnvironment.cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
