import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hub = await readFile(new URL('../src/components/AdministrationHub.tsx', import.meta.url), 'utf8');
const documentModuleLines = hub.split('\n').filter((line) => line.includes("title: 'Documents & Filing"));
assert.equal(documentModuleLines.length, 1, 'the hub should not show duplicate document modules');
assert.match(documentModuleLines[0], /title: 'Documents & Filing \(Phase 1\)'/);
assert.match(documentModuleLines[0], /status: 'Available now'/);
assert.match(documentModuleLines[0], /view: 'documents'/);
assert.match(documentModuleLines[0], /version history are not yet available/);
const procurementLine = hub.split('\n').find((line) => line.includes("title: 'Procurement Lists & Quotations'")) || '';
assert.match(procurementLine, /manager approval/);
assert.match(procurementLine, /receipts/);
assert.doesNotMatch(procurementLine, /formal approvals and stock receipt integration remain planned/);
assert.doesNotMatch(hub, /title: 'Document Index \(Phase 1\)'/, 'use one consistent label for the existing filing workflow');


for (const [title, view] of [
  ['Transport & Logistics', 'transport'],
  ['Administrative Performance', 'admin-performance'],
  ['Finance Administration', 'finance-admin'],
]) {
  const line = hub.split('\n').find((entry) => entry.includes(`title: '${title}'`)) || '';
  assert.match(line, /status: 'Available now'/, `${title} should be linked as an available module`);
  assert.match(line, new RegExp(`view: '${view}'`), `${title} should navigate to its dedicated view`);
}
const viewSwitch = await readFile(new URL('../src/views/AppViewSwitch.tsx', import.meta.url), 'utf8');
assert.match(viewSwitch, /TransportLogisticsView/);
assert.ok(viewSwitch.includes('mode="performance"'));
assert.ok(viewSwitch.includes('mode="finance"'));
const routes = await readFile(new URL('../src/routing/appRoutes.ts', import.meta.url), 'utf8');
for (const route of ['transport', 'admin-performance', 'finance-admin']) {
  assert.ok(routes.includes("'" + route + "'"), `missing route ${route}`);
}
console.log('Administration hub module-link checks passed.');
