import { readFile } from 'node:fs/promises';
import { auditInventorySnapshot } from '../src/utils/inventoryIntegrityAudit';

const inputPath = process.argv[2];
if (!inputPath || inputPath === '--help') {
  console.log('Usage: npm run audit:inventory-snapshot -- <app-database-export.json>');
  console.log('Read-only. Prints aggregate counts only; never repairs or writes records.');
  if (!inputPath) process.exitCode = 2;
} else {
  try {
    const raw = await readFile(inputPath, 'utf8');
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(raw) as unknown;
    } catch {
      throw new Error('Input file is not valid JSON.');
    }

    const summary = auditInventorySnapshot(snapshot);
    console.log('Read-only inventory snapshot audit; no records or identifiers are emitted.');
    console.log('Balance-to-movement reconciliation is not assessed because the schema has no immutable opening balance and signed movement delta.');
    console.log(JSON.stringify(summary, null, 2));
    if (summary.hasFindings) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not audit the supplied inventory snapshot.');
    process.exitCode = 2;
  }
}
