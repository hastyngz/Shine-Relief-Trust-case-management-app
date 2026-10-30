import assert from 'node:assert/strict';
import type { AssetRecord } from '../src/types';
import { recordAssetVerification } from '../src/utils/assetVerification';

const asset: AssetRecord = {
  id: 'asset-1',
  assetTag: 'SHINE-AST-001',
  name: 'Office laptop',
  category: 'IT & Electronics',
  location: 'Main Office',
  condition: 'Good',
  status: 'In Use',
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'Admin',
  updatedBy: 'Admin',
};

const verified = recordAssetVerification(asset, {
  date: '2026-10-15',
  verifiedBy: 'Administration Officer',
  outcome: 'Verified',
  observedLocation: 'Main Office',
  observedCondition: 'Good',
}, '2026-10-15T10:00:00.000Z');
assert.equal(verified.verificationDate, '2026-10-15');
assert.equal(verified.verificationOutcome, 'Verified');
assert.equal(verified.verifiedBy, 'Administration Officer');
assert.equal(verified.history.length, 1);
assert.equal(verified.history[0].action, 'Physical Verification');
assert.equal(verified.location, 'Main Office');
assert.equal(verified.condition, 'Good');
assert.equal(verified.status, 'In Use');

const discrepancy = recordAssetVerification(asset, {
  date: '2026-10-15',
  verifiedBy: 'Administration Officer',
  outcome: 'Discrepancy',
  observedLocation: 'Shine House',
  observedCondition: 'Fair',
  note: 'Laptop was moved without an updated register entry.',
}, '2026-10-15T10:00:00.000Z');
assert.equal(discrepancy.observedLocation, 'Shine House');
assert.equal(discrepancy.observedCondition, 'Fair');
assert.equal(discrepancy.location, 'Main Office', 'verification must not silently overwrite registered location');
assert.equal(discrepancy.condition, 'Good', 'verification must not silently overwrite registered condition');
assert.match(discrepancy.history[0].note, /Observed location: Shine House/);

const notLocated = recordAssetVerification(asset, {
  date: '2026-10-15',
  verifiedBy: 'Administration Officer',
  outcome: 'Not Located',
  note: 'Asset could not be found at the recorded location.',
}, '2026-10-15T10:00:00.000Z');
assert.equal(notLocated.status, 'In Use', 'a verification outcome must not silently change asset status');
assert.equal(notLocated.verificationOutcome, 'Not Located');

assert.throws(() => recordAssetVerification(asset, {
  date: '2026-02-30', verifiedBy: 'Officer', outcome: 'Verified',
}), /valid verification date/);
assert.throws(() => recordAssetVerification(asset, {
  date: '2026-10-15', verifiedBy: ' ', outcome: 'Verified',
}), /person conducting/);
assert.throws(() => recordAssetVerification(asset, {
  date: '2026-10-15', verifiedBy: 'Officer', outcome: 'Not Located',
}), /explaining the discrepancy/);
assert.throws(() => recordAssetVerification(asset, {
  date: '2026-10-15', verifiedBy: 'Officer', outcome: 'Verified', observedLocation: 'Shine House',
}), /Record this as a discrepancy/);
assert.throws(() => recordAssetVerification(asset, {
  date: '2026-10-15', verifiedBy: 'Officer', outcome: 'Verified', observedCondition: 'Fair',
}), /Record this as a discrepancy/);

console.log('Asset physical verification tests passed.');
