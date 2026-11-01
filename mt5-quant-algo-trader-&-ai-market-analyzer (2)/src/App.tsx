import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  ShoppingCart,
  Receipt,
  Package,
  Landmark,
  Users,
  UserCheck,
  BarChart3,
  Settings,
  LogOut,
  CheckCircle2,
  Database,
  Menu,
  Lock,
  Building2,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  BusinessSettings,
  Customer,
  Employee,
  ErpModuleId,
  LedgerEntry,
  Product,
  PurchaseOrder,
  ROLE_PERMISSION_MATRIX,
  SaleTransaction,
  ShiftRegister,
  StaffMember,
  StaffRole,
} from './types/erp';
import {
  computeRoleEmailBuckets,
  DEFAULT_BUSINESS_SETTINGS,
  ensureWorkspaceBinding,
  seedSampleErpWorkspace,
} from './services/erpService';
import { PosView } from './components/PosView';
import { SalesManagementView } from './components/SalesManagementView';
import { InventoryView } from './components/InventoryView';
import { AccountingView } from './components/AccountingView';
import { HrView } from './components/HrView';
import { CrmView } from './components/CrmView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';

type ActiveRoute = ErpModuleId | 'settings';

const NAV_ITEMS: {
  id: ErpModuleId;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    id: 'pos',
    label: 'Point of Sale (POS)',
    shortDesc: 'Process sales, scan barcodes, reconcile shift drawer & issue receipts',
    icon: ShoppingCart,
  },
  {
    id: 'sales',
    label: 'Sales Management',
    shortDesc: 'Monitor sales, Serial/IMEI 7-day warranty checks & returns',
    icon: Receipt,
  },
  {
    id: 'inventory',
    label: 'Inventory & Stock',
    shortDesc: 'Manage products, credit supplier purchases & stock levels',
    icon: Package,
  },
  {
    id: 'accounting',
    label: 'Accounting & Finance',
    shortDesc: 'Track general ledger, supplier accounts payable & cashflow',
    icon: Landmark,
  },
  {
    id: 'hr',
    label: 'Human Resources (HR)',
    shortDesc: 'Manage employees, payroll & staff login role permissions',
    icon: Users,
  },
  {
    id: 'crm',
    label: 'Customer Management (CRM)',
    shortDesc: 'Organize customer information, loyalty & credit accounts',
    icon: UserCheck,
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    shortDesc: 'Valuable business insights for smarter decisions',
    icon: BarChart3,
  },
];

const TERMINAL_ROLES: StaffRole[] = [
  'Owner',
  'Admin',
  'Cashier',
  'Warehouse',
  'Accountant',
];

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [activeRoute, setActiveRoute] = useState<ActiveRoute>('pos');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [seedingInitial, setSeedingInitial] = useState(false);

  // Multi-Tenant Staff Invitations (workspaces this user's email was invited to)
  const [myInvites, setMyInvites] = useState<StaffMember[]>([]);
  const [selectedWorkspaceOwnerId, setSelectedWorkspaceOwnerId] = useState<string>('');
  const [bindingReadyOwnerId, setBindingReadyOwnerId] = useState<string>('');

  // Shared Counter Terminal Role Lock (allows Owner to lock a counter device to Cashier/Warehouse/Accountant)
  const [counterLockedRole, setCounterLockedRole] = useState<StaffRole>('Owner');
  const [unlockModalTargetRole, setUnlockModalTargetRole] = useState<StaffRole | null>(null);
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Cloud Firestore Realtime Collections
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [hasPersistedSettings, setHasPersistedSettings] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shifts, setShifts] = useState<ShiftRegister[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setSelectedWorkspaceOwnerId(currentUser ? currentUser.uid : '');
        setCounterLockedRole('Owner');
        setAuthReady(true);
      },
      (error) => {
        console.error('Firebase authentication state error:', error);
        setAuthError('Unable to restore your sign-in session. Please sign in again.');
        setAuthReady(true);
      }
    );
    return () => unsub();
  }, []);

  // Discover workspaces that invited the signed-in Google email
  useEffect(() => {
    if (!authReady || !user || !user.email) {
      setMyInvites([]);
      return;
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    const unsubInvites = onSnapshot(
      query(
        collection(db, 'staffMembers'),
        where('staffEmail', '==', normalizedEmail)
      ),
      (snap) => {
        const activeInvites = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StaffMember, 'id'>) }))
          .filter((inv) => inv.status === 'active' && inv.ownerId !== user.uid);
        setMyInvites(activeInvites);

        // If user has an active staff invite and hasn't explicitly chosen a workspace yet, keep selection valid
        setSelectedWorkspaceOwnerId((prev) => {
          if (prev && prev !== user.uid) {
            const stillValid = activeInvites.some((i) => i.ownerId === prev);
            return stillValid ? prev : user.uid;
          }
          return prev || user.uid;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'staffMembers')
    );

    return () => unsubInvites();
  }, [authReady, user]);

  const workspaceOwnerId = selectedWorkspaceOwnerId || user?.uid || '';
  const isWorkspaceOwner = Boolean(user && workspaceOwnerId === user.uid);

  const activeInvite = useMemo(
    () => myInvites.find((i) => i.ownerId === workspaceOwnerId) || null,
    [myInvites, workspaceOwnerId]
  );

  // Ensure synchronous workspaceBinding document exists before attaching staff listeners
  useEffect(() => {
    let cancelled = false;
    if (!authReady || !user) return;

    if (isWorkspaceOwner) {
      setBindingReadyOwnerId(user.uid);
      return;
    }

    if (!activeInvite) return;

    setDataLoading(true);
    ensureWorkspaceBinding(activeInvite)
      .then(() => {
        if (!cancelled) {
          setBindingReadyOwnerId(activeInvite.ownerId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedWorkspaceOwnerId(user.uid);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeInvite, authReady, isWorkspaceOwner, user]);

  // Effective Role: either invited staff role (when viewing an Employer Workspace) or Owner/Counter-Locked Role
  const effectiveRole: StaffRole = useMemo(() => {
    if (!isWorkspaceOwner && activeInvite) {
      return activeInvite.role;
    }
    return counterLockedRole;
  }, [activeInvite, counterLockedRole, isWorkspaceOwner]);

  // Attach role-scoped Firestore realtime listeners
  useEffect(() => {
    if (!authReady || !user || !workspaceOwnerId || bindingReadyOwnerId !== workspaceOwnerId) {
      if (!user) setDataLoading(false);
      return;
    }

    setDataLoading(true);
    const normalizedEmail = (user.email || '').trim().toLowerCase();
    const unsubs: (() => void)[] = [];

    const clearDisallowedState = (role: StaffRole) => {
      if (role === 'Cashier') {
        setPurchaseOrders([]);
        setLedgerEntries([]);
        setEmployees([]);
        setStaffMembers([]);
      } else if (role === 'Warehouse') {
        setSales([]);
        setCustomers([]);
        setShifts([]);
        setLedgerEntries([]);
        setEmployees([]);
        setStaffMembers([]);
      } else if (role === 'Accountant') {
        setEmployees([]);
        setStaffMembers([]);
      }
    };

    const roleForSubscriptions: StaffRole = isWorkspaceOwner
      ? 'Owner'
      : activeInvite?.role || 'Cashier';

    clearDisallowedState(roleForSubscriptions);

    const buildQuery = (colName: string) =>
      isWorkspaceOwner
        ? query(collection(db, colName), where('ownerId', '==', workspaceOwnerId))
        : query(
            collection(db, colName),
            where('ownerId', '==', workspaceOwnerId),
            where('authorizedEmails', 'array-contains', normalizedEmail)
          );

    // 1. Business Settings (readable by all active workspace staff)
    unsubs.push(
      onSnapshot(
        doc(db, 'businessSettings', workspaceOwnerId),
        (snap) => {
          if (snap.exists()) {
            setSettings(snap.data() as BusinessSettings);
            setHasPersistedSettings(true);
          } else {
            setSettings(DEFAULT_BUSINESS_SETTINGS(workspaceOwnerId));
            setHasPersistedSettings(false);
          }
        },
        (err) =>
          handleFirestoreError(err, OperationType.GET, `businessSettings/${workspaceOwnerId}`)
      )
    );

    // 2. Products (readable by Owner, Admin, Cashier, Warehouse, Accountant)
    unsubs.push(
      onSnapshot(
        buildQuery('products'),
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Product, 'id'>),
          }));
          list.sort((a, b) => a.name.localeCompare(b.name));
          setProducts(list);
          setDataLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'products')
      )
    );

    // 3. Purchase Orders (Owner, Admin, Warehouse, Accountant)
    if (['Owner', 'Admin', 'Warehouse', 'Accountant'].includes(roleForSubscriptions)) {
      unsubs.push(
        onSnapshot(
          buildQuery('purchaseOrders'),
          (snap) => {
            const list = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<PurchaseOrder, 'id'>),
            }));
            list.sort((a, b) => b.poNumber.localeCompare(a.poNumber));
            setPurchaseOrders(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'purchaseOrders')
        )
      );
    }

    // 4. Sales, Customers & Shift Registers (Owner, Admin, Cashier, Accountant)
    if (['Owner', 'Admin', 'Cashier', 'Accountant'].includes(roleForSubscriptions)) {
      unsubs.push(
        onSnapshot(
          buildQuery('sales'),
          (snap) => {
            const list = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<SaleTransaction, 'id'>),
            }));
            list.sort((a, b) => b.saleDate.localeCompare(a.saleDate));
            setSales(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'sales')
        )
      );

      unsubs.push(
        onSnapshot(
          buildQuery('customers'),
          (snap) => {
            const list = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Customer, 'id'>),
            }));
            list.sort((a, b) => b.totalSpent - a.totalSpent);
            setCustomers(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'customers')
        )
      );

      unsubs.push(
        onSnapshot(
          buildQuery('shiftRegisters'),
          (snap) => {
            const list = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<ShiftRegister, 'id'>),
            }));
            list.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
            setShifts(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'shiftRegisters')
        )
      );
    }

    // 5. General Ledger (Owner, Admin, Accountant)
    if (['Owner', 'Admin', 'Accountant'].includes(roleForSubscriptions)) {
      unsubs.push(
        onSnapshot(
          buildQuery('ledgerEntries'),
          (snap) => {
            const list = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<LedgerEntry, 'id'>),
            }));
            list.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
            setLedgerEntries(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'ledgerEntries')
        )
      );
    }

    // 6. HR Employees & Staff Invites (Owner, Admin ONLY)
    if (['Owner', 'Admin'].includes(roleForSubscriptions)) {
      unsubs.push(
        onSnapshot(
          buildQuery('employees'),
          (snap) => {
            const list = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Employee, 'id'>),
            }));
            list.sort((a, b) => a.fullName.localeCompare(b.fullName));
            setEmployees(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
        )
      );

      unsubs.push(
        onSnapshot(
          buildQuery('staffMembers'),
          (snap) => {
            const list = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<StaffMember, 'id'>),
            }));
            list.sort((a, b) => a.staffName.localeCompare(b.staffName));
            setStaffMembers(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'staffMembers')
        )
      );
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [activeInvite?.role, authReady, bindingReadyOwnerId, isWorkspaceOwner, user, workspaceOwnerId]);

  const effectiveSettings = useMemo(
    () => settings || DEFAULT_BUSINESS_SETTINGS(workspaceOwnerId || 'guest'),
    [settings, workspaceOwnerId]
  );

  const roleEmailBuckets = useMemo(() => {
    if (staffMembers.length > 0) {
      return computeRoleEmailBuckets(staffMembers);
    }
    const fallbackEmails = effectiveSettings.authorizedEmails || [];
    return {
      allStaff: fallbackEmails,
      posFinance: fallbackEmails,
      inventoryFinance: fallbackEmails,
      financeOnly: fallbackEmails,
      adminOnly: [],
    };
  }, [effectiveSettings.authorizedEmails, staffMembers]);

  const roleSpec = ROLE_PERMISSION_MATRIX[effectiveRole];

  const visibleNavItems = useMemo(
    () =>
      NAV_ITEMS.filter(
        (item) =>
          effectiveSettings.enabledModules.includes(item.id) &&
          roleSpec.allowedModules.includes(item.id)
      ),
    [effectiveSettings.enabledModules, roleSpec.allowedModules]
  );

  useEffect(() => {
    if (activeRoute === 'settings') {
      if (!roleSpec.canManageSettings && visibleNavItems.length > 0) {
        setActiveRoute(visibleNavItems[0].id);
      }
      return;
    }

    const isAllowed =
      effectiveSettings.enabledModules.includes(activeRoute) &&
      roleSpec.allowedModules.includes(activeRoute);

    if (!isAllowed && visibleNavItems.length > 0) {
      setActiveRoute(visibleNavItems[0].id);
    }
  }, [
    activeRoute,
    effectiveSettings.enabledModules,
    roleSpec.allowedModules,
    roleSpec.canManageSettings,
    visibleNavItems,
  ]);

  const handleTerminalRoleChange = (nextRole: StaffRole) => {
    if (!isWorkspaceOwner) return;
    // Locking down to a restricted role is immediate; elevating back to Owner/Admin when locked requires Manager PIN if configured
    const currentIsRestricted =
      counterLockedRole !== 'Owner' && counterLockedRole !== 'Admin';
    const nextIsElevated = nextRole === 'Owner' || nextRole === 'Admin';
    const configuredPin = (effectiveSettings.managerPin || '').trim();

    if (currentIsRestricted && nextIsElevated && configuredPin.length > 0) {
      setUnlockModalTargetRole(nextRole);
      setPinAttempt('');
      setPinError(null);
      return;
    }

    setCounterLockedRole(nextRole);
  };

  const handleConfirmPinUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockModalTargetRole) return;
    const configuredPin = (effectiveSettings.managerPin || '').trim();
    if (pinAttempt.trim() !== configuredPin) {
      setPinError('Incorrect Manager PIN. Check Customize Business settings if you are the Owner.');
      return;
    }
    setCounterLockedRole(unlockModalTargetRole);
    setUnlockModalTargetRole(null);
    setPinAttempt('');
    setPinError(null);
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleQuickSeed = async () => {
    if (!user || !isWorkspaceOwner) return;
    setSeedingInitial(true);
    try {
      await seedSampleErpWorkspace(user.uid);
    } catch (err) {
      console.error('Unable to seed the workspace:', err);
      setAuthError('Workspace setup failed. Check your connection and permissions, then try again.');
    } finally {
      setSeedingInitial(false);
    }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-xs font-medium text-slate-500">
        Initializing HOST256 ERP Workspace...
      </div>
    );
  }

  // Unauthenticated Enterprise Sign-In Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
        <header className="border-b border-slate-800 px-6 py-4 lg:px-12 flex items-center justify-between gap-8">
          <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            HOST256 ERP
          </span>
          <button
            type="button"
            disabled={signingIn}
            onClick={handleGoogleLogin}
            className="bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {signingIn ? 'Connecting...' : 'Staff & Owner Sign In'}
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl px-6 py-12 lg:px-12 grid grid-cols-1 gap-10 lg:grid-cols-12 items-center">
          <div className="lg:col-span-6 space-y-5">
            <p className="text-xs font-semibold tracking-wide text-emerald-400">
              Liquidation Uganda Edition · One System. Multiple Solutions.
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight max-w-xl">
              Complete ERP &amp; Counter POS Built for Daily Business Operations.
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
              Role-scoped access for Cashiers, Warehouse Storekeepers, Accountants, and Owners—complete with camera barcode scanning, shift Z-Report drawer reconciliation, Serial/IMEI 7-day warranty checks, and supplier credit payables.
            </p>

            {authError && (
              <div className="border border-red-500/40 bg-red-950/50 p-3 text-xs text-red-200">
                {authError}
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                disabled={signingIn}
                onClick={handleGoogleLogin}
                className="bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {signingIn ? 'Signing in...' : 'Launch ERP Workspace with Google'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 border border-slate-800 bg-slate-900 p-6 space-y-3">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                Integrated HOST256 ERP Modules
              </span>
              <span className="text-xs text-emerald-400">Role-Secured Suite</span>
            </div>
            <div className="divide-y divide-slate-800/80">
              {NAV_ITEMS.map((m) => (
                <div key={m.id} className="py-2.5 flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">{m.label}</div>
                    <div className="text-xs text-slate-400">{m.shortDesc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-900 px-6 py-4 lg:px-12 text-xs text-slate-500 flex flex-wrap justify-between gap-2">
          <span>HOST256 ERP · Customizable Business Management System</span>
          <span>Secured with Cloud Firestore Multi-Role RBAC</span>
        </footer>
      </div>
    );
  }

  const currentModuleMeta =
    activeRoute === 'settings'
      ? {
          label: 'Business Customization & Settings',
          shortDesc: 'Customize branding, currency, VAT, warranty policy, PIN & active modules',
        }
      : NAV_ITEMS.find((i) => i.id === activeRoute) || NAV_ITEMS[0];

  const isWorkspaceEmpty =
    isWorkspaceOwner &&
    !dataLoading &&
    products.length === 0 &&
    sales.length === 0 &&
    customers.length === 0 &&
    employees.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar ($260px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 text-slate-200 border-r border-slate-800">
        <div className="px-5 py-4 border-b border-slate-800">
          <div className="text-sm font-bold tracking-tight text-white truncate">
            {effectiveSettings.businessName}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400 truncate">
            Role: {roleSpec.label}
          </div>
        </div>

        {/* Invited Staff Workspace Switcher (shown if this user has staff invites) */}
        {myInvites.length > 0 && (
          <div className="border-b border-slate-800 px-4 py-3 space-y-1">
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <Building2 className="h-3.5 w-3.5" />
              <span>Active Store Workspace</span>
            </label>
            <select
              value={workspaceOwnerId}
              onChange={(e) => {
                setSelectedWorkspaceOwnerId(e.target.value);
                setCounterLockedRole('Owner');
              }}
              className="w-full border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value={user.uid}>My Own Workspace (Owner)</option>
              {myInvites.map((inv) => (
                <option key={inv.id} value={inv.ownerId}>
                  {inv.workspaceName} ({inv.role})
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveRoute(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          {roleSpec.canManageSettings && (
            <div className="pt-4 mt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveRoute('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                  activeRoute === 'settings'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Settings className="h-4 w-4 shrink-0" />
                <span>Customize Business</span>
              </button>
            </div>
          )}
        </nav>

        {/* Counter Terminal Role Lock (for shared store PCs or Owner testing role permissions) */}
        {isWorkspaceOwner && (
          <div className="border-t border-slate-800 px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Counter Role Mode
              </span>
              {counterLockedRole !== 'Owner' && (
                <span className="font-mono text-[10px] text-amber-400">PIN Protected</span>
              )}
            </div>
            <select
              value={counterLockedRole}
              onChange={(e) => handleTerminalRoleChange(e.target.value as StaffRole)}
              className="w-full border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              {TERMINAL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_PERMISSION_MATRIX[r].label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="border-t border-slate-800 p-4 text-xs">
          <div className="font-medium text-white truncate">
            {user.displayName || user.email}
          </div>
          <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 flex w-64 flex-col bg-slate-900 text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
              <span className="text-sm font-bold text-white truncate">
                {effectiveSettings.businessName}
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveRoute(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-medium ${
                      activeRoute === item.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              {roleSpec.canManageSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveRoute('settings');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-medium ${
                    activeRoute === 'settings'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  <span>Customize Business</span>
                </button>
              )}
            </nav>

            {isWorkspaceOwner && (
              <div className="border-t border-slate-800 p-4 space-y-1.5">
                <label className="block text-[11px] text-slate-400">
                  Counter Role Mode
                </label>
                <select
                  value={counterLockedRole}
                  onChange={(e) => {
                    handleTerminalRoleChange(e.target.value as StaffRole);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white"
                >
                  {TERMINAL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_PERMISSION_MATRIX[r].label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on Left, max 1–2 primary actions on Right */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="truncate font-medium text-slate-700">HOST256 ERP</span>
                <span>/</span>
                <span className="truncate font-semibold text-slate-900">
                  {currentModuleMeta.label}
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-500 truncate">
                {currentModuleMeta.shortDesc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden md:inline font-mono text-xs text-slate-500">
              {roleSpec.role} · {effectiveSettings.currency} · VAT {effectiveSettings.taxRate}%
            </span>
            {activeRoute !== 'pos' &&
              effectiveSettings.enabledModules.includes('pos') &&
              roleSpec.allowedModules.includes('pos') && (
                <button
                  type="button"
                  onClick={() => setActiveRoute('pos')}
                  className="bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
                >
                  Open POS Register
                </button>
              )}
          </div>
        </header>

        {/* Empty Workspace Quick-Start Banner */}
        {isWorkspaceEmpty && (
          <div className="mx-4 mt-4 sm:mx-6 border border-emerald-200 bg-emerald-50/70 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                Welcome to your HOST256 ERP Cloud Workspace
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Start fresh or load sample Liquidation Uganda inventory (with barcodes &amp; 7-day warranties), supplier credit payables, open shift register, staff logins, and POS receipts in one click.
              </p>
            </div>
            <button
              type="button"
              disabled={seedingInitial}
              onClick={handleQuickSeed}
              className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Database className="h-3.5 w-3.5" />
              {seedingInitial ? 'Loading Sample Data...' : 'Load Sample Dataset'}
            </button>
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6">
          {dataLoading ? (
            <div className="space-y-4">
              <div className="h-20 border border-slate-200 bg-white animate-pulse" />
              <div className="h-96 border border-slate-200 bg-white animate-pulse" />
            </div>
          ) : (
            <>
              {activeRoute === 'pos' && roleSpec.allowedModules.includes('pos') && (
                <PosView
                  ownerId={workspaceOwnerId}
                  userDisplayName={
                    activeInvite?.staffName || user.displayName || user.email || 'Cashier'
                  }
                  userEmail={user.email || ''}
                  activeRole={effectiveRole}
                  products={products}
                  customers={customers}
                  employees={employees}
                  sales={sales}
                  shifts={shifts}
                  settings={effectiveSettings}
                  roleEmailBuckets={roleEmailBuckets}
                  onNavigateToInventory={() => setActiveRoute('inventory')}
                />
              )}

              {activeRoute === 'sales' && roleSpec.allowedModules.includes('sales') && (
                <SalesManagementView
                  ownerId={workspaceOwnerId}
                  activeRole={effectiveRole}
                  sales={sales}
                  products={products}
                  customers={customers}
                  settings={effectiveSettings}
                  roleEmailBuckets={roleEmailBuckets}
                  onOpenPos={() => setActiveRoute('pos')}
                />
              )}

              {activeRoute === 'inventory' && roleSpec.allowedModules.includes('inventory') && (
                <InventoryView
                  ownerId={workspaceOwnerId}
                  activeRole={effectiveRole}
                  products={products}
                  purchaseOrders={purchaseOrders}
                  settings={effectiveSettings}
                  roleEmailBuckets={roleEmailBuckets}
                />
              )}

              {activeRoute === 'accounting' && roleSpec.allowedModules.includes('accounting') && (
                <AccountingView
                  ownerId={workspaceOwnerId}
                  ledgerEntries={ledgerEntries}
                  purchaseOrders={purchaseOrders}
                  settings={effectiveSettings}
                  roleEmailBuckets={roleEmailBuckets}
                />
              )}

              {activeRoute === 'hr' && roleSpec.allowedModules.includes('hr') && (
                <HrView
                  ownerId={workspaceOwnerId}
                  employees={employees}
                  staffMembers={staffMembers}
                  settings={effectiveSettings}
                  roleEmailBuckets={roleEmailBuckets}
                />
              )}

              {activeRoute === 'crm' && roleSpec.allowedModules.includes('crm') && (
                <CrmView
                  ownerId={workspaceOwnerId}
                  customers={customers}
                  sales={sales}
                  settings={effectiveSettings}
                  roleEmailBuckets={roleEmailBuckets}
                />
              )}

              {activeRoute === 'reports' && roleSpec.allowedModules.includes('reports') && (
                <ReportsView
                  activeRole={effectiveRole}
                  sales={sales}
                  products={products}
                  ledgerEntries={ledgerEntries}
                  customers={customers}
                  employees={employees}
                  settings={effectiveSettings}
                />
              )}

              {activeRoute === 'settings' && roleSpec.canManageSettings && (
                <SettingsView
                  ownerId={workspaceOwnerId}
                  settings={effectiveSettings}
                  hasPersistedSettings={hasPersistedSettings}
                  hasExistingData={!isWorkspaceEmpty}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Manager PIN Unlock Modal for Counter Role Lock */}
      {unlockModalTargetRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleConfirmPinUnlock}
            className="w-full max-w-sm border border-slate-200 bg-white p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                <Lock className="h-4 w-4 text-slate-800" />
                <span>Manager PIN Required</span>
              </div>
              <button
                type="button"
                onClick={() => setUnlockModalTargetRole(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-slate-600">
              Enter the store Manager PIN to unlock Counter Terminal Mode back to{' '}
              <span className="font-semibold text-slate-900">
                {ROLE_PERMISSION_MATRIX[unlockModalTargetRole].label}
              </span>
              . (Default PIN: <span className="font-mono">2560</span>)
            </p>
            <div>
              <input
                autoFocus
                required
                type="password"
                maxLength={8}
                value={pinAttempt}
                onChange={(e) => setPinAttempt(e.target.value)}
                placeholder="Enter Manager PIN"
                className="w-full border border-slate-300 px-3 py-2 font-mono text-sm tracking-widest focus:border-slate-900 focus:outline-none"
              />
            </div>
            {pinError && (
              <div className="border border-red-200 bg-red-50 p-2 text-red-700">
                {pinError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUnlockModalTargetRole(null)}
                className="border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-slate-900 px-4 py-1.5 font-semibold text-white hover:bg-slate-800"
              >
                Unlock Role
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
