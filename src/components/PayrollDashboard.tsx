import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, BadgeDollarSign, BriefcaseBusiness, CalendarRange, Filter, Pencil, Plus, Trash2, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppDatabase, CaseAction, PayrollRecord, PayrollPaymentStatus, SalaryHistoryRecord } from '../types';
import { addCaseAction, addPayrollRecord, deletePayrollRecord, updateCaseAction, updatePayrollRecord } from '../utils/storage';
import { getEmployeeSalaryHistoryForStaff } from '../services/firestoreSync';
import { notifyPayrollProcessors } from '../services/messagingService';
import { buildMonthlyPayrollSummary, formatPayrollPeriod, monthlyPayrollTaskId, payrollTaskDescription, payrollTaskStatus, shouldCreateMonthlyPayrollTask } from '../services/payrollService';

interface PayrollDashboardProps {
  db: AppDatabase;
  onRefresh: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const PayrollDashboard: React.FC<PayrollDashboardProps> = ({ db, onRefresh }) => {
  const { isAdmin, role, currentUser, staffProfile, allStaff } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [showOutstandingOnly, setShowOutstandingOnly] = useState(false);
  const [paymentEmployee, setPaymentEmployee] = useState<ReturnType<typeof buildMonthlyPayrollSummary>['employees'][number] | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistoryRecord[]>([]);
  const [salaryHistoryError, setSalaryHistoryError] = useState('');
  const [payrollTaskError, setPayrollTaskError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [financialYear, setFinancialYear] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [employeeFilter, setEmployeeFilter] = useState<string>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  const [showPayrollModal, setShowPayrollModal] = useState<boolean>(false);
  const [editingPayroll, setEditingPayroll] = useState<PayrollRecord | null>(null);

  const canViewPayroll = isAdmin || role === 'Manager' || role === 'Staff';
  const canProcessPayroll = isAdmin || role === 'Manager';

  const records: PayrollRecord[] = db.payrollRecords || [];
  const employeeIds = useMemo(() => Array.from(new Set([
    ...(db.employees || []).map((employee) => employee.id),
    ...allStaff.filter((person) => person.status === 'Active').map((person) => person.id),
  ])).sort(), [db.employees, allStaff]);

  useEffect(() => {
    let cancelled = false;
    if (employeeIds.length === 0) {
      setSalaryHistory([]);
      setSalaryHistoryError('');
      return;
    }
    getEmployeeSalaryHistoryForStaff(employeeIds)
      .then((history) => {
        if (cancelled) return;
        setSalaryHistory(history);
        setSalaryHistoryError('');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('Could not load salary history for payroll calculation:', error);
        setSalaryHistoryError('Salary history could not be refreshed. Current payroll will use stored employee salaries where available.');
      });
    return () => { cancelled = true; };
  }, [employeeIds.join('|')]);

  const monthlySummary = useMemo(() => buildMonthlyPayrollSummary(
    selectedPeriod, db.employees || [], allStaff, salaryHistory, records,
  ), [selectedPeriod, db.employees, allStaff, salaryHistory, records]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const currentMonthSummary = useMemo(() => buildMonthlyPayrollSummary(
    currentPeriod, db.employees || [], allStaff, salaryHistory, records,
  ), [currentPeriod, db.employees, allStaff, salaryHistory, records]);

  useEffect(() => {
    if (!canProcessPayroll || !shouldCreateMonthlyPayrollTask(now)) return;
    const taskId = monthlyPayrollTaskId(currentPeriod);
    const dueDate = `${currentPeriod}-27`;
    const description = payrollTaskDescription(currentPeriod, dueDate, currentMonthSummary);
    const taskStatus: CaseAction['status'] = payrollTaskStatus(currentMonthSummary);
    const existing = (db.caseActions || []).find((action) => action.id === taskId || action.sourceId === taskId);
    const actor = {
      uid: currentUser?.uid || '',
      name: staffProfile?.fullName || currentUser?.displayName || 'SHINE Staff',
    };
    if (!existing) {
      const task = addCaseAction({
        id: taskId,
        title: `${formatPayrollPeriod(currentPeriod)} payroll needs to be processed.`,
        description,
        assignedStaffId: actor.uid,
        assignedStaffName: actor.name,
        sourceType: 'manual',
        sourceId: taskId,
        priority: 'High',
        status: taskStatus,
        dueDate,
      }, actor);
      setPayrollTaskError('');
      void notifyPayrollProcessors({
        period: currentPeriod,
        actorName: actor.name,
        staff: allStaff,
        message: description,
      }).catch((error: unknown) => {
        console.error('Could not notify authorized payroll processors:', error);
        setPayrollTaskError('Payroll task was created, but one or more notifications could not be delivered.');
      });
      if (!task) setPayrollTaskError('The monthly payroll task could not be saved.');
      return;
    }
    if (existing.description !== description || existing.status !== taskStatus || existing.dueDate !== dueDate) {
      updateCaseAction(existing.id, { description, status: taskStatus, dueDate }, actor);
    }
  }, [canProcessPayroll, now, currentPeriod, currentMonthSummary, db.caseActions, currentUser, staffProfile, allStaff]);

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
    if (!canProcessPayroll) return;
    setPaymentError('');
    const fd = new FormData(event.currentTarget);
    const employeeName = paymentEmployee?.employeeName || String(fd.get('employeeName') || '').trim();
    const employeeId = paymentEmployee?.employeeId || String(fd.get('employeeId') || '').trim() || employeeName || 'staff-unknown';
    const departmentOrProgramme = paymentEmployee?.department || String(fd.get('departmentOrProgramme') || '').trim();
    const payPeriod = paymentEmployee ? selectedPeriod : String(fd.get('payPeriod') || '').trim();
    const periodMatch = payPeriod.match(/^(\d{4})-(\d{2})$/);
    const payPeriodStartDate = paymentEmployee && periodMatch ? `${payPeriod}-01` : String(fd.get('payPeriodStartDate') || '').trim();
    const payPeriodEndDate = paymentEmployee && periodMatch
      ? new Date(Date.UTC(Number(periodMatch[1]), Number(periodMatch[2]), 0)).toISOString().slice(0, 10)
      : String(fd.get('payPeriodEndDate') || '').trim();
    const applicableSalary = paymentEmployee?.applicableSalary ?? Number(fd.get('applicableSalary') || 0);
    const allowancesMWK = Number(fd.get('allowancesMWK') || 0);
    const deductionsMWK = Number(fd.get('deductionsMWK') || 0);
    const expectedAmount = paymentEmployee
      ? Math.max(applicableSalary + allowancesMWK - deductionsMWK, 0)
      : Number(fd.get('expectedAmount') || 0);
    const paymentAmount = Number(fd.get('amountPaid') || 0);
    const previousPaid = paymentEmployee?.payment?.amountPaid || 0;
    const amountPaid = paymentEmployee ? previousPaid + paymentAmount : paymentAmount;
    const paymentStatus = paymentEmployee
      ? amountPaid >= expectedAmount && amountPaid > 0
        ? 'Paid' as const
        : amountPaid > 0 ? 'Partially Paid' as const : 'Pending' as const
      : (fd.get('paymentStatus') as PayrollPaymentStatus) || 'Unpaid';
    const paymentMethod = String(fd.get('paymentMethod') || '').trim() || 'Bank transfer';
    const paymentReference = String(fd.get('paymentReference') || '').trim();
    const datePaid = String(fd.get('datePaid') || '').trim();
    const notes = String(fd.get('notes') || '').trim();

    if (!employeeName || !payPeriod || !payPeriodStartDate || !payPeriodEndDate) {
      setPaymentError('Employee and payroll period are required.');
      return;
    }
    if (paymentEmployee && (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || !datePaid)) {
      setPaymentError('Enter a positive payment amount and confirm the payment date.');
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
      salaryHistoryRecordIds: editingPayroll?.salaryHistoryRecordIds || salaryHistory
        .filter((record) => record.employeeId === employeeId && record.effectiveDate <= payPeriodEndDate)
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
        .slice(0, 1)
        .map((record) => record.id),
      expectedAmount,
      amountPaid,
      paymentStatus,
      paymentMethod: paymentMethod as PayrollRecord['paymentMethod'],
      paymentReference: paymentReference || undefined,
      datePaid: datePaid || editingPayroll?.datePaid,
      allowancesMWK,
      deductionsMWK,
      notes,
      createdBy: staffProfile?.fullName || 'SHINE Staff',
      updatedBy: staffProfile?.fullName || 'SHINE Staff',
      createdByUid: currentUser?.uid || 'system',
      updatedByUid: currentUser?.uid || 'system',
    };

    if (editingPayroll && paymentEmployee) {
      updatePayrollRecord(editingPayroll.id, payload, staffProfile?.fullName || 'SHINE Staff', currentUser?.uid || 'system');
    } else if (editingPayroll) {
      updatePayrollRecord(editingPayroll.id, payload, staffProfile?.fullName || 'SHINE Staff', currentUser?.uid || 'system');
    } else {
      addPayrollRecord({
        ...payload,
        id: paymentEmployee ? `PAY-${encodeURIComponent(employeeId)}-${payPeriod}` : undefined,
      }, staffProfile?.fullName || 'SHINE Staff', currentUser?.uid || 'system');
    }

    setShowPayrollModal(false);
    setEditingPayroll(null);
    setPaymentEmployee(null);
    setPaymentError('');
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
            {canProcessPayroll && <button
              type="button"
              onClick={() => {
                setEditingPayroll(null);
                setPaymentEmployee(null);
                setPaymentError('');
                setShowPayrollModal(true);
              }}
              className="px-3 py-2 bg-teal-800 text-white rounded-lg text-xs font-bold"
            >
              <span className="inline-flex items-center gap-2"><Plus className="w-3.5 h-3.5" /> Add payroll record</span>
            </button>}
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

      <section className="space-y-4 rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="Monthly payroll">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-stone-900">{formatPayrollPeriod(selectedPeriod)} Payroll</h2>
            <p className="mt-1 text-xs text-stone-600">Each active employee is tracked separately. Imported monthly amounts remain Pending until payment is explicitly confirmed.</p>
          </div>
          <label className="text-xs font-semibold text-stone-700">Payroll period
            <input className="field mt-1 block" type="month" value={selectedPeriod} onChange={(event) => { setSelectedPeriod(event.target.value); setShowOutstandingOnly(false); }} />
          </label>
        </div>
        {salaryHistoryError && <p role="status" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{salaryHistoryError}</p>}
        {payrollTaskError && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-900">{payrollTaskError}</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Employees due', monthlySummary.employees.length],
            ['Expected payroll', `MWK ${monthlySummary.expectedTotal.toLocaleString()}`],
            ['Paid', `${monthlySummary.paidCount} · MWK ${monthlySummary.paidTotal.toLocaleString()}`],
            ['Outstanding', monthlySummary.outstandingCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-stone-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
              <div className="mt-1 text-lg font-black text-stone-900">{value}</div>
            </div>
          ))}
          <button type="button" onClick={() => setShowOutstandingOnly((value) => !value)} className={`rounded-xl p-3 text-left ${showOutstandingOnly ? 'bg-amber-100' : 'bg-amber-50 hover:bg-amber-100'}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Outstanding amount · click to filter</div>
            <div className="mt-1 text-lg font-black text-amber-900">MWK {monthlySummary.outstandingTotal.toLocaleString()}</div>
          </button>
          <div className="rounded-xl bg-emerald-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Task status</div>
            <div className="mt-1 text-lg font-black text-emerald-900">
              {monthlySummary.outstandingCount === 0 && monthlySummary.employees.length > 0 ? 'Completed' : monthlySummary.paidCount > 0 ? 'In Progress' : 'Open'}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase text-stone-600">
              <tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Applicable salary</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">Outstanding</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th></tr>
            </thead>
            <tbody>
              {monthlySummary.employees.filter((employee) => !showOutstandingOnly || employee.status !== 'Paid').map((employee) => (
                <tr key={employee.employeeId} className="border-t border-stone-100">
                  <td className="px-3 py-2"><strong>{employee.employeeName}</strong><div className="text-xs text-stone-500">{employee.positionTitle || employee.department || 'Employee'}</div></td>
                  <td className="px-3 py-2">MWK {employee.applicableSalary.toLocaleString()}</td>
                  <td className="px-3 py-2">MWK {employee.paidAmount.toLocaleString()}</td>
                  <td className="px-3 py-2">MWK {employee.outstandingAmount.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${employee.status === 'Paid' ? 'bg-emerald-100 text-emerald-900' : employee.status === 'Partially Paid' ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'}`}>{employee.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    {employee.status === 'Paid'
                      ? <span className="font-bold text-emerald-800" aria-label={`${employee.employeeName} paid`}>✓ Paid</span>
                      : canProcessPayroll && <button type="button" onClick={() => {
                        setPaymentError('');
                        setPaymentEmployee(employee);
                        setEditingPayroll(employee.payment || null);
                        setShowPayrollModal(true);
                      }} className="rounded bg-teal-800 px-3 py-1.5 text-xs font-bold text-white">{employee.status === 'Partially Paid' ? 'Record balance' : 'Paid'}</button>}
                  </td>
                </tr>
              ))}
              {monthlySummary.employees.filter((employee) => !showOutstandingOnly || employee.status !== 'Paid').length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-stone-500">
                  {showOutstandingOnly ? 'No outstanding employees for this period.' : 'No active payroll-ready employees have a salary for this period.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {(db.employees || []).filter((employee) => employee.employmentStatus === 'Completed').length > 0 && (
          <p className="text-xs text-amber-900">{(db.employees || []).filter((employee) => employee.employmentStatus === 'Completed').length} former employee(s) remain available in historical payroll.</p>
        )}
      </section>

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
              {paymentEmployee ? `Record payment · ${paymentEmployee.employeeName}` : editingPayroll ? 'Edit Payroll Record' : 'Add Payroll Record'}
            </h3>
            <form onSubmit={handleSavePayroll} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Employee name</label>
                  <input name="employeeName" required defaultValue={paymentEmployee?.employeeName || editingPayroll?.employeeName || ''} readOnly={!!paymentEmployee} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Employee ID</label>
                  <input name="employeeId" defaultValue={paymentEmployee?.employeeId || editingPayroll?.employeeId || ''} readOnly={!!paymentEmployee} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Department / programme</label>
                  <input name="departmentOrProgramme" defaultValue={paymentEmployee?.department || editingPayroll?.departmentOrProgramme || ''} readOnly={!!paymentEmployee} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Pay period</label>
                  <input name="payPeriod" required defaultValue={paymentEmployee ? selectedPeriod : editingPayroll?.payPeriod || ''} readOnly={!!paymentEmployee} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Start date</label>
                  <input name="payPeriodStartDate" type="date" required defaultValue={paymentEmployee ? `${selectedPeriod}-01` : editingPayroll?.payPeriodStartDate || ''} readOnly={!!paymentEmployee} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">End date</label>
                  <input name="payPeriodEndDate" type="date" required defaultValue={paymentEmployee ? new Date(Date.UTC(Number(selectedPeriod.slice(0, 4)), Number(selectedPeriod.slice(5, 7)), 0)).toISOString().slice(0, 10) : editingPayroll?.payPeriodEndDate || ''} readOnly={!!paymentEmployee} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Applicable salary</label>
                  <input name="applicableSalary" type="number" step="any" defaultValue={paymentEmployee?.applicableSalary || editingPayroll?.applicableSalary || 0} readOnly={!!paymentEmployee} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Expected amount</label>
                  <input name="expectedAmount" type="number" step="any" defaultValue={editingPayroll?.expectedAmount || paymentEmployee?.applicableSalary || 0} readOnly={!!paymentEmployee} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">{paymentEmployee ? 'Amount paid now' : 'Amount paid'}</label>
                  <input name="amountPaid" type="number" step="any" min="0" defaultValue={paymentEmployee ? Math.max((paymentEmployee.payment?.expectedAmount || paymentEmployee.applicableSalary) - paymentEmployee.paidAmount, 0) : editingPayroll?.amountPaid || 0} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                </div>
              </div>

              {paymentEmployee && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Allowances (MWK)</label>
                    <input name="allowancesMWK" type="number" min="0" step="any" defaultValue={editingPayroll?.allowancesMWK || 0} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Deductions (MWK)</label>
                    <input name="deductionsMWK" type="number" min="0" step="any" defaultValue={editingPayroll?.deductionsMWK || 0} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Payment date</label>
                    <input name="datePaid" type="date" required defaultValue={editingPayroll?.datePaid || new Date().toISOString().slice(0, 10)} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Reference number</label>
                    <input name="paymentReference" defaultValue={editingPayroll?.paymentReference || ''} className="w-full text-xs border border-stone-300 rounded-lg p-2" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Payment status</label>
                  <select name="paymentStatus" defaultValue={paymentEmployee ? 'Pending' : editingPayroll?.paymentStatus || 'Pending'} disabled={!!paymentEmployee} className="w-full text-xs border border-stone-300 rounded-lg p-2">
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

              {paymentError && <p role="alert" className="text-xs font-semibold text-rose-800">{paymentError}</p>}
              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button type="button" onClick={() => { setShowPayrollModal(false); setEditingPayroll(null); setPaymentEmployee(null); setPaymentError(''); }} className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-1.5 text-xs font-bold bg-teal-800 text-white rounded-lg hover:bg-teal-900">{editingPayroll ? 'Save changes' : 'Add record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
