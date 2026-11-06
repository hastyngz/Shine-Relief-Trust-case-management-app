import { test, expect, type Page } from '@playwright/test';
import {
  E2E_VIEWER_EMAIL,
  E2E_VIEWER_PASSWORD,
  getSignedInUid,
  logPageErrors,
  signIn,
  signInAs,
} from './helpers';

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const PROJECT = 'shine-relief-trust-cms';
const EMULATOR_AUTH = { Authorization: 'Bearer owner' };

async function serverHasEarlyYearsRecord(recordId: string): Promise<boolean> {
  const response = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/earlyYearsRecords/${encodeURIComponent(recordId)}`,
    { headers: EMULATOR_AUTH },
  );
  return response.ok;
}

async function readEarlyYearsQueue(page: Page, uid: string) {
  return page.evaluate(async (uid) => {
    return await new Promise<Array<{ collection: string; recordId: string; studentName?: string }>>((resolve) => {
      const request = indexedDB.open('shine_relief_trust_offline_v3::uid:' + encodeURIComponent(uid), 2);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('queue')) {
          db.close();
          resolve([]);
          return;
        }
        const get = db.transaction('queue', 'readonly').objectStore('queue').getAll();
        get.onsuccess = () => {
          const entries = (get.result || []).map((entry: any) => ({
            collection: entry.collection,
            recordId: entry.recordId,
            studentName: entry.data?.studentName,
          }));
          db.close();
          resolve(entries);
        };
        get.onerror = () => { db.close(); resolve([]); };
      };
      request.onerror = () => resolve([]);
    });
  }, uid);
}

async function openEarlyYears(page: Page): Promise<void> {
  await page.evaluate(() => { window.location.hash = '#/operations'; });
  await expect(page.getByRole('heading', { name: 'Intelligence & operational management' })).toBeVisible();
  await page.getByRole('button', { name: /early years/i }).click();
  await expect(page.getByRole('heading', { name: 'Early Years child register & daily attendance' })).toBeVisible();
}

test('staff can register a child and correct attendance for the same date', async ({ page }) => {
  logPageErrors(page);
  await signIn(page);
  const uid = await getSignedInUid(page);
  await openEarlyYears(page);

  const studentName = `E2E Early Years ${Date.now()}`;
  await page.getByRole('button', { name: /register child/i }).click();
  const form = page.locator('form').filter({ hasText: 'Student name' });
  await form.getByLabel('Student name').fill(studentName);
  await form.getByLabel('Date of birth').fill('2022-03-14');
  await form.getByLabel('Enrollment date').fill('2026-11-01');
  await form.getByLabel('Guardian').fill('E2E Guardian');
  await form.getByLabel('Class / group').fill('ECD A');
  await form.getByRole('button', { name: 'Save student record' }).click();

  const childRow = page.locator('div.rounded-lg.border').filter({ hasText: studentName });
  await expect(childRow).toBeVisible();
  const attendanceDate = new Date().toISOString().slice(0, 10);
  await page.getByLabel('Attendance date').fill(attendanceDate);
  const attendance = childRow.getByLabel('Attendance');
  await attendance.selectOption('Present');
  await attendance.selectOption('Late');

  await expect.poll(async () => page.evaluate(({ uid, studentName }) => {
    const key = 'shine_relief_trust_prod_v1::uid:' + encodeURIComponent(uid);
    const db = JSON.parse(window.localStorage.getItem(key) || '{}');
    const record = (db.earlyYearsRecords || []).find((item: any) => item.studentName === studentName);
    return record?.attendanceEntries?.length || 0;
  }, { uid, studentName })).toBe(1);
  const localRecord = await page.evaluate(({ uid, studentName }) => {
    const key = 'shine_relief_trust_prod_v1::uid:' + encodeURIComponent(uid);
    const db = JSON.parse(window.localStorage.getItem(key) || '{}');
    return (db.earlyYearsRecords || []).find((record: any) => record.studentName === studentName);
  }, { uid, studentName });
  expect(localRecord.attendanceEntries).toHaveLength(1);
  expect(localRecord.attendanceEntries[0].date).toBe(attendanceDate);
  expect(localRecord.attendanceEntries[0].status).toBe('Late');
});

test('View Only staff can see the Early Years register but cannot register or mark attendance', async ({ page }) => {
  logPageErrors(page);
  await signInAs(page, E2E_VIEWER_EMAIL, E2E_VIEWER_PASSWORD);
  await openEarlyYears(page);

  await expect(page.getByText('E2E Viewer Child', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /register child/i })).toHaveCount(0);
  const childRow = page.locator('div.rounded-lg.border').filter({ hasText: 'E2E Viewer Child' });
  await expect(childRow.getByLabel('Attendance')).toBeDisabled();
});

test('a child registered while offline is queued and synchronised after reconnection', async ({ page }) => {
  logPageErrors(page);
  await signIn(page);
  const uid = await getSignedInUid(page);
  await openEarlyYears(page);

  // Wait for the app to establish a confirmed Firestore baseline before going offline.
  await page.waitForTimeout(3000);
  await page.route('**/*', (route) => route.abort());

  const studentName = `E2E Offline Early Years ${Date.now()}`;
  await page.getByRole('button', { name: /register child/i }).click();
  const form = page.locator('form').filter({ hasText: 'Student name' });
  await form.getByLabel('Student name').fill(studentName);
  await form.getByLabel('Date of birth').fill('2022-07-09');
  await form.getByLabel('Enrollment date').fill('2026-11-05');
  await form.getByLabel('Guardian').fill('Offline E2E Guardian');
  await form.getByLabel('Class / group').fill('ECD B');
  await form.getByRole('button', { name: 'Save student record' }).click();

  await expect(page.getByText(studentName, { exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  const queued = await readEarlyYearsQueue(page, uid);
  const queuedRecord = queued.find((entry) => entry.collection === 'earlyYearsRecords' && entry.studentName === studentName);
  expect(queuedRecord).toBeTruthy();
  expect(await serverHasEarlyYearsRecord(queuedRecord!.recordId)).toBe(false);

  // Reconnect and let the app's online handler flush the durable queue.
  await page.unroute('**/*');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => serverHasEarlyYearsRecord(queuedRecord!.recordId), { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await readEarlyYearsQueue(page, uid)).some(
    (entry) => entry.recordId === queuedRecord!.recordId,
  ), { timeout: 30_000 }).toBe(false);
});
