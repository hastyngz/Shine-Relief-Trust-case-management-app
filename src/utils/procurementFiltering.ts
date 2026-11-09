import type { ProcurementList } from '../types';

export type ProcurementStatusFilter = 'All' | ProcurementList['status'];
export type ProcurementStageFilter = 'All' | 'Awaiting receipt' | 'Received - finance pending' | 'Handed to finance';

export interface ProcurementListFilters {
  search: string;
  status: ProcurementStatusFilter;
  stage: ProcurementStageFilter;
}

/** Filter procurement lists without changing the stored list or item order. */
export function filterProcurementLists(
  lists: ProcurementList[],
  filters: ProcurementListFilters,
): ProcurementList[] {
  const term = filters.search.trim().toLocaleLowerCase('en-US');
  return lists.filter((list) => {
    if (filters.status !== 'All' && list.status !== filters.status) return false;
    if (filters.stage === 'Awaiting receipt' && !(list.status === 'purchased' && !list.receivedAt)) return false;
    if (filters.stage === 'Received - finance pending' && !(list.status === 'purchased' && Boolean(list.receivedAt) && !list.financeHandedOverAt)) return false;
    if (filters.stage === 'Handed to finance' && !(list.status === 'purchased' && Boolean(list.financeHandedOverAt))) return false;
    if (!term) return true;
    const searchable = [
      list.title,
      list.purpose,
      list.purchaseOrderReference,
      list.financeReference,
      ...list.items.flatMap((item) => [
        item.description,
        item.specification,
        item.itemNumber,
        item.note,
        ...(item.quotes || []).flatMap((quote) => [quote.supplier, quote.note]),
        item.selectedQuoteSupplier,
      ]),
    ];
    return searchable.some((value) =>
      String(value || '').toLocaleLowerCase('en-US').includes(term),
    );
  });
}
