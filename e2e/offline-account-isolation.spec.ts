import { test, expect, type Page } from '@playwright/test';
import {
  E2E_SECOND_EMAIL,
  E2E_SECOND_PASSWORD,
  getSignedInUid,
  logPageErrors,
  signIn,
} from './helpers';

const DB_BASE = 'shine_relief_trust_prod_v1';
const QUEUE_DB_BASE = 'shine_relief_trust_offline_v3';
const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const PROJECT = 'shine-relief-trust-cms';
const EMULATOR_AUTH = { Authorization: 'Bearer owner' };
const scopedKey = (base: string, uid: string) => `${base}::uid:${encodeURIComponent(uid)}`;

async function serverRecordExists(recordId: string): Promise<boolean> {
  const response = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/girls/${recordId}`,
    { headers: EMULATOR_AUTH },
  );
  return response.ok;
}

async function seedSyntheticAccountState(page: Page, uid: string): Promise<void> {
  await page.evaluate(async ({ uid, dbKey, queueDbName }) => {
    const database = JSON.parse(window.localStorage.getItem(dbKey) || '{}') as { girls?: unknown[] };
    database.girls = [{ id: 'SYNTHETIC-A-ONLY', fullName: 'Account A local record' }];
    window.localStorage.setItem(dbKey, JSON.stringify(database));

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(queueDbName, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'queueKey' });
      };
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('queue', 'readwrite');
        transaction.objectStore('queue').put({
          ownerUid: uid,
          collection: 'girls',
          recordId: 'SYNTHETIC-A-ONLY',
          operation: 'set',
          data: { id: 'SYNTHETIC-A-ONLY', fullName: 'Account A queued record' },
          baseUpdatedAt: null,
          queuedAt: new Date().toISOString(),
          queueKey: 'girls/SYNTHETIC-A-ONLY',
        });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
      request.onerror = () => reject(request.error);
    });
    window.dispatchEvent(new Event('shine_offline_queue_updated'));
  }, { uid, dbKey: scopedKey(DB_BASE, uid), queueDbName: scopedKey(QUEUE_DB_BASE, uid) });
}

async function readQueueRecordIds(page: Page, uid: string): Promise<string[]> {
  return page.evaluate(async (dbName) => await new Promise<string[]>((resolve) => {
    const request = indexedDB.open(dbName, 2);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('queue')) { db.close(); resolve([]); return; }
      const get = db.transaction('queue', 'readonly').objectStore('queue').getAll();
      get.onsuccess = () => { const rows = get.result as Array<{ recordId?: string }>; db.close(); resolve(rows.map((row) => row.recordId || '')); };
      get.onerror = () => { db.close(); resolve([]); };
    };
    request.onerror = () => resolve([]);
  }), scopedKey(QUEUE_DB_BASE, uid));
}

test('switching accounts does not expose or replay the previous account workspace', async ({ page }) => {
  logPageErrors(page);
  await signIn(page);
  const accountAUid = await getSignedInUid(page);
  await page.waitForTimeout(2000);
  await seedSyntheticAccountState(page, accountAUid);

  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page.getByRole('button', { name: 'Sign In with Email & Password' })).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder(/hastingszidanamot@gmail\.com/).fill(E2E_SECOND_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(E2E_SECOND_PASSWORD);
  await page.getByRole('button', { name: 'Sign In with Email & Password' }).click();
  await expect.poll(async () => {
    return await page.getByRole('button', { name: /dashboard/i }).count()
      + await page.getByRole('heading', { name: 'Preparing your secure workspace' }).count();
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  const accountBUid = await getSignedInUid(page);
  expect(accountBUid).not.toBe(accountAUid);

  // A reconnect event is the point at which a wrongly shared queue would be
  // replayed under account B. The synthetic record must remain local to A.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1500);

  expect(await readQueueRecordIds(page, accountBUid)).not.toContain('SYNTHETIC-A-ONLY');
  await expect(page.getByText('Account A local record')).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), scopedKey(DB_BASE, accountBUid))).not.toContain('SYNTHETIC-A-ONLY');
  expect(await serverRecordExists('SYNTHETIC-A-ONLY')).toBe(false);

  // The first account's queued work remains preserved in its own workspace.
  expect(await readQueueRecordIds(page, accountAUid)).toContain('SYNTHETIC-A-ONLY');

  // Reopen the app and confirm the newly signed-in workspace can complete its
  // normal secure-sync startup after the isolation assertions have run.
  await page.reload();
  await expect(page.getByRole('button', { name: /dashboard/i }).first()).toBeVisible({ timeout: 30_000 });
});
