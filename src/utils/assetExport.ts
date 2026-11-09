import type { AssetRecord } from '../types';

export type AssetExportFormat = 'docx' | 'xlsx' | 'pdf';
export const ASSET_EXPORT_COLUMNS: Array<{ header: string; value: (asset: AssetRecord) => string | number }> = [
  { header: 'Asset tag', value: (a) => a.assetTag }, { header: 'Name', value: (a) => a.name },
  { header: 'Category', value: (a) => a.category }, { header: 'Description', value: (a) => a.description || '' },
  { header: 'Serial number', value: (a) => a.serialNumber || '' }, { header: 'Location', value: (a) => a.location },
  { header: 'Assigned to', value: (a) => a.assignedTo || 'Not assigned' }, { header: 'Condition', value: (a) => a.condition },
  { header: 'Status', value: (a) => a.status }, { header: 'Acquisition date', value: (a) => a.acquisitionDate || '' },
  { header: 'Acquisition cost (MWK)', value: (a) => a.acquisitionCostMWK ?? '' }, { header: 'Funding source', value: (a) => a.fundingSource || '' },
  { header: 'Warranty expiry', value: (a) => a.warrantyExpiryDate || '' }, { header: 'Next service date', value: (a) => a.nextServiceDate || '' },
  { header: 'Notes', value: (a) => a.notes || '' },
];
export function assetExportRows(assets: AssetRecord[]): Array<Array<string | number>> {
  return [ASSET_EXPORT_COLUMNS.map((c) => c.header), ...assets.map((a) => ASSET_EXPORT_COLUMNS.map((c) => c.value(a)))];
}
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportAssetRegister(assets: AssetRecord[], format: AssetExportFormat): Promise<void> {
  if (!assets.length) throw new Error('There are no asset records to export.');
  const date = new Date().toISOString().slice(0, 10); const filename = `SHINE_Asset_Register_${date}`; const rows = assetExportRows(assets);
  if (format === 'xlsx') {
    const XLSX = await import('xlsx'); const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = rows[0].map((h, index) => ({ wch: Math.min(32, Math.max(String(h).length + 2, ...rows.slice(1, 30).map((row) => String(row[index] ?? '').length + 2))) }));
    if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
    XLSX.utils.book_append_sheet(workbook, sheet, 'Asset Register');
    downloadBlob(new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`); return;
  }
  if (format === 'pdf') {
    const { jsPDF } = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16); doc.text('SHINE Relief Trust — Asset Register', 36, 34); doc.setFontSize(9);
    doc.text(`Generated ${date} · ${assets.length} assets · Amounts in MWK`, 36, 50);
    autoTable(doc, { head: [rows[0].map(String)], body: rows.slice(1).map((row) => row.map((v) => String(v ?? ''))),
      startY: 62, margin: { left: 24, right: 24 }, styles: { fontSize: 6, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [59, 26, 6] },
      didDrawPage: () => { doc.setFontSize(8); doc.text(`SHINE Relief Trust · Page ${doc.getNumberOfPages()}`, doc.internal.pageSize.getWidth() - 24, doc.internal.pageSize.getHeight() - 12, { align: 'right' }); } });
    doc.save(`${filename}.pdf`); return;
  }
  const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } = await import('docx');
  const tableRows = rows.map((row, ri) => new TableRow({ tableHeader: ri === 0, children: row.map((v) => new TableCell({
    children: [new Paragraph(String(v ?? ''))], width: { size: Math.floor(100 / row.length), type: WidthType.PERCENTAGE },
  })) }));
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: 'SHINE Relief Trust — Asset Register', heading: HeadingLevel.HEADING_1 }),
    new Paragraph(`Generated ${date} · ${assets.length} assets · Amounts in MWK`),
    new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
  ] }] });
  downloadBlob(await Packer.toBlob(doc), `${filename}.docx`);
}
