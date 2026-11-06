import type { AssetCondition, AssetRecord, AssetStatus } from '../types';

export type AssetFollowUpFilter = 'All' | 'Service overdue' | 'Service due soon' | 'Warranty expired' | 'Warranty expiring soon';
export type AssetVerificationFilter = 'All' | 'Not verified this year' | 'Verified this year' | 'Latest outcome: discrepancy' | 'Latest outcome: not located';

export interface AssetRegisterFilters {
  search: string;
  status: 'All' | AssetStatus;
  condition: 'All' | AssetCondition;
  category: 'All' | string;
  location: 'All' | string;
  followUp: AssetFollowUpFilter;
  verification: AssetVerificationFilter;
  today: string;
}


function isValidCalendarDate(value: string | undefined): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

const dateDaysFrom = (date: string | undefined, today: string): number | null => {
  if (!isValidCalendarDate(date) || !isValidCalendarDate(today)) return null;
  const timestamp = Date.parse(date + 'T00:00:00Z');
  const todayTimestamp = Date.parse(today + 'T00:00:00Z');
  return Math.round((timestamp - todayTimestamp) / 86400000);
};

/** True only when a valid calendar date records a physical check in the supplied year. */
export function isAssetVerifiedInYear(asset: Pick<AssetRecord, 'verificationDate'>, year: string): boolean {
  const date = asset.verificationDate;
  if (!/^\d{4}$/.test(year) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date && date.startsWith(year);
}

/** Filter the asset register without mutating the source records. */
export function filterAssetRegister(assets: AssetRecord[], filters: AssetRegisterFilters): AssetRecord[] {
  const term = filters.search.trim().toLocaleLowerCase('en-US');
  return assets.filter((asset) => {
    const matchesText = !term || [
      asset.assetTag, asset.name, asset.category, asset.serialNumber, asset.location, asset.assignedTo, asset.fundingSource,
    ].some((value) => String(value || '').toLocaleLowerCase('en-US').includes(term));
    const serviceDays = dateDaysFrom(asset.nextServiceDate, filters.today);
    const warrantyDays = dateDaysFrom(asset.warrantyExpiryDate, filters.today);
    const verificationYear = isValidCalendarDate(filters.today) ? filters.today.slice(0, 4) : '';
    const verifiedThisYear = isAssetVerifiedInYear(asset, verificationYear);
    let matchesVerification = true;
    if (filters.verification === 'Not verified this year') matchesVerification = asset.status !== 'Disposed' && !verifiedThisYear;
    if (filters.verification === 'Verified this year') matchesVerification = asset.status !== 'Disposed' && verifiedThisYear;
    if (filters.verification === 'Latest outcome: discrepancy') matchesVerification = asset.status !== 'Disposed' && asset.verificationOutcome === 'Discrepancy';
    if (filters.verification === 'Latest outcome: not located') matchesVerification = asset.status !== 'Disposed' && asset.verificationOutcome === 'Not Located';
    let matchesFollowUp = true;
    if (filters.followUp === 'Service overdue') matchesFollowUp = asset.status !== 'Disposed' && serviceDays !== null && serviceDays < 0;
    if (filters.followUp === 'Service due soon') matchesFollowUp = asset.status !== 'Disposed' && serviceDays !== null && serviceDays >= 0 && serviceDays <= 30;
    if (filters.followUp === 'Warranty expired') matchesFollowUp = asset.status !== 'Disposed' && warrantyDays !== null && warrantyDays < 0;
    if (filters.followUp === 'Warranty expiring soon') matchesFollowUp = asset.status !== 'Disposed' && warrantyDays !== null && warrantyDays >= 0 && warrantyDays <= 30;
    return matchesText && matchesFollowUp && matchesVerification
      && (filters.status === 'All' || asset.status === filters.status)
      && (filters.condition === 'All' || asset.condition === filters.condition)
      && (filters.category === 'All' || asset.category === filters.category)
      && (filters.location === 'All' || asset.location === filters.location);
  }).sort((a, b) => a.name.localeCompare(b.name));
}
