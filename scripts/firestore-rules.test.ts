import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import assert from 'node:assert/strict';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, getDocsFromServer, orderBy, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
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
    await setDoc(doc(firestore, 'staffUsers/case-reviewer'), staff('case-reviewer', 'Staff', {
      canViewCaseReviews: true,
      canEditCaseReviews: true,
    }));
    const safeguardingWorkerProfile = staff('safeguarding-worker', 'Staff');
    safeguardingWorkerProfile.safeguardingPermissions = { canView: true, canCreate: false, canEdit: false, canClose: false };
    await setDoc(doc(firestore, 'staffUsers/safeguarding-worker'), safeguardingWorkerProfile);
    await setDoc(doc(firestore, 'procurementLists/procurement-test'), { id: 'procurement-test', title: 'Synthetic procurement test', purpose: 'Rules fixture only', items: [{ description: 'Synthetic test item', quantity: 1, unit: 'item', unitPriceMWK: 1, totalMWK: 1, priceStatus: 'quoted' }], totalMWK: 1, status: 'draft', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'manager', updatedBy: 'manager' });
    await setDoc(doc(firestore, 'importAudits/legacy-source-data'), {
      id: 'legacy-source-data',
      fileName: 'synthetic.xlsx',
      importedAt: '2026-10-18T00:00:00.000Z',
      status: 'completed',
      sourceData: { rows: [{ syntheticLabel: 'legacy-private-row' }] },
    });
    await setDoc(doc(firestore, 'caseActions/action-1'), {
      id: 'action-1',
      title: 'Visit school',
      assignedStaffId: 'viewer',
      assignedStaffName: 'viewer',
      sourceType: 'manual',
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
      sourceType: 'manual',
      status: 'Open',
      priority: 'Medium',
      dueDate: '2026-10-01',
      createdByUid: 'manager',
      updatedByUid: 'manager',
    });
    await setDoc(doc(firestore, 'caseActions/action-safeguarding'), {
      id: 'action-safeguarding',
      title: 'SYNTHETIC_RESTRICTED_ACTION',
      description: 'Synthetic safeguarding action fixture',
      assignedStaffId: 'viewer',
      assignedStaffName: 'viewer',
      sourceType: 'safeguarding',
      priority: 'High',
      status: 'Open',
      dueDate: '2026-10-01',
      createdByUid: 'manager',
      updatedByUid: 'manager',
    });
    await setDoc(doc(firestore, 'caseActions/action-safeguarding-authorized'), {
      id: 'action-safeguarding-authorized',
      title: 'Synthetic authorized safeguarding action',
      description: 'Synthetic authorized fixture',
      assignedStaffId: 'safeguarding-worker',
      assignedStaffName: 'safeguarding-worker',
      sourceType: 'safeguarding',
      priority: 'High',
      status: 'Open',
      dueDate: '2026-10-01',
      createdByUid: 'manager',
      updatedByUid: 'manager',
    });
    await setDoc(doc(firestore, 'caseActions/action-health'), {
      id: 'action-health',
      title: 'SYNTHETIC_RESTRICTED_HEALTH_ACTION',
      description: 'Synthetic health action fixture',
      assignedStaffId: 'viewer',
      assignedStaffName: 'viewer',
      sourceType: 'healthFollowUp',
      priority: 'High',
      status: 'Open',
      dueDate: '2026-10-01',
      createdByUid: 'manager',
      updatedByUid: 'manager',
    });
    await setDoc(doc(firestore, 'caseReviews/review-health'), {
      id: 'review-health',
      girlId: 'girl-1',
      reviewDate: '2026-10-01',
      health: 'SYNTHETIC_RESTRICTED_HEALTH_REVIEW',
      currentSituation: 'Synthetic case review fixture',
    });
    await setDoc(doc(firestore, 'caseActionAuditLogs/audit-action-1'), {
      id: 'audit-action-1', recordId: 'action-1', userId: 'viewer', eventType: 'updated', timestamp: '2026-10-01T00:00:00.000Z',
    });
    await setDoc(doc(firestore, 'caseActionAuditLogs/audit-action-health'), {
      id: 'audit-action-health', recordId: 'action-health', userId: 'viewer', eventType: 'updated', timestamp: '2026-10-01T00:00:00.000Z',
    });
    await setDoc(doc(firestore, 'caseActionAuditLogs/audit-action-safeguarding'), {
      id: 'audit-action-safeguarding', recordId: 'action-safeguarding', userId: 'viewer', eventType: 'updated', timestamp: '2026-10-01T00:00:00.000Z',
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
    await setDoc(doc(firestore, 'employees/employee-1'), {
      id: 'employee-1',
      fullName: 'Employee One',
      employmentStatus: 'Active',
      createdBy: 'manager',
    });
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
    const caseReviewer = testEnvironment.authenticatedContext('case-reviewer', { email: 'case-reviewer@example.test' }).firestore();
    const manager = testEnvironment.authenticatedContext('manager', { email: 'manager@example.test' }).firestore();
    const admin = testEnvironment.authenticatedContext('admin', { email: 'admin@example.test' }).firestore();
    const anonymous = testEnvironment.unauthenticatedContext().firestore();

    // Original import rows must be separate from staff-readable audit metadata.
    await assertSucceeds(setDoc(doc(worker, 'importAudits/audit-safe'), {
      id: 'audit-safe', fileName: 'synthetic.xlsx', importedAt: '2026-10-18T00:00:00.000Z', status: 'completed',
    }));
    await assertFails(setDoc(doc(worker, 'importAudits/audit-with-source-data'), {
      id: 'audit-with-source-data', fileName: 'synthetic.xlsx', importedAt: '2026-10-18T00:00:00.000Z',
      status: 'completed', sourceData: { rows: [{ syntheticLabel: 'private-row' }] },
    }));
    await assertFails(getDoc(doc(worker, 'importAudits/legacy-source-data')));
    await assertSucceeds(getDoc(doc(manager, 'importAudits/legacy-source-data')));
    await assertFails(getDocs(collection(worker, 'importAudits')));
    await assertSucceeds(getDocs(collection(manager, 'importAudits')));
    await assertFails(getDoc(doc(worker, 'importAuditMigrationStatus/sourceDataBoundary')));
    await assertFails(setDoc(doc(manager, 'importAuditMigrationStatus/sourceDataBoundary'), { status: 'complete' }));
    await assertSucceeds(setDoc(doc(worker, 'restrictedImportSources/source-worker'), {
      id: 'source-worker', auditId: 'source-worker', fileName: 'synthetic.xlsx',
      importedAt: '2026-10-18T00:00:00.000Z', sourceData: { rows: [{ syntheticLabel: 'private-row' }] },
    }));
    await assertFails(getDoc(doc(worker, 'restrictedImportSources/source-worker')));
    await assertSucceeds(getDoc(doc(manager, 'restrictedImportSources/source-worker')));
    await assertSucceeds(getDoc(doc(admin, 'restrictedImportSources/source-worker')));
    await assertFails(setDoc(doc(worker, 'restrictedImportSources/source-worker'), {
      id: 'source-worker', auditId: 'source-worker', fileName: 'synthetic.xlsx',
      importedAt: '2026-10-18T00:00:00.000Z', sourceData: { rows: [{ syntheticLabel: 'private-row' }] },
    }));

    const newImportAudit = doc(worker, 'importAudits/staff-transaction-create');
    const newRestrictedSource = doc(worker, 'restrictedImportSources/staff-transaction-create');
    const newAuditMetadata = {
      id: 'staff-transaction-create',
      fileName: 'synthetic.xlsx',
      importedAt: '2026-10-18T00:00:00.000Z',
      status: 'completed',
      sourceDataStoredInRestrictedCollection: true,
    };
    const newSourceData = {
      id: 'staff-transaction-create',
      auditId: 'staff-transaction-create',
      fileName: 'synthetic.xlsx',
      importedAt: '2026-10-18T00:00:00.000Z',
      sourceData: { rows: [{ syntheticLabel: 'private-transaction-row' }] },
    };
    assert.equal((await getDoc(newImportAudit)).exists(), false, 'staff may check an absent audit ID without reading any source data');

    // The marker must not certify an absent or empty restricted payload.
    for (const [auditId, sourceData] of [
      ['staff-source-missing-payload', undefined],
      ['staff-source-empty-payload', {}],
    ] as const) {
      const incompleteAudit = doc(worker, `importAudits/${auditId}`);
      const incompleteSource = doc(worker, `restrictedImportSources/${auditId}`);
      await assertFails(runTransaction(worker, async (transaction) => {
        const existingAudit = await transaction.get(incompleteAudit);
        if (!existingAudit.exists()) {
          const sourceDocument: Record<string, unknown> = {
            id: auditId,
            auditId,
            fileName: 'synthetic.xlsx',
            importedAt: '2026-10-18T00:00:00.000Z',
          };
          if (sourceData !== undefined) sourceDocument.sourceData = sourceData;
          transaction.set(incompleteSource, sourceDocument);
          transaction.set(incompleteAudit, {
            ...newAuditMetadata,
            id: auditId,
          });
        }
      }));
    }

    await assertSucceeds(runTransaction(worker, async (transaction) => {
      const existingAudit = await transaction.get(newImportAudit);
      if (!existingAudit.exists()) {
        transaction.set(newRestrictedSource, newSourceData);
        transaction.set(newImportAudit, newAuditMetadata);
      }
    }));
    await assertFails(getDoc(newRestrictedSource));
    await assertSucceeds(getDoc(doc(manager, 'restrictedImportSources/staff-transaction-create')));
    await assertSucceeds(runTransaction(worker, async (transaction) => {
      const existingAudit = await transaction.get(newImportAudit);
      assert.deepEqual(existingAudit.data(), newAuditMetadata);
    }));

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const privilegedFirestore = context.firestore();
      await setDoc(doc(privilegedFirestore, 'restrictedImportSources/legacy-source-data'), {
        id: 'legacy-source-data',
        auditId: 'legacy-source-data',
        fileName: 'synthetic.xlsx',
        importedAt: '2026-10-18T00:00:00.000Z',
        sourceData: { rows: [{ syntheticLabel: 'legacy-private-row' }] },
      });
      await updateDoc(doc(privilegedFirestore, 'importAudits/legacy-source-data'), { sourceData: deleteField() });
      await setDoc(doc(privilegedFirestore, 'importAuditMigrationStatus/sourceDataBoundary'), { status: 'complete' });
    });
    await assertSucceeds(getDocs(collection(worker, 'importAudits')));
    await assertSucceeds(getDoc(doc(viewer, 'importAudits/legacy-source-data')));
    await assertSucceeds(getDoc(doc(manager, 'importAudits/legacy-source-data')));
    await assertFails(getDoc(doc(worker, 'restrictedImportSources/legacy-source-data')));
    await assertFails(getDoc(doc(viewer, 'restrictedImportSources/legacy-source-data')));
    await assertSucceeds(getDoc(doc(manager, 'restrictedImportSources/legacy-source-data')));
    await assertSucceeds(getDoc(doc(admin, 'restrictedImportSources/legacy-source-data')));

    await assertSucceeds(getDoc(doc(worker, 'contacts/contact-1')));
    await assertFails(getDoc(doc(anonymous, 'contacts/contact-1')));
    await assertSucceeds(setDoc(doc(worker, 'contacts/contact-worker'), {
      id: 'contact-worker', type: 'organisation', name: 'Worker Contact', category: 'school',
      aliases: [], phone: [], email: [], notes: '', programmes: [], interactions: [], archived: false,
      createdBy: 'worker', createdByUid: 'worker', createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-17T00:00:00.000Z', updatedByUid: 'worker', updatedByName: 'worker',
      source: 'manual', firstSeen: '2026-10-17', lastSeen: '2026-10-17',
    }));
    await assertFails(setDoc(doc(worker, 'contacts/contact-forged'), {
      id: 'contact-forged', type: 'person', name: 'Forged Contact', category: 'other',
      createdByUid: 'manager', updatedByUid: 'worker',
    }));
    await assertSucceeds(updateDoc(doc(worker, 'contacts/contact-worker'), { notes: 'Updated by staff', updatedByUid: 'worker', updatedByName: 'worker' }));
    await assertFails(updateDoc(doc(worker, 'contacts/contact-worker'), { notes: 'Forged editor', updatedByUid: 'manager', updatedByName: 'manager' }));
    await assertFails(updateDoc(doc(worker, 'contacts/contact-worker'), { createdByUid: 'manager', updatedByUid: 'worker', updatedByName: 'worker' }));
    await assertFails(updateDoc(doc(worker, 'contacts/contact-worker'), { createdBy: 'manager', updatedByUid: 'worker', updatedByName: 'worker' }));
    await assertFails(updateDoc(doc(worker, 'contacts/contact-worker'), { createdAt: 'forged', updatedByUid: 'worker', updatedByName: 'worker' }));
    await assertFails(setDoc(doc(worker, 'contacts/contact-extra-field'), {
      id: 'contact-extra-field', type: 'person', name: 'Unexpected Field', category: 'other',
      aliases: [], phone: [], email: [], notes: '', programmes: [], interactions: [], archived: false,
      createdBy: 'worker', createdByUid: 'worker', createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-17T00:00:00.000Z', updatedByUid: 'worker', updatedByName: 'worker',
      source: 'manual', firstSeen: '2026-10-17', lastSeen: '2026-10-17', admin: true,
    }));
    await assertFails(deleteDoc(doc(worker, 'contacts/contact-worker')));

    // Asset register follows the same active-staff / manager-staff / admin-delete policy.
    const assetRecord = {
      id: 'asset-worker', assetTag: 'SHINE-AST-001', name: 'Office laptop', category: 'IT & Electronics',
      location: 'Main Office', condition: 'Good', status: 'In Use', history: [],
      createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z',
      createdBy: 'worker', updatedBy: 'worker', createdByUid: 'worker', updatedByUid: 'worker',
    };
    await assertSucceeds(setDoc(doc(worker, 'assets/asset-worker'), assetRecord));
    await assertSucceeds(getDoc(doc(viewer, 'assets/asset-worker')));
    await assertSucceeds(updateDoc(doc(worker, 'assets/asset-worker'), { condition: 'Fair', updatedByUid: 'worker' }));
    await assertFails(deleteDoc(doc(worker, 'assets/asset-worker')));
    await assertSucceeds(deleteDoc(doc(admin, 'assets/asset-worker')));


    await assertSucceeds(getDoc(doc(viewer, 'caseActions/action-1')));
    await assertFails(getDoc(doc(viewer, 'caseActions/action-safeguarding')));
    await assertFails(getDoc(doc(manager, 'caseActions/action-safeguarding')));
    await assertSucceeds(getDoc(doc(admin, 'caseActions/action-safeguarding')));
    const safeguardingWorker = testEnvironment.authenticatedContext('safeguarding-worker', { email: 'safeguarding-worker@example.test' }).firestore();
    await assertSucceeds(getDoc(doc(safeguardingWorker, 'caseActions/action-safeguarding-authorized')));
    await assertFails(getDoc(doc(viewer, 'caseActions/action-health')));
    await assertSucceeds(getDoc(doc(manager, 'caseActions/action-health')));
    // Case-review reads remain queryable; the client strips health for users without view access.
    await assertSucceeds(getDoc(doc(caseReviewer, 'caseReviews/review-health')));
    await assertSucceeds(getDoc(doc(manager, 'caseReviews/review-health')));
    await assertSucceeds(setDoc(doc(caseReviewer, 'caseReviews/review-without-health'), {
      id: 'review-without-health', girlId: 'girl-1', reviewDate: '2026-10-02', currentSituation: 'Synthetic safe review',
    }));
    await assertFails(setDoc(doc(caseReviewer, 'caseReviews/review-with-health'), {
      id: 'review-with-health', girlId: 'girl-1', reviewDate: '2026-10-03', health: 'SYNTHETIC_RESTRICTED_HEALTH_REVIEW',
    }));
    const adminAssignedViewerActions = await assertSucceeds(getDocsFromServer(query(collection(admin, 'caseActions'), where('assignedStaffId', '==', 'viewer'))));
    assert.deepEqual(adminAssignedViewerActions.docs.map((action) => action.id).sort(), ['action-1', 'action-health', 'action-safeguarding']);
    const visibleViewerActions = await assertSucceeds(getDocsFromServer(query(collection(viewer, 'caseActions'), where('assignedStaffId', '==', 'viewer'), where('sourceType', 'not-in', ['safeguarding', 'healthFollowUp']))));
    assert.deepEqual(visibleViewerActions.docs.map((action) => action.id), ['action-1']);
    await assertFails(getDocsFromServer(query(collection(viewer, 'caseActions'), where('assignedStaffId', '==', 'viewer'))));
    await assertSucceeds(getDoc(doc(viewer, 'caseActionAuditLogs/audit-action-1')));
    await assertFails(getDoc(doc(viewer, 'caseActionAuditLogs/audit-action-health')));
    await assertFails(getDoc(doc(viewer, 'caseActionAuditLogs/audit-action-safeguarding')));
    await assertFails(getDocsFromServer(query(collection(viewer, 'caseActionAuditLogs'), where('userId', '==', 'viewer'))));
    await assertFails(getDocsFromServer(query(collection(manager, 'caseActionAuditLogs'), where('userId', '==', 'viewer'))));
    const adminCaseActionAuditLogs = await assertSucceeds(getDocsFromServer(collection(admin, 'caseActionAuditLogs')));
    assert.equal(adminCaseActionAuditLogs.size, 3);
    await assertFails(updateDoc(doc(viewer, 'caseActions/action-1'), { status: 'Completed' }));
    await assertFails(getDoc(doc(viewer, 'caseActions/action-2')));
    await assertSucceeds(updateDoc(doc(worker, 'caseActions/action-2'), { status: 'Completed', completedAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z', updatedBy: 'worker', updatedByUid: 'worker' }));
    const caseGoal = {
      id: 'goal-worker', girlId: 'girl-1', title: 'Improve attendance', baseline: '70%',
      targetOutcome: '90% attendance', measureOfSuccess: 'Monthly attendance report', status: 'In progress',
      progressNotes: [], createdByUid: 'worker', createdBy: 'worker', createdAt: '2026-09-26T00:00:00.000Z',
      updatedByUid: 'worker', updatedBy: 'worker', updatedAt: '2026-09-26T00:00:00.000Z',
    };
    await assertSucceeds(setDoc(doc(worker, 'caseGoals/goal-worker'), caseGoal));
    await assertSucceeds(getDoc(doc(viewer, 'caseGoals/goal-worker')));
    await assertFails(setDoc(doc(viewer, 'caseGoals/goal-viewer'), { ...caseGoal, id: 'goal-viewer', createdByUid: 'viewer' }));
    await assertFails(updateDoc(doc(worker, 'caseGoals/goal-worker'), { status: 'Achieved', updatedByUid: 'worker' }));
    await assertSucceeds(updateDoc(doc(worker, 'caseGoals/goal-worker'), { status: 'Achieved', outcome: 'Attendance rose to 92%', updatedByUid: 'worker' }));
    await assertFails(updateDoc(doc(worker, 'caseGoals/goal-worker'), { girlId: 'girl-2', updatedByUid: 'worker' }));
    await assertFails(deleteDoc(doc(worker, 'caseGoals/goal-worker')));
    await assertSucceeds(deleteDoc(doc(manager, 'caseGoals/goal-worker')));
    await assertFails(getDoc(doc(viewer, 'healthFollowUps/health-1')));
    await assertSucceeds(getDoc(doc(manager, 'healthFollowUps/health-1')));
    await assertFails(getDoc(doc(viewer, 'attachments/medical-photo')));
    // A broad targetId `in` query can mix ordinary and health-sensitive attachments.
    // Firestore rules are not filters, so an ordinary viewer must not be able to
    // read the mixed result set just because one target is otherwise accessible.
    await assertFails(getDocs(query(
      collection(viewer, 'attachments'),
      where('targetId', 'in', ['girl-1', 'household-1']),
    )));
    await assertSucceeds(getDoc(doc(manager, 'attachments/medical-photo')));
    const safeAttachmentTypes = ['girl', 'household', 'educationalFollowUp', 'familyFollowUp', 'householdActivity', 'rentPayment', 'expense'];
    await Promise.all(safeAttachmentTypes.map((targetType) => assertSucceeds(getDocs(query(collection(viewer, 'attachments'), where('targetType', '==', targetType), where('category', 'not-in', ['Medical Document', 'Prescription']))))));
    const reportAttachmentTypes = [
      'girl', 'household', 'educationalFollowUp', 'familyFollowUp', 'householdActivity',
      'programme', 'programmeLog', 'importBatch', 'rentPayment', 'expense', 'healthFollowUp',
    ];
    await assertSucceeds(getDocs(query(
      collection(manager, 'attachments'),
      where('targetType', 'in', reportAttachmentTypes),
    )));
    await assertFails(getDoc(doc(admin, 'safeguardingCases/case-1')));
    await assertFails(getDoc(doc(viewer, 'employeeSalaryHistory/salary-1')));
    await assertFails(getDoc(doc(worker, 'employeeSalaryHistory/salary-1')));
    await assertSucceeds(getDoc(doc(manager, 'employeeSalaryHistory/salary-1')));
    await assertSucceeds(getDoc(doc(manager, 'payrollRecords/payroll-manager')));
    await assertSucceeds(getDoc(doc(admin, 'payrollRecords/payroll-manager')));
    await assertFails(getDoc(doc(viewer, 'payrollRecords/payroll-manager')));
    await assertFails(getDoc(doc(worker, 'payrollRecords/payroll-manager')));
    await assertSucceeds(getDoc(doc(worker, 'payrollRecords/payroll-worker')));
    await assertSucceeds(getDoc(doc(manager, 'employees/employee-1')));
    await assertSucceeds(getDoc(doc(admin, 'employees/employee-1')));
    await assertFails(getDoc(doc(viewer, 'employees/employee-1')));
    await assertFails(getDoc(doc(worker, 'employees/employee-1')));
    await assertSucceeds(setDoc(doc(manager, 'employees/employee-2'), {
      id: 'employee-2',
      fullName: 'Employee Two',
      employmentStatus: 'Active',
      createdBy: 'manager',
    }));
    await assertFails(setDoc(doc(worker, 'employees/employee-3'), {
      id: 'employee-3',
      fullName: 'Employee Three',
      employmentStatus: 'Active',
      createdBy: 'worker',
    }));
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
    await assertSucceeds(setDoc(doc(worker, 'reportExports/fixed-export-worker'), {
      id: 'fixed-export-worker', reportType: 'import-fixed', title: 'Fixed report',
      fileName: 'source - fixed - 2026-10-05.docx', format: 'docx', version: 1,
      hash: 'a'.repeat(64), openProblems: [], overrides: [], generatedBy: 'Worker',
      generatedByUid: 'worker', generatedAt: '2026-10-05T12:00:00.000Z',
      draft: false, finalLocked: true,
    }));
    await assertSucceeds(getDoc(doc(manager, 'reportExports/fixed-export-worker')));
    await assertFails(getDoc(doc(viewer, 'reportExports/fixed-export-worker')));
    await assertFails(setDoc(doc(viewer, 'reportExports/fixed-export-viewer'), {
      id: 'fixed-export-viewer', reportType: 'import-fixed', title: 'Fixed report',
      fileName: 'source - fixed.docx', format: 'docx', version: 1,
      hash: 'b'.repeat(64), openProblems: [], overrides: [], generatedBy: 'Viewer',
      generatedByUid: 'viewer', generatedAt: '2026-10-05T12:00:00.000Z',
      draft: false, finalLocked: true,
    }));
    await assertFails(updateDoc(doc(worker, 'reportExports/fixed-export-worker'), { finalLocked: false }));
    await assertFails(setDoc(doc(manager, 'employeeSalaryHistory/salary-2'), { salaryAmount: 130000 }));
    await assertSucceeds(updateDoc(doc(worker, 'procurementLists/procurement-test'), { purpose: 'Staff can update a draft' }));
    await assertFails(updateDoc(doc(worker, 'procurementLists/procurement-test'), { status: 'approved', approvedBy: 'worker' }));
    await assertFails(updateDoc(doc(manager, 'procurementLists/procurement-test'), { status: 'purchased', purchaseOrderReference: 'PO-TEST', orderedAt: '2026-01-02T00:00:00.000Z', orderedBy: 'manager' }));
    await assertSucceeds(updateDoc(doc(manager, 'procurementLists/procurement-test'), { status: 'approved', approvedBy: 'manager', approvedAt: '2026-01-01T12:00:00.000Z' }));
    await assertFails(updateDoc(doc(worker, 'procurementLists/procurement-test'), { purpose: 'Cannot edit after approval' }));
    await assertFails(updateDoc(doc(manager, 'procurementLists/procurement-test'), { financeHandedOverAt: '2026-01-03T00:00:00.000Z', financeHandedOverBy: 'manager', financeReference: 'EARLY-HANDOVER' }));
    await assertSucceeds(updateDoc(doc(manager, 'procurementLists/procurement-test'), { status: 'purchased', purchaseOrderReference: 'PO-TEST', orderedAt: '2026-01-02T00:00:00.000Z', orderedBy: 'manager' }));
    await assertSucceeds(updateDoc(doc(worker, 'procurementLists/procurement-test'), { receivedAt: '2026-01-03T00:00:00.000Z', receivedBy: 'worker' }));
    await assertFails(updateDoc(doc(worker, 'procurementLists/procurement-test'), { financeReference: 'FORGED-REF' }));
    await assertSucceeds(updateDoc(doc(manager, 'procurementLists/procurement-test'), { financeHandedOverAt: '2026-01-04T00:00:00.000Z', financeHandedOverBy: 'manager', financeReference: 'INV-TEST' }));

    console.log('Firestore rules tests passed.');
  } finally {
    await testEnvironment.cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
