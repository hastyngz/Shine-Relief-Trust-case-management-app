import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hub = await readFile(new URL('../src/components/AdministrationHub.tsx', import.meta.url), 'utf8');
const documentModuleLines = hub.split('\n').filter((line) => line.includes("title: 'Documents & Filing"));
assert.equal(documentModuleLines.length, 1, 'the hub should not show duplicate document modules');
assert.match(documentModuleLines[0], /title: 'Documents & Filing \(Phase 1\)'/);
assert.match(documentModuleLines[0], /status: 'Available now'/);
assert.match(documentModuleLines[0], /view: 'documents'/);
assert.match(documentModuleLines[0], /version history are not yet available/);
assert.doesNotMatch(hub, /title: 'Document Index \(Phase 1\)'/, 'use one consistent label for the existing filing workflow');

console.log('Administration hub module-link checks passed.');
