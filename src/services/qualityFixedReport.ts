import {
  AlignmentType,
  Document,
  FileChild,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export type FixedReportFormat = 'docx' | 'pdf' | 'marked-docx' | 'xlsx';
export type ReportExportFormat = FixedReportFormat | 'csv';

export interface FixedReportSection {
  title: string;
  text: string;
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

export function assertFixedReportCanDownload(input: Pick<FixedReportInput, 'openProblems' | 'draft'>): void {
  const blockers = input.openProblems.filter((problem) => problem.severity === 'blocker');
  if (blockers.length && !input.draft) {
    throw new Error(`A final copy is not available while ${blockers.length} blocking ${blockers.length === 1 ? 'problem remains' : 'problems remain'}.`);
  }
}

function paragraphs(input: FixedReportInput): FileChild[] {
  const items: FileChild[] = [];
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
  input.sections.forEach((section) => {
    items.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2 }));
    for (const text of section.text.split(/\n+/).filter(Boolean)) {
      if (input.format === 'marked-docx') {
        const change = input.changes.find((item) => item.section === section.title && item.newText === text);
        if (change) {
          items.push(new Paragraph({
            children: [
              new TextRun({ text: `Was: ${change.originalText}`, strike: true, color: '9A3412' }),
              new TextRun({ text: `  Now: ${change.newText}`, highlight: 'yellow' }),
            ],
          }));
          continue;
        }
      }
      items.push(new Paragraph({ text }));
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
  if (input.draft) {
    pdf.setTextColor(185, 28, 28);
    write('DRAFT', 20, true);
    pdf.setTextColor(0, 0, 0);
  }
  write(input.title, 18, true);
  write('Contents', 14, true);
  input.sections.forEach((section, index) => write(`${index + 1}. ${section.title}`));
  input.sections.forEach((section) => {
    write(section.title, 14, true);
    write(section.text);
  });
  if (input.changes.length) {
    write('Changes made', 14, true);
    for (const change of input.changes) {
      write(`${change.section}: Was: ${change.originalText} Now: ${change.newText}`);
      write(`${change.reason} · ${change.by} · ${new Date(change.at).toLocaleString('en-GB')}`, 9);
    }
  }
  if (input.draft && input.openProblems.length) {
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
  assertFixedReportCanDownload(input);
  if (input.format === 'pdf') return pdfDocument(input);
  if (input.format === 'xlsx') return changesWorkbook(input);
  return wordDocument(input);
}

export async function sha256Blob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot create the required export audit hash.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
