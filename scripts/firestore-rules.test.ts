import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import assert from 'node:assert/strict';
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
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
    await setDoc(doc(firestore, 'attachments/medical-photo'), {
      id: 'medical-photo', targetType: 'girl', targetId: 'girl-1', category: 'Medical Document',
      fileName: 'medical.png', storagePath: 'attachments/girl/girl-1/medical.png',
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
    await setDoc(doc(firestore, 'contacts/contact-1'), {
      id: 'contact-1', type: 'person', name: 'Contact One', category: 'volunteer', aliases: [],
      phone: [], email: [], notes: '', programmes: [], interactions: [], archived: false,
      createdByUid: 'manager', updatedByUid: 'manager',
    });
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
    const anonymous = testEnvironment.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(worker, 'contacts/contact-1')));
    await assertFails(getDoc(doc(anonymous, 'contacts/contact-1')));
    await assertSucceeds(setDoc(doc(worker, 'contacts/contact-worker'), {
      id: 'contact-worker', type: 'organisation', name: 'Worker Contact', category: 'school',
      aliases: [], phone: [], email: [], notes: '', programmes: [], interactions: [], archived: false,
      createdByUid: 'worker', updatedByUid: 'worker',
    }));
    await assertFails(setDoc(doc(worker, 'contacts/contact-forged'), {
      id: 'contact-forged', type: 'person', name: 'Forged Contact', category: 'other',
      createdByUid: 'manager', updatedByUid: 'worker',
    }));
    await assertSucceeds(updateDoc(doc(worker, 'contacts/contact-worker'), { notes: 'Updated by staff', updatedByUid: 'worker' }));
    await assertFails(updateDoc(doc(worker, 'contacts/contact-worker'), { notes: 'Forged editor', updatedByUid: 'manager' }));
    await assertFails(deleteDoc(doc(worker, 'contacts/contact-worker')));

    await assertSucceeds(getDoc(doc(viewer, 'caseActions/action-1')));
    await assertFails(updateDoc(doc(viewer, 'caseActions/action-1'), { status: 'Completed' }));
    await assertFails(getDoc(doc(viewer, 'caseActions/action-2')));
    await assertSucceeds(updateDoc(doc(worker, 'caseActions/action-2'), { status: 'Completed', completedAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z', updatedBy: 'worker', updatedByUid: 'worker' }));
    await assertFails(getDoc(doc(viewer, 'healthFollowUps/health-1')));
    await assertSucceeds(getDoc(doc(manager, 'healthFollowUps/health-1')));
    await assertFails(getDoc(doc(viewer, 'attachments/medical-photo')));
    await assertSucceeds(getDoc(doc(manager, 'attachments/medical-photo')));
    const safeAttachmentTypes = ['girl', 'household', 'educationalFollowUp', 'familyFollowUp', 'householdActivity', 'rentPayment', 'expense'];
    await Promise.all(safeAttachmentTypes.map((targetType) => assertSucceeds(getDocs(query(collection(viewer, 'attachments'), where('targetType', '==', targetType), where('category', 'not-in', ['Medical Document', 'Prescription']))))));
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
    await assertSucceeds(setDoc(doc(worker, 'reportHistory/report-worker'), { id: 'report-worker', reportType: 'comprehensive', title: 'Worker report', reportingPeriod: '2026-01', filters: {}, generatedBy: 'worker', generatedByUid: 'worker', generatedAt: '2026-09-28T00:00:00.000Z', fileType: 'docx', fileName: 'report.docx', storagePath: 'reports/worker/report-worker/report.docx', dataSourceReferences: ['girls'], recordCount: 1, photoCount: 0, tableCount: 1, status: 'Generated' }));
    await assertSucceeds(getDoc(doc(manager, 'reportHistory/report-worker')));
    const ownReportHistory = await getDoc(doc(worker, 'reportHistory/report-worker'));
    await assertSucceeds(Promise.resolve(ownReportHistory));
    assert.equal(ownReportHistory.data()?.storagePath, 'reports/worker/report-worker/report.docx');
    await assertSucceeds(getDocs(query(collection(worker, 'reportHistory'), where('generatedByUid', '==', 'worker'), orderBy('generatedAt', 'desc'))));
    await assertSucceeds(getDocs(query(collection(manager, 'reportHistory'), orderBy('generatedAt', 'desc'))));
    await assertFails(getDoc(doc(viewer, 'reportHistory/report-worker')));
    await assertFails(setDoc(doc(worker, 'reportHistory/report-forged'), { id: 'report-forged', generatedByUid: 'manager', status: 'Generated', fileType: 'docx' }));
    await assertFails(setDoc(doc(worker, 'reportHistory/report-bad-path'), { id: 'report-bad-path', reportType: 'comprehensive', title: 'Bad path', reportingPeriod: '2026-01', filters: {}, generatedBy: 'worker', generatedByUid: 'worker', generatedAt: '2026-09-28T00:00:00.000Z', fileType: 'docx', fileName: 'report.docx', storagePath: 'reports/manager/report-bad-path/report.docx', dataSourceReferences: ['girls'], recordCount: 1, photoCount: 0, tableCount: 1, status: 'Generated' }));
    await assertFails(updateDoc(doc(worker, 'reportHistory/report-worker'), { title: 'Changed' }));
    await assertFails(setDoc(doc(viewer, 'reportHistory/report-viewer'), { id: 'report-viewer', reportType: 'comprehensive', title: 'Viewer report', reportingPeriod: '2026-01', filters: {}, generatedBy: 'viewer', generatedByUid: 'viewer', generatedAt: '2026-09-28T00:00:00.000Z', fileType: 'pdf', fileName: 'report.pdf', dataSourceReferences: ['girls'], recordCount: 1, photoCount: 0, tableCount: 1, status: 'Generated' }));
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
