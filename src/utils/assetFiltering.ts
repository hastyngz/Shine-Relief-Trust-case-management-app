import type { AssetCondition, AssetRecord, AssetStatus } from '../types';

export type AssetFollowUpFilter = 'All' | 'Service overdue' | 'Service due soon' | 'Warranty expired' | 'Warranty expiring soon';

export interface AssetRegisterFilters {
  search: string;
  status: 'All' | AssetStatus;
  condition: 'All' | AssetCondition;
  category: 'All' | string;
  location: 'All' | string;
  followUp: AssetFollowUpFilter;
  today: string;
}


const dateDaysFrom = (date: string | undefined, today: string): number | null => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const timestamp = Date.parse(date + 'T00:00:00Z');
  const todayTimestamp = Date.parse(today + 'T00:00:00Z');
  if (!Number.isFinite(timestamp) || !Number.isFinite(todayTimestamp)
    || new Date(timestamp).toISOString().slice(0, 10) !== date
    || new Date(todayTimestamp).toISOString().slice(0, 10) !== today) return null;
  return Math.round((timestamp - todayTimestamp) / 86400000);
};

/** Filter the asset register without mutating the source records. */
export function filterAssetRegister(assets: AssetRecord[], filters: AssetRegisterFilters): AssetRecord[] {
  const term = filters.search.trim().toLocaleLowerCase('en-US');
  return assets.filter((asset) => {
    const matchesText = !term || [
      asset.assetTag, asset.name, asset.category, asset.serialNumber, asset.location, asset.assignedTo, asset.fundingSource,
    ].some((value) => String(value || '').toLocaleLowerCase('en-US').includes(term));
    const serviceDays = dateDaysFrom(asset.nextServiceDate, filters.today);
    const warrantyDays = dateDaysFrom(asset.warrantyExpiryDate, filters.today);
    let matchesFollowUp = true;
    if (filters.followUp === 'Service overdue') matchesFollowUp = asset.status !== 'Disposed' && serviceDays !== null && serviceDays < 0;
    if (filters.followUp === 'Service due soon') matchesFollowUp = asset.status !== 'Disposed' && serviceDays !== null && serviceDays >= 0 && serviceDays <= 30;
    if (filters.followUp === 'Warranty expired') matchesFollowUp = asset.status !== 'Disposed' && warrantyDays !== null && warrantyDays < 0;
    if (filters.followUp === 'Warranty expiring soon') matchesFollowUp = asset.status !== 'Disposed' && warrantyDays !== null && warrantyDays >= 0 && warrantyDays <= 30;
    return matchesText && matchesFollowUp
      && (filters.status === 'All' || asset.status === filters.status)
      && (filters.condition === 'All' || asset.condition === filters.condition)
      && (filters.category === 'All' || asset.category === filters.category)
      && (filters.location === 'All' || asset.location === filters.location);
  }).sort((a, b) => a.name.localeCompare(b.name));
}
