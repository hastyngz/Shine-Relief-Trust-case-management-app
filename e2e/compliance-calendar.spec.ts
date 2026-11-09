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

test('completing a recurring compliance obligation creates the next occurrence once', async ({ page }) => {
  logPageErrors(page);
  await signIn(page);
  await page.evaluate(() => { window.location.hash = '#/compliance'; });
  await expect(page.getByRole('heading', { name: 'Compliance & Deadlines' })).toBeVisible();

  await page.getByRole('button', { name: 'Add obligation' }).click();
  const form = page.getByRole('dialog', { name: 'Register compliance obligation' });
  await form.getByLabel('Obligation title').fill('E2E recurring compliance obligation');
  await form.getByLabel('Category').selectOption({ label: 'Organisational renewal' });
  await form.getByLabel('Details').fill('Synthetic recurring test record.');
  await form.getByLabel('Due date').fill('2026-10-31');
  await form.getByLabel('Recurrence').selectOption({ label: 'Monthly' });
  await form.getByLabel('Responsible person').selectOption({ label: 'E2E Test Staff · Staff' });
  await form.getByRole('button', { name: 'Save obligation' }).click();

  const occurrences = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'E2E recurring compliance obligation', exact: true }),
  });
  await expect(occurrences).toHaveCount(1);
  await occurrences.getByRole('button', { name: 'Complete' }).click();
  const completion = page.getByRole('dialog', { name: 'Complete obligation' });
  await completion.getByLabel('Completion note').fill('E2E recurrence check done.');
  await completion.getByRole('button', { name: 'Confirm completion' }).click();

  await expect(page.getByRole('status')).toContainText('Next occurrence scheduled for 2026-11-30');
  await expect(occurrences).toHaveCount(2);
  await expect(occurrences.filter({ hasText: 'Completed' })).toBeVisible();
  await expect(occurrences.filter({ hasText: 'Scheduled' })).toBeVisible();
  await expect(occurrences.filter({ hasText: 'Completed' })).toContainText('Next due 2026-11-30');
});

test('staff can collect a supplier quote when an item price is missing', async ({ page }) => {
  logPageErrors(page);
  await signIn(page);
  await page.evaluate(() => { window.location.hash = '#/planning'; });

  const procurementTab = page.getByRole('button', { name: /Procurement \(/ });
  await expect(procurementTab).toBeVisible();
  await procurementTab.click();

  const list = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'E2E Procurement Missing Price', exact: true }),
  });
  await expect(list).toBeVisible();
  await expect(list).toContainText('Collect supplier quotes to establish the price: 0/3');

  await list.getByLabel('Quote supplier').fill('E2E Supplier A');
  await list.getByLabel('Quote amount in MWK').fill('12000');
  await list.getByRole('button', { name: 'Add' }).click();

  await expect(list).toContainText('E2E Supplier A');
  await expect(list).toContainText('12,000');
  await expect(list).toContainText('Collect supplier quotes to establish the price: 1/3');

  // Selecting a single quote must not erase the three-quote requirement for an item that started unpriced.
  await list.getByRole('button', { name: 'Select' }).click();
  await expect(list).toContainText('Three quotes required: 1/3');
});
