import React, { useState } from 'react';
import { ArrowLeft, FileText, Plus, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppDatabase, EmployeeRecord } from '../types';
import { updateEmployeeRecord } from '../utils/storage';
import { EmployeeContractPanel } from './EmployeeContractPanel';

interface ContractsDashboardProps {
  db: AppDatabase;
  onRefresh: () => void;
  onBackToPayroll: () => void;
}

export const ContractsDashboard: React.FC<ContractsDashboardProps> = ({ db, onRefresh, onBackToPayroll }) => {
  const { isAdmin, role, currentUser, staffProfile } = useAuth();
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const canManageContracts = isAdmin || role === 'Manager';
  const employees = [...(db.employees || [])].sort((left, right) => left.fullName.localeCompare(right.fullName));
  const employeesWithContracts = employees.filter((employee) => Boolean(employee.contractStartDate)).length;
  const employeesWithoutContracts = employees.length - employeesWithContracts;

  if (!canManageContracts) {
    return (
      <div className="mx-auto max-w-3xl py-12 px-4">
        <div className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-rose-500" />
          <h1 className="text-lg font-bold text-stone-900">Contract access restricted</h1>
          <p className="mt-2 text-sm text-stone-600">Only payroll managers and administrators can access employee contracts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-xl font-black text-stone-900">Employee Contracts</h1>
          <p className="mt-1 text-xs text-stone-600">Contracts for employees on payroll.</p>
        </div>
        <button type="button" onClick={onBackToPayroll} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
          <ArrowLeft className="h-4 w-4" />Payroll
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-xs font-semibold text-stone-500">Payroll employees</div>
          <div className="mt-1 text-xl font-black text-stone-900">{employees.length}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-xs font-semibold text-stone-500">With contracts</div>
          <div className="mt-1 text-xl font-black text-emerald-800">{employeesWithContracts}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-xs font-semibold text-stone-500">Contract needed</div>
          <div className="mt-1 text-xl font-black text-amber-800">{employeesWithoutContracts}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-bold uppercase text-stone-600">
          <FileText className="h-4 w-4" />Employees
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs text-stone-600">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Contract period</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const hasContract = Boolean(employee.contractStartDate);
                return (
                  <tr key={employee.id} className="border-t border-stone-100">
                    <td className="px-4 py-3 font-semibold text-stone-900">{employee.fullName}</td>
                    <td className="px-4 py-3 text-stone-700">{employee.position || employee.positionTitle || employee.department || 'Not recorded'}</td>
                    <td className="px-4 py-3 text-stone-700">{hasContract ? `${employee.contractStartDate} to ${employee.contractEndDate || 'Open-ended'}` : 'No contract recorded'}</td>
                    <td className="px-4 py-3 text-stone-700">{hasContract ? employee.contractStatus || 'Active' : 'Missing'}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setSelectedEmployee(employee)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold ${hasContract ? 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50' : 'bg-teal-800 text-white hover:bg-teal-900'}`} aria-label={`${hasContract ? 'View contract' : 'Add contract'} for ${employee.fullName}`}>
                        {hasContract ? <FileText className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {hasContract ? 'View contract' : 'Add contract'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-stone-500">No payroll employees are available.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEmployee && currentUser && staffProfile && (
        <EmployeeContractPanel
          key={selectedEmployee.id}
          employee={selectedEmployee}
          actorUid={currentUser.uid}
          actorName={staffProfile.fullName}
          canEdit
          onUpdate={async (employeeId, updates) => {
            const updated = await updateEmployeeRecord(employeeId, updates, staffProfile.fullName);
            if (!updated) throw new Error('Employee record could not be found.');
            setSelectedEmployee(updated);
            onRefresh();
          }}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
};