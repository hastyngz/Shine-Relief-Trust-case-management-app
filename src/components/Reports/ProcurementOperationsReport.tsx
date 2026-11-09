import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import type { AppDatabase } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessManagementDashboard } from '../../services/managementAnalytics';
import { appendManagementProcurementReportHistory } from '../../services/firestoreSync';
import {
  buildProcurementOperationsCsv,
  buildProcurementOperationsDocument,
  buildProcurementOperationsReport,
  PROCUREMENT_OPERATIONS_REPORT_TYPE,
  PROCUREMENT_REPORT_CLASSIFICATION,
  PROCUREMENT_REPORT_DATE_BASES,
  PROCUREMENT_REPORT_RETENTION_DAYS,
  procurementProgrammeOptions,
  type ProcurementReportDateBasis,
} from '../../services/managementProcurementReport';

interface ProcurementOperationsReportProps {
  db: AppDatabase;
  onBack: () => void;
}

type ExportFormat = 'csv' | 'xlsx' | 'docx';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const ProcurementOperationsReport: React.FC<ProcurementOperationsReportProps> = ({ db, onBack }) => {
  const { isAdmin, role, currentUser } = useAuth();
  const [dateBasis, setDateBasis] = useState<ProcurementReportDateBasis>('createdAt');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [programmeId, setProgrammeId] = useState('');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const options = useMemo(() => procurementProgrammeOptions(), []);
  const selectedProgrammeLabel = options.find((option) => option.id === programmeId)?.label;
  const authorized = canAccessManagementDashboard(isAdmin, role);
  const reportState = useMemo(() => {
    if (!authorized) return { report: buildProcurementOperationsReport([], { dateBasis }), error: '' };
    try {
      return { report: buildProcurementOperationsReport(db.procurementLists || [], {
        dateBasis,
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(programmeId ? { programmeId } : {}),
      }), error: '' };
    } catch (error) {
      return {
        report: buildProcurementOperationsReport([], { dateBasis }),
        error: error instanceof Error ? error.message : 'The selected report filters are invalid.',
      };
    }
  }, [authorized, db.procurementLists, dateBasis, startDate, endDate, programmeId]);
  const report = reportState.report;

  if (!authorized) {
    return <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900" aria-label="Procurement report access denied">
      Procurement Operations Reports are restricted to Administrators and Managers.
    </section>;
  }

  const exportReport = async (format: ExportFormat) => {
    if (reportState.error) {
      setMessage(`Export not downloaded: ${reportState.error}`);
      return;
    }
    if (!currentUser || !canAccessManagementDashboard(isAdmin, role)) {
      setMessage('Your account is not authorized to export this internal report.');
      return;
    }
    setExporting(true);
    setMessage('');
    let metadataAttempted = false;
    let metadataSaved = false;
    try {
      const generatedAt = new Date();
      const fileName = `SHINE_Internal_Procurement_Operations_Report_${generatedAt.toISOString().slice(0, 10)}.${format}`;
      let blob: Blob;
      if (format === 'csv') {
        blob = new Blob([buildProcurementOperationsCsv(report, selectedProgrammeLabel)], { type: 'text/csv;charset=utf-8' });
      } else {
        blob = await buildProcurementOperationsDocument(report, format, selectedProgrammeLabel);
      }

      // This dedicated write is manager/admin-only in Firestore, contains no exported file,
      // and adds an expiresAt timestamp for the 90-day TTL policy.
      metadataAttempted = true;
      await appendManagementProcurementReportHistory({
        reportType: PROCUREMENT_OPERATIONS_REPORT_TYPE,
        generatedByUid: currentUser.uid,
        dateBasis,
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(programmeId ? { programmeId } : {}),
        format,
        selectedListCount: report.counts.selectedListCount,
        aggregateRowCount: report.rows.length,
      });
      metadataSaved = true;
      saveBlob(blob, fileName);
      setMessage(`Internal report exported. Metadata-only history is recorded with a ${PROCUREMENT_REPORT_RETENTION_DAYS}-day expiry; the generated file was not archived.`);
    } catch (error) {
      console.error('Procurement Operations Report export failed:', error);
      if (!metadataAttempted) {
        setMessage('Export not generated. No report-history entry was written; review the selected data and try again.');
      } else if (!metadataSaved) {
        setMessage('Export not downloaded because its secure audit metadata could not be saved. Check connectivity and access, then retry.');
      } else {
        setMessage('The audit entry was saved, but the download did not start. Retry to create a new export entry.');
      }
    } finally {
      setExporting(false);
    }
  };

  return <section className="space-y-4" aria-label="Internal Procurement Operations Report">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-rose-800">{PROCUREMENT_REPORT_CLASSIFICATION}</p>
        <h3 className="mt-1 text-base font-black text-stone-900">Procurement Operations Report</h3>
        <p className="mt-1 max-w-3xl text-xs text-stone-600">Internal purchasing, approval, receipt-acknowledgement, finance-handover, quote, and recorded-total aggregates. This report is separate from Sponsor/Donor/Trustee reporting.</p>
      </div>
      <button type="button" onClick={onBack} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700">Back to management reports</button>
    </div>

    <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-[11px] font-semibold text-stone-700">Date basis
        <select className="field mt-1 w-full" value={dateBasis} onChange={(event) => setDateBasis(event.target.value as ProcurementReportDateBasis)}>
          {PROCUREMENT_REPORT_DATE_BASES.map((basis) => <option key={basis.id} value={basis.id}>{basis.label}</option>)}
        </select>
      </label>
      <label className="text-[11px] font-semibold text-stone-700">From
        <input className="field mt-1 w-full" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
      </label>
      <label className="text-[11px] font-semibold text-stone-700">To
        <input className="field mt-1 w-full" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
      </label>
      <label className="text-[11px] font-semibold text-stone-700">Programme
        <select className="field mt-1 w-full" value={programmeId} onChange={(event) => setProgrammeId(event.target.value)}>
          <option value="">All programmes</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <div className="self-end text-[11px] text-stone-600"><strong>{report.counts.selectedListCount}</strong> list(s) in scope<br /><strong>{report.counts.missingDateCount}</strong> missing selected date</div>
    </div>
    {reportState.error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900">{reportState.error}</p>}

    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
      Recorded list totals are shown as stored; variances are warnings, not export blockers. Missing milestone dates are visible in a separate bucket. Receipt acknowledgement does not establish inventory posting or reconciliation. Metadata expires after 90 days; the Firestore TTL policy on this dedicated collection must be enabled before production use.
    </div>

    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void exportReport('csv')} disabled={exporting || !currentUser || !!reportState.error} className="inline-flex items-center gap-2 rounded-md bg-teal-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button>
      <button type="button" onClick={() => void exportReport('xlsx')} disabled={exporting || !currentUser || !!reportState.error} className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-white px-3 py-2 text-xs font-bold text-emerald-900 disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" />Export Excel</button>
      <button type="button" onClick={() => void exportReport('docx')} disabled={exporting || !currentUser || !!reportState.error} className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-800 disabled:opacity-50"><FileText className="h-4 w-4" />Export Word</button>
    </div>
    {message && <p role="status" className="text-xs text-teal-800">{message}</p>}

    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-stone-50"><tr>{report.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 font-bold text-stone-600">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-stone-100">{report.rows.map((row, index) => <tr key={`${row[0]}-${row[1]}-${index}`}>
          {row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-3 py-2 text-stone-700">{cellIndex === 3 && typeof cell === 'number' ? cell.toLocaleString('en-MW', { maximumFractionDigits: 2 }) : cell}</td>)}
        </tr>)}</tbody>
      </table>
      {report.counts.varianceListCount > 0 && <p className="border-t border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Warning: {report.counts.varianceListCount} list(s) have recorded totals that differ from recomputed item totals. Review the aggregate variance; no source data was changed.</p>}
    </div>
  </section>;
};
