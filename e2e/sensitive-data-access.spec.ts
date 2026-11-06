import { test, expect } from '@playwright/test';
import { signIn, logPageErrors } from './helpers';

test('ordinary staff cannot open database backup or export restricted medical records', async ({ page }) => {
  logPageErrors(page);
  await signIn(page);

  // The complete local backup contains confidential staff and beneficiary data.
  await expect(page.locator('#data-backup-btn')).toHaveCount(0);

  await page.evaluate(() => { window.location.hash = '#/reports'; });
  await page.getByRole('button', { name: 'Excel Export Centre' }).click();

  // Medical exports must remain hidden even if a stale local snapshot exists.
  await expect(page.getByRole('button', { name: 'Download Medical Excel' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Health follow-ups Excel' })).toHaveCount(0);
});
