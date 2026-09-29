import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';

const projectId = 'demo-shine-phase5-rules';
let testEnvironment: RulesTestEnvironment;
const staffProfile = (uid: string, role: string) => ({ uid, id: uid, email: `${uid}@example.test`, fullName: uid, role, status: 'Active', safeguardingPermissions: { canView: false, canCreate: false, canEdit: false, canClose: false } });

async function run() {
  testEnvironment = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8') } });
  try {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, 'staffUsers/staff'), staffProfile('staff', 'Staff'));
      await setDoc(doc(firestore, 'staffUsers/manager'), staffProfile('manager', 'Manager'));
      await setDoc(doc(firestore, 'staffUsers/viewer'), staffProfile('viewer', 'View Only'));
      await setDoc(doc(firestore, 'staffUsers/admin'), staffProfile('admin', 'Administrator'));
    });
    const staff = testEnvironment.authenticatedContext('staff', { email: 'staff@example.test' }).firestore();
    const manager = testEnvironment.authenticatedContext('manager', { email: 'manager@example.test' }).firestore();
    const viewer = testEnvironment.authenticatedContext('viewer', { email: 'viewer@example.test' }).firestore();
    const admin = testEnvironment.authenticatedContext('admin', { email: 'admin@example.test' }).firestore();

    await assertSucceeds(setDoc(doc(staff, 'meetings/meeting-1'), { id: 'meeting-1', title: 'Committee', dateTime: '2026-09-29T10:00:00.000Z' }));
    await assertSucceeds(getDoc(doc(viewer, 'meetings/meeting-1')));
    await assertFails(setDoc(doc(viewer, 'meetings/meeting-2'), { id: 'meeting-2', title: 'Blocked', dateTime: '2026-09-29T11:00:00.000Z' }));
    await assertSucceeds(setDoc(doc(staff, 'feedingProgramLogs/feeding-1'), { id: 'feeding-1', date: '2026-09-29', studentsPresent: 10, mealsServed: 10 }));
    await assertSucceeds(setDoc(doc(staff, 'marketPrices/price-1'), { id: 'price-1', itemName: 'Maize', price: 40000, dateRecorded: '2026-09-29' }));
    await assertSucceeds(setDoc(doc(manager, 'forecastSettings/default'), { id: 'default', inflationPercent: 10, authorizedBy: 'manager' }));
    await assertFails(setDoc(doc(staff, 'forecastSettings/blocked'), { id: 'blocked', inflationPercent: 10, authorizedBy: 'staff' }));
    await assertFails(getDoc(doc(staff, 'whatIfScenarios/scenario-1')));
    await assertSucceeds(setDoc(doc(manager, 'whatIfScenarios/scenario-1'), { id: 'scenario-1', name: 'Food increase' }));
    await assertFails(setDoc(doc(manager, 'aiSettings/default'), { id: 'default', enabled: false }));
    await assertSucceeds(setDoc(doc(admin, 'aiSettings/default'), { id: 'default', enabled: false }));
    await assertSucceeds(getDoc(doc(staff, 'aiSettings/default')));
    console.log('Phase 5 Firestore rules tests passed.');
  } finally {
    await testEnvironment.cleanup();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
