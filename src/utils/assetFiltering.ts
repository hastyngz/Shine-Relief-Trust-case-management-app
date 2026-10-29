import type { AssetCondition, AssetRecord, AssetStatus } from '../types';

export interface AssetRegisterFilters {
  search: string;
  status: 'All' | AssetStatus;
  condition: 'All' | AssetCondition;
  category: 'All' | string;
}

/** Filter the asset register without mutating the source records. */
export function filterAssetRegister(assets: AssetRecord[], filters: AssetRegisterFilters): AssetRecord[] {
  const term = filters.search.trim().toLocaleLowerCase('en-US');
  return assets.filter((asset) => {
    const matchesText = !term || [
      asset.assetTag, asset.name, asset.category, asset.serialNumber, asset.location, asset.assignedTo, asset.fundingSource,
    ].some((value) => String(value || '').toLocaleLowerCase('en-US').includes(term));
    return matchesText
      && (filters.status === 'All' || asset.status === filters.status)
      && (filters.condition === 'All' || asset.condition === filters.condition)
      && (filters.category === 'All' || asset.category === filters.category);
  }).sort((a, b) => a.name.localeCompare(b.name));
}
