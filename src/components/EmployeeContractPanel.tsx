import React, { useEffect, useState } from 'react';
import { CalendarDays, DollarSign, Save, X } from 'lucide-react';
import { StaffUser, ContractStatus, EmployeeCategory, EmploymentStatus, SalaryFrequency, SalaryHistoryRecord, EmploymentPeriod } from '../types';
import { appendEmployeeAuditLog, getEmployeeSalaryHistory, persistEmployeeSalaryHistoryToFirestore } from '../services/firestoreSync';
import { calculateGratuity } from '../services/gratuityService';

interface EmployeeContractPanelProps {
  staff: StaffUser;
  actorUid: string;
  actorName: string;
  canEdit: boolean;
  onUpdate: (staffId: string, updates: Partial<StaffUser>) => Promise<void>;
  onClose: () => void;
}

const contractStatuses: ContractStatus[] = ['Active', 'Expiring Soon', 'Expired', 'Renewed', 'Completed', 'Terminated', 'Resigned'];

export const EmployeeContractPanel: React.FC<EmployeeContractPanelProps> = ({ staff, actorUid, actorName, canEdit, onUpdate, onClose }) => {
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistoryRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState({
    employeeCategory: staff.employeeCategory || 'Other Staff' as EmployeeCategory,
    position: staff.position || staff.departmentOrTitle || '',
    contractStartDate: staff.contractStartDate || staff.originalContractStartDate || '',
    contractEndDate: staff.contractEndDate || '',
    contractType: staff.contractType || '',
    contractDuration: staff.contractDuration || '',
    contractStatus: staff.contractStatus || 'Active' as ContractStatus,
    renewalInformation: staff.renewalInformation || '',
    employmentStatus: staff.employmentStatus || 'Active' as EmploymentStatus,
  });
  const [salary, setSalary] = useState({ amount: '', effectiveDate: '', frequency: 'Monthly' as SalaryFrequency, reason: '', notes: '' });
  const [calculationEndDate, setCalculationEndDate] = useState(staff.contractEndDate || new Date().toISOString().slice(0, 10));

  useEffect(() => {
    getEmployeeSalaryHistory(staff.id).then(setSalaryHistory).catch(() => setError('Salary history could not be loaded.'));
  }, [staff.id]);

  const gratuity = contract.contractStartDate && calculationEndDate
    ? (() => {
        try {
          return calculateGratuity({ id: staff.id, employeeCategory: contract.employeeCategory, contractStartDate: contract.contractStartDate, employmentPeriodId: staff.employmentPeriods?.[0]?.id }, calculationEndDate, salaryHistory);
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
      const originalStart = staff.originalContractStartDate || staff.contractStartDate || contract.contractStartDate;
      const existingPeriods = staff.employmentPeriods || [];
      const isExtension = contract.contractStatus === 'Renewed' &&
        Boolean(staff.contractEndDate) && contract.contractEndDate !== staff.contractEndDate;
      const period: EmploymentPeriod = {
        id: isExtension ? `employment-${staff.id}-${Date.now()}` : existingPeriods[0]?.id || `employment-${staff.id}-1`,
        startDate: contract.contractStartDate,
        endDate: contract.contractEndDate || undefined,
        contractType: contract.contractType || undefined,
        duration: contract.contractDuration || undefined,
        renewalInformation: contract.renewalInformation || undefined,
        status: contract.contractStatus,
      };
      const updates: Partial<StaffUser> = { ...contract, originalContractStartDate: originalStart, employmentPeriods: [period, ...existingPeriods.filter((item) => item.id !== period.id)] };
      await onUpdate(staff.id, updates);
      await appendEmployeeAuditLog({ employeeId: staff.id, action: 'contract_change', actorUid, actorName, changedAt: new Date().toISOString(), changes: updates });
      setCalculationEndDate(contract.contractEndDate || calculationEndDate);
    } catch (err: any) { setError(err.message || 'Contract could not be saved.'); }
    finally { setSaving(false); }
  };

  const addSalary = async () => {
    if (!canEdit) return;
    const amount = Number(salary.amount);
    if (!salary.effectiveDate || !Number.isFinite(amount) || amount <= 0) { setError('Enter a positive salary and effective date.'); return; }
    setSaving(true); setError(null);
    try {
      const previousSalary = salaryHistory.filter((record) => record.effectiveDate < salary.effectiveDate).at(-1)?.salaryAmount;
      const now = new Date().toISOString();
      const record: SalaryHistoryRecord = {
        id: `salary-${staff.id}-${salary.effectiveDate}-${Date.now()}`,
        employeeId: staff.id,
        effectiveDate: salary.effectiveDate,
        salaryAmount: amount,
        salaryFrequency: salary.frequency,
        previousSalary,
        reasonForChange: salary.reason,
        recordedBy: actorName,
        recordedDate: now,
        notes: salary.notes || undefined,
        auditMetadata: { createdAt: now, createdByUid: actorUid },
        employmentPeriodId: staff.employmentPeriods?.[0]?.id,
      };
      await persistEmployeeSalaryHistoryToFirestore(record);
      await appendEmployeeAuditLog({ employeeId: staff.id, action: 'salary_creation', actorUid, actorName, changedAt: now, recordId: record.id });
      setSalaryHistory((history) => [...history, record].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)));
      setSalary({ amount: '', effectiveDate: '', frequency: 'Monthly', reason: '', notes: '' });
    } catch (err: any) { setError(err.message || 'Salary record could not be saved.'); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
    <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-stone-200 my-4">
      <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
        <div><h2 className="text-lg font-black text-stone-900">Employee Contract & Gratuity</h2><p className="text-xs text-stone-500">{staff.fullName} · Employee ID: {staff.id}</p></div>
        <button type="button" onClick={onClose} title="Close"><X className="w-5 h-5 text-stone-500" /></button>
      </div>
      {error && <div className="mb-3 p-2 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg">{error}</div>}
      <div className="grid md:grid-cols-2 gap-5">
        <section className="space-y-3">
          <h3 className="font-bold text-sm text-teal-900">Contract information</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-stone-600">Position<input className="field" value={contract.position} onChange={(e) => setContract({ ...contract, position: e.target.value })} /></label>
            <label className="text-xs text-stone-600">Category<select className="field" value={contract.employeeCategory} onChange={(e) => setContract({ ...contract, employeeCategory: e.target.value as EmployeeCategory })}><option>Ground Worker/Gardener</option><option>Other Staff</option></select></label>
            <label className="text-xs text-stone-600">Contract start<input type="date" className="field" value={contract.contractStartDate} onChange={(e) => setContract({ ...contract, contractStartDate: e.target.value })} /></label>
            <label className="text-xs text-stone-600">Contract end<input type="date" className="field" value={contract.contractEndDate} onChange={(e) => { setContract({ ...contract, contractEndDate: e.target.value }); setCalculationEndDate(e.target.value); }} /></label>
            <label className="text-xs text-stone-600">Contract type<input className="field" value={contract.contractType} onChange={(e) => setContract({ ...contract, contractType: e.target.value })} /></label>
            <label className="text-xs text-stone-600">Duration<input className="field" value={contract.contractDuration} onChange={(e) => setContract({ ...contract, contractDuration: e.target.value })} /></label>
            <label className="text-xs text-stone-600">Contract status<select className="field" value={contract.contractStatus} onChange={(e) => setContract({ ...contract, contractStatus: e.target.value as ContractStatus })}>{contractStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label className="text-xs text-stone-600">Employment status<select className="field" value={contract.employmentStatus} onChange={(e) => setContract({ ...contract, employmentStatus: e.target.value as EmploymentStatus })}><option>Active</option><option>On Leave</option><option>Completed</option><option>Terminated</option><option>Resigned</option></select></label>
          </div>
          <label className="text-xs text-stone-600">Renewal information<textarea className="field" value={contract.renewalInformation} onChange={(e) => setContract({ ...contract, renewalInformation: e.target.value })} /></label>
          {canEdit && <button type="button" onClick={saveContract} disabled={saving} className="inline-flex items-center gap-2 px-3 py-2 bg-teal-900 text-white rounded-lg text-xs font-bold"><Save className="w-4 h-4" />Save contract</button>}
        </section>
        <section className="space-y-3">
          <h3 className="font-bold text-sm text-teal-900">Salary history</h3>
          {canEdit && <div className="grid grid-cols-2 gap-2 p-3 bg-stone-50 rounded-lg"><input className="field" type="number" min="0.01" placeholder="Salary (MWK)" value={salary.amount} onChange={(e) => setSalary({ ...salary, amount: e.target.value })} /><input className="field" type="date" value={salary.effectiveDate} onChange={(e) => setSalary({ ...salary, effectiveDate: e.target.value })} /><select className="field" value={salary.frequency} onChange={(e) => setSalary({ ...salary, frequency: e.target.value as SalaryFrequency })}><option>Monthly</option><option>Weekly</option><option>Daily</option><option>Annual</option></select><input className="field" placeholder="Reason for change" value={salary.reason} onChange={(e) => setSalary({ ...salary, reason: e.target.value })} /><input className="field col-span-2" placeholder="Notes" value={salary.notes} onChange={(e) => setSalary({ ...salary, notes: e.target.value })} /><button type="button" onClick={addSalary} disabled={saving} className="col-span-2 inline-flex justify-center items-center gap-2 px-3 py-2 bg-amber-500 text-teal-950 rounded-lg text-xs font-bold"><DollarSign className="w-4 h-4" />Add salary record</button></div>}
          <div className="max-h-36 overflow-y-auto border border-stone-200 rounded-lg"><table className="w-full text-xs"><thead className="bg-stone-50"><tr><th className="p-2 text-left">Effective</th><th className="p-2 text-right">Salary</th><th className="p-2 text-left">Reason</th></tr></thead><tbody>{salaryHistory.map((record) => <tr key={record.id} className="border-t border-stone-100"><td className="p-2">{record.effectiveDate}</td><td className="p-2 text-right">MWK {record.salaryAmount.toLocaleString()}</td><td className="p-2">{record.reasonForChange || 'Initial salary'}</td></tr>)}</tbody></table></div>
        </section>
      </div>
      <section className="mt-5 border-t border-stone-100 pt-4"><div className="flex flex-wrap items-end gap-4"><div><label className="text-xs text-stone-600">Calculation/end date<input type="date" className="field" value={calculationEndDate} onChange={(e) => setCalculationEndDate(e.target.value)} /></label></div><div className="text-xs"><div>Employee: {staff.fullName}</div><div>Position: {contract.position || 'Not set'}</div><div>Category: {contract.employeeCategory}</div><div>Contract start: {contract.contractStartDate || 'Not set'}</div></div><div className="text-xs"><div>Total months employed: <strong>{gratuity?.employmentMonths ?? 0}</strong></div><div>Gratuity rate: <strong>{((gratuity?.rate ?? (contract.employeeCategory === 'Ground Worker/Gardener' ? 0.05 : 0.1)) * 100).toFixed(0)}%</strong></div><div>Current salary: <strong>{currentSalary ? `MWK ${currentSalary.toLocaleString()}` : 'Not recorded'}</strong></div><div>Total accrued gratuity: <strong>MWK {(gratuity?.totalGratuity ?? 0).toLocaleString()}</strong></div></div></div><div className="mt-3 overflow-x-auto"><table className="w-full text-xs"><thead className="bg-teal-50"><tr><th className="p-2 text-left">Salary period</th><th className="p-2 text-right">Salary</th><th className="p-2 text-right">Months</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Gratuity</th></tr></thead><tbody>{gratuity?.salaryPeriods.map((period) => <tr key={`${period.startDate}-${period.salary}`} className="border-t border-stone-100"><td className="p-2">{period.startDate} to {period.endDate}</td><td className="p-2 text-right">MWK {period.salary.toLocaleString()}</td><td className="p-2 text-right">{period.months.toFixed(2)}</td><td className="p-2 text-right">{(period.rate * 100).toFixed(0)}%</td><td className="p-2 text-right font-bold">MWK {period.gratuity.toLocaleString()}</td></tr>)}</tbody></table></div></section>
    </div>
    <style>{`.field { display: block; width: 100%; margin-top: 0.25rem; padding: 0.4rem 0.5rem; border: 1px solid #d6d3d1; border-radius: 0.5rem; background: #fafaf9; font-size: 0.75rem; color: #292524; } textarea.field { min-height: 3.5rem; }`}</style>
  </div>;
};
