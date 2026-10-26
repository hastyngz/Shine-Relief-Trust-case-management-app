import { test, expect, type Page } from '@playwright/test';
import { signIn, logPageErrors, getSignedInUid } from './helpers';

/**
 * Two-device conflict end-to-end test (Task 5).
 *
 * Proves a record another phone edited while this phone was offline is not
 * silently overwritten, and that resolving the conflict applies the chosen side
 * for real in Firestore.
 *
 * The offline queue lives in IndexedDB and the conflict list in localStorage,
 * so the test seeds exactly the state the app produces (a queued local edit plus
 * a stored conflict whose "other device" version is newer and already saved in
 * Firestore), then drives the real Sync-conflicts panel and checks Firestore.
 *
 * The queue/diff/flush logic itself is covered by scripts/offline-sync.test.ts;
 * a browser-level edit-while-offline flow is not used here because the app
 * cannot cold-start offline yet (it re-verifies the staff profile via Firestore,
 * and Firestore has no offline persistence configured) — a separate change.
 */

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const PROJECT = 'shine-relief-trust-cms';
const MINE_ID = 'SG-E2E-MINE';
const THEIRS_ID = 'SG-E2E-THEIRS';
// The Firestore emulator only serves privileged REST reads/writes with this
// header; it is not a credential to any real project.
const EMULATOR_AUTH = { Authorization: 'Bearer owner' };

async function serverField(recordId: string, field: string): Promise<string | undefined> {
  const response = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/girls/${recordId}`,
    { headers: EMULATOR_AUTH },
  );
  const body = (await response.json()) as { fields?: Record<string, { stringValue?: string }> };
  return body.fields?.[field]?.stringValue;
}


/** Simulates an edit made by another phone and saved to Firestore. */
async function otherDeviceEdits(recordId: string, fullName: string, updatedAt: string, updatedBy: string): Promise<void> {
  const response = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/girls/${recordId}?updateMask.fieldPaths=fullName&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=updatedBy`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH },
      body: JSON.stringify({
        fields: {
          fullName: { stringValue: fullName },
          updatedAt: { stringValue: updatedAt },
          updatedBy: { stringValue: updatedBy },
        },
      }),
    },
  );
  expect(response.ok, `other-device edit failed: ${response.status}`).toBe(true);
}

/**
 * Seeds the offline queue (IndexedDB) and the conflict list (localStorage) to
 * mirror what a real offline edit + flush would have produced.
 */
async function seedConflict(
  page: Page,
  opts: { uid: string; recordId: string; localName: string; baseUpdatedAt: string; serverName: string; serverUpdatedAt: string; serverUpdatedBy: string },
): Promise<void> {
  await page.evaluate(async (o) => {
    const localData = { id: o.recordId, fullName: o.localName, updatedAt: new Date().toISOString(), updatedBy: 'This Phone' };
    const entry = {
      ownerUid: o.uid,
      collection: 'girls',
      recordId: o.recordId,
      operation: 'set',
      data: localData,
      baseUpdatedAt: o.baseUpdatedAt,
      queuedAt: new Date().toISOString(),
      queueKey: `girls/${o.recordId}`,
    };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('shine_relief_trust_offline_v3::uid:' + encodeURIComponent(o.uid), 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'queueKey' });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('queue', 'readwrite');
        tx.objectStore('queue').put(entry);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
    const conflict = {
      id: `girls::${o.recordId}`,
      collection: 'girls',
      recordId: o.recordId,
      localData,
      localOperation: 'set',
      baseUpdatedAt: o.baseUpdatedAt,
      serverData: { id: o.recordId, fullName: o.serverName, updatedAt: o.serverUpdatedAt, updatedBy: o.serverUpdatedBy },
      serverUpdatedAt: o.serverUpdatedAt,
      serverUpdatedBy: o.serverUpdatedBy,
      detectedAt: new Date().toISOString(),
      detectedBy: null,
    };
    window.localStorage.setItem('shine_relief_trust_sync_conflicts_v2::uid:' + encodeURIComponent(o.uid), JSON.stringify([conflict]));
    // Nudge the mounted header/panel to re-read the queue and conflict list.
    window.dispatchEvent(new Event('shine_sync_conflicts_updated'));
    window.dispatchEvent(new Event('shine_offline_queue_updated'));
  }, opts);
}

test.describe('two-device offline conflict', () => {
  test('shows the conflict, then Keep mine applies this phone\'s edit', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    logPageErrors(page);
    await signIn(page);
    const uid = await getSignedInUid(page);

    const baseUpdatedAt = (await serverField(MINE_ID, 'updatedAt')) ?? '';
    // The other phone's edit is newer and is already the server's copy.
    const serverUpdatedAt2 = new Date(new Date(baseUpdatedAt).getTime() + 60_000).toISOString();
    await otherDeviceEdits(MINE_ID, 'Theirs newer edit', serverUpdatedAt2, 'Other Phone');
    await seedConflict(page, {
      uid,
      recordId: MINE_ID,
      localName: 'Mine offline edit',
      baseUpdatedAt,
      serverName: 'Theirs newer edit',
      serverUpdatedAt: serverUpdatedAt2,
      serverUpdatedBy: 'Other Phone',
    });

    // The header surfaces the conflict.
    const conflictBadge = page.getByRole('button', { name: /Sync status:/ });
    await expect(conflictBadge).toBeVisible({ timeout: 30_000 });
    await conflictBadge.click();

    const panel = page.getByRole('dialog', { name: 'Sync conflicts' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Changed on another device')).toContainText('Other Phone');
    await expect(panel.getByRole('button', { name: 'Keep mine' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Keep theirs' })).toBeVisible();

    // The newer server value is still intact until the user chooses.
    expect(await serverField(MINE_ID, 'fullName')).toBe('Theirs newer edit');

    // Keep mine: the local edit is re-based and flushed, overwriting on purpose.
    await panel.getByRole('button', { name: 'Keep mine' }).click();
    await expect(panel.getByText(/No sync conflicts/i)).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => serverField(MINE_ID, 'fullName'), { timeout: 30_000 }).toBe('Mine offline edit');

    await context.close();
  });

  test('Keep theirs leaves the other phone\'s newer value in place', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    logPageErrors(page);
    await signIn(page);
    const uid = await getSignedInUid(page);

    const baseUpdatedAt = (await serverField(THEIRS_ID, 'updatedAt')) ?? '';
    const serverUpdatedAt2 = new Date(new Date(baseUpdatedAt).getTime() + 60_000).toISOString();
    await otherDeviceEdits(THEIRS_ID, 'Authoritative server value', serverUpdatedAt2, 'Other Phone');
    await seedConflict(page, {
      uid,
      recordId: THEIRS_ID,
      localName: 'Discard this local edit',
      baseUpdatedAt,
      serverName: 'Authoritative server value',
      serverUpdatedAt: serverUpdatedAt2,
      serverUpdatedBy: 'Other Phone',
    });

    const conflictBadge = page.getByRole('button', { name: /Sync status:/ });
    await expect(conflictBadge).toBeVisible({ timeout: 30_000 });
    await conflictBadge.click();
    const panel = page.getByRole('dialog', { name: 'Sync conflicts' });
    await panel.getByRole('button', { name: 'Keep theirs' }).click();

    // The server keeps the other phone's value; the local edit is dropped.
    await expect.poll(() => serverField(THEIRS_ID, 'fullName'), { timeout: 30_000 }).toBe('Authoritative server value');
    await expect(panel.getByText(/No sync conflicts/i)).toBeVisible({ timeout: 20_000 });

    await context.close();
  });
});
