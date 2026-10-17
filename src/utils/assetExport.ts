import type { AssetRecord } from '../types';

const columns: Array<[string, (asset: AssetRecord) => unknown]> = [
  ['Asset tag', (asset) => asset.assetTag],
  ['Name', (asset) => asset.name],
  ['Category', (asset) => asset.category],
  ['Description', (asset) => asset.description],
  ['Serial number', (asset) => asset.serialNumber],
  ['Location', (asset) => asset.location],
  ['Assigned to', (asset) => asset.assignedTo],
  ['Condition', (asset) => asset.condition],
  ['Status', (asset) => asset.status],
  ['Acquisition date', (asset) => asset.acquisitionDate],
  ['Acquisition cost MWK', (asset) => asset.acquisitionCostMWK],
  ['Funding source', (asset) => asset.fundingSource],
  ['Warranty expiry', (asset) => asset.warrantyExpiryDate],
  ['Next service date', (asset) => asset.nextServiceDate],
  ['Notes', (asset) => asset.notes],
];

export function escapeAssetCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Avoid spreadsheet formula execution when exported values are opened in Excel/Sheets.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildAssetsCsv(assets: AssetRecord[]): string {
  const header = columns.map(([name]) => escapeAssetCsvCell(name)).join(',');
  const rows = assets.map((asset) => columns.map(([, value]) => escapeAssetCsvCell(value(asset))).join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}
