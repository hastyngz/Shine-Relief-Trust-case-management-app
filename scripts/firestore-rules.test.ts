import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';

const projectId = 'demo-shine-phase2-rules';
let testEnvironment: RulesTestEnvironment;

const staff = (uid: string, role: string, permissions: Record<string, boolean> = {}) => ({
  uid,
  id: uid,
  email: `${uid}@example.test`,
  fullName: uid,
  role,
  status: 'Active',
  safeguardingPermissions: {
    canView: false,
    canCreate: false,
    canEdit: false,
    canClose: false,
  },
  ...permissions,
});

async function seedData() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'staffUsers/admin'), staff('admin', 'Administrator'));
    await setDoc(doc(firestore, 'staffUsers/manager'), staff('manager', 'Manager'));
    await setDoc(doc(firestore, 'staffUsers/viewer'), staff('viewer', 'View Only'));
    await setDoc(doc(firestore, 'staffUsers/worker'), staff('worker', 'Staff'));
    await setDoc(doc(firestore, 'caseActions/action-1'), {
      id: 'action-1',
      title: 'Visit school',
      assignedStaffId: 'viewer',
      assignedStaffName: 'viewer',
      status: 'Open',
      priority: 'Medium',
      dueDate: '2026-10-01',
      createdByUid: 'manager',
      updatedByUid: 'manager',
    });
    await setDoc(doc(firestore, 'caseActions/action-2'), {
      id: 'action-2',
      title: 'Visit household',
      assignedStaffId: 'worker',
      assignedStaffName: 'worker',
      status: 'Open',
      priority: 'Medium',
      dueDate: '2026-10-01',
      createdByUid: 'manager',
      updatedByUid: 'manager',
    });
    await setDoc(doc(firestore, 'healthFollowUps/health-1'), {
      id: 'health-1',
      girlId: 'girl-1',
      date: '2026-09-26',
    });
    await setDoc(doc(firestore, 'safeguardingCases/case-1'), {
      id: 'case-1',
      girlId: 'girl-1',
      authorizedStaffUids: ['manager'],
    });
    await setDoc(doc(firestore, 'employeeSalaryHistory/salary-1'), {
      id: 'salary-1',
      employeeId: 'worker',
      effectiveDate: '2026-01-01',
      salaryAmount: 100000,
      salaryFrequency: 'Monthly',
      auditMetadata: { createdByUid: 'admin', createdAt: '2026-09-27T00:00:00.000Z' },
    });
    await setDoc(doc(firestore, 'payrollRecords/payroll-manager'), { id: 'payroll-manager', employeeId: 'manager', expectedAmount: 100000, amountPaid: 0 });
    await setDoc(doc(firestore, 'payrollRecords/payroll-worker'), { id: 'payroll-worker', employeeId: 'worker', expectedAmount: 80000, amountPaid: 80000 });
  });
}

async function run() {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8'),
    },
  });

  try {
    await seedData();

    const viewer = testEnvironment.authenticatedContext('viewer', { email: 'viewer@example.test' }).firestore();
    const worker = testEnvironment.authenticatedContext('worker', { email: 'worker@example.test' }).firestore();
    const manager = testEnvironment.authenticatedContext('manager', { email: 'manager@example.test' }).firestore();
    const admin = testEnvironment.authenticatedContext('admin', { email: 'admin@example.test' }).firestore();

    await assertSucceeds(getDoc(doc(viewer, 'caseActions/action-1')));
    await assertFails(updateDoc(doc(viewer, 'caseActions/action-1'), { status: 'Completed' }));
    await assertFails(getDoc(doc(viewer, 'caseActions/action-2')));
    await assertSucceeds(updateDoc(doc(worker, 'caseActions/action-2'), { status: 'Completed', completedAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z', updatedBy: 'worker', updatedByUid: 'worker' }));
    await assertFails(getDoc(doc(viewer, 'healthFollowUps/health-1')));
    await assertSucceeds(getDoc(doc(manager, 'healthFollowUps/health-1')));
    await assertFails(getDoc(doc(admin, 'safeguardingCases/case-1')));
    await assertFails(getDoc(doc(viewer, 'employeeSalaryHistory/salary-1')));
    await assertFails(getDoc(doc(worker, 'employeeSalaryHistory/salary-1')));
    await assertSucceeds(getDoc(doc(manager, 'employeeSalaryHistory/salary-1')));
    await assertSucceeds(getDoc(doc(manager, 'payrollRecords/payroll-manager')));
    await assertSucceeds(getDoc(doc(admin, 'payrollRecords/payroll-manager')));
    await assertFails(getDoc(doc(viewer, 'payrollRecords/payroll-manager')));
    await assertFails(getDoc(doc(worker, 'payrollRecords/payroll-manager')));
    await assertSucceeds(getDoc(doc(worker, 'payrollRecords/payroll-worker')));
    await assertFails(setDoc(doc(worker, 'employeeSalaryHistory/salary-2'), {
      id: 'salary-2', employeeId: 'worker', effectiveDate: '2026-07-01', salaryAmount: 120000,
      salaryFrequency: 'Monthly', auditMetadata: { createdByUid: 'worker', createdAt: '2026-09-27T00:00:00.000Z' },
    }));
    await assertSucceeds(setDoc(doc(manager, 'employeeSalaryHistory/salary-2'), {
      id: 'salary-2', employeeId: 'worker', effectiveDate: '2026-07-01', salaryAmount: 120000,
      salaryFrequency: 'Monthly', auditMetadata: { createdByUid: 'manager', createdAt: '2026-09-27T00:00:00.000Z' },
    }));
    await assertSucceeds(setDoc(doc(manager, 'employeeAuditLogs/report-event'), { employeeId: 'management-report', action: 'report_export', actorUid: 'manager' }));
    await assertFails(setDoc(doc(worker, 'employeeAuditLogs/report-event-worker'), { employeeId: 'management-report', action: 'report_export', actorUid: 'worker' }));
    await assertFails(setDoc(doc(manager, 'employeeSalaryHistory/salary-2'), { salaryAmount: 130000 }));

    console.log('Firestore rules tests passed.');
  } finally {
    await testEnvironment.cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
