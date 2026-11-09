import 'dotenv/config';
import type { Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  fingerprintPettyCashEntries,
  migratePettyCashLedgerState,
  parsePettyCashLedgerMigrationOptions,
  type PettyCashLedgerMigrationStore,
} from './pettyCashLedgerStateMigration';

function createMigrationStore(adminFirestore: Firestore): PettyCashLedgerMigrationStore {
  const entriesRef = adminFirestore.collection('pettyCashTransactions');
  const stateRef = adminFirestore.collection('pettyCashLedgerState').doc('current');
  return {
    async listEntries() {
      const snapshot = await entriesRef.get();
      return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
    },
    async readState() {
      const snapshot = await stateRef.get();
      return snapshot.exists ? snapshot.data() || null : null;
    },
    initializeStateIfUnchanged(state, expectedFingerprint) {
      return adminFirestore.runTransaction(async (transaction) => {
        const [currentState, currentEntries] = await Promise.all([
          transaction.get(stateRef),
          transaction.get(entriesRef),
        ]);
        if (currentState.exists) {
          const current = currentState.data();
          const matches = current?.balanceMWK === state.balanceMWK &&
            current?.latestDate === state.latestDate &&
            current?.lastTransactionId === state.lastTransactionId &&
            current?.updatedAt === state.updatedAt &&
            Object.keys(current || {}).length === 4;
          return matches ? 'already-current' : 'changed';
        }
        const fingerprint = fingerprintPettyCashEntries(
          currentEntries.docs.map((document) => ({ id: document.id, data: document.data() })),
        );
        if (fingerprint !== expectedFingerprint) return 'changed';
        transaction.create(stateRef, state);
        return 'created';
      });
    },
  };
}

async function main() {
  const options = parsePettyCashLedgerMigrationOptions(process.argv.slice(2), firebaseConfig.projectId);
  console.log(`Petty-cash checkpoint ${options.apply ? 'APPLY' : 'DRY RUN'} for explicitly selected project ${options.projectId}.`);
  const { adminFirestore } = await import('../src/server/firebaseAdmin');
  const summary = await migratePettyCashLedgerState(createMigrationStore(adminFirestore), options);
  console.log(`Entries examined: ${summary.entriesExamined}`);
  console.log(`Malformed entries: ${summary.malformed}`);
  console.log(`Conflicts: ${summary.conflicts}`);
  console.log(`Checkpoint status: ${summary.stateStatus}`);
  console.log(`Checkpoint created: ${summary.applied ? 'yes' : 'no'}`);
  if (summary.conflicts > 0 || summary.malformed > 0 || summary.stateStatus === 'inconsistent') {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error('Petty-cash checkpoint migration stopped safely. Check project confirmation and Firebase Admin authentication; ledger entries and balances were not logged.');
  process.exitCode = 1;
});
