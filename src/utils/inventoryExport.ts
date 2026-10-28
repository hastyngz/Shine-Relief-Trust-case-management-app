import type { InventoryItem } from '../types';

export type InventoryExportFormat = 'docx' | 'xlsx' | 'pdf';
export const INVENTORY_EXPORT_COLUMNS: Array<{ header: string; value: (item: InventoryItem) => string | number }> = [
 { header: 'Stock code', value: (i) => i.stockCode }, { header: 'Item', value: (i) => i.name },
 { header: 'Category', value: (i) => i.category }, { header: 'Location', value: (i) => i.location },
 { header: 'Unit', value: (i) => i.unit }, { header: 'Quantity on hand', value: (i) => i.quantityOnHand },
 { header: 'Minimum stock', value: (i) => i.minimumStockLevel }, { header: 'Supplier', value: (i) => i.supplier || 'Not recorded' },
 { header: 'Unit cost (MWK)', value: (i) => i.unitCostMWK ?? '' }, { header: 'Expiry date', value: (i) => i.expiryDate || '' },
 { header: 'Condition', value: (i) => i.condition || 'Not recorded' },
];
export function inventoryExportRows(items: InventoryItem[]): Array<Array<string | number>> {
 return [INVENTORY_EXPORT_COLUMNS.map((c) => c.header), ...items.map((i) => INVENTORY_EXPORT_COLUMNS.map((c) => c.value(i)))];
}
function downloadBlob(blob: Blob, filename: string): void {
 const url = URL.createObjectURL(blob); const link = document.createElement('a');
 link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
 window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportInventoryRegister(items: InventoryItem[], format: InventoryExportFormat): Promise<void> {
 if (!items.length) throw new Error('There are no inventory records to export.');
 const date = new Date().toISOString().slice(0, 10); const filename = `SHINE_Inventory_Register_${date}`; const rows = inventoryExportRows(items);
 if (format === 'xlsx') {
  const XLSX = await import('xlsx'); const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = rows[0].map((h, index) => ({ wch: Math.min(32, Math.max(String(h).length + 2, ...rows.slice(1, 30).map((row) => String(row[index] ?? '').length + 2))) }));
  if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Inventory Register');
  downloadBlob(new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`); return;
 }
 if (format === 'pdf') {
  const { jsPDF } = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16); doc.text('SHINE Relief Trust — Inventory Register', 36, 34); doc.setFontSize(9);
  doc.text(`Generated ${date} · ${items.length} items · Amounts in MWK`, 36, 50);
  autoTable(doc, { head: [rows[0].map(String)], body: rows.slice(1).map((row) => row.map((v) => String(v ?? ''))),
   startY: 62, margin: { left: 24, right: 24 }, styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
   headStyles: { fillColor: [59, 26, 6] }, didDrawPage: () => { doc.setFontSize(8); doc.text(`SHINE Relief Trust · Page ${doc.getNumberOfPages()}`, doc.internal.pageSize.getWidth() - 24, doc.internal.pageSize.getHeight() - 12, { align: 'right' }); } });
  doc.save(`${filename}.pdf`); return;
 }
 const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } = await import('docx');
 const tableRows = rows.map((row, ri) => new TableRow({ tableHeader: ri === 0, children: row.map((v) => new TableCell({ children: [new Paragraph(String(v ?? ''))], width: { size: Math.floor(100 / row.length), type: WidthType.PERCENTAGE } })) }));
 const doc = new Document({ sections: [{ children: [new Paragraph({ text: 'SHINE Relief Trust — Inventory Register', heading: HeadingLevel.HEADING_1 }), new Paragraph(`Generated ${date} · ${items.length} items · Amounts in MWK`), new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } })] }] });
 downloadBlob(await Packer.toBlob(doc), `${filename}.docx`);
}
