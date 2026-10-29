import assert from 'node:assert/strict';
import { isComplianceDueSoon, isComplianceOverdue, matchesComplianceStatus } from '../src/utils/compliance';

const item = (scheduledDate: string, status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled' = 'Scheduled') => ({ scheduledDate, status });

assert.equal(isComplianceOverdue(item('2026-10-14'), '2026-10-15'), true);
assert.equal(isComplianceOverdue(item('2026-10-15'), '2026-10-15'), false);
assert.equal(isComplianceOverdue(item('2026-10-14', 'Completed'), '2026-10-15'), false);
assert.equal(isComplianceOverdue(item('2026-10-14', 'Cancelled'), '2026-10-15'), false);
assert.equal(isComplianceOverdue(item('2026-10-14', 'In Progress'), '2026-10-15'), true);
assert.equal(isComplianceOverdue(item('2026-99-45'), '2026-10-15'), false);
assert.equal(isComplianceOverdue(item('2026-10-14'), 'not-a-date'), false);

assert.equal(isComplianceDueSoon(item('2026-10-15'), '2026-10-15'), true);
assert.equal(isComplianceDueSoon(item('2026-11-14'), '2026-10-15'), true);
assert.equal(isComplianceDueSoon(item('2026-11-15'), '2026-10-15'), false);
assert.equal(isComplianceDueSoon(item('2026-10-14'), '2026-10-15'), false);
assert.equal(isComplianceDueSoon(item('2026-10-20', 'Completed'), '2026-10-15'), false);
assert.equal(isComplianceDueSoon(item('2026-10-20', 'Cancelled'), '2026-10-15'), false);
assert.equal(isComplianceDueSoon(item('2026-02-30'), '2026-02-01'), false);

console.log('Compliance deadline tests passed: overdue, due-soon boundaries, completed/cancelled exclusions and invalid dates.');

const openItem = item('2026-10-20', 'Scheduled');
assert.equal(matchesComplianceStatus(openItem, 'All', '2026-10-15'), true);
assert.equal(matchesComplianceStatus(openItem, 'Open', '2026-10-15'), true);
assert.equal(matchesComplianceStatus(openItem, 'Due soon', '2026-10-15'), true);
assert.equal(matchesComplianceStatus(openItem, 'Overdue', '2026-10-15'), false);
assert.equal(matchesComplianceStatus(item('2026-10-14'), 'Overdue', '2026-10-15'), true);
assert.equal(matchesComplianceStatus(item('2026-10-20', 'Completed'), 'Open', '2026-10-15'), false);
assert.equal(matchesComplianceStatus(item('2026-10-20', 'Cancelled'), 'Open', '2026-10-15'), false);
assert.equal(matchesComplianceStatus(item('2026-10-20', 'Cancelled'), 'Cancelled', '2026-10-15'), true);
assert.equal(matchesComplianceStatus(item('2026-10-20', 'Completed'), 'Completed', '2026-10-15'), true);
