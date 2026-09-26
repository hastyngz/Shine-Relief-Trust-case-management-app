import React, { useState } from 'react';
import { useAuth, PRIMARY_ADMIN_EMAIL } from '../contexts/AuthContext';
import { StaffUser, StaffRole, StaffStatus } from '../types';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Briefcase,
  Mail,
  Phone,
  Calendar,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
  KeyRound,
  RefreshCw,
  Lock,
  UserCheck,
} from 'lucide-react';

export const StaffManagement: React.FC = () => {
  const {
    staffProfile,
    allStaff,
    isAdmin,
    createStaffAccount,
    updateStaffAccount,
    deleteStaffAccount,
    sendResetPassword,
  } = useAuth();

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('Staff');
  const [newDepartment, setNewDepartment] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('Shine@2026!');

  // Action states
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Guard: Admin only
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-stone-900 mb-2">Access Denied</h2>
        <p className="text-sm text-stone-600 max-w-md mx-auto">
          Staff Account & Role Management is strictly restricted to SHINE Relief Trust Administrators.
          Please contact Hastings Zidana or an active Administrator if you need permission changes.
        </p>
      </div>
    );
  }

  // Filtered staff list
  const filteredStaff = allStaff.filter((staff) => {
    const matchesSearch =
      staff.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      staff.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (staff.departmentOrTitle && staff.departmentOrTitle.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole = roleFilter === 'ALL' || staff.role === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || staff.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Role badge helper
  const renderRoleBadge = (role: StaffRole) => {
    switch (role) {
      case 'Administrator':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
            Administrator
          </span>
        );
      case 'Manager':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300">
            <Shield className="w-3.5 h-3.5 text-blue-700" />
            Manager
          </span>
        );
      case 'Staff':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <Briefcase className="w-3.5 h-3.5 text-emerald-700" />
            Staff
          </span>
        );
      case 'View Only':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-100 text-stone-700 border border-stone-300">
            <Eye className="w-3.5 h-3.5 text-stone-500" />
            View Only
          </span>
        );
      default:
        return null;
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    if (!newFullName || !newEmail) {
      setActionError('Please fill in both full name and email address.');
      return;
    }

    setSubmitting(true);
    try {
      await createStaffAccount({
        fullName: newFullName,
        email: newEmail,
        role: newRole,
        departmentOrTitle: newDepartment,
        phone: newPhone,
        initialPassword: newPassword,
      });

      setActionSuccess(`Staff account created for ${newFullName} (${newRole}). An invitation email was sent.`);
      setIsAddModalOpen(false);
      // Reset form
      setNewFullName('');
      setNewEmail('');
      setNewRole('Staff');
      setNewDepartment('');
      setNewPhone('');
      setNewPassword('Shine@2026!');
    } catch (err: any) {
      setActionError(err.message || 'Failed to create staff account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (staff: StaffUser, nextRole: StaffRole) => {
    if (staff.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && nextRole !== 'Administrator') {
      alert('The primary administrator account role cannot be changed.');
      return;
    }
    try {
      await updateStaffAccount(staff.id, { role: nextRole });
      setActionSuccess(`Updated ${staff.fullName}'s role to ${nextRole}.`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update role.');
    }
  };

  const handleStatusToggle = async (staff: StaffUser) => {
    if (staff.email.toLowerCase() === PRIMARY_ADMIN_EMAIL) {
      alert('The primary administrator account cannot be suspended.');
      return;
    }
    const nextStatus: StaffStatus = staff.status === 'Active' ? 'Suspended' : 'Active';
    try {
      await updateStaffAccount(staff.id, { status: nextStatus });
      setActionSuccess(`Changed status for ${staff.fullName} to ${nextStatus}.`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to change status.');
    }
  };

  const handleSendResetLink = async (staff: StaffUser) => {
    try {
      await sendResetPassword(staff.email);
      setActionSuccess(`Dispatched password reset instructions to ${staff.email}.`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to send password reset email.');
    }
  };

  const handleDeleteStaff = async (staff: StaffUser) => {
    if (staff.email.toLowerCase() === PRIMARY_ADMIN_EMAIL) {
      alert('The primary administrator account cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove staff member ${staff.fullName}?`)) {
      return;
    }
    try {
      await deleteStaffAccount(staff.id, staff.email);
      setActionSuccess(`Staff member ${staff.fullName} removed.`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete staff member.');
    }
  };

  const updateSensitiveAccess = async (
    staff: StaffUser,
    field: 'canViewHealthRecords' | 'canEditHealthRecords' | 'canViewCaseReviews' | 'canEditCaseReviews' | 'safeguardingPermissions',
    permission?: 'canView' | 'canCreate' | 'canEdit' | 'canClose'
  ) => {
    try {
      if (field === 'safeguardingPermissions' && permission) {
        const current = staff.safeguardingPermissions || {
          canView: false,
          canCreate: false,
          canEdit: false,
          canClose: false,
        };
        await updateStaffAccount(staff.id, {
          safeguardingPermissions: { ...current, [permission]: !current[permission] },
        });
      } else {
        await updateStaffAccount(staff.id, { [field]: !staff[field] });
      }
    } catch (err: any) {
      setActionError(err.message || 'Could not update sensitive record permissions.');
    }
  };

  // Metrics
  const totalCount = allStaff.length;
  const adminCount = allStaff.filter((s) => s.role === 'Administrator').length;
  const managerCount = allStaff.filter((s) => s.role === 'Manager').length;
  const regularStaffCount = allStaff.filter((s) => s.role === 'Staff').length;
  const viewOnlyCount = allStaff.filter((s) => s.role === 'View Only').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Users className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-stone-900">
              Staff & Permissions Management
            </h1>
          </div>
          <p className="text-xs text-stone-500 max-w-2xl">
            Authorize and manage trusted SHINE Relief Trust staff. Assign precise roles (Administrator,
            Manager, Staff, View Only) backed by strict Firebase Security Rules.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setActionError(null);
            setActionSuccess(null);
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-900 hover:bg-teal-950 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-[0.98] shrink-0"
        >
          <UserPlus className="w-4 h-4 text-amber-400" />
          Invite Staff Member
        </button>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs">
          <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Total Staff</p>
          <p className="text-xl font-black text-stone-900 mt-0.5">{totalCount}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs bg-gradient-to-br from-amber-50/50 to-white">
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Administrators</p>
          <p className="text-xl font-black text-amber-900 mt-0.5">{adminCount}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-xs bg-gradient-to-br from-blue-50/50 to-white">
          <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Managers</p>
          <p className="text-xl font-black text-blue-900 mt-0.5">{managerCount}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-xs bg-gradient-to-br from-emerald-50/50 to-white">
          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Field Staff</p>
          <p className="text-xl font-black text-emerald-900 mt-0.5">{regularStaffCount}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">View Only</p>
          <p className="text-xl font-black text-stone-700 mt-0.5">{viewOnlyCount}</p>
        </div>
      </div>

      {/* Alerts */}
      {actionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, or department..."
            className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-700"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Role:</span>
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-700 font-medium"
          >
            <option value="ALL">All Roles</option>
            <option value="Administrator">Administrator</option>
            <option value="Manager">Manager</option>
            <option value="Staff">Staff</option>
            <option value="View Only">View Only</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-700 font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Staff Roster Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Department / Title</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Health Records</th>
                <th className="py-3 px-4">Case Reviews</th>
                <th className="py-3 px-4">Safeguarding Access</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Audit Info</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-stone-500 text-xs">
                    No staff records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => {
                  const isPrimaryAdmin = staff.email.toLowerCase() === PRIMARY_ADMIN_EMAIL;
                  const isSelf = staff.uid === staffProfile?.uid || staff.id === staffProfile?.id;

                  return (
                    <tr key={staff.id || staff.uid} className="hover:bg-stone-50/70 transition-colors">
                      {/* Name & Contact */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-teal-900 text-amber-300 font-bold flex items-center justify-center text-xs">
                            {staff.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-stone-900 flex items-center gap-1.5">
                              {staff.fullName}
                              {isPrimaryAdmin && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.2 rounded-sm">
                                  Primary Root
                                </span>
                              )}
                              {isSelf && (
                                <span className="text-[10px] bg-stone-100 text-stone-600 font-medium px-1.5 py-0.2 rounded-sm">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-stone-500 text-[11px] flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-stone-400" />
                              {staff.email}
                            </div>
                            {staff.phone && (
                              <div className="text-stone-400 text-[10px] flex items-center gap-1">
                                <Phone className="w-3 h-3 text-stone-400" />
                                {staff.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Department / Title */}
                      <td className="py-3 px-4">
                        <span className="text-stone-700 font-medium">
                          {staff.departmentOrTitle || '—'}
                        </span>
                      </td>

                      {/* Assigned Role & Dropdown */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {renderRoleBadge(staff.role)}
                          {!isPrimaryAdmin && (
                            <select
                              value={staff.role}
                              onChange={(e) => handleRoleChange(staff, e.target.value as StaffRole)}
                              className="text-[11px] py-0.5 px-1.5 bg-stone-100 border border-stone-300 rounded-md text-stone-700 cursor-pointer hover:bg-white"
                              title="Reassign role"
                            >
                              <option value="Administrator">Administrator</option>
                              <option value="Manager">Manager</option>
                              <option value="Staff">Staff</option>
                              <option value="View Only">View Only</option>
                            </select>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {staff.role === 'Administrator' || staff.role === 'Manager' ? (
                          <span className="text-[10px] text-stone-500">Full access</span>
                        ) : (
                          <div className="space-y-1.5">
                            {(['canViewHealthRecords', 'canEditHealthRecords'] as const).map((field) => (
                              <label key={field} className="flex items-center gap-1.5 text-[10px] text-stone-700 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={staff[field] === true}
                                  onChange={() => updateSensitiveAccess(staff, field)}
                                />
                                {field === 'canViewHealthRecords' ? 'View' : 'Edit'}
                              </label>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {staff.role === 'Administrator' || staff.role === 'Manager' ? (
                          <span className="text-[10px] text-stone-500">Full access</span>
                        ) : (
                          <div className="space-y-1.5">
                            {(['canViewCaseReviews', 'canEditCaseReviews'] as const).map((field) => (
                              <label key={field} className="flex items-center gap-1.5 text-[10px] text-stone-700 whitespace-nowrap">
                                <input type="checkbox" checked={staff[field] === true} onChange={() => updateSensitiveAccess(staff, field)} />
                                {field === 'canViewCaseReviews' ? 'View' : 'Edit'}
                              </label>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {staff.role === 'Administrator' ? (
                          <span className="text-[10px] text-stone-500">Full access</span>
                        ) : (
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                            {(['canView', 'canCreate', 'canEdit', 'canClose'] as const).map((permission) => (
                              <label key={permission} className="flex items-center gap-1 text-[10px] text-stone-700 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={staff.safeguardingPermissions?.[permission] === true}
                                  onChange={() => updateSensitiveAccess(staff, 'safeguardingPermissions', permission)}
                                />
                                {permission.replace('can', '')}
                              </label>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            staff.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {staff.status === 'Active' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <XCircle className="w-3 h-3 text-rose-600" />
                          )}
                          {staff.status}
                        </span>
                      </td>

                      {/* Audit Info */}
                      <td className="py-3 px-4 text-stone-500 text-[11px] space-y-0.5">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-stone-400" />
                          <span>Joined: {new Date(staff.createdAt).toLocaleDateString()}</span>
                        </div>
                        {staff.createdBy && (
                          <div className="text-[10px] text-stone-400">By: {staff.createdBy}</div>
                        )}
                        {staff.lastLoginAt && (
                          <div className="text-[10px] text-stone-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-stone-400" />
                            <span>Last login: {new Date(staff.lastLoginAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Send Reset Email */}
                          <button
                            type="button"
                            onClick={() => handleSendResetLink(staff)}
                            title="Send Password Reset Email"
                            className="p-1.5 text-stone-500 hover:text-teal-900 hover:bg-stone-100 rounded-lg transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Active / Suspended */}
                          {!isPrimaryAdmin && (
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(staff)}
                              title={staff.status === 'Active' ? 'Suspend Account' : 'Activate Account'}
                              className={`p-1.5 rounded-lg transition-colors ${
                                staff.status === 'Active'
                                  ? 'text-amber-600 hover:bg-amber-50'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete Account */}
                          {!isPrimaryAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteStaff(staff)}
                              title="Delete Staff Member"
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite / Add Staff Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-900 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Invite New Staff Member</h3>
                  <p className="text-xs text-stone-500">Create account and assign explicit role</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="e.g. Mary Banda"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Staff Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. mary.banda@shine.org"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Assigned Role *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as StaffRole)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 font-semibold focus:bg-white focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="Staff">Staff (Standard)</option>
                    <option value="Manager">Manager (Operations)</option>
                    <option value="Administrator">Administrator (Full Access)</option>
                    <option value="View Only">View Only (Auditor/Guest)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Department or Title
                  </label>
                  <input
                    type="text"
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    placeholder="e.g. Social Worker"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+265 99 123 4567"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-teal-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Temporary Initial Password
                  </label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono text-stone-900 focus:bg-white focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900">
                <div className="font-bold flex items-center gap-1 text-amber-950 mb-0.5">
                  <Lock className="w-3.5 h-3.5" />
                  Firebase Authentication Account Provisioning
                </div>
                The account will be provisioned in Firebase Auth, and a password reset link will be
                automatically sent so the staff member can immediately set their own private password.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-teal-900 hover:bg-teal-950 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50"
                >
                  {submitting ? 'Creating Account...' : 'Create Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
