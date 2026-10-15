import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Task 7 regression guard: hash routing was extracted out of App.tsx into
// src/routing/appRoutes.ts. These checks pin the parse/build behaviour so the
// split stays behaviour-preserving.
// ---------------------------------------------------------------------------

function withHash<T>(hash: string, run: () => T): T {
  const original = (globalThis as any).window;
  (globalThis as any).window = { location: { hash } };
  try {
    return run();
  } finally {
    if (original === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = original;
  }
}

const { parseHash, buildHash, qualityTargetHash } = await import('../src/routing/appRoutes');

// 1. Known routes parse to the same view/tab as before the split.
const cases: Array<[string, string, string]> = [
  ['', 'dashboard', 'dashboard'],
  ['#/', 'dashboard', 'dashboard'],
  ['#/girls', 'girls', 'girls'],
  ['#/houses', 'houses', 'houses'],
  ['#/activities', 'activities', 'activities'],
  ['#/contacts', 'contacts', 'contacts'],
  ['#/case-management', 'case-management', 'case-management'],
  ['#/messages', 'messages', 'messages'],
  ['#/inbox', 'messages', 'messages'],
  ['#/planning', 'planning', 'planning'],
  ['#/budgets', 'planning', 'planning'],
  ['#/management', 'management', 'management'],
  ['#/import', 'import', 'import'],
  ['#/reports', 'reports', 'reports'],
  ['#/report-builder', 'report-builder', 'reports'],
  ['#/payroll', 'payroll', 'payroll'],
  ['#/contracts', 'contracts', 'payroll'],
  ['#/staff', 'staff', 'staff'],
  ['#/ai-assistant', 'ai-assistant', 'ai-assistant'],
  ['#/ai', 'ai-assistant', 'ai-assistant'],
  ['#/register-girl', 'form-girl', 'girls'],
  ['#/add-house', 'form-house', 'houses'],
  ['#/operations', 'operations', 'operations'],
  ['#/administration', 'administration', 'administration'],
  ['#/admin-operations', 'administration', 'administration'],
];

for (const [hash, view, tab] of cases) {
  const route = withHash(hash, parseHash);
  assert.equal(route.view, view, `${hash} should parse to view ${view}`);
  assert.equal(route.activeTab, tab, `${hash} should parse to tab ${tab}`);
}

// 2. Profile routes carry the record id.
assert.equal(withHash('#/girl/abc123', parseHash).girlId, 'abc123');
assert.equal(withHash('#/house/h-9', parseHash).houseId, 'h-9');
assert.equal(withHash('#/staff?employeeId=staff%2F123', parseHash).view, 'staff');

// 3. The planning quality target is preserved.
const quality = withHash('#/planning?qualityKind=budget-item&qualityId=b%2F7', parseHash).qualityTarget;
assert.deepEqual(quality, { kind: 'budget-item', id: 'b/7' });

// 4. buildHash mirrors parseHash for the round-trip routes.
assert.equal(buildHash('dashboard'), '#/');
assert.equal(buildHash('girls'), '#/girls');
assert.equal(buildHash('girl-profile', 'g1'), '#/girl/g1');
assert.equal(buildHash('girl-profile', null), '#/girls');
assert.equal(buildHash('house-profile', undefined, 'h1'), '#/house/h1');
assert.equal(buildHash('programmes', undefined, undefined, 'education' as any), '#/programmes/education');
assert.equal(buildHash('form-girl'), '#/register-girl');
assert.equal(buildHash('ai-assistant'), '#/ai-assistant');
assert.equal(buildHash('contracts'), '#/contracts');
assert.equal(buildHash('administration'), '#/administration');
assert.equal(buildHash('inventory'), '#/inventory');

for (const [hash, view] of cases) {
  const route = withHash(hash, parseHash);
  const built = buildHash(route.view, route.girlId, route.houseId, route.programmeId);
  if (built) {
    assert.equal(withHash(built, parseHash).view, view, `round trip ${hash} -> ${built}`);
  }
}

// 5. qualityTargetHash encodes the id.
assert.equal(qualityTargetHash('workplan-item', 'a b/c'), '#/planning?qualityKind=workplan-item&qualityId=a%20b%2Fc');

console.log('Routing tests passed: parseHash/buildHash round trips, profile routes, and staff contract deep links.');
