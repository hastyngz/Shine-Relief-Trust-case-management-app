import 'dotenv/config';
import { isDeepStrictEqual } from 'node:util';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '../src/server/firebaseAdmin';

const APPLY = process.argv.includes('--apply');

async function main() {
  const audits = await adminFirestore.collection('importAudits').get();
  let eligible = 0;
  let alreadyPresent = 0;
  let conflicts = 0;

  for (const audit of audits.docs) {
    const data = audit.data();
    if (!Object.prototype.hasOwnProperty.call(data, 'sourceData')) continue;
    const sourceData = data.sourceData;
    if (!sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) {
      conflicts += 1;
      console.error(`Skipped malformed sourceData on import audit ${audit.id}; no source contents logged.`);
      continue;
    }

    const sourceRef = adminFirestore.collection('restrictedImportSources').doc(audit.id);
    const sourceRecord = {
      id: audit.id,
      auditId: audit.id,
      fileName: typeof data.fileName === 'string' ? data.fileName : '',
      importedAt: typeof data.importedAt === 'string' ? data.importedAt : '',
      sourceData,
    };

    try {
      await adminFirestore.runTransaction(async (transaction) => {
        const existing = await transaction.get(sourceRef);
        if (existing.exists) {
          const current = existing.data() || {};
          if (
            current.auditId !== sourceRecord.auditId ||
            current.fileName !== sourceRecord.fileName ||
            current.importedAt !== sourceRecord.importedAt ||
            !isDeepStrictEqual(current.sourceData, sourceRecord.sourceData)
          ) {
            throw new Error('A restricted source record already exists with different metadata or source data.');
          }
          alreadyPresent += 1;
        } else if (APPLY) {
          transaction.set(sourceRef, sourceRecord);
        }
        if (APPLY) transaction.update(audit.ref, { sourceData: FieldValue.delete() });
      });
      eligible += 1;
    } catch (error) {
      conflicts += 1;
      console.error(`Could not safely repair import audit ${audit.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  console.log(`Import source-data repair ${APPLY ? 'APPLY' : 'DRY RUN'} complete.`);
  console.log(`Audits with embedded sourceData eligible for repair: ${eligible}`);
  console.log(`Restricted source records already matching: ${alreadyPresent}`);
  console.log(`Conflicts or malformed records: ${conflicts}`);
  if (!APPLY && eligible > 0) {
    console.log('No changes were made. Review the counts, then rerun with --apply using an authorised Firebase Admin environment.');
  }
  if (conflicts > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Import source-data repair failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
