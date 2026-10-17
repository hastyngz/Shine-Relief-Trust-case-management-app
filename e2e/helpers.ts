import { expect, type Page } from '@playwright/test';

export const E2E_EMAIL = 'e2e-staff@example.test';
export const E2E_PASSWORD = 'e2e-password-123';

/** Signs in through the real login form and waits for the app shell to render. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/#/');
  await page.getByPlaceholder(/hastingszidanamot@gmail\.com/).fill(E2E_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In with Email & Password' }).click();
  await expect(page.getByRole('button', { name: /dashboard/i }).first()).toBeVisible({ timeout: 30_000 });
}

/** Surfaces in-page errors in the test output to make failures easier to read. */
export function logPageErrors(page: Page): void {
  page.on('pageerror', (error) => console.error('[e2e pageerror]', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[e2e console]', message.text());
  });
}
