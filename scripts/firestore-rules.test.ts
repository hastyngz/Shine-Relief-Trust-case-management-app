import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import assert from 'node:assert/strict';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, getDocsFromServer, orderBy, query, runTransaction, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
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
    await setDoc(doc(firestore, 'staffUsers/pre-registered'), staff('pre-registered', 'Staff'));
    await setDoc(doc(firestore, 'staffInvitations/synthetic-private-invitation'), {
      id: 'synthetic-private-invitation',
      email: 'invitee@example.test',
      tokenHash: 'synthetic-token-hash-only',
      status: 'pending',
      createdAt: '2026-10-27T12:00:00.000Z',
      expiresAt: '2026-10-28T12:00:00.000Z',
    });
    await setDoc(doc(firestore, 'staffUsers/case-reviewer'), staff('case-reviewer', 'Staff', {
      canViewCaseReviews: true,
      canEditCaseReviews: true,
    }));
    const safeguardingWorkerProfile = staff('safeguarding-worker', 'Staff');
    safeguardingWorkerProfile.safeguardingPermissions = { canView: true, canCreate: false, canEdit: false, canClose: false };
    await setDoc(doc(firestore, 'staffUsers/safeguarding-worker'), safeguardingWorkerProfile);
    await setDoc(doc(firestore, 'procurementLists/procurement-test'), { id: 'procurement-test', title: 'Synthetic procurement test', purpose: 'Rules fixture only', items: [{ description: 'Synthetic test item', quantity: 1, unit: 'item', unitPriceMWK: 1, totalMWK: 1, priceStatus: 'quoted' }], totalMWK: 1, status: 'draft', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'manager', updatedBy: 'manager' });
    const expiredAt = Timestamp.fromMillis(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await setDoc(doc(firestore, 'managementProcurementReportHistory/expired-report-metadata'), {
      id: 'expired-report-metadata', reportType: 'management-procurement', generatedByUid: 'manager',
      generatedAt: Timestamp.fromMillis(Date.now() - 100 * 24 * 60 * 60 * 1000), expiresAt: expiredAt,
      dateBasis: 'createdAt', format: 'csv', selectedListCount: 1, aggregateRowCount: 20,
    });
    await setDoc(doc(firestore, 'importAudits/legacy-source-data'), {
      id: 'legacy-source-data',
      fileName: 'synthetic.xlsx',
      importedAt: '2026-10-18T00:00:00.000Z',
      status: 'completed',
      sourceData: { rows: [{ syntheticLabel: 'legacy-private-row' }] },
    });
    await setDoc(doc(firestore, 'expenses/finance-expense-test'), {
      id: 'finance-expense-test',
      householdId: 'household-1',
      date: '2026-11-02',
      category: 'Repairs',
      itemDescription: 'Synthetic finance permission fixture',
      quantity: '1',
      unitCost: 1000,
      totalCost: 1000,
      paymentStatus: 'Payment Outstanding',
      amountDue: 1000,
      auditTrail: [{ action: 'created', by: 'manager', at: '2026-11-02T00:00:00.000Z', newStatus: 'Payment Outstanding' }],
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
    await setDoc(doc(firestore, 'attachments/ordinary-file'), {
      id: 'ordinary-file', targetType: 'household', targetId: 'household-1', category: 'Receipt',
      fileName: 'receipt.pdf', storagePath: 'attachments/household/household-1/receipt.pdf',
      filingMetadata: { documentTitle: 'Receipt', referenceNumber: 'REF-001', documentOwner: 'Finance', classification: 'Internal' },
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
    await setDoc(doc(firestore, 'payrollRecords/payroll-worker'), { id: 'payroll-worker', employeeId: 'worker', staffUid: 'worker', expectedAmount: 80000, amountPaid: 80000 });
    await setDoc(doc(firestore, 'payrollRecords/payroll-linked'), { id: 'payroll-linked', employeeId: 'EMP-123', staffUid: 'worker', expectedAmount: 80000, amountPaid: 0 });
    await setDoc(doc(firestore, 'payrollRecords/payroll-unlinked'), { id: 'payroll-unlinked', employeeId: 'worker', expectedAmount: 80000, amountPaid: 0 });
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

    const verifiedPrimaryAdmin = testEnvironment.authenticatedContext('primary-admin', {
      email: 'hastingszidanamot@gmail.com',
      email_verified: true,
    }).firestore();
    const unverifiedPrimaryAdmin = testEnvironment.authenticatedContext('unverified-primary-admin', {
      email: 'hastingszidanamot@gmail.com',
      email_verified: false,
    }).firestore();
    const verifiedPreRegistered = testEnvironment.authenticatedContext('pre-registered-verified', {
      email: 'pre-registered@example.test',
      email_verified: true,
    }).firestore();
    const unverifiedPreRegistered = testEnvironment.authenticatedContext('pre-registered-unverified', {
      email: 'pre-registered@example.test',
      email_verified: false,
    }).firestore();

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'staffUsers/legacy-primary-admin'), {
        ...staff('legacy-primary-admin', 'Administrator'),
        email: 'hastingszidanamot@gmail.com',
      });
    });
    const legacyVerifiedAdmin = testEnvironment.authenticatedContext('legacy-primary-admin', {
      email: 'hastingszidanamot@gmail.com',
      email_verified: true,
    }).firestore();
    const legacyUnverifiedAdmin = testEnvironment.authenticatedContext('legacy-primary-admin', {
      email: 'hastingszidanamot@gmail.com',
      email_verified: false,
    }).firestore();
    await assertSucceeds(getDoc(doc(legacyVerifiedAdmin, 'staffUsers/legacy-primary-admin')));
    await assertFails(getDoc(doc(legacyUnverifiedAdmin, 'staffUsers/legacy-primary-admin')));
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'staffUsers/legacy-primary-admin'));
    });

    // The primary-admin email alone is not proof of identity: bootstrap privileges
    // require Firebase's verified-email claim and the profile must use that email.
    await assertSucceeds(getDoc(doc(verifiedPrimaryAdmin, 'staffUsers/admin')));
    await assertFails(getDoc(doc(unverifiedPrimaryAdmin, 'staffUsers/admin')));
    await assertSucceeds(getDoc(doc(verifiedPreRegistered, 'staffUsers/pre-registered')));
    await assertFails(getDoc(doc(unverifiedPreRegistered, 'staffUsers/pre-registered')));
    await assertFails(setDoc(doc(unverifiedPrimaryAdmin, 'staffUsers/unverified-primary-admin'), {
      ...staff('unverified-primary-admin', 'Administrator'),
      email: 'hastingszidanamot@gmail.com',
    }));
    await assertSucceeds(setDoc(doc(verifiedPrimaryAdmin, 'staffUsers/primary-admin'), {
      ...staff('primary-admin', 'Administrator'),
      email: 'hastingszidanamot@gmail.com',
    }));
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'staffUsers/primary-admin'));
    });

    // Invitation records contain private recipient addresses and token hashes.
    // They are server-only: even Administrators must use the trusted Worker API.
    const invitationPath = 'staffInvitations/synthetic-private-invitation';
    for (const context of [viewer, worker, manager, admin]) {
      await assertFails(getDoc(doc(context, invitationPath)));
      await assertFails(getDocs(collection(context, 'staffInvitations')));
      await assertFails(setDoc(doc(context, 'staffInvitations/client-write'), {
        id: 'client-write',
        email: 'attacker@example.test',
        tokenHash: 'client-controlled-hash',
        status: 'accepted',
      }));
      await assertFails(updateDoc(doc(context, invitationPath), { status: 'accepted' }));
      await assertFails(deleteDoc(doc(context, invitationPath)));
    }
    await assertFails(getDoc(doc(anonymous, invitationPath)));

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
    const selfAssignedAction = (uid: string) => ({
      id: `action-created-${uid}`,
      title: 'Synthetic self-assigned action',
      sourceType: 'manual',
      assignedStaffId: uid,
      createdByUid: uid,
      status: 'Open',
    });
    await assertFails(setDoc(doc(viewer, 'caseActions/action-created-viewer'), selfAssignedAction('viewer')));
    await assertSucceeds(setDoc(doc(worker, 'caseActions/action-created-worker'), selfAssignedAction('worker')));
    await assertFails(setDoc(doc(viewer, 'rentPayments/viewer-write-denied'), { id: 'viewer-write-denied' }));
    await assertFails(setDoc(doc(viewer, 'expenses/viewer-write-denied'), { id: 'viewer-write-denied' }));
    await assertFails(setDoc(doc(worker, 'expenses/worker-paid-expense-denied'), {
      id: 'worker-paid-expense-denied',
      householdId: 'household-1',
      date: '2026-11-02',
      category: 'Repairs',
      itemDescription: 'Synthetic paid-at-creation denial',
      quantity: '1',
      unitCost: 1000,
      totalCost: 1000,
      paymentStatus: 'Paid',
      datePaid: '2026-11-02',
    }));
    await assertSucceeds(setDoc(doc(worker, 'expenses/worker-unpaid-expense-allowed'), {
      id: 'worker-unpaid-expense-allowed',
      householdId: 'household-1',
      date: '2026-11-02',
      category: 'Repairs',
      itemDescription: 'Synthetic outstanding expense',
      quantity: '1',
      unitCost: 1000,
      totalCost: 1000,
      paymentStatus: 'Payment Outstanding',
      amountDue: 1000,
    }));
    const pettyCashOpening = {
      id: 'PETTY_CASH_OPENING_BALANCE',
      date: '2026-11-02',
      type: 'opening_balance',
      amountMWK: 50000,
      description: 'Synthetic opening float',
      reference: 'OPEN-TEST-001',
      recordedAt: '2026-11-02T08:00:00.000Z',
      createdAt: '2026-11-02T08:00:00.000Z',
      recordedBy: 'manager',
      recordedByUid: 'manager',
    };
    await assertFails(setDoc(doc(manager, 'pettyCashTransactions/receipt-before-opening'), {
      ...pettyCashOpening, id: 'receipt-before-opening', type: 'cash_received',
    }));
    await assertFails(getDoc(doc(worker, 'pettyCashTransactions/PETTY_CASH_OPENING_BALANCE')));
    await assertFails(setDoc(doc(worker, 'pettyCashTransactions/PETTY_CASH_OPENING_BALANCE'), pettyCashOpening));
    await assertFails(setDoc(doc(viewer, 'pettyCashTransactions/PETTY_CASH_OPENING_BALANCE'), pettyCashOpening));
    const pettyCashRestoreBatch = writeBatch(manager);
    pettyCashRestoreBatch.set(doc(manager, 'pettyCashTransactions/PETTY_CASH_OPENING_BALANCE'), pettyCashOpening);
    pettyCashRestoreBatch.set(doc(manager, 'pettyCashTransactions/receipt-manager-001'), {
      ...pettyCashOpening, id: 'receipt-manager-001', type: 'cash_received', amountMWK: 10000,
      reference: 'TRANSFER-TEST-001', recordedAt: '2026-11-02T09:00:00.000Z', createdAt: '2026-11-02T09:00:00.000Z',
    });
    await assertSucceeds(pettyCashRestoreBatch.commit());
    await assertSucceeds(setDoc(doc(admin, 'pettyCashTransactions/expense-admin-001'), {
      ...pettyCashOpening, id: 'expense-admin-001', type: 'expense', amountMWK: 5000,
      reference: 'VOUCHER-TEST-001', recordedAt: '2026-11-02T10:00:00.000Z', createdAt: '2026-11-02T10:00:00.000Z',
    }));
    await assertFails(setDoc(doc(manager, 'pettyCashTransactions/PETTY_CASH_OPENING_BALANCE_DUPLICATE'), {
      ...pettyCashOpening, id: 'PETTY_CASH_OPENING_BALANCE_DUPLICATE',
    }));
    await assertFails(updateDoc(doc(manager, 'pettyCashTransactions/receipt-manager-001'), { amountMWK: 1 }));
    await assertFails(deleteDoc(doc(manager, 'pettyCashTransactions/receipt-manager-001')));
    await assertSucceeds(deleteDoc(doc(admin, 'pettyCashTransactions/receipt-manager-001')));
    await assertFails(updateDoc(doc(admin, 'pettyCashTransactions/expense-admin-001'), { amountMWK: 1 }));
    await assertFails(setDoc(doc(manager, 'pettyCashTransactions/invalid-date-001'), {
      ...pettyCashOpening, id: 'invalid-date-001', type: 'cash_received', date: '2026-13-45',
    }));
    await assertFails(setDoc(doc(manager, 'pettyCashTransactions/decimal-amount-001'), {
      ...pettyCashOpening, id: 'decimal-amount-001', type: 'cash_received', amountMWK: 1.5,
    }));
    await assertFails(setDoc(doc(worker, 'pettyCashTransactions/worker-entry-001'), {
      ...pettyCashOpening, id: 'worker-entry-001', type: 'cash_received',
    }));
    await assertFails(getDoc(doc(viewer, 'pettyCashTransactions/PETTY_CASH_OPENING_BALANCE')));
    await assertSucceeds(getDoc(doc(manager, 'pettyCashTransactions/PETTY_CASH_OPENING_BALANCE')));
    const financeExpense = doc(worker, 'expenses/finance-expense-test');
    await assertSucceeds(updateDoc(financeExpense, { itemDescription: 'Staff may correct expense description' }));
    await assertFails(updateDoc(financeExpense, { paymentStatus: 'Paid' }));
    await assertFails(updateDoc(financeExpense, { amountDue: 0 }));
    await assertFails(updateDoc(financeExpense, { datePaid: '2026-11-02' }));
    await assertFails(updateDoc(financeExpense, {
      auditTrail: [
        { action: 'created', by: 'manager', at: '2026-11-02T00:00:00.000Z', newStatus: 'Payment Outstanding' },
        { action: 'payment-status-changed', by: 'worker', at: '2026-11-02T01:00:00.000Z', previousStatus: 'Payment Outstanding', newStatus: 'Paid' },
      ],
    }));
    await assertSucceeds(updateDoc(doc(manager, 'expenses/finance-expense-test'), {
      paymentStatus: 'Paid',
      amountDue: 0,
      datePaid: '2026-11-02',
      paymentMethod: 'Bank transfer',
      paymentReference: 'SYNTHETIC-TRANSFER-001',
      auditTrail: [
        { action: 'created', by: 'manager', at: '2026-11-02T00:00:00.000Z', newStatus: 'Payment Outstanding' },
        { action: 'payment-status-changed', by: 'manager', at: '2026-11-02T01:00:00.000Z', previousStatus: 'Payment Outstanding', newStatus: 'Paid' },
      ],
    }));
    await assertFails(setDoc(doc(viewer, 'householdActivities/viewer-write-denied'), { id: 'viewer-write-denied' }));
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
    await assertFails(updateDoc(doc(worker, 'attachments/ordinary-file'), {
      filingMetadata: { documentTitle: 'Changed', referenceNumber: 'REF-002', documentOwner: 'Finance', classification: 'Internal' },
    }));
    await assertSucceeds(updateDoc(doc(manager, 'attachments/ordinary-file'), {
      filingMetadata: { documentTitle: 'Changed', referenceNumber: 'REF-002', documentOwner: 'Finance', classification: 'Internal' },
      filingAudit: [{ id: 'audit-1', action: 'Metadata Updated', actor: 'Manager', at: '2026-11-02T00:00:00.000Z', changedFields: ['documentTitle'] }],
      filingMetadataUpdatedAt: '2026-11-02T00:00:00.000Z',
    }));

    // Staff cannot create a version or mark the previous file as superseded.
    const staffVersionBatch = writeBatch(worker);
    staffVersionBatch.update(doc(worker, 'attachments/ordinary-file'), {
      versionNumber: 1, supersededBy: 'ordinary-file-v2', updatedAt: '2026-11-02T01:00:00.000Z',
    });
    staffVersionBatch.set(doc(worker, 'attachments/ordinary-file-v2'), {
      id: 'ordinary-file-v2', targetType: 'household', targetId: 'household-1', category: 'Receipt',
      fileName: 'receipt-v2.pdf', storagePath: 'attachments/household/household-1/receipt-v2.pdf',
      versionOf: 'ordinary-file', versionNumber: 2, versionNote: 'Corrected receipt',
      uploadedBy: { uid: 'worker' },
    });
    await assertFails(staffVersionBatch.commit());

    // A manager must create the immutable version and supersede the previous one atomically.
    const managerVersionBatch = writeBatch(manager);
    managerVersionBatch.update(doc(manager, 'attachments/ordinary-file'), {
      versionNumber: 1, supersededBy: 'ordinary-file-v2', updatedAt: '2026-11-02T01:00:00.000Z',
    });
    managerVersionBatch.set(doc(manager, 'attachments/ordinary-file-v2'), {
      id: 'ordinary-file-v2', targetType: 'household', targetId: 'household-1', category: 'Receipt',
      fileName: 'receipt-v2.pdf', storagePath: 'attachments/household/household-1/receipt-v2.pdf',
      versionOf: 'ordinary-file', versionNumber: 2, versionNote: 'Corrected receipt',
      uploadedBy: { uid: 'manager' },
    });
    await assertSucceeds(managerVersionBatch.commit());
    await assertSucceeds(getDoc(doc(manager, 'attachments/ordinary-file-v2')));
    await assertSucceeds(updateDoc(doc(manager, 'attachments/ordinary-file-v2'), {
      filingMetadata: { documentTitle: 'Updated current version', referenceNumber: 'REF-002', documentOwner: 'Finance', classification: 'Internal' },
      filingAudit: [{ id: 'audit-v2', action: 'Metadata Updated', actor: 'Manager', at: '2026-11-02T02:00:00.000Z', changedFields: ['documentTitle'] }],
      filingMetadataUpdatedAt: '2026-11-02T02:00:00.000Z',
    }));
    await assertFails(updateDoc(doc(manager, 'attachments/ordinary-file-v2'), { fileName: 'tampered.pdf' }));
    await assertFails(updateDoc(doc(manager, 'attachments/ordinary-file'), {
      filingMetadata: { documentTitle: 'Tampered old version', referenceNumber: 'REF-001', documentOwner: 'Finance', classification: 'Internal' },
    }));
    await assertFails(deleteDoc(doc(manager, 'attachments/ordinary-file-v2')));
    await assertFails(deleteDoc(doc(admin, 'attachments/ordinary-file')));
    await assertFails(setDoc(doc(manager, 'attachments/ordinary-file-v3'), {
      id: 'ordinary-file-v3', targetType: 'household', targetId: 'household-1', category: 'Receipt',
      fileName: 'receipt-v3.pdf', storagePath: 'attachments/household/household-1/receipt-v3.pdf',
      versionOf: 'ordinary-file-v2', versionNumber: 3, uploadedBy: { uid: 'manager' },
    }));
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
    await assertFails(deleteDoc(doc(manager, 'payrollRecords/payroll-manager')));
    await assertSucceeds(deleteDoc(doc(admin, 'payrollRecords/payroll-manager')));
    await assertSucceeds(getDoc(doc(worker, 'payrollRecords/payroll-worker')));
    await assertSucceeds(getDoc(doc(worker, 'payrollRecords/payroll-linked')));
    await assertFails(getDoc(doc(viewer, 'payrollRecords/payroll-linked')));
    await assertFails(getDoc(doc(worker, 'payrollRecords/payroll-unlinked')));
    await assertSucceeds(getDocs(query(collection(worker, 'payrollRecords'), where('staffUid', '==', 'worker'))));
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
    const procurementReportGeneratedAt = new Date();
    const procurementReportMetadata = {
      id: 'management-procurement-report-manager',
      reportType: 'management-procurement',
      generatedByUid: 'manager',
      generatedAt: procurementReportGeneratedAt,
      expiresAt: new Date(procurementReportGeneratedAt.getTime() + 90 * 24 * 60 * 60 * 1000),
      dateBasis: 'createdAt',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      programmeId: 'fish-farming',
      format: 'csv',
      selectedListCount: 2,
      aggregateRowCount: 30,
    };
    await assertSucceeds(setDoc(doc(manager, 'managementProcurementReportHistory/management-procurement-report-manager'), procurementReportMetadata));
    await assertSucceeds(getDoc(doc(manager, 'managementProcurementReportHistory/management-procurement-report-manager')));
    await assertSucceeds(getDoc(doc(admin, 'managementProcurementReportHistory/management-procurement-report-manager')));
    await assertFails(getDoc(doc(worker, 'managementProcurementReportHistory/management-procurement-report-manager')));
    await assertFails(getDoc(doc(viewer, 'managementProcurementReportHistory/management-procurement-report-manager')));
    await assertFails(setDoc(doc(worker, 'managementProcurementReportHistory/worker-attempt'), { ...procurementReportMetadata, id: 'worker-attempt', generatedByUid: 'worker' }));
    await assertFails(setDoc(doc(viewer, 'managementProcurementReportHistory/viewer-attempt'), { ...procurementReportMetadata, id: 'viewer-attempt', generatedByUid: 'viewer' }));
    await assertFails(setDoc(doc(manager, 'managementProcurementReportHistory/raw-payload-attempt'), { ...procurementReportMetadata, id: 'raw-payload-attempt', rawProcurementRows: [{ supplier: 'synthetic' }] }));
    await assertFails(setDoc(doc(manager, 'managementProcurementReportHistory/long-retention-attempt'), {
      ...procurementReportMetadata,
      id: 'long-retention-attempt',
      expiresAt: new Date(procurementReportGeneratedAt.getTime() + 365 * 24 * 60 * 60 * 1000),
    }));
    await assertFails(setDoc(doc(manager, 'managementProcurementReportHistory/invalid-date-attempt'), {
      ...procurementReportMetadata,
      id: 'invalid-date-attempt',
      startDate: 'unbounded and not a date',
    }));
    await assertFails(setDoc(doc(manager, 'managementProcurementReportHistory/unknown-programme-attempt'), {
      ...procurementReportMetadata,
      id: 'unknown-programme-attempt',
      programmeId: 'unregistered-programme',
    }));
    await assertFails(getDoc(doc(manager, 'managementProcurementReportHistory/expired-report-metadata')));
    await assertFails(updateDoc(doc(manager, 'managementProcurementReportHistory/management-procurement-report-manager'), { selectedListCount: 99 }));
    await assertFails(deleteDoc(doc(manager, 'managementProcurementReportHistory/management-procurement-report-manager')));
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

    const trip = { id: 'trip-1', type: 'transport_trip', title: 'Test trip', scheduledDate: '2026-11-10', assignedStaffId: 'worker', assignedStaffName: 'worker', status: 'Scheduled', tripApprovalStatus: 'Pending', tripRequestedByUid: 'worker', tripRequestedByName: 'worker', transportDetails: { vehicleAssetId: 'vehicle-1', vehicleLabel: 'VEH-001', driverName: 'worker', origin: 'Office', destination: 'Zomba', purpose: 'Field visit', startOdometerKm: 100 } };
    await assertSucceeds(setDoc(doc(worker, 'schedules/trip-1'), trip));
    await assertFails(setDoc(doc(worker, 'schedules/trip-start-on-create'), { ...trip, id: 'trip-start-on-create', status: 'In Progress' }));
    await assertFails(updateDoc(doc(worker, 'schedules/trip-1'), { status: 'In Progress' }));
    await assertFails(updateDoc(doc(worker, 'schedules/trip-1'), { status: 'Completed' }));
    await assertFails(updateDoc(doc(manager, 'schedules/trip-1'), { status: 'In Progress' }));
    await assertFails(updateDoc(doc(worker, 'schedules/trip-1'), { tripApprovalStatus: 'Approved', tripApprovedByUid: 'worker', tripApprovedAt: '2026-11-02T00:00:00.000Z' }));
    await assertSucceeds(updateDoc(doc(manager, 'schedules/trip-1'), { tripApprovalStatus: 'Approved', tripApprovedByUid: 'manager', tripApprovedByName: 'manager', tripApprovedAt: '2026-11-02T00:00:00.000Z', tripApprovalNote: '', status: 'Scheduled', updatedAt: '2026-11-02T00:00:00.000Z', updatedBy: 'manager' }));
    await assertSucceeds(updateDoc(doc(worker, 'schedules/trip-1'), { status: 'In Progress', updatedAt: '2026-11-02T01:00:00.000Z', updatedBy: 'worker' }));
    await assertFails(updateDoc(doc(worker, 'schedules/trip-1'), { status: 'Completed', completedAt: '2026-11-10T12:00:00.000Z', transportDetails: { ...trip.transportDetails, destination: 'Blantyre', endOdometerKm: 125 }, updatedAt: '2026-11-10T12:00:00.000Z', updatedBy: 'worker' }));
    await assertFails(updateDoc(doc(worker, 'schedules/trip-1'), { status: 'Completed', completedAt: '2026-11-10T12:00:00.000Z', updatedAt: '2026-11-10T12:00:00.000Z', updatedBy: 'worker' }));
    await assertSucceeds(updateDoc(doc(worker, 'schedules/trip-1'), { status: 'Completed', completedAt: '2026-11-10T12:00:00.000Z', transportDetails: { ...trip.transportDetails, endOdometerKm: 125 }, updatedAt: '2026-11-10T12:00:00.000Z', updatedBy: 'worker' }));

    const adminTrip = { ...trip, id: 'trip-admin-approval' };
    await assertSucceeds(setDoc(doc(worker, 'schedules/trip-admin-approval'), adminTrip));
    await assertSucceeds(updateDoc(doc(admin, 'schedules/trip-admin-approval'), { tripApprovalStatus: 'Approved', tripApprovedByUid: 'admin', tripApprovedByName: 'admin', tripApprovedAt: '2026-11-02T03:00:00.000Z', tripApprovalNote: '', status: 'Scheduled', updatedAt: '2026-11-02T03:00:00.000Z', updatedBy: 'admin' }));

    console.log('Firestore rules tests passed.');
  } finally {
    await testEnvironment.cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
