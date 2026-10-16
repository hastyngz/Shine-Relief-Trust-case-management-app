import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * Global setup for the offline end-to-end tests.
 *
 * 1. Builds the app with the emulator hook switched on, so the running bundle
 *    talks to the local Firebase emulators instead of production.
 * 2. Starts the Firestore and Auth emulators (needs Java; CI installs it).
 * 3. Seeds one Active Staff account so a real sign-in can be performed.
 * 4. Starts the production server (server.ts) that serves the built app.
 *
 * The teardown returned here stops both processes after the suite finishes.
 */

const PROJECT_ID = 'shine-relief-trust-cms';
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8080;
const APP_PORT = Number(process.env.PORT || 3000);
const E2E_EMAIL = 'e2e-staff@example.test';
const E2E_PASSWORD = 'e2e-password-123';

const children: ChildProcess[] = [];

function waitForPort(port: number, host = '127.0.0.1', timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`Timed out waiting for ${host}:${port}`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, cwd: process.cwd() });
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
    child.once('error', reject);
  });
}

function start(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { stdio: 'inherit', env, cwd: process.cwd() });
  children.push(child);
  return child;
}

async function seedStaffAccount(): Promise<void> {
  // Auth emulator REST API. Any api key is accepted by the emulator.
  const signUp = await fetch(
    `http://127.0.0.1:${AUTH_EMULATOR_PORT}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=e2e`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD, returnSecureToken: true }),
    },
  );
  const body = (await signUp.json()) as { localId?: string; error?: unknown };
  if (!body.localId) {
    // The account may already exist from a previous run; look it up.
    const signIn = await fetch(
      `http://127.0.0.1:${AUTH_EMULATOR_PORT}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=e2e`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD, returnSecureToken: true }),
      },
    );
    const signInBody = (await signIn.json()) as { localId?: string };
    if (!signInBody.localId) throw new Error(`Could not create the e2e auth user: ${JSON.stringify(body.error)}`);
    body.localId = signInBody.localId;
  }

  const now = new Date().toISOString();
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_EMULATOR_PORT}`;
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const adminApp = getApps()[0] || initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(adminApp);
  await db.collection('staffUsers').doc(body.localId).set({
    id: body.localId,
    uid: body.localId,
    email: E2E_EMAIL,
    fullName: 'E2E Test Staff',
    role: 'Staff',
    status: 'Active',
    departmentOrTitle: 'Field Staff',
    createdAt: now,
    updatedAt: now,
    createdBy: 'E2E Setup',
    lastLoginAt: now,
  });

  // Synthetic procurement fixture: unknown price must still permit supplier quote collection.
  await db.collection('procurementLists').doc('PRC-E2E-MISSING-PRICE').set({
    id: 'PRC-E2E-MISSING-PRICE',
    title: 'E2E Procurement Missing Price',
    purpose: 'Synthetic browser test record only',
    items: [{ description: 'Office paper', quantity: 2, unit: 'reams', priceStatus: 'missing', itemNumber: '1' }],
    totalMWK: 0,
    status: 'draft',
    quoteThresholdMWK: 500000,
    createdAt: now,
    updatedAt: now,
    createdBy: 'E2E Setup',
    updatedBy: 'E2E Setup',
  });

  // Synthetic records for the two-device conflict test — never real case data.
  // They are complete enough to render in the girl profile and edit form.
  await db.collection('households').doc('SH-E2E').set({
    id: 'SH-E2E',
    name: 'E2E House',
    location: 'Test Location',
    houseMum: 'E2E House Mum',
    status: 'Active',
    createdAt: now,
    updatedAt: now,
    createdBy: 'E2E Setup',
    updatedBy: 'E2E Setup',
  });

  for (const [id, name] of [['SG-E2E-THEIRS', 'Conflict Demo'], ['SG-E2E-MINE', 'Conflict Demo Two']] as const) {
    await db.collection('girls').doc(id).set({
      id,
      fullName: name,
      dateOfBirth: '2012-01-01',
      gender: 'Female',
      dateAdmitted: '2024-01-01',
      school: 'E2E School',
      classLevel: 'Standard 5',
      householdId: 'SH-E2E',
      status: 'Active',
      guardianInfo: { name: 'E2E Guardian', phone: '0000000000', relationship: 'Aunt' },
      createdAt: now,
      updatedAt: now,
      createdBy: 'E2E Setup',
      updatedBy: 'E2E Setup',
    });
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const buildEnv: NodeJS.ProcessEnv = {
    ...process.env,
    VITE_USE_FIREBASE_EMULATORS: 'true',
    VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
  };

  // 1. Build the app against the emulators.
  await run('npm', ['run', 'build'], buildEnv);

  // 2. Start the emulators.
  start('npx', ['firebase', 'emulators:start', '--only', 'firestore,auth', '--project', PROJECT_ID], process.env);
  await waitForPort(FIRESTORE_EMULATOR_PORT);
  await waitForPort(AUTH_EMULATOR_PORT);

  // 3. Seed an Active Staff account.
  await seedStaffAccount();

  // 4. Serve the built app from server.ts.
  start('node', [path.join('dist', 'server.cjs')], {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(APP_PORT),
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${FIRESTORE_EMULATOR_PORT}`,
    GCLOUD_PROJECT: PROJECT_ID,
  });
  await waitForPort(APP_PORT);

  // Give the app one moment to settle before the first navigation.
  await delay(500);

  return async () => {
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
  };
}
