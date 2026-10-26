import { test, expect } from '@playwright/test';
import { signIn, logPageErrors, getSignedInUid } from './helpers';

/**
 * Regression test for an offline data-loss bug: while the app was open, an edit
 * made with no signal was never queued. Firestore echoed the optimistic local
 * write back through the collection listeners, and the app treated that echo as
 * a confirmed server copy, advancing the sync baseline past the unsynced edit.
 * The debounced diff then saw "no change" and the edit was lost.
 *
 * The fix only advances the baseline for server-confirmed snapshots (not
 * `fromCache`, and not carrying pending local writes), so the edit is queued and
 * flushed when the phone reconnects.
 *
 * Network is blocked at the browser level (abort every request) rather than via
 * context offline, because the latter does not sever an already-open Firestore
 * stream.
 */

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const PROJECT = 'shine-relief-trust-cms';
const MINE_ID = 'SG-E2E-MINE';
const EMULATOR_AUTH = { Authorization: 'Bearer owner' };
const DB_KEY_BASE = 'shine_relief_trust_prod_v1';
const BASELINE_KEY_BASE = 'shine_relief_trust_last_synced_v2';
const scopedKey = (base: string, uid: string) => base + '::uid:' + encodeURIComponent(uid);

async function serverFullName(recordId: string): Promise<string | undefined> {
  const response = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/girls/${recordId}`,
    { headers: EMULATOR_AUTH },
  );
  const body = (await response.json()) as { fields?: { fullName?: { stringValue?: string } } };
  return body.fields?.fullName?.stringValue;
}

function readQueue(page: import('@playwright/test').Page, uid: string) {
  return page.evaluate(async () => {
    return await new Promise<Array<{ recordId: string; fullName?: string }>>((resolve) => {
      const request = indexedDB.open('shine_relief_trust_offline_v3::uid:' + encodeURIComponent(uid), 2);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('queue')) { resolve([]); return; }
        const get = db.transaction('queue', 'readonly').objectStore('queue').getAll();
        get.onsuccess = () => resolve((get.result || []).map((entry: any) => ({
          recordId: entry.recordId,
          fullName: entry.data?.fullName,
        })));
        get.onerror = () => resolve([]);
      };
      request.onerror = () => resolve([]);
    });
  });
}

test('an edit made while offline is queued, not lost to the local-write echo', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  logPageErrors(page);
  await signIn(page);
  const uid = await getSignedInUid(page);
  const dbKey = scopedKey(DB_KEY_BASE, uid);
  const baselineKey = scopedKey(BASELINE_KEY_BASE, uid);

  // Let the initial listeners settle so the baseline is a confirmed copy.
  await page.waitForTimeout(3000);

  // Simulate the phone losing signal for real.
  await page.route('**/*', (route) => route.abort());

  await page.evaluate((id) => { window.location.hash = `#/girl/${id}`; }, MINE_ID);
  await expect(page.getByRole('button', { name: /edit profile/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /edit profile/i }).click();
  await page.getByPlaceholder('e.g. Chimwemwe Banda').fill('Offline queued edit');
  await page.getByRole('button', { name: /Update Profile/i }).click();

  // The debounced full-database diff runs ~1s after the edit.
  await page.waitForTimeout(2500);

  const queued = await readQueue(page, uid);
  expect(queued.map((entry) => entry.recordId)).toContain(MINE_ID);
  expect(queued.find((entry) => entry.recordId === MINE_ID)?.fullName).toBe('Offline queued edit');

  // The baseline must NOT have advanced to the unsynced edit.
  const baselineName = await page.evaluate((key) => {
    const baseline = JSON.parse(window.localStorage.getItem(key) || '{}');
    return (baseline.girls || []).find((g: { id: string }) => g.id === 'SG-E2E-MINE')?.fullName;
  }, baselineKey);
  expect(baselineName).not.toBe('Offline queued edit');
  // The local copy still holds the edit (never thrown away).
  const localName = await page.evaluate((key) => {
    const db = JSON.parse(window.localStorage.getItem(key) || '{}');
    return (db.girls || []).find((g: { id: string }) => g.id === 'SG-E2E-MINE')?.fullName;
  }, dbKey);
  expect(localName).toBe('Offline queued edit');
  expect(await serverFullName(MINE_ID)).not.toBe('Offline queued edit');

  // Reconnect: the queued edit is flushed to the server.
  await page.unroute('**/*');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(5000);

  expect(await serverFullName(MINE_ID)).toBe('Offline queued edit');
  expect(await readQueue(page, uid)).toHaveLength(0);

  await context.close();
});

