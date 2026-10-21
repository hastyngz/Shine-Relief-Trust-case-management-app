import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the offline behaviours that only a real browser can
 * prove: opening the app with no signal (app shell), the two-phone conflict
 * flow, and the update prompt.
 *
 * The global setup (e2e/global-setup.ts) starts the Firebase emulators and
 * seeds one test staff account. The app under test is a real production build
 * (vite build) served by server.ts, with the emulator hook switched on through
 * VITE_USE_FIREBASE_EMULATORS. Real girls' data is never used.
 *
 * Run with: npm run test:e2e
 * CI installs Java so the Firestore emulator can start.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list']] : [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
