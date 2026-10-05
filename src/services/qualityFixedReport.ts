import {
  AlignmentType,
  Document,
  FileChild,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TableOfContents,
  TextRun,
} from 'docx';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { ReportExportRecord } from '../types';

export type FixedReportFormat = 'docx' | 'pdf' | 'marked-docx' | 'xlsx';
export type ReportExportFormat = FixedReportFormat | 'csv';

export interface FixedReportImage {
  data: Uint8Array;
  type: 'png' | 'jpg';
  altText: string;
  consent: boolean;
}

export interface FixedReportSection {
  title: string;
  text: string;
  paragraphs?: string[];
  table?: { headers: string[]; rows: Array<Array<string | number>> };
  images?: FixedReportImage[];
  sensitivity?: 'health' | 'family' | 'psychosocial' | 'safeguarding' | 'photo';
  identifyingValues?: string[];
}

export interface FixedReportChange {
  section: string;
  originalText: string;
  newText: string;
  by: string;
  at: string;
  reason: string;
}

export interface FixedReportProblem {
  severity: 'blocker' | 'warning' | 'info';
  text: string;
}

export interface FixedReportInput {
  title: string;
  sections: FixedReportSection[];
  changes: FixedReportChange[];
  openProblems: FixedReportProblem[];
  format: FixedReportFormat;
  draft: boolean;
  hideIdentifyingDetails?: boolean;
  identifyingValues?: string[];
}

export function formatFixedReportChangeValue(value: unknown, field?: string): string {
  if (field === 'quantifiedActivity' && value && typeof value === 'object') {
    const change = value as {
      text?: unknown;
      extractedData?: Record<string, unknown>;
    };
    const data = change.extractedData;
    const details = data ? [
      ['Indicator', data.indicatorId],
      ['Actual', data.actual ?? data.completedCount],
      ['Target', data.target ?? data.targetCount],
      ['Unit', data.countUnit],
      ['Activity count', data.activityCount],
      ['Period', data.reportingPeriod],
      ['Activity', data.activityDescription],
      ['Place', data.place],
      ['Data source', data.dataSource ?? data.source],
      ['Measurement method', data.measurementMethod ?? data.method],
      ['Narrative only', data.narrativeOnly],
      ['Narrative-only reason', data.narrativeOnlyReason],
      ['Manager approved', data.managerApproved],
    ].filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')
      .map(([label, entry]) => `${label}: ${String(entry)}`)
      : [];
    return [
      typeof change.text === 'string' && change.text ? `Narrative: ${change.text}` : '',
      ...details,
    ].filter(Boolean).join('\n') || 'No quantitative details recorded.';
  }
  if (field === 'method' && value && typeof value === 'object') {
    const method = value as { method?: unknown; affectedIds?: unknown; applyToAll?: unknown };
    if (typeof method.method === 'string') return `Measurement method: ${method.method}`;
    return Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => !/ids?$/i.test(key) && entry !== undefined)
      .map(([key, entry]) => `${key}: ${String(entry)}`).join('\n');
  }
  if (field === 'validity' && value && typeof value === 'object') {
    const validityValue = value as Record<string, unknown>;
    const validity = validityValue.validity && typeof validityValue.validity === 'object'
      ? validityValue.validity as Record<string, unknown>
      : validityValue;
    const source = validity.source && typeof validity.source === 'object'
      ? validity.source as Record<string, unknown>
      : {};
    const details = [
      ['Source', source.name],
      ['Reference', source.reference],
      ['Second source', validity.secondSource],
      ['Checked by', validity.checkedBy],
      ['Checked at', validity.checkedAt],
      ['Note', validity.note],
    ].filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')
      .map(([label, entry]) => `${label}: ${String(entry)}`);
    if (details.length) return details.join('\n');
  }
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function fixedReportFileName(originalName: string, date = new Date()): string {
  const base = originalName.replace(/\.[^.]+$/, '').trim() || 'Report';
  return `${base} - fixed - ${date.toISOString().slice(0, 10)}`;
}

export function nextReportExportVersion(reportType: string): number {
  const records = JSON.parse(localStorage.getItem('shine-report-exports') || '[]') as Array<{ reportType?: unknown; version?: unknown }>;
  return records.reduce((max, record) =>
    record.reportType === reportType && typeof record.version === 'number' ? Math.max(max, record.version) : max, 0) + 1;
}

export async function createReportExportRecord(
  blob: Blob,
  details: Omit<ReportExportRecord, 'id' | 'version' | 'hash' | 'generatedAt'>,
): Promise<ReportExportRecord> {
  const generatedAt = new Date().toISOString();
  return {
    ...details,
    id: `report_export_${details.generatedByUid}_${Date.now()}`,
    version: nextReportExportVersion(details.reportType),
    hash: await sha256Blob(blob),
    generatedAt,
  };
}

export function assertFixedReportCanDownload(input: Pick<FixedReportInput, 'openProblems' | 'draft'>): void {
  const blockers = input.openProblems.filter((problem) => problem.severity === 'blocker');
  if (blockers.length && !input.draft) {
    throw new Error(`A final copy is not available while ${blockers.length} blocking ${blockers.length === 1 ? 'problem remains' : 'problems remain'}.`);
  }
}

function sanitizeText(text: string, sensitiveValues: string[]): string {
  return sensitiveValues.filter(Boolean).reduce((result, value) => result.replace(
    new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    '[hidden]',
  ), text);
}

function visibleSections(input: FixedReportInput): FixedReportSection[] {
  return input.sections
    .filter((section) => !input.hideIdentifyingDetails
      || (!['health', 'family', 'psychosocial', 'safeguarding', 'photo'].includes(section.sensitivity || '')
        && !/\b(?:health|medical|family|psychosocial|safeguarding|photo|photograph)\b/i.test(section.title)))
    .map((section) => {
      const sensitiveValues = [...(input.identifyingValues || []), ...(section.identifyingValues || [])];
      return {
        ...section,
        title: input.hideIdentifyingDetails ? sanitizeText(section.title, sensitiveValues) : section.title,
        text: input.hideIdentifyingDetails ? sanitizeText(section.text, sensitiveValues) : section.text,
        paragraphs: section.paragraphs?.map((text) => input.hideIdentifyingDetails ? sanitizeText(text, sensitiveValues) : text),
        table: section.table && {
          headers: section.table.headers.map((text) => input.hideIdentifyingDetails ? sanitizeText(text, sensitiveValues) : text),
          rows: section.table.rows.map((row) => row.map((value) => input.hideIdentifyingDetails
            ? sanitizeText(String(value), sensitiveValues)
            : value)),
        },
        images: section.images?.filter((image) => !input.hideIdentifyingDetails && image.consent),
      };
    });
}

function privacySafeInput(input: FixedReportInput): FixedReportInput {
  if (!input.hideIdentifyingDetails) return input;
  const globalValues = input.identifyingValues || [];
  const clean = (text: string, values = globalValues) => sanitizeText(text, values);
  const sections = visibleSections(input).map((section) => {
    const values = [...globalValues, ...(section.identifyingValues || [])];
    return {
      ...section,
      title: clean(section.title, values),
      text: clean(section.text, values),
      paragraphs: section.paragraphs?.map((text) => clean(text, values)),
      table: section.table && {
        headers: section.table.headers.map((text) => clean(text, values)),
        rows: section.table.rows.map((row) => row.map((value) => clean(String(value), values))),
      },
    };
  });
  return {
    ...input,
    title: clean(input.title),
    sections,
    changes: input.changes.map((change) => {
      const values = [
        ...globalValues,
        ...(input.sections.find((section) => section.title === change.section)?.identifyingValues || []),
      ];
      return {
        ...change,
        section: clean(change.section, values),
        originalText: clean(change.originalText, values),
        newText: clean(change.newText, values),
        by: clean(change.by),
        reason: clean(change.reason, values),
      };
    }),
    openProblems: input.openProblems.map((problem) => ({ ...problem, text: clean(problem.text) })),
  };
}

function tableRows(table: NonNullable<FixedReportSection['table']>): Table {
  const rows = [table.headers, ...table.rows].map((row, rowIndex) => new TableRow({
    children: row.map((value) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(value), bold: rowIndex === 0 })],
      })],
    })),
  }));
  return new Table({ rows });
}

function markedRuns(text: string, sectionTitle: string, input: FixedReportInput): TextRun[] {
  const changes = input.format === 'marked-docx'
    ? input.changes.filter((change) => change.section === sectionTitle && change.newText && text.includes(change.newText))
      .sort((left, right) => text.indexOf(left.newText) - text.indexOf(right.newText))
    : [];
  if (!changes.length) return [new TextRun({ text })];
  const runs: TextRun[] = [];
  let cursor = 0;
  for (const change of changes) {
    const start = text.indexOf(change.newText, cursor);
    if (start < 0) continue;
    if (start > cursor) runs.push(new TextRun({ text: text.slice(cursor, start) }));
    runs.push(new TextRun({ text: `Was: ${change.originalText}`, strike: true, color: '9A3412' }));
    runs.push(new TextRun({ text: `  Now: ${change.newText}`, highlight: 'yellow' }));
    cursor = start + change.newText.length;
  }
  if (cursor < text.length) runs.push(new TextRun({ text: text.slice(cursor) }));
  return runs;
}

function paragraphs(input: FixedReportInput): FileChild[] {
  const items: FileChild[] = [];
  const sections = visibleSections(input);
  if (input.draft) {
    items.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'DRAFT', bold: true, color: 'B91C1C' })],
    }));
  }
  items.push(new Paragraph({ text: input.title, heading: HeadingLevel.TITLE }));
  items.push(new Paragraph({ text: 'Contents', heading: HeadingLevel.HEADING_1 }));
  items.push(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }));
  items.push(new Paragraph({ text: 'Report', heading: HeadingLevel.HEADING_1 }));
  sections.forEach((section, index) => {
    items.push(new Paragraph({ text: `${index + 1}. ${section.title}`, heading: HeadingLevel.HEADING_2 }));
    for (const text of (section.paragraphs || section.text.split(/\n+/)).filter(Boolean)) {
      items.push(new Paragraph({ children: markedRuns(text, section.title, input) }));
    }
    if (section.table?.headers.length) items.push(tableRows(section.table));
    for (const image of section.images || []) {
      if (!image.altText.trim()) throw new Error(`An image in "${section.title}" needs alt text before export.`);
      items.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({
          data: image.data,
          type: image.type,
          transformation: { width: 420, height: 280 },
          altText: { name: image.altText, description: image.altText },
        })],
      }));
      items.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: image.altText, italics: true })] }));
    }
  });
  if (input.changes.length) {
    items.push(new Paragraph({ text: 'Changes made', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    for (const change of input.changes) {
      items.push(new Paragraph({ text: change.section, heading: HeadingLevel.HEADING_2 }));
      items.push(new Paragraph({ children: [new TextRun({ text: `Was: ${change.originalText}`, strike: true })] }));
      items.push(new Paragraph({ children: [new TextRun({ text: `Now: ${change.newText}`, highlight: 'yellow' })] }));
      items.push(new Paragraph({ text: `${change.reason} · ${change.by} · ${new Date(change.at).toLocaleString('en-GB')}` }));
    }
  }
  if (input.draft && input.openProblems.length) {
    items.push(new Paragraph({ text: 'Open problems', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    input.openProblems.forEach((problem) => items.push(new Paragraph({ text: `${problem.severity.toUpperCase()}: ${problem.text}` })));
  }
  return items;
}

async function wordDocument(input: FixedReportInput): Promise<Blob> {
  const header = new Header({ children: [new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: `SHINE Relief Trust${input.draft ? ' · DRAFT' : ''}`, bold: true })],
  })] });
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })],
    })],
  });
  const doc = new Document({
    sections: [{
      properties: {},
      headers: { default: header },
      footers: { default: footer },
      children: paragraphs(input),
    }],
  });
  return Packer.toBlob(doc);
}

function pdfDocument(input: FixedReportInput): Blob {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = 18;
  const write = (text: string, size = 11, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, pageWidth - 32) as string[];
    for (const line of lines) {
      if (y > pageHeight - 20) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(line, 16, y);
      y += size * 0.48 + 2;
    }
  };
  const writeTable = (table: NonNullable<FixedReportSection['table']>) => {
    if (!table.headers.length) return;
    const rows = [table.headers, ...table.rows];
    const columnWidth = (pageWidth - 32) / table.headers.length;
    rows.forEach((row, rowIndex) => {
      const cells = table.headers.map((_, columnIndex) => pdf.splitTextToSize(
        String(row[columnIndex] ?? ''),
        Math.max(12, columnWidth - 6),
      ) as string[]);
      const rowHeight = Math.max(18, ...cells.map((lines) => lines.length * 5 + 8));
      if (y + rowHeight > pageHeight - 20) {
        pdf.addPage();
        y = 18;
      }
      cells.forEach((lines, columnIndex) => {
        const x = 16 + columnIndex * columnWidth;
        pdf.setDrawColor(190, 190, 190);
        pdf.setFillColor(...(rowIndex === 0 ? [235, 242, 239] as [number, number, number] : [255, 255, 255] as [number, number, number]));
        pdf.rect(x, y - 4, columnWidth, rowHeight, 'FD');
        pdf.setFont('helvetica', rowIndex === 0 ? 'bold' : 'normal');
        pdf.setFontSize(8);
        pdf.text(lines, x + 3, y + 3);
      });
      y += rowHeight;
    });
  };
  if (input.draft) {
    pdf.setTextColor(185, 28, 28);
    write('DRAFT', 20, true);
    pdf.setTextColor(0, 0, 0);
  }
  write(input.title, 18, true);
  write('Contents', 14, true);
  const sections = visibleSections(input);
  sections.forEach((section, index) => write(`${index + 1}. ${section.title}`));
  sections.forEach((section) => {
    write(section.title, 14, true);
    for (const text of (section.paragraphs || section.text.split(/\n+/)).filter(Boolean)) write(text);
    if (section.table) writeTable(section.table);
    for (const image of section.images || []) {
      if (!image.altText.trim()) throw new Error(`An image in "${section.title}" needs alt text before export.`);
      const properties = pdf.getImageProperties(image.data);
      const width = Math.min(pageWidth - 32, 150);
      const height = width * (properties.height / properties.width);
      if (y + height + 14 > pageHeight - 20) {
        pdf.addPage();
        y = 18;
      }
      pdf.addImage(image.data, image.type === 'jpg' ? 'JPEG' : 'PNG', 16, y, width, height);
      y += height + 4;
      write(`Image description: ${image.altText}`, 9);
    }
  });
  if (input.changes.length) {
    write('Changes made', 14, true);
    for (const change of input.changes) {
      write(`${change.section}: Was: ${change.originalText} Now: ${change.newText}`);
      write(`${change.reason} · ${change.by} · ${new Date(change.at).toLocaleString('en-GB')}`, 9);
    }
  }
  if (input.draft && input.openProblems.length) {
    pdf.addPage();
    y = 18;
    write('Open problems', 14, true);
    input.openProblems.forEach((problem) => write(`${problem.severity.toUpperCase()}: ${problem.text}`));
  }
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(9);
    if (input.draft) {
      pdf.setTextColor(185, 28, 28);
      pdf.text('DRAFT', 16, 10);
      pdf.setTextColor(0, 0, 0);
    }
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }
  return pdf.output('blob');
}

function changesWorkbook(input: FixedReportInput): Blob {
  const rows = [
    ['Section', 'Original text', 'New text', 'Who', 'Date and time', 'Reason'],
    ...input.changes.map((change) => [
      change.section,
      change.originalText,
      change.newText,
      change.by,
      new Date(change.at).toLocaleString('en-GB'),
      change.reason,
    ]),
    ...(input.openProblems.length ? [['Open problems', '', '', '', '', '']] : []),
    ...input.openProblems.map((problem) => ['Open problem', '', '', '', '', `${problem.severity}: ${problem.text}`]),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Changes');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function createFixedReport(input: FixedReportInput): Promise<Blob> {
  const safeInput = privacySafeInput(input);
  assertFixedReportCanDownload(safeInput);
  if (safeInput.format === 'pdf') return pdfDocument(safeInput);
  if (safeInput.format === 'xlsx') return changesWorkbook(safeInput);
  return wordDocument(safeInput);
}

export async function sha256Blob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot create the required export audit hash.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
