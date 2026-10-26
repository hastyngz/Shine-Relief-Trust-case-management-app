import React, { useEffect, useState } from 'react';
import { CalendarDays, DollarSign, Save, X } from 'lucide-react';
import { EmployeeRecord, EmployeeContractFields, ContractStatus, EmployeeCategory, EmploymentStatus, SalaryFrequency, SalaryHistoryRecord, EmploymentPeriod } from '../types';
import { appendEmployeeAuditLog, COLLECTIONS, getEmployeeSalaryHistory } from '../services/firestoreSync';
import { flushPendingOfflineSnapshots, loadQueue, queueOfflineRecordsForSync } from '../services/offlineSync';
import { calculateGratuity } from '../services/gratuityService';

interface EmployeeContractPanelProps {
  employee: EmployeeRecord;
  actorUid: string;
  actorName: string;
  canEdit: boolean;
  contractDetailsAvailable?: boolean;
  onUpdate: (staffId: string, updates: Partial<EmployeeContractFields>) => Promise<void>;
  onClose: () => void;
}

const contractStatuses: ContractStatus[] = ['Active', 'Expiring Soon', 'Expired', 'Renewed', 'Completed', 'Terminated', 'Resigned'];

export const EmployeeContractPanel: React.FC<EmployeeContractPanelProps> = ({ employee, actorUid, actorName, canEdit, contractDetailsAvailable = true, onUpdate, onClose }) => {
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistoryRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [contract, setContract] = useState({
    employeeCategory: employee.employeeCategory || 'Other Staff' as EmployeeCategory,
    position: employee.position || employee.positionTitle || employee.department || '',
    contractStartDate: employee.contractStartDate || employee.originalContractStartDate || '',
    contractEndDate: employee.contractEndDate || '',
    contractType: employee.contractType || '',
    contractDuration: employee.contractDuration || '',
    contractStatus: employee.contractStatus || 'Active' as ContractStatus,
    renewalInformation: employee.renewalInformation || '',
    employmentStatus: employee.employmentStatus || 'Active' as EmploymentStatus,
  });
  const [salary, setSalary] = useState({ amount: '', effectiveDate: '', frequency: 'Monthly' as SalaryFrequency, reason: '', notes: '' });
  const [calculationEndDate, setCalculationEndDate] = useState(employee.contractEndDate || new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      const [serverResult, queueResult] = await Promise.allSettled([
        getEmployeeSalaryHistory(employee.id),
        loadQueue(),
      ]);
      if (cancelled) return;
      const serverRecords = serverResult.status === 'fulfilled' ? serverResult.value : [];
      const queuedRecords = queueResult.status === 'fulfilled'
        ? queueResult.value
            .filter((entry) =>
              entry.collection === COLLECTIONS.EMPLOYEE_SALARY_HISTORY &&
              entry.operation === 'set' &&
              entry.data?.employeeId === employee.id &&
              entry.ownerUid === actorUid
            )
            .map((entry) => entry.data as SalaryHistoryRecord)
        : [];
      const byId = new Map(serverRecords.map((record) => [record.id, record]));
      // Only add queued records that are not already present in Firestore. If a
      // conflicting server record exists, leave the server version visible and
      // keep the local version in the conflict workflow rather than masking it.
      for (const record of queuedRecords) {
        if (!byId.has(record.id)) byId.set(record.id, record);
      }
      setSalaryHistory([...byId.values()].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)));
      if (serverResult.status === 'rejected') {
        setError(queuedRecords.length
          ? 'Could not reach salary history on the server. Pending local salary records are shown and will retry sync.'
          : 'Salary history could not be loaded from the server.');
      } else {
        setError(null);
        if (queuedRecords.length) {
          setSaveNotice('Pending salary records are saved on this device and waiting for sync or conflict review.');
        }
      }
      if (queueResult.status === 'rejected') {
        setSaveNotice('The offline queue could not be checked. Keep this device and retry when storage is available.');
      }
    };
    void loadHistory();
    return () => { cancelled = true; };
  }, [employee.id, actorUid]);

  const gratuity = contract.contractStartDate && calculationEndDate
    ? (() => {
        try {
          return calculateGratuity({ id: employee.id, employeeCategory: contract.employeeCategory, contractStartDate: contract.contractStartDate, employmentPeriodId: employee.employmentPeriods?.[0]?.id }, calculationEndDate, salaryHistory);
        } catch {
          return null;
        }
      })()
    : null;
  const currentSalary = salaryHistory.filter((record) => record.effectiveDate <= calculationEndDate).at(-1)?.salaryAmount;

  const saveContract = async () => {
    if (!canEdit) return;
    if (!contract.contractStartDate) { setError('Contract start date is required.'); return; }
    setSaving(true); setError(null);
    try {
      const originalStart = employee.originalContractStartDate || employee.contractStartDate || contract.contractStartDate;
      const existingPeriods = employee.employmentPeriods || [];
      const isExtension = contract.contractStatus === 'Renewed' &&
        Boolean(employee.contractEndDate) && contract.contractEndDate !== employee.contractEndDate;
      const period: EmploymentPeriod = {
        id: isExtension ? `employment-${employee.id}-${Date.now()}` : existingPeriods[0]?.id || `employment-${employee.id}-1`,
        startDate: contract.contractStartDate,
        endDate: contract.contractEndDate || undefined,
        contractType: contract.contractType || undefined,
        duration: contract.contractDuration || undefined,
        renewalInformation: contract.renewalInformation || undefined,
        status: contract.contractStatus,
      };
      const updates: Partial<EmployeeContractFields> = { ...contract, originalContractStartDate: originalStart, employmentPeriods: [period, ...existingPeriods.filter((item) => item.id !== period.id)] };
      await onUpdate(employee.id, updates);
      await appendEmployeeAuditLog({ employeeId: employee.id, action: 'contract_change', actorUid, actorName, changedAt: new Date().toISOString(), changes: updates });
      setCalculationEndDate(contract.contractEndDate || calculationEndDate);
    } catch (err: any) { setError(err.message || 'Contract could not be saved.'); }
    finally { setSaving(false); }
  };

  const addSalary = async () => {
    if (!canEdit) return;
    setSaveNotice(null);
    const amount = Number(salary.amount);
    if (!salary.effectiveDate || !Number.isFinite(amount) || amount <= 0) { setError('Enter a positive salary and effective date.'); return; }
    setSaving(true); setError(null);
    try {
      const previousSalary = salaryHistory.filter((record) => record.effectiveDate < salary.effectiveDate).at(-1)?.salaryAmount;
      const now = new Date().toISOString();
      const record: SalaryHistoryRecord = {
        id: `salary-${employee.id}-${salary.effectiveDate}-${Date.now()}`,
        employeeId: employee.id,
        effectiveDate: salary.effectiveDate,
        salaryAmount: amount,
        salaryFrequency: salary.frequency,
        previousSalary,
        reasonForChange: salary.reason,
        recordedBy: actorName,
        recordedDate: now,
        notes: salary.notes || undefined,
        auditMetadata: { createdAt: now, createdByUid: actorUid },
        employmentPeriodId: employee.employmentPeriods?.[0]?.id,
      };
      const auditId = `salary-audit-${record.id}`;
      const auditRecord = {
        id: auditId,
        employeeId: employee.id,
        action: 'salary_creation',
        actorUid,
        actorName,
        changedAt: now,
        recordId: record.id,
      };
      // Persist both the append-only salary record and its audit event in one
      // durable, account-scoped queue operation before showing local success.
      await queueOfflineRecordsForSync([
        { collection: COLLECTIONS.EMPLOYEE_SALARY_HISTORY, record },
        { collection: COLLECTIONS.EMPLOYEE_AUDIT_LOGS, record: auditRecord },
      ], actorUid);
      setSalaryHistory((history) =>
        history.some((item) => item.id === record.id)
          ? history
          : [...history, record].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
      );
      setSalary({ amount: '', effectiveDate: '', frequency: 'Monthly', reason: '', notes: '' });
      setSaveNotice('Salary record saved on this device and queued for sync.');
      // Attempt the normal conflict-aware queue immediately when online. The
      // global reconnect handler will retry any remaining entries later.
      try {
        const flush = await flushPendingOfflineSnapshots({ actor: { uid: actorUid, name: actorName } });
        const salaryConflict = flush.conflicts.some((conflict) =>
          (conflict.collection === COLLECTIONS.EMPLOYEE_SALARY_HISTORY && conflict.recordId === record.id) ||
          (conflict.collection === COLLECTIONS.EMPLOYEE_AUDIT_LOGS && conflict.recordId === auditId)
        );
        if (flush.flushed && !salaryConflict) {
          setSaveNotice('Salary record and audit entry synced successfully.');
        } else if (salaryConflict) {
          setSaveNotice('Salary record is saved locally, but a server conflict needs review before it can sync.');
        }
      } catch {
        // Queue persistence already succeeded; keep the saved entry and tell the
        // user it remains pending instead of reporting the salary as lost.
        setSaveNotice('Salary record saved on this device; sync is pending and will retry.');
      }
    } catch (err: any) { setError(err.message || 'Salary record could not be saved.'); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
    <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-stone-200 my-4">
      <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
        <div><h2 className="text-lg font-black text-stone-900">Employee Contract & Gratuity</h2><p className="text-xs text-stone-500">{employee.fullName} · Employee ID: {employee.id}</p></div>
        <button type="button" onClick={onClose} title="Close"><X className="w-5 h-5 text-stone-500" /></button>
      </div>
      {error && <div role="alert" className="mb-3 p-2 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg">{error}</div>}
      {saveNotice && <div role="status" className="mb-3 p-2 bg-amber-50 border border-amber-200 text-xs text-amber-900 rounded-lg">{saveNotice}</div>}
      {!contractDetailsAvailable && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Contract details are not recorded for this historical payroll entry.</p>}
      <div className="grid md:grid-cols-2 gap-5">
        {contractDetailsAvailable && <section className="space-y-3">
          <h3 className="font-bold text-sm text-teal-900">Contract information</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-stone-600">Position<input className="field" value={contract.position} onChange={(e) => setContract({ ...contract, position: e.target.value })} /></label>
            <label className="text-xs text-stone-600">Category<select className="field" value={contract.employeeCategory} onChange={(e) => setContract({ ...contract, employeeCategory: e.target.value as EmployeeCategory })}><option value="Ground Worker/Gardener">Gardener (5%)</option><option value="Other Staff">Other staff (10%)</option></select></label>
            <label className="text-xs text-stone-600">Contract start<input type="date" className="field" value={contract.contractStartDate} onChange={(e) => setContract({ ...contract, contractStartDate: e.target.value })} /></label>
            <label className="text-xs text-stone-600">Contract end<input type="date" className="field" value={contract.contractEndDate} onChange={(e) => { setContract({ ...contract, contractEndDate: e.target.value }); setCalculationEndDate(e.target.value); }} /></label>
            <label className="text-xs text-stone-600">Contract type<input className="field" value={contract.contractType} onChange={(e) => setContract({ ...contract, contractType: e.target.value })} /></label>
            <label className="text-xs text-stone-600">Duration<input className="field" value={contract.contractDuration} onChange={(e) => setContract({ ...contract, contractDuration: e.target.value })} /></label>
            <label className="text-xs text-stone-600">Contract status<select className="field" value={contract.contractStatus} onChange={(e) => setContract({ ...contract, contractStatus: e.target.value as ContractStatus })}>{contractStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label className="text-xs text-stone-600">Employment status<select className="field" value={contract.employmentStatus} onChange={(e) => setContract({ ...contract, employmentStatus: e.target.value as EmploymentStatus })}><option>Active</option><option>On Leave</option><option>Completed</option><option>Terminated</option><option>Resigned</option></select></label>
          </div>
          <label className="text-xs text-stone-600">Renewal information<textarea className="field" value={contract.renewalInformation} onChange={(e) => setContract({ ...contract, renewalInformation: e.target.value })} /></label>
          {canEdit && <button type="button" onClick={saveContract} disabled={saving} className="inline-flex items-center gap-2 px-3 py-2 bg-teal-900 text-white rounded-lg text-xs font-bold"><Save className="w-4 h-4" />{contract.contractStartDate ? 'Save contract' : 'Add contract'}</button>}
        </section>}
        <section className="space-y-3">
          <h3 className="font-bold text-sm text-teal-900">Salary history</h3>
          {canEdit && <div className="grid grid-cols-2 gap-2 p-3 bg-stone-50 rounded-lg"><input className="field" type="number" min="0.01" placeholder="Salary (MWK)" value={salary.amount} onChange={(e) => setSalary({ ...salary, amount: e.target.value })} /><input className="field" type="date" value={salary.effectiveDate} onChange={(e) => setSalary({ ...salary, effectiveDate: e.target.value })} /><select className="field" value={salary.frequency} onChange={(e) => setSalary({ ...salary, frequency: e.target.value as SalaryFrequency })}><option>Monthly</option><option>Weekly</option><option>Daily</option><option>Annual</option></select><input className="field" placeholder="Reason for change" value={salary.reason} onChange={(e) => setSalary({ ...salary, reason: e.target.value })} /><input className="field col-span-2" placeholder="Notes" value={salary.notes} onChange={(e) => setSalary({ ...salary, notes: e.target.value })} /><button type="button" onClick={addSalary} disabled={saving} className="col-span-2 inline-flex justify-center items-center gap-2 px-3 py-2 bg-amber-500 text-teal-950 rounded-lg text-xs font-bold"><DollarSign className="w-4 h-4" />Add salary record</button></div>}
          <div className="max-h-36 overflow-y-auto border border-stone-200 rounded-lg"><table className="w-full text-xs"><thead className="bg-stone-50"><tr><th className="p-2 text-left">Effective</th><th className="p-2 text-right">Salary</th><th className="p-2 text-left">Reason</th></tr></thead><tbody>{salaryHistory.map((record) => <tr key={record.id} className="border-t border-stone-100"><td className="p-2">{record.effectiveDate}</td><td className="p-2 text-right">MWK {record.salaryAmount.toLocaleString()}</td><td className="p-2">{record.reasonForChange || 'Initial salary'}</td></tr>)}</tbody></table></div>
        </section>
      </div>
      {contractDetailsAvailable && <section className="mt-5 border-t border-stone-100 pt-4"><div className="flex flex-wrap items-end gap-4"><div><label className="text-xs text-stone-600">Calculation/end date<input type="date" className="field" value={calculationEndDate} onChange={(e) => setCalculationEndDate(e.target.value)} /></label></div><div className="text-xs"><div>Employee: {employee.fullName}</div><div>Position: {contract.position || 'Not set'}</div><div>Category: {contract.employeeCategory}</div><div>Contract start: {contract.contractStartDate || 'Not set'}</div></div><div className="text-xs"><div>Total months employed: <strong>{gratuity?.employmentMonths ?? 0}</strong></div><div>Gratuity rate: <strong>{((gratuity?.rate ?? (contract.employeeCategory === 'Ground Worker/Gardener' ? 0.05 : 0.1)) * 100).toFixed(0)}%</strong></div><div>Current salary: <strong>{currentSalary ? `MWK ${currentSalary.toLocaleString()}` : 'Not recorded'}</strong></div><div>Total accrued gratuity: <strong>MWK {(gratuity?.totalGratuity ?? 0).toLocaleString()}</strong></div></div></div><div className="mt-3 overflow-x-auto"><table className="w-full text-xs"><thead className="bg-teal-50"><tr><th className="p-2 text-left">Salary period</th><th className="p-2 text-right">Salary</th><th className="p-2 text-right">Months</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Gratuity</th></tr></thead><tbody>{gratuity?.salaryPeriods.map((period) => <tr key={`${period.startDate}-${period.salary}`} className="border-t border-stone-100"><td className="p-2">{period.startDate} to {period.endDate}</td><td className="p-2 text-right">MWK {period.salary.toLocaleString()}</td><td className="p-2 text-right">{period.months.toFixed(2)}</td><td className="p-2 text-right">{(period.rate * 100).toFixed(0)}%</td><td className="p-2 text-right font-bold">MWK {period.gratuity.toLocaleString()}</td></tr>)}</tbody></table></div></section>}
    </div>
    <style>{`.field { display: block; width: 100%; margin-top: 0.25rem; padding: 0.4rem 0.5rem; border: 1px solid #d6d3d1; border-radius: 0.5rem; background: #fafaf9; font-size: 0.75rem; color: #292524; } textarea.field { min-height: 3.5rem; }`}</style>
  </div>;
};
