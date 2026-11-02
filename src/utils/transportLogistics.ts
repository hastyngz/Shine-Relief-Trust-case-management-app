import type { AssetHistoryEntry, AssetRecord } from '../types';
import { isValidInventoryDate } from './inventory';

export type VehicleServiceDateState = 'missing' | 'invalid' | 'overdue' | 'due_today' | 'due_soon' | 'scheduled';

export interface VehicleServiceDueItem {
  assetId: string;
  assetTag: string;
  assetName: string;
  nextServiceDate?: string;
  daysUntilService: number | null;
  state: VehicleServiceDateState;
}

export interface VehicleMaintenanceRecord {
  id: string;
  assetId: string;
  assetTag: string;
  assetName: string;
  date: string;
  note: string;
  costMWK?: number;
  supplier?: string;
  invoiceReference?: string;
  linkedExpenseId?: string;
}

const isVehicle = (asset: AssetRecord) =>
  asset.status !== 'Disposed' && /vehicle|car|motorcycle|motorbike|van|truck/i.test(`${asset.category} ${asset.name}`);

export function getVehicleServiceDateState(
  nextServiceDate: string | undefined,
  today: string,
): { state: VehicleServiceDateState; daysUntilService: number | null } {
  if (!nextServiceDate) return { state: 'missing', daysUntilService: null };
  if (!isValidInventoryDate(nextServiceDate) || !isValidInventoryDate(today)) {
    return { state: 'invalid', daysUntilService: null };
  }
  const [year, month, day] = nextServiceDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  const daysUntilService = Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86400000,
  );
  if (daysUntilService < 0) return { state: 'overdue', daysUntilService };
  if (daysUntilService === 0) return { state: 'due_today', daysUntilService };
  if (daysUntilService <= 30) return { state: 'due_soon', daysUntilService };
  return { state: 'scheduled', daysUntilService };
}

export function buildVehicleServiceOverview(assets: AssetRecord[], today: string) {
  const vehicles = assets.filter(isVehicle);
  const dueItems: VehicleServiceDueItem[] = vehicles.map((asset) => ({
    assetId: asset.id,
    assetTag: asset.assetTag,
    assetName: asset.name,
    nextServiceDate: asset.nextServiceDate,
    ...getVehicleServiceDateState(asset.nextServiceDate, today),
  }));
  const maintenanceRecords: VehicleMaintenanceRecord[] = vehicles.flatMap((asset) =>
    (asset.history || [])
      .filter((entry: AssetHistoryEntry) => entry.action === 'Maintenance')
      .map((entry) => ({
        id: entry.id,
        assetId: asset.id,
        assetTag: asset.assetTag,
        assetName: asset.name,
        date: entry.date,
        note: entry.note,
        costMWK: entry.costMWK,
        supplier: entry.supplier,
        invoiceReference: entry.invoiceReference,
        linkedExpenseId: entry.linkedExpenseId,
      })),
  ).sort((a, b) => b.date.localeCompare(a.date));
  return {
    vehicleCount: vehicles.length,
    overdueCount: dueItems.filter((item) => item.state === 'overdue').length,
    dueWithin30DaysCount: dueItems.filter((item) => item.state === 'due_today' || item.state === 'due_soon').length,
    missingServiceDateCount: dueItems.filter((item) => item.state === 'missing' || item.state === 'invalid').length,
    dueItems: dueItems
      .filter((item) => item.state !== 'scheduled')
      .sort((a, b) => (a.daysUntilService ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilService ?? Number.MAX_SAFE_INTEGER)),
    maintenanceRecords,
  };
}
