import assert from 'node:assert/strict';
import { inventoryExportRows } from '../src/utils/inventoryExport';
import type { InventoryItem } from '../src/types';
const item: InventoryItem = { id:'item-1', stockCode:'FOOD-01', name:'Rice, brown', category:'Food & Groceries', unit:'bags', quantityOnHand:12, minimumStockLevel:3, location:'Shine House', supplier:'Local Supplier', unitCostMWK:18000, expiryDate:'2027-01-31', condition:'Good', movements:[], createdAt:'2026-10-01T00:00:00.000Z', updatedAt:'2026-10-01T00:00:00.000Z', createdBy:'Test User', updatedBy:'Test User' };
const rows = inventoryExportRows([item]);
assert.deepEqual(rows[0], ['Stock code','Item','Category','Location','Unit','Quantity on hand','Minimum stock','Supplier','Unit cost (MWK)','Expiry date','Condition']);
assert.equal(rows.length, 2); assert.equal(rows[1][1], 'Rice, brown'); assert.equal(rows[1][5], 12); assert.equal(rows[1][8], 18000);
assert.equal(inventoryExportRows([]).length, 1);
console.log('Inventory export mapping tests passed.');
