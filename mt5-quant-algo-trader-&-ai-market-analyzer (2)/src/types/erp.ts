export type CurrencyCode = 'UGX' | 'USD' | 'KES' | 'EUR' | 'GBP';

export type ErpModuleId =
  | 'pos'
  | 'sales'
  | 'inventory'
  | 'accounting'
  | 'hr'
  | 'crm'
  | 'reports';

export type StaffRole = 'Owner' | 'Admin' | 'Cashier' | 'Warehouse' | 'Accountant';

export type InvitedStaffRole = Exclude<StaffRole, 'Owner'>;

export type PaymentMethod =
  | 'Cash'
  | 'MTN Mobile Money'
  | 'Airtel Money'
  | 'Card'
  | 'Customer Credit';

export interface RolePermissionSpec {
  role: StaffRole;
  label: string;
  summary: string;
  allowedModules: ErpModuleId[];
  canSeeMargins: boolean;
  canManagePayroll: boolean;
  canManageSettings: boolean;
  canRefundSales: boolean;
}

export const ROLE_PERMISSION_MATRIX: Record<StaffRole, RolePermissionSpec> = {
  Owner: {
    role: 'Owner',
    label: 'Workspace Owner',
    summary: 'Full access to all modules, profit margins, payroll, staff invites, and settings.',
    allowedModules: ['pos', 'sales', 'inventory', 'accounting', 'hr', 'crm', 'reports'],
    canSeeMargins: true,
    canManagePayroll: true,
    canManageSettings: true,
    canRefundSales: true,
  },
  Admin: {
    role: 'Admin',
    label: 'Administrator',
    summary: 'Full operational access including profit margins, HR payroll, and store settings.',
    allowedModules: ['pos', 'sales', 'inventory', 'accounting', 'hr', 'crm', 'reports'],
    canSeeMargins: true,
    canManagePayroll: true,
    canManageSettings: true,
    canRefundSales: true,
  },
  Cashier: {
    role: 'Cashier',
    label: 'POS Cashier',
    summary: 'POS register, barcode scanner, shift Z-Report drawer, and serial/warranty checks only.',
    allowedModules: ['pos'],
    canSeeMargins: false,
    canManagePayroll: false,
    canManageSettings: false,
    canRefundSales: false,
  },
  Warehouse: {
    role: 'Warehouse',
    label: 'Warehouse / Storekeeper',
    summary: 'Inventory catalog, stock counts, and supplier restocking only. No POS, payroll, or margins.',
    allowedModules: ['inventory'],
    canSeeMargins: false,
    canManagePayroll: false,
    canManageSettings: false,
    canRefundSales: false,
  },
  Accountant: {
    role: 'Accountant',
    label: 'Accountant / Finance',
    summary: 'General ledger, supplier payables, customer credit, sales invoices & revenue reports.',
    allowedModules: ['accounting', 'sales', 'crm', 'reports'],
    canSeeMargins: false,
    canManagePayroll: false,
    canManageSettings: false,
    canRefundSales: true,
  },
};

export interface BusinessSettings {
  ownerId: string;
  businessName: string;
  tagline: string;
  currency: CurrencyCode;
  taxRate: number;
  monthlySalesTarget: number;
  receiptHeader: string;
  receiptFooter: string;
  branchAddress: string;
  businessPhone: string;
  enabledModules: ErpModuleId[];
  managerPin?: string;
  defaultWarrantyDays?: number;
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StaffMember {
  id: string;
  ownerId: string;
  workspaceName: string;
  staffName: string;
  staffEmail: string;
  role: InvitedStaffRole;
  assignedBranch: string;
  status: 'active' | 'revoked';
  invitedByEmail: string;
  createdByUid?: string;
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ShiftRegister {
  id: string;
  ownerId: string;
  shiftNumber: string;
  cashierName: string;
  cashierEmail: string;
  openedByUid: string;
  openedAt: string;
  closedAt: string;
  closedByName?: string;
  openingFloat: number;
  cashSalesTotal: number;
  mobileMoneyTotal: number;
  cardSalesTotal: number;
  creditSalesTotal: number;
  cashRefundsTotal: number;
  expectedCashInDrawer: number;
  countedCashInDrawer: number;
  varianceAmount: number;
  status: 'open' | 'closed';
  notes: string;
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  ownerId: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  stockQty: number;
  reorderLevel: number;
  supplierName: string;
  status: 'active' | 'archived';
  warrantyDays?: number;
  requiresSerial?: boolean;
  createdByUid?: string;
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PurchaseOrder {
  id: string;
  ownerId: string;
  poNumber: string;
  supplierName: string;
  supplierInvoiceNo?: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  amountPaid?: number;
  balanceDue?: number;
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  dueDate?: string;
  paymentMethod?: string;
  status: 'received' | 'cancelled';
  notes: string;
  createdByUid?: string;
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SaleTransaction {
  id: string;
  ownerId: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  cashierName: string;
  paymentMethod: PaymentMethod;
  itemCount: number;
  itemsSummary: string;
  serialsSummary?: string;
  warrantyUntil?: string;
  shiftId?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  cogsAmount: number;
  amountPaid: number;
  changeDue: number;
  status: 'completed' | 'refunded';
  notes: string;
  saleDate: string;
  createdByUid?: string;
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SaleItem {
  id: string;
  ownerId: string;
  saleId: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineDiscount: number;
  lineTotal: number;
  serialNumbers?: string;
  warrantyDays?: number;
  warrantyExpiryDate?: string;
  createdByUid?: string;
  authorizedEmails?: string[];
  createdAt?: unknown;
}

export interface CartItem {
  product: Product;
  quantity: number;
  lineDiscount: number;
  serialNumbers: string;
}

export interface LedgerEntry {
  id: string;
  ownerId: string;
  entryRef: string;
  entryType: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  sourceModule: 'POS' | 'Inventory' | 'HR' | 'Manual' | 'Sales' | 'Payables';
  entryDate: string;
  createdByUid?: string;
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Employee {
  id: string;
  ownerId: string;
  staffCode: string;
  fullName: string;
  roleTitle: string;
  department: string;
  phone: string;
  email: string;
  monthlySalary: number;
  shiftSchedule: string;
  attendanceStatus: 'Present' | 'On Shift' | 'Off Duty' | 'On Leave';
  payrollStatus: 'Paid' | 'Pending';
  lastPaidDate: string;
  employmentStatus: 'active' | 'inactive';
  systemRole?: InvitedStaffRole | 'None';
  createdByUid?: string;
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Customer {
  id: string;
  ownerId: string;
  customerCode: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  segment: 'Retail' | 'Wholesale' | 'VIP' | 'Corporate';
  loyaltyPoints: number;
  creditBalance: number;
  totalSpent: number;
  ordersCount: number;
  lastOrderDate: string;
  notes: string;
  createdByUid?: string;
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}
