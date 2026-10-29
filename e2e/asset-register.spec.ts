import { test, expect } from '@playwright/test';
import { logPageErrors, signIn } from './helpers';

test('staff can register an asset and record physical verification without changing register values', async ({ page }) => {
  logPageErrors(page);
  await signIn(page);
  await page.evaluate(() => { window.location.hash = '#/assets'; });
  await expect(page.getByRole('heading', { name: 'Asset Register' })).toBeVisible();

  const suffix = Date.now().toString();
  const assetTag = `E2E-ASSET-${suffix}`;
  const assetName = `E2E physical verification ${suffix}`;
  await page.getByRole('button', { name: 'Register asset' }).first().click();
  const register = page.getByRole('dialog', { name: 'Register asset' });
  await register.getByLabel(/Asset tag \/ register number/).fill(assetTag);
  await register.getByLabel('Asset name').fill(assetName);
  await register.getByLabel('Location').selectOption({ label: 'Main Office' });
  await register.getByRole('button', { name: 'Register asset' }).click();

  const asset = page.locator('article').filter({ has: page.getByRole('heading', { name: assetName, exact: true }) });
  await expect(asset).toBeVisible();
  await expect(asset).toContainText('No physical verification recorded yet');

  await asset.getByRole('button', { name: 'Verify physically' }).click();
  const verify = page.getByRole('dialog', { name: 'Physical asset verification' });
  await verify.getByLabel('Outcome').selectOption({ label: 'Found as recorded' });
  await verify.getByLabel('Notes').fill('Synthetic E2E physical check.');
  await verify.getByRole('button', { name: 'Save verification' }).click();

  await expect(page.getByRole('status')).toContainText(`Physical verification recorded for ${assetTag}`);
  await expect(asset).toContainText('Verified');
  await expect(asset).toContainText('E2E Test Staff');
  await asset.getByRole('button', { name: /History/ }).click();
  await expect(asset.getByText('Physical Verification', { exact: true })).toHaveCount(1);
  await expect(asset).toContainText('Synthetic E2E physical check.');
});
