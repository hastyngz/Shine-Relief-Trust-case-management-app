import 'dotenv/config';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  formatMigrationSummary,
  migrateImportAuditSourceData,
  parseMigrationOptions,
  type ImportAuditMigrationStore,
} from './importAuditSourceMigration';
import firebaseConfig from '../firebase-applet-config.json';

function createMigrationStore(adminFirestore: Firestore): ImportAuditMigrationStore {
  return {
    async listImportAuditIds() {
      const snapshot = await adminFirestore.collection('importAudits').select('id').get();
      return snapshot.docs.map((document) => document.id);
    },
    async markMigrationComplete() {
      const statusRef = adminFirestore.collection('importAuditMigrationStatus').doc('sourceDataBoundary');
      await adminFirestore.runTransaction(async (transaction) => {
        const status = await transaction.get(statusRef);
        if (status.exists && status.data()?.status === 'complete') return;
        transaction.set(statusRef, {
          status: 'complete',
          verifiedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
    },
    runAuditTransaction(auditId, action) {
      const auditRef = adminFirestore.collection('importAudits').doc(auditId);
      const sourceRef = adminFirestore.collection('restrictedImportSources').doc(auditId);
      return adminFirestore.runTransaction(async (transaction) => action({
        async getAudit() {
          const snapshot = await transaction.get(auditRef);
          return { exists: snapshot.exists, data: snapshot.data() };
        },
        async getRestrictedSource() {
          const snapshot = await transaction.get(sourceRef);
          return { exists: snapshot.exists, data: snapshot.data() };
        },
        createRestrictedSource(data) {
          transaction.create(sourceRef, data);
        },
        removeEmbeddedSourceData() {
          transaction.update(auditRef, {
            sourceData: FieldValue.delete(),
            sourceDataStoredInRestrictedCollection: true,
          });
        },
      }));
    },
  };
}

async function main() {
  const options = parseMigrationOptions(process.argv.slice(2), firebaseConfig.projectId);
  console.log(`Import source-data repair ${options.apply ? 'APPLY' : 'DRY RUN'} for explicitly selected Firebase project ${options.projectId}.`);
  const { adminFirestore } = await import('../src/server/firebaseAdmin');
  const summary = await migrateImportAuditSourceData(createMigrationStore(adminFirestore), options);
  formatMigrationSummary(summary, options.apply).forEach((line) => console.log(line));
  if (summary.conflicts > 0 || summary.malformed > 0 || summary.failures > 0 || summary.applyBlocked || (options.apply && summary.requiringRepair > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Import source-data repair stopped safely. Supply --project matching the configured Firebase project, and require --confirm-project with --apply. Check Firebase Admin authentication; no source records or document IDs were logged.');
  process.exitCode = 1;
});
