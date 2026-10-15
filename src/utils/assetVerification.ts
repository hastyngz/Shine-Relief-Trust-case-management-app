import type { AssetCondition, AssetHistoryEntry, AssetRecord } from '../types';

export type AssetVerificationOutcome = NonNullable<AssetRecord['verificationOutcome']>;

export interface AssetVerificationInput {
  date: string;
  verifiedBy: string;
  outcome: AssetVerificationOutcome;
  observedLocation?: string;
  observedCondition?: AssetCondition;
  note?: string;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Records a physical check without silently changing the registered asset
 * location, condition or status. A discrepancy remains visible for follow-up.
 */
export function recordAssetVerification(
  asset: AssetRecord,
  input: AssetVerificationInput,
  recordedAt = new Date().toISOString(),
): AssetRecord {
  const verifiedBy = input.verifiedBy.trim();
  const note = input.note?.trim() || '';
  const observedLocation = input.observedLocation?.trim() || '';

  if (!isValidDate(input.date)) throw new Error('Enter a valid verification date.');
  if (!verifiedBy) throw new Error('The person conducting the verification is required.');
  if (input.outcome !== 'Verified' && !note) {
    throw new Error('Add a note explaining the discrepancy or why the asset was not located.');
  }
  if (input.outcome === 'Verified' && (
    (observedLocation && observedLocation !== asset.location) ||
    (input.observedCondition && input.observedCondition !== asset.condition)
  )) {
    throw new Error('The observed location or condition differs from the register. Record this as a discrepancy and add a note.');
  }

  const id = `AV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const summary = [
    `Outcome: ${input.outcome}`,
    `Register location: ${asset.location}`,
    observedLocation ? `Observed location: ${observedLocation}` : '',
    input.observedCondition ? `Observed condition: ${input.observedCondition}` : '',
    note ? `Note: ${note}` : '',
  ].filter(Boolean).join(' · ');
  const historyEntry: AssetHistoryEntry = {
    id,
    date: input.date,
    action: 'Physical Verification',
    note: summary,
    previousValue: asset.status,
    newValue: input.outcome,
    recordedBy: verifiedBy,
    recordedAt,
  };

  return {
    ...asset,
    verificationDate: input.date,
    verifiedBy,
    verificationOutcome: input.outcome,
    verificationNote: note || undefined,
    observedLocation: observedLocation || undefined,
    observedCondition: input.observedCondition,
    history: [...(asset.history || []), historyEntry],
    updatedAt: recordedAt,
    updatedBy: verifiedBy,
  };
}
