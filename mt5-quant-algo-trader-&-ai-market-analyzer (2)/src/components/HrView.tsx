import React, { useMemo, useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Banknote,
  CheckCircle2,
  Clock,
  Search,
  KeyRound,
  UserPlus,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  BusinessSettings,
  Employee,
  InvitedStaffRole,
  ROLE_PERMISSION_MATRIX,
  StaffMember,
} from '../types/erp';
import { formatCurrency } from '../utils/formatters';
import {
  disburseEmployeeSalary,
  removeEmployee,
  removeStaffMemberInvite,
  RoleEmailBuckets,
  saveEmployee,
  saveStaffMemberInvite,
  updateEmployeeAttendance,
} from '../services/erpService';

interface HrViewProps {
  ownerId: string;
  employees: Employee[];
  staffMembers: StaffMember[];
  settings: BusinessSettings;
  roleEmailBuckets: RoleEmailBuckets;
}

const ATTENDANCE_OPTIONS: Employee['attendanceStatus'][] = [
  'On Shift',
  'Present',
  'Off Duty',
  'On Leave',
];

const INVITE_ROLES: InvitedStaffRole[] = [
  'Cashier',
  'Warehouse',
  'Accountant',
  'Admin',
];

export const HrView: React.FC<HrViewProps> = ({
  ownerId,
  employees,
  staffMembers,
  settings,
  roleEmailBuckets,
}) => {
  const [activeTab, setActiveTab] = useState<'directory' | 'permissions'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [payrollModalEmployee, setPayrollModalEmployee] = useState<Employee | null>(null);
  const [payrollChannel, setPayrollChannel] = useState('MTN Mobile Money');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Staff Login Invite state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingInvite, setEditingInvite] = useState<StaffMember | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitedStaffRole>('Cashier');
  const [inviteBranch, setInviteBranch] = useState(settings.branchAddress || 'Main Branch');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [confirmRemoveInviteId, setConfirmRemoveInviteId] = useState<string | null>(null);

  // Employee form fields
  const [staffCode, setStaffCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [department, setDepartment] = useState('Retail Floor');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [shiftSchedule, setShiftSchedule] = useState('Mon–Sat · 08:00–17:00');
  const [attendanceStatus, setAttendanceStatus] =
    useState<Employee['attendanceStatus']>('Present');
  const [payrollStatus, setPayrollStatus] =
    useState<Employee['payrollStatus']>('Pending');

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.employmentStatus === 'active');
    const onDuty = active.filter(
      (e) => e.attendanceStatus === 'On Shift' || e.attendanceStatus === 'Present'
    ).length;
    const totalPayroll = active.reduce((acc, e) => acc + e.monthlySalary, 0);
    const pendingPayroll = active
      .filter((e) => e.payrollStatus === 'Pending')
      .reduce((acc, e) => acc + e.monthlySalary, 0);
    const activeLogins = staffMembers.filter((s) => s.status === 'active').length;
    return {
      headcount: active.length,
      onDuty,
      totalPayroll,
      pendingPayroll,
      activeLogins,
    };
  }, [employees, staffMembers]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter(
      (e) =>
        !q ||
        e.fullName.toLowerCase().includes(q) ||
        e.roleTitle.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.staffCode.toLowerCase().includes(q)
    );
  }, [employees, searchQuery]);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setStaffCode(`EMP-${Math.floor(100 + Math.random() * 900)}`);
    setFullName('');
    setRoleTitle('Sales Executive');
    setDepartment('Retail Floor');
    setPhone('+256 7');
    setEmail('');
    setMonthlySalary('850000');
    setShiftSchedule('Mon–Sat · 08:00–17:00');
    setAttendanceStatus('Present');
    setPayrollStatus('Pending');
    setShowModal(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setStaffCode(emp.staffCode);
    setFullName(emp.fullName);
    setRoleTitle(emp.roleTitle);
    setDepartment(emp.department);
    setPhone(emp.phone);
    setEmail(emp.email);
    setMonthlySalary(String(emp.monthlySalary));
    setShiftSchedule(emp.shiftSchedule);
    setAttendanceStatus(emp.attendanceStatus);
    setPayrollStatus(emp.payrollStatus);
    setShowModal(true);
  };

  const openNewInviteModal = () => {
    setEditingInvite(null);
    setInviteName('');
    setInviteEmail('');
    setInviteRole('Cashier');
    setInviteBranch('Kampala Road Counter 1');
    setInviteError(null);
    setShowInviteModal(true);
  };

  const openEditInviteModal = (inv: StaffMember) => {
    setEditingInvite(inv);
    setInviteName(inv.staffName);
    setInviteEmail(inv.staffEmail);
    setInviteRole(inv.role);
    setInviteBranch(inv.assignedBranch);
    setInviteError(null);
    setShowInviteModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      await saveEmployee(
        ownerId,
        {
          staffCode,
          fullName,
          roleTitle,
          department,
          phone,
          email,
          monthlySalary: Number(monthlySalary) || 0,
          shiftSchedule,
          attendanceStatus,
          payrollStatus,
          lastPaidDate: editingEmployee?.lastPaidDate || '',
          employmentStatus: 'active',
        },
        editingEmployee?.id,
        roleEmailBuckets.adminOnly
      );
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDisburseSalary = async () => {
    if (!payrollModalEmployee) return;
    setSaving(true);
    try {
      await disburseEmployeeSalary(
        ownerId,
        payrollModalEmployee,
        payrollChannel,
        roleEmailBuckets.financeOnly
      );
      setPayrollModalEmployee(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setSaving(true);
    try {
      await saveStaffMemberInvite(
        ownerId,
        settings.businessName,
        staffMembers,
        {
          staffName: inviteName,
          staffEmail: inviteEmail,
          role: inviteRole,
          assignedBranch: inviteBranch,
          status: editingInvite ? editingInvite.status : 'active',
        },
        editingInvite?.id
      );
      setShowInviteModal(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to save staff invite.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleInviteStatus = async (inv: StaffMember) => {
    setSaving(true);
    try {
      await saveStaffMemberInvite(
        ownerId,
        settings.businessName,
        staffMembers,
        {
          staffName: inv.staffName,
          staffEmail: inv.staffEmail,
          role: inv.role,
          assignedBranch: inv.assignedBranch,
          status: inv.status === 'active' ? 'revoked' : 'active',
        },
        inv.id
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HR Operations KPI Strip */}
      <div className="grid grid-cols-1 border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Active Staff Headcount</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {stats.headcount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {stats.onDuty} on shift · {stats.activeLogins} workspace login(s)
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Monthly Payroll Commitment</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(stats.totalPayroll, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Admin &amp; Owner restricted view
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Pending Payroll Balance</div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-700 tabular-nums">
            {formatCurrency(stats.pendingPayroll, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Unpaid salaries for current cycle
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Staff Login Access</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
            {stats.activeLogins} Active
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Role-isolated Google workspace accounts
          </div>
        </div>
      </div>

      {/* Sub-navigation & Actions */}
      <div className="flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 text-xs font-semibold ${
              activeTab === 'directory'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            HR Directory, Shifts &amp; Payroll ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
              activeTab === 'permissions'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            Staff Login &amp; Role Permissions ({staffMembers.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'directory' ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Employee
            </button>
          ) : (
            <button
              type="button"
              onClick={openNewInviteModal}
              className="inline-flex items-center gap-1.5 bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invite Staff Login
            </button>
          )}
        </div>
      </div>

      {activeTab === 'directory' ? (
        <div className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff by name, code, role, or department..."
                className="w-full border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 text-xs focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredEmployees.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No employees registered yet. Click "Add Employee" to set up staff roles, shifts, and payroll.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5">Staff Member</th>
                    <th className="px-4 py-2.5">Role · Department</th>
                    <th className="px-4 py-2.5">Contact</th>
                    <th className="px-4 py-2.5">Shift &amp; Live Attendance</th>
                    <th className="px-4 py-2.5 text-right">Monthly Salary</th>
                    <th className="px-4 py-2.5">Payroll Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">{emp.fullName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{emp.staffCode}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">{emp.roleTitle}</div>
                        <div className="text-[11px] text-slate-500">{emp.department}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-slate-700">{emp.phone}</div>
                        {emp.email && (
                          <div className="text-[11px] text-slate-400">{emp.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={emp.attendanceStatus}
                          onChange={(e) =>
                            updateEmployeeAttendance(
                              emp.id,
                              e.target.value as Employee['attendanceStatus'],
                              emp.shiftSchedule
                            )
                          }
                          className="border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
                        >
                          {ATTENDANCE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <div className="mt-0.5 text-[11px] text-slate-400">{emp.shiftSchedule}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                        {formatCurrency(emp.monthlySalary, settings.currency)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {emp.payrollStatus === 'Paid' ? (
                          <div>
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Paid
                            </span>
                            {emp.lastPaidDate && (
                              <div className="font-mono text-[10px] text-slate-400">
                                {emp.lastPaidDate}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                            <Clock className="h-3.5 w-3.5" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => setPayrollModalEmployee(emp)}
                            className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900"
                          >
                            <Banknote className="h-3.5 w-3.5" />
                            Pay Salary
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(emp)}
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-950"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          {confirmDeleteId === emp.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await removeEmployee(emp.id);
                                setConfirmDeleteId(null);
                              }}
                              className="font-semibold text-red-600 hover:text-red-800"
                            >
                              Confirm?
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(emp.id)}
                              className="text-slate-400 hover:text-red-600"
                              aria-label="Delete employee"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Role Permission Matrix Reference */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INVITE_ROLES.map((r) => {
              const spec = ROLE_PERMISSION_MATRIX[r];
              return (
                <div key={r} className="border border-slate-200 bg-white p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{spec.label}</span>
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-600">{spec.summary}</p>
                  <div className="pt-1 font-mono text-[10px] text-slate-500">
                    Modules: {spec.allowedModules.join(', ').toUpperCase()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Invited Staff Logins Table */}
          <div className="border border-slate-200 bg-white overflow-x-auto">
            <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-900">
                  Authorized Workspace Staff Logins
                </h3>
                <p className="text-[11px] text-slate-500">
                  Invited staff sign in with Google using their email below and automatically join your workspace under their assigned role.
                </p>
              </div>
            </div>

            {staffMembers.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No staff logins invited yet. Click "Invite Staff Login" to grant a Cashier, Storekeeper, or Accountant role-scoped access.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5">Staff Name &amp; Google Email</th>
                    <th className="px-4 py-2.5">Assigned Role</th>
                    <th className="px-4 py-2.5">Permitted Modules</th>
                    <th className="px-4 py-2.5">Branch / Station</th>
                    <th className="px-4 py-2.5">Access State</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {staffMembers.map((inv) => {
                    const spec = ROLE_PERMISSION_MATRIX[inv.role];
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900">{inv.staffName}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {inv.staffEmail}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">
                          {spec.label}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                          {spec.allowedModules.join(' · ').toUpperCase()}
                          {spec.canSeeMargins ? ' · MARGINS' : ''}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{inv.assignedBranch}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {inv.status === 'active' ? (
                            <span className="font-semibold text-emerald-700">Active</span>
                          ) : (
                            <span className="font-semibold text-red-600">Revoked</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2.5">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleToggleInviteStatus(inv)}
                              className="font-semibold text-slate-700 hover:text-slate-950"
                            >
                              {inv.status === 'active' ? 'Revoke' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditInviteModal(inv)}
                              className="text-slate-600 hover:text-slate-950"
                            >
                              Edit
                            </button>
                            {confirmRemoveInviteId === inv.id ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await removeStaffMemberInvite(ownerId, inv.id, staffMembers);
                                  setConfirmRemoveInviteId(null);
                                }}
                                className="font-semibold text-red-600 hover:text-red-800"
                              >
                                Confirm?
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveInviteId(inv.id)}
                                className="text-slate-400 hover:text-red-600"
                                aria-label="Remove invite"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Invite / Edit Staff Login Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveInvite}
            className="w-full max-w-md border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingInvite ? 'Update Staff Role Permission' : 'Invite Workspace Staff Member'}
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 p-5 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Staff Full Name</label>
                <input
                  required
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g., Brian Mugisha"
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700">
                  Staff Google Account Email
                </label>
                <input
                  required
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="cashier@gmail.com"
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700">System Access Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as InvitedStaffRole)}
                  className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none"
                >
                  {INVITE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_PERMISSION_MATRIX[r].label} ({r})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  {ROLE_PERMISSION_MATRIX[inviteRole].summary}
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-700">
                  Assigned Counter / Warehouse Branch
                </label>
                <input
                  type="text"
                  value={inviteBranch}
                  onChange={(e) => setInviteBranch(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>

              {inviteError && (
                <div className="border border-red-200 bg-red-50 p-2.5 text-red-700">
                  {inviteError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Syncing Permissions...' : 'Save Staff Access'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveEmployee}
            className="w-full max-w-lg border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingEmployee ? 'Edit Staff Profile' : 'Add New Staff Member'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 p-5 sm:grid-cols-2 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Staff ID Code</label>
                <input
                  required
                  type="text"
                  disabled={Boolean(editingEmployee)}
                  value={staffCode}
                  onChange={(e) => setStaffCode(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono disabled:bg-slate-100 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Department</label>
                <input
                  required
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700">Full Name</label>
                <input
                  required
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Role / Job Title</label>
                <input
                  required
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">
                  Monthly Salary ({settings.currency})
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Phone Number</label>
                <input
                  required
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Shift Schedule</label>
                <input
                  required
                  type="text"
                  value={shiftSchedule}
                  onChange={(e) => setShiftSchedule(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Payroll Cycle Status</label>
                <select
                  value={payrollStatus}
                  onChange={(e) =>
                    setPayrollStatus(e.target.value as Employee['payrollStatus'])
                  }
                  className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none"
                >
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingEmployee ? 'Update Staff' : 'Save Staff Member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payroll Disbursement Confirmation Modal */}
      {payrollModalEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-xl space-y-4 text-xs">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Process Salary Disbursement · {payrollModalEmployee.fullName}
              </h3>
              <p className="mt-1 text-slate-600">
                Disbursing{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {formatCurrency(payrollModalEmployee.monthlySalary, settings.currency)}
                </span>{' '}
                marks this employee as Paid and automatically posts a Payroll Expense entry in Accounting &amp; Finance.
              </p>
            </div>

            <div>
              <label className="block font-medium text-slate-700">Disbursement Channel</label>
              <select
                value={payrollChannel}
                onChange={(e) => setPayrollChannel(e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none"
              >
                <option value="MTN Mobile Money">MTN Mobile Money</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="Card">Bank Salary Transfer</option>
                <option value="Cash">Cash Voucher</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayrollModalEmployee(null)}
                className="border border-slate-300 px-3.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleDisburseSalary}
                className="bg-emerald-700 px-4 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Disbursing...' : 'Confirm & Post Payroll'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
