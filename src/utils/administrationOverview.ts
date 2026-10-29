import type { AppDatabase, AssetRecord, InventoryItem, ScheduleItem } from '../types';
import { isComplianceOverdue } from './compliance';

export interface AdministrationAttentionSummary {
  lowStockItems: number;
  stockExpiryAlerts: number;
  assetsNeedingAttention: number;
  overdueCompliance: number;
  openProcurementLists: number;
}

function isValidDate(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function withinNext30Days(value: string | undefined, today: string): boolean {
  if (!isValidDate(value) || !isValidDate(today)) return false;
  const end = new Date(`${today}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  return value <= end.toISOString().slice(0, 10);
}

export function getAdministrationAttention(db: AppDatabase, today: string): AdministrationAttentionSummary {
  const inventory: InventoryItem[] = db.inventoryItems || [];
  const assets: AssetRecord[] = db.assets || [];
  const schedules: ScheduleItem[] = db.schedules || [];
  return {
    lowStockItems: inventory.filter((item) => Number.isFinite(item.quantityOnHand) &&
      Number.isFinite(item.minimumStockLevel) && item.minimumStockLevel > 0 &&
      item.quantityOnHand <= item.minimumStockLevel).length,
    stockExpiryAlerts: inventory.filter((item) => withinNext30Days(item.expiryDate, today)).length,
    assetsNeedingAttention: assets.filter((asset) => asset.status !== 'Disposed' && (
      asset.status === 'Missing' || asset.status === 'Under Repair' ||
      asset.condition === 'Damaged' || asset.condition === 'Needs Repair' ||
      withinNext30Days(asset.warrantyExpiryDate, today) || withinNext30Days(asset.nextServiceDate, today)
    )).length,
    overdueCompliance: schedules.filter((item) => Boolean(item.complianceCategory) && isComplianceOverdue(item, today)).length,
    openProcurementLists: (db.procurementLists || []).filter((item) => item.status === 'draft' || item.status === 'approved').length,
  };
}
