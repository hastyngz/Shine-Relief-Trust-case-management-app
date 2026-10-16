import { test, expect } from '@playwright/test';
import { signIn, logPageErrors } from './helpers';

test('staff can register and complete a compliance obligation', async ({ page }) => {
  logPageErrors(page);
  await signIn(page);

  // Open the real routed view as the seeded active staff user.
  await page.evaluate(() => { window.location.hash = '#/compliance'; });
  await expect(page.getByRole('heading', { name: 'Compliance & Deadlines' })).toBeVisible();

  await page.getByRole('button', { name: 'Add obligation' }).click();
  const form = page.getByRole('dialog', { name: 'Register compliance obligation' });
  await expect(form).toBeVisible();
  await form.getByLabel('Obligation title').fill('E2E compliance obligation');
  await form.getByLabel('Category').selectOption({ label: 'Staff training & policies' });
  await form.getByLabel('Details').fill('Synthetic end-to-end test record.');
  await form.getByLabel('Responsible person').selectOption({ label: 'E2E Test Staff · Staff' });
  await form.getByRole('button', { name: 'Save obligation' }).click();

  const record = page.locator('article').filter({ has: page.getByRole('heading', { name: 'E2E compliance obligation', exact: true }) });
  await expect(record).toBeVisible();
  await expect(page.getByRole('status')).toContainText('saved on this device');

  await record.getByRole('button', { name: 'Complete' }).click();
  const completion = page.getByRole('dialog', { name: 'Complete obligation' });
  await completion.getByLabel('Completion note').fill('E2E test confirms completion workflow.');
  await completion.getByRole('button', { name: 'Confirm completion' }).click();

  await expect(record).toContainText('Completed');
  await expect(record).toContainText('E2E test confirms completion workflow.');
  await record.getByText(/^History \(/).click();
  await expect(record.getByText(/Completed · E2E Test Staff/)).toBeVisible();
});
