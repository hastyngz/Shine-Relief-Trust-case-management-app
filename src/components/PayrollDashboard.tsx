import React, { useMemo, useState } from 'react';
import { ArrowDownUp, BadgeDollarSign, BriefcaseBusiness, CalendarRange, Filter, Pencil, Plus, Trash2, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppDatabase, PayrollRecord, PayrollPaymentStatus } from '../types';
import { addPayrollRecord, deletePayrollRecord, updatePayrollRecord } from '../utils/storage';

interface PayrollDashboardProps {
  db: AppDatabase;
  onRefresh: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const PayrollDashboard: React.FC<PayrollDashboardProps> = ({ db, onRefresh }) => {
  const { isAdmin, role, isViewOnly, currentUser, staffProfile } = useAuth();
  const [financialYear, setFinancialYear] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [employeeFilter, setEmployeeFilter] = useState<string>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  const [showPayrollModal, setShowPayrollModal] = useState<boolean>(false);
  const [editingPayroll, setEditingPayroll] = useState<PayrollRecord | null>(null);

  const canViewPayroll = isAdmin || role === 'Manager' || !isViewOnly;

  const records: PayrollRecord[] = db.payrollRecords || [];

  const financialYears = useMemo(() => Array.from(new Set(records.map((record) => record.payPeriodStartDate.slice(0, 4)))).sort().reverse(), [records]);
  const employees = useMemo(() => Array.from(new Set(records.map((record) => record.employeeName))).sort(), [records]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    if (financialYear !== 'ALL' && !record.payPeriodStartDate.startsWith(financialYear)) return false;
    if (monthFilter !== 'ALL' && Number(record.payPeriodStartDate.slice(5, 7)) !== Number(monthFilter)) return false;
    if (employeeFilter !== 'ALL' && record.employeeName !== employeeFilter) return false;
    if (paymentStatusFilter !== 'ALL' && record.paymentStatus !== paymentStatusFilter) return false;
    return true;
  }), [records, financialYear, monthFilter, employeeFilter, paymentStatusFilter]);

  const totals = useMemo(() => {
    const expected = filteredRecords.reduce((sum, record) => sum + (record.expectedAmount || 0), 0);
    const paid = filteredRecords.reduce((sum, record) => sum + (record.amountPaid || 0), 0);
    const unpaid = filteredRecords.filter((record) => record.paymentStatus === 'Unpaid').length;
    const partiallyPaid = filteredRecords.filter((record) => record.paymentStatus === 'Partially Paid').length;
    const outstanding = filteredRecords.reduce((sum, record) => sum + Math.max((record.expectedAmount || 0) - (record.amountPaid || 0), 0), 0);
    const employeeCount = new Set(filteredRecords.map((record) => record.employeeId)).size;
    return { expected, paid, unpaid, partiallyPaid, outstanding, employeeCount };
  }, [filteredRecords]);

  const handleSavePayroll = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const employeeName = String(fd.get('employeeName') || '').trim();
    const employeeId = String(fd.get('employeeId') || '').trim() || employeeName || 'staff-unknown';
    const departmentOrProgramme = String(fd.get('departmentOrProgramme') || '').trim();
    const payPeriod = String(fd.get('payPeriod') || '').trim();
    const payPeriodStartDate = String(fd.get('payPeriodStartDate') || '').trim();
    const payPeriodEndDate = String(fd.get('payPeriodEndDate') || '').trim();
    const applicableSalary = Number(fd.get('applicableSalary') || 0);
    const expectedAmount = Number(fd.get('expectedAmount') || 0);
    const amountPaid = Number(fd.get('amountPaid') || 0);
    const paymentStatus = (fd.get('paymentStatus') as PayrollPaymentStatus) || 'Unpaid';
    const paymentMethod = String(fd.get('paymentMethod') || '').trim() || 'Bank transfer';
    const notes = String(fd.get('notes') || '').trim();

    if (!employeeName || !payPeriod || !payPeriodStartDate || !payPeriodEndDate) {
      return;
    }

    const payload = {
      employeeId,
      employeeName,
      departmentOrProgramme: departmentOrProgramme || 'General programme',
      payPeriod,
      payPeriodStartDate,
      payPeriodEndDate,
      applicableSalary,
      salaryHistoryRecordIds: editingPayroll?.salaryHistoryRecordIds || [],
      expectedAmount,
      amountPaid,
      paymentStatus,
      paymentMethod: paymentMethod as any,
      notes,
      createdBy: staffProfile?.fullName || 'SHINE Staff',
      updatedBy: staffProfile?.fullName || 'SHINE Staff',
      createdByUid: currentUser?.uid || 'system',
      updatedByUid: currentUser?.uid || 'system',
    };

    if (editingPayroll) {
      updatePayrollRecord(editingPayroll.id, payload, staffProfile?.fullName || 'SHINE Staff', currentUser?.uid || 'system');
    } else {
      addPayrollRecord(payload, staffProfile?.fullName || 'SHINE Staff', currentUser?.uid || 'system');
    }

    setShowPayrollModal(false);
    setEditingPayroll(null);
    onRefresh();
  };

  if (!canViewPayroll) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center shadow-sm">
          <UserCheck className="w-10 h-10 text-stone-400 mx-auto mb-3" />
          <h2 className="text-xl font-black text-stone-900 mb-2">Payroll Access Restricted</h2>
          <p className="text-sm text-stone-600">Only authorized managers and administrators can access payroll records.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-teal-100 text-teal-800"><BadgeDollarSign className="w-5 h-5" /></span>
              <h1 className="text-xl font-black text-stone-900">Employee Payroll</h1>
            </div>
            <p className="text-xs text-stone-500">Track expected payroll, actual payments, and outstanding payroll by employee.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingPayroll(null);
                setShowPayrollModal(true);
              }}
              className="px-3 py-2 bg-teal-800 text-white rounded-lg text-xs font-bold"
            >
              <span className="inline-flex items-center gap-2"><Plus className="w-3.5 h-3.5" /> Add payroll record</span>
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-2 bg-stone-100 border border-stone-200 rounded-lg text-xs font-bold text-stone-700"
            >
              Refresh payroll
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-stone-500">Total expected</div>
          <div className="mt-2 text-2xl font-black text-stone-900">MWK {totals.expected.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-stone-500">Total paid</div>
          <div className="mt-2 text-2xl font-black text-emerald-700">MWK {totals.paid.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-stone-500">Outstanding</div>
          <div className="mt-2 text-2xl font-black text-amber-700">MWK {totals.outstanding.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-stone-500">Employees</div>
          <div className="mt-2 text-2xl font-black text-teal-700">{totals.employeeCount}</div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-xs text-stone-600">
            <Filter className="w-4 h-4" />
            Filters
          </div>
          <select className="field" value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>
            <option value="ALL">All financial years</option>
            {financialYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <select className="field" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="ALL">All months</option>
            {MONTHS.map((month, index) => (
              <option key={month} value={String(index + 1)}>{month}</option>
            ))}
          </select>
          <select className="field" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="ALL">All staff</option>
            {employees.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select className="field" value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}>
            <option value="ALL">All payment statuses</option>
            {['Paid', 'Partially Paid', 'Unpaid', 'Pending'].map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-stone-200 bg-stone-50 text-xs font-bold uppercase tracking-wide text-stone-600 flex items-center gap-2">
          <BriefcaseBusiness className="w-4 h-4" />
          Payroll records
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-50 text-stone-600">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Pay period</th>
                <th className="px-4 py-3">Applicable salary</th>
                <th className="px-4 py-3">Expected</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-stone-500">
                    No payroll records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-stone-900">{record.employeeName}</div>
                      <div className="text-xs text-stone-500">{record.departmentOrProgramme || 'General'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-800">{record.payPeriod}</div>
                      <div className="text-xs text-stone-500">{record.payPeriodStartDate} → {record.payPeriodEndDate}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-700">MWK {record.applicableSalary.toLocaleString()}</td>
                    <td className="px-4 py-3 text-stone-700">MWK {record.expectedAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-stone-700">MWK {record.amountPaid.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold border ${
                        record.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                        record.paymentStatus === 'Partially Paid' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        record.paymentStatus === 'Pending' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                        'bg-rose-100 text-rose-800 border-rose-200'
                      }`}>
                        {record.paymentStatus}
                      </span>
                    </td>
                    {(isAdmin || role === 'Manager') && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPayroll(record);
                              setShowPayrollModal(true);
                            }}
                            className="p-1.5 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200"
                            aria-label={`Edit payroll for ${record.employeeName}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete payroll record for ${record.employeeName}?`)) {
                                deletePayrollRecord(record.id);
                                onRefresh();
                              }
                            }}
                            className="p-1.5 rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200"
                            aria-label={`Delete payroll for ${record.employeeName}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPayrollModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-4">
              {editingPayroll ? 'Edit Payroll Record' : 'Add Payroll Record'}
            </h3>
            <form onSubmit={handleSavePayroll} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Employee name</label>
                  <input name="employeeName" required defaultValue={editingPayroll?.employeeName || ''} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Employee ID</label>
                  <input name="employeeId" defaultValue={editingPayroll?.employeeId || ''} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Department / programme</label>
                  <input name="departmentOrProgramme" defaultValue={editingPayroll?.departmentOrProgramme || ''} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Pay period</label>
                  <input name="payPeriod" required defaultValue={editingPayroll?.payPeriod || ''} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Start date</label>
                  <input name="payPeriodStartDate" type="date" required defaultValue={editingPayroll?.payPeriodStartDate || ''} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">End date</label>
                  <input name="payPeriodEndDate" type="date" required defaultValue={editingPayroll?.payPeriodEndDate || ''} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Applicable salary</label>
                  <input name="applicableSalary" type="number" step="any" defaultValue={editingPayroll?.applicableSalary || 0} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Expected amount</label>
                  <input name="expectedAmount" type="number" step="any" defaultValue={editingPayroll?.expectedAmount || 0} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Amount paid</label>
                  <input name="amountPaid" type="number" step="any" defaultValue={editingPayroll?.amountPaid || 0} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Payment status</label>
                  <select name="paymentStatus" defaultValue={editingPayroll?.paymentStatus || 'Pending'} className="w-full text-xs border border-stone-300 rounded-lg p-2">
                    <option value="Pending">Pending</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Paid">Paid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Payment method</label>
                  <select name="paymentMethod" defaultValue={editingPayroll?.paymentMethod || 'Bank transfer'} className="w-full text-xs border border-stone-300 rounded-lg p-2">
                    <option value="Bank transfer">Bank transfer</option>
                    <option value="Mobile money">Mobile money</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Notes</label>
                <textarea name="notes" rows={2} defaultValue={editingPayroll?.notes || ''} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button type="button" onClick={() => { setShowPayrollModal(false); setEditingPayroll(null); }} className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900">{editingPayroll ? 'Save changes' : 'Add record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
