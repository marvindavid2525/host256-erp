import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  BusinessSettings,
  CartItem,
  Customer,
  Employee,
  InvitedStaffRole,
  LedgerEntry,
  PaymentMethod,
  Product,
  PurchaseOrder,
  SaleItem,
  SaleTransaction,
  ShiftRegister,
  StaffMember,
} from '../types/erp';
import {
  addDaysToIsoDate,
  clampNonNegative,
  clampSignedNumber,
  clampString,
  formatIsoDate,
  makeSafeId,
} from '../utils/formatters';

export interface RoleEmailBuckets {
  allStaff: string[];
  posFinance: string[];
  inventoryFinance: string[];
  financeOnly: string[];
  adminOnly: string[];
}

export function computeRoleEmailBuckets(staffList: StaffMember[]): RoleEmailBuckets {
  const active = staffList.filter((s) => s.status === 'active' && s.staffEmail.trim().length >= 3);
  const uniqueEmails = (roles: InvitedStaffRole[]) =>
    Array.from(
      new Set(
        active
          .filter((s) => roles.includes(s.role))
          .map((s) => s.staffEmail.trim().toLowerCase())
      )
    ).slice(0, 25);

  return {
    allStaff: uniqueEmails(['Admin', 'Cashier', 'Warehouse', 'Accountant']),
    posFinance: uniqueEmails(['Admin', 'Cashier', 'Accountant']),
    inventoryFinance: uniqueEmails(['Admin', 'Warehouse', 'Accountant']),
    financeOnly: uniqueEmails(['Admin', 'Accountant']),
    adminOnly: uniqueEmails(['Admin']),
  };
}

function actorUid(fallbackOwnerId: string): string {
  return auth.currentUser?.uid || fallbackOwnerId;
}

export const DEFAULT_BUSINESS_SETTINGS = (ownerId: string): BusinessSettings => ({
  ownerId,
  businessName: 'HOST256 ERP — Liquidation Uganda',
  tagline: 'One System. Multiple Solutions.',
  currency: 'UGX',
  taxRate: 18,
  monthlySalesTarget: 45_000_000,
  receiptHeader: 'Plot 24 Kampala Road · Downtown Branch',
  receiptFooter: 'Goods once sold carry an official store warranty verified by unit Serial/IMEI. Thank you for shopping with us.',
  branchAddress: 'Plot 24 Kampala Road, Kampala, Uganda',
  businessPhone: '+256 772 256 000',
  enabledModules: ['pos', 'sales', 'inventory', 'accounting', 'hr', 'crm', 'reports'],
  managerPin: '2560',
  defaultWarrantyDays: 7,
  authorizedEmails: [],
});

export async function saveBusinessSettings(
  ownerId: string,
  settings: Omit<BusinessSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  isExisting: boolean
): Promise<void> {
  const path = `businessSettings/${ownerId}`;
  const docRef = doc(db, 'businessSettings', ownerId);
  const enabled = settings.enabledModules.length > 0 ? settings.enabledModules.slice(0, 10) : ['pos'];
  const sanitized = {
    businessName: clampString(settings.businessName, 120, 'HOST256 ERP'),
    tagline: clampString(settings.tagline, 160, ''),
    currency: settings.currency,
    taxRate: Math.max(0, Math.min(100, Number(settings.taxRate) || 0)),
    monthlySalesTarget: clampNonNegative(settings.monthlySalesTarget),
    receiptHeader: clampString(settings.receiptHeader, 200, ''),
    receiptFooter: clampString(settings.receiptFooter, 240, ''),
    branchAddress: clampString(settings.branchAddress, 180, ''),
    businessPhone: clampString(settings.businessPhone, 40, ''),
    enabledModules: enabled,
    managerPin: clampString(settings.managerPin ?? '', 8, ''),
    defaultWarrantyDays: Math.max(
      0,
      Math.min(3650, Math.round(Number(settings.defaultWarrantyDays ?? 7) || 0))
    ),
    authorizedEmails: (settings.authorizedEmails || []).slice(0, 25),
  };

  try {
    if (isExisting) {
      await updateDoc(docRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ownerId,
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isExisting ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function syncWorkspaceAuthorizedEmails(
  ownerId: string,
  staffList: StaffMember[]
): Promise<void> {
  if (auth.currentUser?.uid !== ownerId) {
    return;
  }
  const buckets = computeRoleEmailBuckets(staffList);
  const batch = writeBatch(db);
  let opCount = 0;

  const settingsSnap = await getDoc(doc(db, 'businessSettings', ownerId));
  if (settingsSnap.exists()) {
    batch.update(doc(db, 'businessSettings', ownerId), {
      authorizedEmails: buckets.allStaff,
      updatedAt: serverTimestamp(),
    });
    opCount++;
  }

  const syncCollection = async (colName: string, emails: string[]) => {
    const snap = await getDocs(query(collection(db, colName), where('ownerId', '==', ownerId)));
    for (const d of snap.docs) {
      if (opCount >= 420) break;
      batch.update(doc(db, colName, d.id), {
        authorizedEmails: emails,
        updatedAt: serverTimestamp(),
      });
      opCount++;
    }
  };

  await syncCollection('products', buckets.allStaff);
  await syncCollection('purchaseOrders', buckets.inventoryFinance);
  await syncCollection('sales', buckets.posFinance);
  await syncCollection('customers', buckets.posFinance);
  await syncCollection('shiftRegisters', buckets.posFinance);
  await syncCollection('ledgerEntries', buckets.financeOnly);
  await syncCollection('employees', buckets.adminOnly);
  await syncCollection('staffMembers', buckets.adminOnly);

  if (opCount > 0) {
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `businessSettings/${ownerId}`);
    }
  }
}

export async function saveStaffMemberInvite(
  ownerId: string,
  workspaceName: string,
  currentStaff: StaffMember[],
  input: {
    staffName: string;
    staffEmail: string;
    role: InvitedStaffRole;
    assignedBranch: string;
    status: 'active' | 'revoked';
  },
  existingId?: string
): Promise<void> {
  const id = existingId || makeSafeId('stf');
  const normalizedEmail = clampString(input.staffEmail.toLowerCase(), 120, '');
  if (!normalizedEmail.includes('@')) {
    throw new Error('Enter a valid Google email address for the staff member.');
  }

  const updatedPreview: StaffMember[] = existingId
    ? currentStaff.map((s) =>
        s.id === existingId
          ? { ...s, ...input, staffEmail: normalizedEmail }
          : s
      )
    : [
        ...currentStaff,
        {
          id,
          ownerId,
          workspaceName,
          staffName: input.staffName,
          staffEmail: normalizedEmail,
          role: input.role,
          assignedBranch: input.assignedBranch,
          status: input.status,
          invitedByEmail: auth.currentUser?.email || 'owner@host256.ug',
        },
      ];

  const buckets = computeRoleEmailBuckets(updatedPreview);

  const payload = {
    workspaceName: clampString(workspaceName, 120, 'HOST256 ERP'),
    staffName: clampString(input.staffName, 100, 'Staff Member'),
    staffEmail: normalizedEmail,
    role: input.role,
    assignedBranch: clampString(input.assignedBranch, 100, 'Main Branch'),
    status: input.status,
    authorizedEmails: buckets.adminOnly,
  };

  try {
    if (existingId) {
      await updateDoc(doc(db, 'staffMembers', existingId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'staffMembers', id), {
        ownerId,
        ...payload,
        invitedByEmail: clampString(auth.currentUser?.email || 'owner@host256.ug', 120, 'owner@host256.ug'),
        createdByUid: actorUid(ownerId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await syncWorkspaceAuthorizedEmails(ownerId, updatedPreview);
  } catch (error) {
    handleFirestoreError(
      error,
      existingId ? OperationType.UPDATE : OperationType.CREATE,
      `staffMembers/${id}`
    );
  }
}

export async function removeStaffMemberInvite(
  ownerId: string,
  inviteId: string,
  currentStaff: StaffMember[]
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'staffMembers', inviteId));
    const remaining = currentStaff.filter((s) => s.id !== inviteId);
    await syncWorkspaceAuthorizedEmails(ownerId, remaining);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `staffMembers/${inviteId}`);
  }
}

export async function ensureWorkspaceBinding(invite: StaffMember): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) return;
  const path = `workspaceBindings/${invite.ownerId}/members/${user.uid}`;
  const bindingRef = doc(db, 'workspaceBindings', invite.ownerId, 'members', user.uid);

  try {
    const existingSnap = await getDoc(bindingRef);
    if (existingSnap.exists()) {
      await updateDoc(bindingRef, {
        inviteId: invite.id,
        role: invite.role,
        staffEmail: user.email,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(bindingRef, {
        ownerId: invite.ownerId,
        staffUid: user.uid,
        staffEmail: user.email,
        inviteId: invite.id,
        role: invite.role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function openShiftRegister(params: {
  ownerId: string;
  cashierName: string;
  cashierEmail: string;
  openingFloat: number;
  notes: string;
  authorizedEmails?: string[];
}): Promise<string> {
  const id = makeSafeId('shf');
  const shiftNumber = `SHF-${Date.now().toString().slice(-6)}`;
  const path = `shiftRegisters/${id}`;
  const floatAmt = clampNonNegative(params.openingFloat);

  try {
    await setDoc(doc(db, 'shiftRegisters', id), {
      ownerId: params.ownerId,
      shiftNumber,
      cashierName: clampString(params.cashierName, 100, 'Cashier'),
      cashierEmail: clampString(params.cashierEmail, 120, ''),
      openedByUid: actorUid(params.ownerId),
      openedAt: new Date().toISOString().slice(0, 32),
      closedAt: '',
      closedByName: '',
      openingFloat: floatAmt,
      cashSalesTotal: 0,
      mobileMoneyTotal: 0,
      cardSalesTotal: 0,
      creditSalesTotal: 0,
      cashRefundsTotal: 0,
      expectedCashInDrawer: floatAmt,
      countedCashInDrawer: 0,
      varianceAmount: 0,
      status: 'open',
      notes: clampString(params.notes, 240, ''),
      authorizedEmails: (params.authorizedEmails || []).slice(0, 25),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function calculateShiftReconciliation(
  shift: ShiftRegister,
  sales: SaleTransaction[]
): {
  cashSalesTotal: number;
  mobileMoneyTotal: number;
  cardSalesTotal: number;
  creditSalesTotal: number;
  cashRefundsTotal: number;
  expectedCashInDrawer: number;
  shiftSalesCount: number;
} {
  const shiftSales = sales.filter(
    (s) => s.shiftId === shift.id || (s.saleDate >= shift.openedAt && (!shift.closedAt || s.saleDate <= shift.closedAt))
  );

  let cashSalesTotal = 0;
  let mobileMoneyTotal = 0;
  let cardSalesTotal = 0;
  let creditSalesTotal = 0;
  let cashRefundsTotal = 0;
  let shiftSalesCount = 0;

  for (const s of shiftSales) {
    if (s.status === 'completed') {
      shiftSalesCount++;
      if (s.paymentMethod === 'Cash') {
        cashSalesTotal += s.totalAmount;
      } else if (s.paymentMethod === 'MTN Mobile Money' || s.paymentMethod === 'Airtel Money') {
        mobileMoneyTotal += s.totalAmount;
      } else if (s.paymentMethod === 'Card') {
        cardSalesTotal += s.totalAmount;
      } else if (s.paymentMethod === 'Customer Credit') {
        creditSalesTotal += s.totalAmount;
      }
    } else if (s.status === 'refunded' && s.paymentMethod === 'Cash') {
      cashRefundsTotal += s.totalAmount;
    }
  }

  const expectedCashInDrawer = clampNonNegative(
    shift.openingFloat + cashSalesTotal - cashRefundsTotal
  );

  return {
    cashSalesTotal: clampNonNegative(cashSalesTotal),
    mobileMoneyTotal: clampNonNegative(mobileMoneyTotal),
    cardSalesTotal: clampNonNegative(cardSalesTotal),
    creditSalesTotal: clampNonNegative(creditSalesTotal),
    cashRefundsTotal: clampNonNegative(cashRefundsTotal),
    expectedCashInDrawer,
    shiftSalesCount,
  };
}

export async function closeShiftRegister(params: {
  shift: ShiftRegister;
  sales: SaleTransaction[];
  countedCashInDrawer: number;
  closedByName: string;
  notes: string;
}): Promise<ShiftRegister> {
  const { shift, sales, countedCashInDrawer, closedByName, notes } = params;
  const recon = calculateShiftReconciliation(shift, sales);
  const counted = clampNonNegative(countedCashInDrawer);
  const variance = clampSignedNumber(counted - recon.expectedCashInDrawer);
  const closedAt = new Date().toISOString().slice(0, 32);

  const updates = {
    closedAt,
    closedByName: clampString(closedByName, 100, shift.cashierName),
    cashSalesTotal: recon.cashSalesTotal,
    mobileMoneyTotal: recon.mobileMoneyTotal,
    cardSalesTotal: recon.cardSalesTotal,
    creditSalesTotal: recon.creditSalesTotal,
    cashRefundsTotal: recon.cashRefundsTotal,
    expectedCashInDrawer: recon.expectedCashInDrawer,
    countedCashInDrawer: counted,
    varianceAmount: variance,
    status: 'closed' as const,
    notes: clampString(notes, 240, shift.notes || ''),
  };

  try {
    await updateDoc(doc(db, 'shiftRegisters', shift.id), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return {
      ...shift,
      ...updates,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `shiftRegisters/${shift.id}`);
  }
}

export async function createOrUpdateProduct(
  ownerId: string,
  input: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
  existingId?: string,
  authorizedEmails: string[] = []
): Promise<string> {
  const id = existingId || makeSafeId('prod');
  const path = `products/${id}`;
  const sanitized = {
    sku: clampString(input.sku, 40, 'SKU-001'),
    name: clampString(input.name, 140, 'Unnamed Product'),
    category: clampString(input.category, 60, 'General'),
    unit: clampString(input.unit, 24, 'pcs'),
    costPrice: clampNonNegative(input.costPrice),
    sellingPrice: clampNonNegative(input.sellingPrice),
    stockQty: clampNonNegative(input.stockQty),
    reorderLevel: clampNonNegative(input.reorderLevel),
    supplierName: clampString(input.supplierName, 100, ''),
    status: input.status === 'archived' ? 'archived' : 'active',
    warrantyDays: Math.max(0, Math.min(3650, Math.round(Number(input.warrantyDays ?? 7) || 0))),
    requiresSerial: Boolean(input.requiresSerial),
    authorizedEmails: authorizedEmails.slice(0, 25),
  };

  try {
    if (existingId) {
      await updateDoc(doc(db, 'products', existingId), {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'products', id), {
        ownerId,
        ...sanitized,
        createdByUid: actorUid(ownerId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function removeProduct(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function recordSupplierPurchase(
  ownerId: string,
  product: Product,
  params: {
    supplierName: string;
    supplierInvoiceNo?: string;
    quantity: number;
    unitCost: number;
    amountPaid?: number;
    dueDate?: string;
    paymentMethod: string;
    notes: string;
    poAuthorizedEmails?: string[];
    ledgerAuthorizedEmails?: string[];
  }
): Promise<void> {
  const poId = makeSafeId('po');
  const ledgerId = makeSafeId('led');
  const qty = Math.max(1, Math.min(1_000_000, Math.round(params.quantity)));
  const unitCost = clampNonNegative(params.unitCost);
  const totalCost = clampNonNegative(qty * unitCost);
  const isCreditMode = params.paymentMethod === 'Supplier Credit';
  const rawPaid =
    params.amountPaid !== undefined
      ? clampNonNegative(params.amountPaid)
      : isCreditMode
      ? 0
      : totalCost;
  const amountPaid = Math.min(totalCost, rawPaid);
  const balanceDue = clampNonNegative(totalCost - amountPaid);
  const paymentStatus: 'paid' | 'partial' | 'unpaid' =
    balanceDue === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

  const poNumber = `PO-${Date.now().toString().slice(-6)}`;
  const batch = writeBatch(db);

  batch.update(doc(db, 'products', product.id), {
    stockQty: clampNonNegative(product.stockQty + qty),
    costPrice: unitCost,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'purchaseOrders', poId), {
    ownerId,
    poNumber,
    supplierName: clampString(params.supplierName, 100, product.supplierName || 'Direct Supplier'),
    supplierInvoiceNo: clampString(params.supplierInvoiceNo || '', 60, ''),
    productId: product.id,
    productName: clampString(product.name, 140, 'Product'),
    quantity: qty,
    unitCost,
    totalCost,
    amountPaid,
    balanceDue,
    paymentStatus,
    dueDate: balanceDue > 0 ? clampString(params.dueDate || addDaysToIsoDate(14), 32, '') : '',
    paymentMethod: clampString(params.paymentMethod, 32, 'Cash'),
    status: 'received',
    notes: clampString(params.notes, 240, ''),
    createdByUid: actorUid(ownerId),
    authorizedEmails: (params.poAuthorizedEmails || []).slice(0, 25),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (amountPaid > 0) {
    batch.set(doc(db, 'ledgerEntries', ledgerId), {
      ownerId,
      entryRef: poNumber,
      entryType: 'expense',
      category: balanceDue > 0 ? 'Inventory Deposit (Partial)' : 'Inventory Restock',
      description: clampString(
        `Stock purchase (${paymentStatus}): ${qty} ${product.unit} × ${product.name}`,
        240,
        'Stock purchase'
      ),
      amount: amountPaid,
      paymentMethod: clampString(
        params.paymentMethod === 'Supplier Credit' ? 'Cash' : params.paymentMethod,
        32,
        'Cash'
      ),
      sourceModule: 'Inventory',
      entryDate: formatIsoDate(),
      createdByUid: actorUid(ownerId),
      authorizedEmails: (params.ledgerAuthorizedEmails || []).slice(0, 25),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `purchaseOrders/${poId}`);
  }
}

export async function settleSupplierPayable(params: {
  ownerId: string;
  purchaseOrder: PurchaseOrder;
  paymentAmount: number;
  paymentMethod: string;
  notes?: string;
  ledgerAuthorizedEmails?: string[];
}): Promise<void> {
  const { ownerId, purchaseOrder, paymentAmount, paymentMethod, notes, ledgerAuthorizedEmails } =
    params;
  const currentBalance =
    purchaseOrder.balanceDue !== undefined
      ? purchaseOrder.balanceDue
      : purchaseOrder.paymentStatus === 'unpaid'
      ? purchaseOrder.totalCost
      : 0;

  const payAmt = Math.min(currentBalance, Math.max(1, clampNonNegative(paymentAmount)));
  if (payAmt <= 0) return;

  const prevPaid =
    purchaseOrder.amountPaid !== undefined
      ? purchaseOrder.amountPaid
      : Math.max(0, purchaseOrder.totalCost - currentBalance);
  const nextPaid = clampNonNegative(prevPaid + payAmt);
  const nextBalance = clampNonNegative(Math.max(0, purchaseOrder.totalCost - nextPaid));
  const nextStatus: 'paid' | 'partial' | 'unpaid' =
    nextBalance === 0 ? 'paid' : nextPaid > 0 ? 'partial' : 'unpaid';

  const batch = writeBatch(db);
  const payRef = `AP-${Date.now().toString().slice(-6)}`;

  batch.update(doc(db, 'purchaseOrders', purchaseOrder.id), {
    amountPaid: nextPaid,
    balanceDue: nextBalance,
    paymentStatus: nextStatus,
    paymentMethod: clampString(paymentMethod, 32, 'MTN Mobile Money'),
    notes: clampString(notes || purchaseOrder.notes || '', 240, ''),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'ledgerEntries', makeSafeId('led')), {
    ownerId,
    entryRef: payRef,
    entryType: 'expense',
    category: 'Supplier Accounts Payable',
    description: clampString(
      `Supplier payable settlement (${purchaseOrder.poNumber} · ${purchaseOrder.supplierName})${
        nextBalance > 0 ? ' [Partial]' : ' [Cleared]'
      }`,
      240,
      'Supplier payable payment'
    ),
    amount: payAmt,
    paymentMethod: clampString(paymentMethod, 32, 'MTN Mobile Money'),
    sourceModule: 'Payables',
    entryDate: formatIsoDate(),
    createdByUid: actorUid(ownerId),
    authorizedEmails: (ledgerAuthorizedEmails || []).slice(0, 25),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `purchaseOrders/${purchaseOrder.id}`);
  }
}

export interface CheckoutResult {
  sale: SaleTransaction;
  items: SaleItem[];
}

export async function processPosCheckout(params: {
  ownerId: string;
  cart: CartItem[];
  customer: Customer | null;
  cashierName: string;
  paymentMethod: PaymentMethod;
  taxRate: number;
  amountPaid: number;
  notes: string;
  defaultWarrantyDays?: number;
  shiftId?: string;
  posAuthorizedEmails?: string[];
  ledgerAuthorizedEmails?: string[];
}): Promise<CheckoutResult> {
  const {
    ownerId,
    cart,
    customer,
    cashierName,
    paymentMethod,
    taxRate,
    amountPaid,
    notes,
    defaultWarrantyDays = 7,
    shiftId = '',
    posAuthorizedEmails = [],
    ledgerAuthorizedEmails = [],
  } = params;
  if (cart.length === 0) {
    throw new Error('Cart is empty.');
  }

  const saleId = makeSafeId('sale');
  const receiptNumber = `RCP-${Date.now().toString().slice(-6)}`;
  const nowIso = new Date().toISOString();
  const creator = actorUid(ownerId);

  let rawSubtotal = 0;
  let totalDiscount = 0;
  let totalCogs = 0;
  let totalQty = 0;
  let maxWarrantyUntil = '';
  const allSerialTokens: string[] = [];

  const preparedItems: SaleItem[] = cart.map((entry) => {
    const qty = Math.max(1, Math.min(100_000, Math.round(entry.quantity)));
    const discount = clampNonNegative(entry.lineDiscount);
    const gross = entry.product.sellingPrice * qty;
    const lineTotal = clampNonNegative(gross - discount);
    rawSubtotal += gross;
    totalDiscount += Math.min(gross, discount);
    totalCogs += entry.product.costPrice * qty;
    totalQty += qty;

    const itemWarrantyDays =
      entry.product.warrantyDays !== undefined ? entry.product.warrantyDays : defaultWarrantyDays;
    const expiryIso = itemWarrantyDays > 0 ? addDaysToIsoDate(itemWarrantyDays, nowIso) : '';
    if (expiryIso && expiryIso > maxWarrantyUntil) {
      maxWarrantyUntil = expiryIso;
    }

    const cleanSerials = clampString(entry.serialNumbers || '', 240, '');
    if (cleanSerials) {
      allSerialTokens.push(`${entry.product.sku}: ${cleanSerials}`);
    }

    return {
      id: makeSafeId('item'),
      ownerId,
      saleId,
      productId: entry.product.id,
      sku: clampString(entry.product.sku, 40, 'SKU'),
      productName: clampString(entry.product.name, 140, 'Item'),
      quantity: qty,
      unitPrice: clampNonNegative(entry.product.sellingPrice),
      unitCost: clampNonNegative(entry.product.costPrice),
      lineDiscount: Math.min(gross, discount),
      lineTotal,
      serialNumbers: cleanSerials,
      warrantyDays: itemWarrantyDays,
      warrantyExpiryDate: expiryIso,
      createdByUid: creator,
      authorizedEmails: posAuthorizedEmails.slice(0, 25),
    };
  });

  const netBeforeTax = Math.max(0, rawSubtotal - totalDiscount);
  const computedTax = clampNonNegative((netBeforeTax * Math.max(0, Math.min(100, taxRate))) / 100);
  const grandTotal = clampNonNegative(netBeforeTax + computedTax);
  const paid =
    paymentMethod === 'Customer Credit' ? 0 : Math.max(grandTotal, clampNonNegative(amountPaid));
  const changeDue = paymentMethod === 'Customer Credit' ? 0 : clampNonNegative(paid - grandTotal);

  const summaryText = clampString(
    preparedItems.map((i) => `${i.quantity}x ${i.productName}`).join(', '),
    400,
    'POS Sale'
  );
  const serialsSummary = clampString(allSerialTokens.join(' | '), 400, '');

  const saleData = {
    ownerId,
    receiptNumber,
    customerId: customer ? customer.id : '',
    customerName: clampString(
      customer ? customer.fullName : 'Walk-in Customer',
      100,
      'Walk-in Customer'
    ),
    cashierName: clampString(cashierName, 100, 'Main Cashier'),
    paymentMethod,
    itemCount: Math.max(1, Math.min(500, totalQty)),
    itemsSummary: summaryText,
    serialsSummary,
    warrantyUntil: maxWarrantyUntil,
    shiftId: clampString(shiftId, 128, ''),
    subtotal: clampNonNegative(rawSubtotal),
    discountAmount: clampNonNegative(totalDiscount),
    taxAmount: computedTax,
    totalAmount: grandTotal,
    cogsAmount: clampNonNegative(totalCogs),
    amountPaid: paid,
    changeDue,
    status: 'completed' as const,
    notes: clampString(notes, 240, ''),
    saleDate: nowIso.slice(0, 32),
    createdByUid: creator,
    authorizedEmails: posAuthorizedEmails.slice(0, 25),
  };

  const batch = writeBatch(db);

  // 1. Create Sale header
  batch.set(doc(db, 'sales', saleId), {
    ...saleData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Create subcollection items & decrement stock
  for (const cartEntry of cart) {
    const matchingItem = preparedItems.find((i) => i.productId === cartEntry.product.id);
    if (!matchingItem) continue;

    batch.set(doc(db, 'sales', saleId, 'items', matchingItem.id), {
      ownerId: matchingItem.ownerId,
      saleId: matchingItem.saleId,
      productId: matchingItem.productId,
      sku: matchingItem.sku,
      productName: matchingItem.productName,
      quantity: matchingItem.quantity,
      unitPrice: matchingItem.unitPrice,
      unitCost: matchingItem.unitCost,
      lineDiscount: matchingItem.lineDiscount,
      lineTotal: matchingItem.lineTotal,
      serialNumbers: matchingItem.serialNumbers || '',
      warrantyDays: matchingItem.warrantyDays ?? 0,
      warrantyExpiryDate: matchingItem.warrantyExpiryDate || '',
      createdByUid: creator,
      authorizedEmails: posAuthorizedEmails.slice(0, 25),
      createdAt: serverTimestamp(),
    });

    const newStock = Math.max(0, cartEntry.product.stockQty - matchingItem.quantity);
    batch.update(doc(db, 'products', cartEntry.product.id), {
      stockQty: clampNonNegative(newStock),
      updatedAt: serverTimestamp(),
    });
  }

  // 3. Post Revenue to Accounting Ledger (if grandTotal > 0 and not unpaid credit, or record accrual)
  if (grandTotal > 0 && paymentMethod !== 'Customer Credit') {
    const ledgerId = makeSafeId('led');
    batch.set(doc(db, 'ledgerEntries', ledgerId), {
      ownerId,
      entryRef: receiptNumber,
      entryType: 'income',
      category: 'POS Sales Revenue',
      description: clampString(
        `Receipt ${receiptNumber} · ${saleData.customerName}`,
        240,
        'POS Sale'
      ),
      amount: grandTotal,
      paymentMethod: clampString(paymentMethod, 32, 'Cash'),
      sourceModule: 'POS',
      entryDate: formatIsoDate(),
      createdByUid: creator,
      authorizedEmails: ledgerAuthorizedEmails.slice(0, 25),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 4. Update CRM customer stats if selected
  if (customer) {
    const earnedPoints = Math.floor(grandTotal / 10000);
    const addedCredit = paymentMethod === 'Customer Credit' ? grandTotal : 0;
    batch.update(doc(db, 'customers', customer.id), {
      loyaltyPoints: clampNonNegative(customer.loyaltyPoints + Math.max(1, earnedPoints)),
      creditBalance: clampNonNegative(customer.creditBalance + addedCredit),
      totalSpent: clampNonNegative(customer.totalSpent + grandTotal),
      ordersCount: clampNonNegative(customer.ordersCount + 1),
      lastOrderDate: formatIsoDate(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `sales/${saleId}`);
  }

  return {
    sale: { id: saleId, ...saleData },
    items: preparedItems,
  };
}

export async function fetchSaleItems(ownerId: string, saleId: string): Promise<SaleItem[]> {
  const path = `sales/${saleId}/items`;
  const currentUser = auth.currentUser;
  const isOwner = currentUser?.uid === ownerId;

  try {
    const q = isOwner
      ? query(collection(db, 'sales', saleId, 'items'), where('ownerId', '==', ownerId))
      : query(
          collection(db, 'sales', saleId, 'items'),
          where('ownerId', '==', ownerId),
          where('authorizedEmails', 'array-contains', (currentUser?.email || '').toLowerCase())
        );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<SaleItem, 'id'>),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function refundSaleTransaction(params: {
  ownerId: string;
  sale: SaleTransaction;
  products: Product[];
  customers: Customer[];
  reason: string;
  ledgerAuthorizedEmails?: string[];
}): Promise<void> {
  const { ownerId, sale, products, customers, reason, ledgerAuthorizedEmails = [] } = params;
  if (sale.status === 'refunded') return;

  const saleItems = await fetchSaleItems(ownerId, sale.id);
  const batch = writeBatch(db);

  batch.update(doc(db, 'sales', sale.id), {
    status: 'refunded',
    notes: clampString(reason || 'Refunded via Sales Management', 240, 'Refunded'),
    updatedAt: serverTimestamp(),
  });

  // Restore inventory stock
  for (const item of saleItems) {
    const prod = products.find((p) => p.id === item.productId);
    if (prod) {
      batch.update(doc(db, 'products', prod.id), {
        stockQty: clampNonNegative(prod.stockQty + item.quantity),
        updatedAt: serverTimestamp(),
      });
    }
  }

  // Post reversal expense entry in Accounting (if cash/electronic payment was collected)
  if (sale.totalAmount > 0 && sale.paymentMethod !== 'Customer Credit') {
    const ledgerId = makeSafeId('led');
    batch.set(doc(db, 'ledgerEntries', ledgerId), {
      ownerId,
      entryRef: `RFD-${sale.receiptNumber.slice(-6)}`,
      entryType: 'expense',
      category: 'Sales Refunds & Returns',
      description: clampString(
        `Refund for ${sale.receiptNumber}: ${reason || 'Customer return'}`,
        240,
        'Refund'
      ),
      amount: clampNonNegative(sale.totalAmount),
      paymentMethod: clampString(sale.paymentMethod, 32, 'Cash'),
      sourceModule: 'Sales',
      entryDate: formatIsoDate(),
      createdByUid: actorUid(ownerId),
      authorizedEmails: ledgerAuthorizedEmails.slice(0, 25),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Adjust CRM customer balance if applicable
  if (sale.customerId) {
    const cust = customers.find((c) => c.id === sale.customerId);
    if (cust) {
      const reducedCredit =
        sale.paymentMethod === 'Customer Credit'
          ? Math.max(0, cust.creditBalance - sale.totalAmount)
          : cust.creditBalance;
      batch.update(doc(db, 'customers', cust.id), {
        loyaltyPoints: cust.loyaltyPoints,
        creditBalance: clampNonNegative(reducedCredit),
        totalSpent: clampNonNegative(Math.max(0, cust.totalSpent - sale.totalAmount)),
        ordersCount: cust.ordersCount,
        lastOrderDate: cust.lastOrderDate,
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sales/${sale.id}`);
  }
}

export async function createManualLedgerEntry(
  ownerId: string,
  input: {
    entryType: 'income' | 'expense';
    category: string;
    description: string;
    amount: number;
    paymentMethod: string;
    entryDate: string;
    authorizedEmails?: string[];
  }
): Promise<void> {
  const id = makeSafeId('led');
  const amount = Math.max(1, clampNonNegative(input.amount));
  const entryRef = `${input.entryType === 'income' ? 'INC' : 'EXP'}-${Date.now().toString().slice(-6)}`;
  try {
    await setDoc(doc(db, 'ledgerEntries', id), {
      ownerId,
      entryRef,
      entryType: input.entryType,
      category: clampString(input.category, 60, 'Operating Expense'),
      description: clampString(input.description, 240, 'Manual ledger entry'),
      amount,
      paymentMethod: clampString(input.paymentMethod, 32, 'Cash'),
      sourceModule: 'Manual',
      entryDate: clampString(input.entryDate || formatIsoDate(), 32, formatIsoDate()),
      createdByUid: actorUid(ownerId),
      authorizedEmails: (input.authorizedEmails || []).slice(0, 25),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `ledgerEntries/${id}`);
  }
}

export async function deleteLedgerEntry(entryId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'ledgerEntries', entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `ledgerEntries/${entryId}`);
  }
}

export async function saveEmployee(
  ownerId: string,
  input: Omit<Employee, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
  existingId?: string,
  authorizedEmails: string[] = []
): Promise<void> {
  const id = existingId || makeSafeId('emp');
  const sanitized = {
    fullName: clampString(input.fullName, 100, 'Employee'),
    roleTitle: clampString(input.roleTitle, 80, 'Staff'),
    department: clampString(input.department, 60, 'Operations'),
    phone: clampString(input.phone, 40, '+256 700 000000'),
    email: clampString(input.email, 120, ''),
    monthlySalary: clampNonNegative(input.monthlySalary),
    shiftSchedule: clampString(input.shiftSchedule, 60, 'Mon–Sat 08:00–17:00'),
    attendanceStatus: input.attendanceStatus,
    payrollStatus: input.payrollStatus,
    lastPaidDate: clampString(input.lastPaidDate, 32, ''),
    employmentStatus: input.employmentStatus,
    systemRole: input.systemRole || 'None',
    authorizedEmails: authorizedEmails.slice(0, 25),
  };

  try {
    if (existingId) {
      await updateDoc(doc(db, 'employees', existingId), {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'employees', id), {
        ownerId,
        staffCode: clampString(
          input.staffCode || `EMP-${Date.now().toString().slice(-4)}`,
          32,
          'EMP-001'
        ),
        ...sanitized,
        createdByUid: actorUid(ownerId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      existingId ? OperationType.UPDATE : OperationType.CREATE,
      `employees/${id}`
    );
  }
}

export async function updateEmployeeAttendance(
  employeeId: string,
  attendanceStatus: Employee['attendanceStatus'],
  shiftSchedule: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'employees', employeeId), {
      attendanceStatus,
      shiftSchedule: clampString(shiftSchedule, 60, 'Mon–Sat 08:00–17:00'),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `employees/${employeeId}`);
  }
}

export async function disburseEmployeeSalary(
  ownerId: string,
  employee: Employee,
  paymentMethod: string,
  ledgerAuthorizedEmails: string[] = []
): Promise<void> {
  const batch = writeBatch(db);
  const today = formatIsoDate();
  const payRef = `PAY-${Date.now().toString().slice(-6)}`;

  batch.update(doc(db, 'employees', employee.id), {
    payrollStatus: 'Paid',
    lastPaidDate: today,
    updatedAt: serverTimestamp(),
  });

  if (employee.monthlySalary > 0) {
    const ledgerId = makeSafeId('led');
    batch.set(doc(db, 'ledgerEntries', ledgerId), {
      ownerId,
      entryRef: payRef,
      entryType: 'expense',
      category: 'Staff Payroll & Salaries',
      description: clampString(
        `Monthly salary disbursement: ${employee.fullName} (${employee.roleTitle})`,
        240,
        'Payroll'
      ),
      amount: clampNonNegative(employee.monthlySalary),
      paymentMethod: clampString(paymentMethod, 32, 'MTN Mobile Money'),
      sourceModule: 'HR',
      entryDate: today,
      createdByUid: actorUid(ownerId),
      authorizedEmails: ledgerAuthorizedEmails.slice(0, 25),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `employees/${employee.id}`);
  }
}

export async function removeEmployee(employeeId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'employees', employeeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `employees/${employeeId}`);
  }
}

export async function saveCustomer(
  ownerId: string,
  input: Omit<Customer, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
  existingId?: string,
  authorizedEmails: string[] = []
): Promise<void> {
  const id = existingId || makeSafeId('cust');
  const sanitized = {
    fullName: clampString(input.fullName, 100, 'Customer'),
    phone: clampString(input.phone, 40, '+256 700 000000'),
    email: clampString(input.email, 120, ''),
    address: clampString(input.address, 180, ''),
    segment: input.segment,
    loyaltyPoints: clampNonNegative(input.loyaltyPoints),
    creditBalance: clampNonNegative(input.creditBalance),
    totalSpent: clampNonNegative(input.totalSpent),
    ordersCount: clampNonNegative(input.ordersCount),
    lastOrderDate: clampString(input.lastOrderDate, 32, ''),
    notes: clampString(input.notes, 240, ''),
    authorizedEmails: authorizedEmails.slice(0, 25),
  };

  try {
    if (existingId) {
      await updateDoc(doc(db, 'customers', existingId), {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'customers', id), {
        ownerId,
        customerCode: clampString(
          input.customerCode || `CUS-${Date.now().toString().slice(-4)}`,
          32,
          'CUS-001'
        ),
        ...sanitized,
        createdByUid: actorUid(ownerId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      existingId ? OperationType.UPDATE : OperationType.CREATE,
      `customers/${id}`
    );
  }
}

export async function settleCustomerCredit(
  ownerId: string,
  customer: Customer,
  paymentAmount: number,
  paymentMethod: string,
  ledgerAuthorizedEmails: string[] = []
): Promise<void> {
  const payAmt = Math.min(customer.creditBalance, Math.max(1, clampNonNegative(paymentAmount)));
  if (payAmt <= 0) return;

  const batch = writeBatch(db);
  const ref = `CRD-${Date.now().toString().slice(-6)}`;

  batch.update(doc(db, 'customers', customer.id), {
    loyaltyPoints: customer.loyaltyPoints,
    creditBalance: clampNonNegative(customer.creditBalance - payAmt),
    totalSpent: customer.totalSpent,
    ordersCount: customer.ordersCount,
    lastOrderDate: customer.lastOrderDate,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'ledgerEntries', makeSafeId('led')), {
    ownerId,
    entryRef: ref,
    entryType: 'income',
    category: 'Customer Credit Settlement',
    description: clampString(
      `Account payment received from ${customer.fullName}`,
      240,
      'Credit payment'
    ),
    amount: payAmt,
    paymentMethod: clampString(paymentMethod, 32, 'MTN Mobile Money'),
    sourceModule: 'Sales',
    entryDate: formatIsoDate(),
    createdByUid: actorUid(ownerId),
    authorizedEmails: ledgerAuthorizedEmails.slice(0, 25),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `customers/${customer.id}`);
  }
}

export async function removeCustomer(customerId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'customers', customerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `customers/${customerId}`);
  }
}

export async function seedSampleErpWorkspace(ownerId: string): Promise<void> {
  const batch = writeBatch(db);
  const today = formatIsoDate();
  const yesterday = formatIsoDate(new Date(Date.now() - 86_400_000));
  const twoDaysAgo = formatIsoDate(new Date(Date.now() - 2 * 86_400_000));
  const sevenDaysAhead = addDaysToIsoDate(7);
  const sixDaysAhead = addDaysToIsoDate(6);
  const creator = actorUid(ownerId);

  // Sample Staff Invites
  const seedStaff: Omit<StaffMember, 'createdAt' | 'updatedAt'>[] = [
    {
      id: makeSafeId('stf'),
      ownerId,
      workspaceName: 'HOST256 ERP — Liquidation Uganda',
      staffName: 'Brian Mugisha',
      staffEmail: 'brian.cashier@host256erp.ug',
      role: 'Cashier',
      assignedBranch: 'Kampala Road Counter 1',
      status: 'active',
      invitedByEmail: auth.currentUser?.email || 'owner@host256erp.ug',
      createdByUid: creator,
      authorizedEmails: [],
    },
    {
      id: makeSafeId('stf'),
      ownerId,
      workspaceName: 'HOST256 ERP — Liquidation Uganda',
      staffName: 'Amina Nabirye',
      staffEmail: 'amina.warehouse@host256erp.ug',
      role: 'Warehouse',
      assignedBranch: 'Namanve & Downtown Store',
      status: 'active',
      invitedByEmail: auth.currentUser?.email || 'owner@host256erp.ug',
      createdByUid: creator,
      authorizedEmails: [],
    },
    {
      id: makeSafeId('stf'),
      ownerId,
      workspaceName: 'HOST256 ERP — Liquidation Uganda',
      staffName: 'Samuel Kato',
      staffEmail: 'samuel.accounts@host256erp.ug',
      role: 'Accountant',
      assignedBranch: 'Head Office Finance',
      status: 'active',
      invitedByEmail: auth.currentUser?.email || 'owner@host256erp.ug',
      createdByUid: creator,
      authorizedEmails: [],
    },
  ];

  const buckets = computeRoleEmailBuckets(seedStaff);

  // 1. Business Settings
  const defaultSettings = DEFAULT_BUSINESS_SETTINGS(ownerId);
  batch.set(doc(db, 'businessSettings', ownerId), {
    ...defaultSettings,
    authorizedEmails: buckets.allStaff,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const stf of seedStaff) {
    batch.set(doc(db, 'staffMembers', stf.id), {
      ownerId: stf.ownerId,
      workspaceName: stf.workspaceName,
      staffName: stf.staffName,
      staffEmail: stf.staffEmail,
      role: stf.role,
      assignedBranch: stf.assignedBranch,
      status: stf.status,
      invitedByEmail: stf.invitedByEmail,
      createdByUid: creator,
      authorizedEmails: buckets.adminOnly,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 2. Inventory Products (with Warranty Days & Serial/IMEI Requirements)
  const p1Id = makeSafeId('prod');
  const p2Id = makeSafeId('prod');
  const p3Id = makeSafeId('prod');
  const p4Id = makeSafeId('prod');
  const p5Id = makeSafeId('prod');
  const p6Id = makeSafeId('prod');

  const seedProducts = [
    {
      id: p1Id,
      sku: 'LQU-TV-43SM',
      name: 'Hisense 43" 4K Smart UHD LED TV',
      category: 'Electronics',
      unit: 'unit',
      costPrice: 820_000,
      sellingPrice: 1_050_000,
      stockQty: 14,
      reorderLevel: 5,
      supplierName: 'Crown Electronics Kampala',
      warrantyDays: 7,
      requiresSerial: true,
    },
    {
      id: p2Id,
      sku: 'LQU-APP-BLD',
      name: 'Ninja Commercial Heavy-Duty Blender 1500W',
      category: 'Home Appliances',
      unit: 'unit',
      costPrice: 210_000,
      sellingPrice: 315_000,
      stockQty: 22,
      reorderLevel: 6,
      supplierName: 'UK Pallet Liquidators Ltd',
      warrantyDays: 7,
      requiresSerial: true,
    },
    {
      id: p3Id,
      sku: 'LQU-POS-SCN',
      name: 'Honeywell 2D Wireless Barcode Scanner',
      category: 'POS Hardware',
      unit: 'pcs',
      costPrice: 145_000,
      sellingPrice: 230_000,
      stockQty: 4,
      reorderLevel: 8,
      supplierName: 'Host256 Hardware Supply',
      warrantyDays: 30,
      requiresSerial: true,
    },
    {
      id: p4Id,
      sku: 'LQU-SOL-200',
      name: 'Monocrystalline Solar Panel 200W + Controller',
      category: 'Solar & Power',
      unit: 'kit',
      costPrice: 290_000,
      sellingPrice: 420_000,
      stockQty: 9,
      reorderLevel: 4,
      supplierName: 'East Africa Solar Hub',
      warrantyDays: 90,
      requiresSerial: true,
    },
    {
      id: p5Id,
      sku: 'LQU-OFF-CHR',
      name: 'Ergonomic Mesh Executive Office Chair',
      category: 'Furniture',
      unit: 'unit',
      costPrice: 185_000,
      sellingPrice: 280_000,
      stockQty: 3,
      reorderLevel: 5,
      supplierName: 'Namanve Warehouse Imports',
      warrantyDays: 7,
      requiresSerial: false,
    },
    {
      id: p6Id,
      sku: 'LQU-KIT-AF6',
      name: 'Philips Digital Air Fryer XL 6.2L',
      category: 'Home Appliances',
      unit: 'unit',
      costPrice: 240_000,
      sellingPrice: 360_000,
      stockQty: 18,
      reorderLevel: 6,
      supplierName: 'UK Pallet Liquidators Ltd',
      warrantyDays: 7,
      requiresSerial: true,
    },
  ];

  for (const p of seedProducts) {
    batch.set(doc(db, 'products', p.id), {
      ownerId,
      sku: p.sku,
      name: p.name.trim(),
      category: p.category,
      unit: p.unit,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      stockQty: p.stockQty,
      reorderLevel: p.reorderLevel,
      supplierName: p.supplierName,
      status: 'active',
      warrantyDays: p.warrantyDays,
      requiresSerial: p.requiresSerial,
      createdByUid: creator,
      authorizedEmails: buckets.allStaff,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 3. Customers (CRM)
  const c1Id = makeSafeId('cust');
  const c2Id = makeSafeId('cust');
  const c3Id = makeSafeId('cust');

  const seedCustomers = [
    {
      id: c1Id,
      customerCode: 'CUS-1001',
      fullName: 'Nakato Sarah Enterprises',
      phone: '+256 772 419 820',
      email: 'procurement@nakatoent.ug',
      address: 'Kikuubo Lane, Plaza Building Shop G12, Kampala',
      segment: 'Wholesale',
      loyaltyPoints: 340,
      creditBalance: 420_000,
      totalSpent: 4_850_000,
      ordersCount: 6,
      lastOrderDate: today,
      notes: 'Regular bulk buyer of kitchen appliances and TVs.',
    },
    {
      id: c2Id,
      customerCode: 'CUS-1002',
      fullName: 'David Ochieng',
      phone: '+256 752 883 110',
      email: 'd.ochieng@kampalatech.co.ug',
      address: 'Ntinda Complex Block B, Kampala',
      segment: 'Corporate',
      loyaltyPoints: 180,
      creditBalance: 0,
      totalSpent: 1_960_000,
      ordersCount: 3,
      lastOrderDate: yesterday,
      notes: 'Prefers VAT tax invoices with Serial/IMEI warranty schedule.',
    },
    {
      id: c3Id,
      customerCode: 'CUS-1003',
      fullName: 'Grace Namukasa',
      phone: '+256 784 512 009',
      email: 'grace.namukasa@gmail.com',
      address: 'Entebbe Road, Lubowa Estate',
      segment: 'VIP',
      loyaltyPoints: 125,
      creditBalance: 0,
      totalSpent: 1_410_000,
      ordersCount: 2,
      lastOrderDate: twoDaysAgo,
      notes: 'Pays via MTN Mobile Money.',
    },
  ];

  for (const c of seedCustomers) {
    batch.set(doc(db, 'customers', c.id), {
      ownerId,
      ...c,
      createdByUid: creator,
      authorizedEmails: buckets.posFinance,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 4. HR Employees
  const seedEmployees = [
    {
      id: makeSafeId('emp'),
      staffCode: 'EMP-201',
      fullName: 'Brian Mugisha',
      roleTitle: 'Senior POS Cashier',
      department: 'Retail Floor',
      phone: '+256 776 310 442',
      email: 'brian.cashier@host256erp.ug',
      monthlySalary: 950_000,
      shiftSchedule: 'Mon–Sat · 08:00–17:00',
      attendanceStatus: 'On Shift',
      payrollStatus: 'Paid',
      lastPaidDate: twoDaysAgo,
      employmentStatus: 'active',
      systemRole: 'Cashier' as const,
    },
    {
      id: makeSafeId('emp'),
      staffCode: 'EMP-202',
      fullName: 'Amina Nabirye',
      roleTitle: 'Inventory & Stock Controller',
      department: 'Warehouse',
      phone: '+256 701 992 315',
      email: 'amina.warehouse@host256erp.ug',
      monthlySalary: 1_200_000,
      shiftSchedule: 'Mon–Sat · 08:30–17:30',
      attendanceStatus: 'Present',
      payrollStatus: 'Pending',
      lastPaidDate: '',
      employmentStatus: 'active',
      systemRole: 'Warehouse' as const,
    },
    {
      id: makeSafeId('emp'),
      staffCode: 'EMP-203',
      fullName: 'Samuel Kato',
      roleTitle: 'Accounts & Finance Officer',
      department: 'Finance',
      phone: '+256 782 604 118',
      email: 'samuel.accounts@host256erp.ug',
      monthlySalary: 1_650_000,
      shiftSchedule: 'Mon–Fri · 08:30–17:00',
      attendanceStatus: 'Present',
      payrollStatus: 'Pending',
      lastPaidDate: '',
      employmentStatus: 'active',
      systemRole: 'Accountant' as const,
    },
  ];

  for (const emp of seedEmployees) {
    batch.set(doc(db, 'employees', emp.id), {
      ownerId,
      staffCode: emp.staffCode,
      fullName: emp.fullName,
      roleTitle: emp.roleTitle,
      department: emp.department,
      phone: emp.phone,
      email: emp.email,
      monthlySalary: emp.monthlySalary,
      shiftSchedule: emp.shiftSchedule,
      attendanceStatus: emp.attendanceStatus,
      payrollStatus: emp.payrollStatus,
      lastPaidDate: emp.lastPaidDate,
      employmentStatus: emp.employmentStatus,
      systemRole: emp.systemRole,
      createdByUid: creator,
      authorizedEmails: buckets.adminOnly,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 5. Sample Shift Registers (1 Closed Z-Report + 1 Open Shift)
  const closedShiftId = makeSafeId('shf');
  batch.set(doc(db, 'shiftRegisters', closedShiftId), {
    ownerId,
    shiftNumber: 'SHF-840100',
    cashierName: 'Brian Mugisha',
    cashierEmail: 'brian.cashier@host256erp.ug',
    openedByUid: creator,
    openedAt: new Date(Date.now() - 32 * 3_600_000).toISOString().slice(0, 32),
    closedAt: new Date(Date.now() - 22 * 3_600_000).toISOString().slice(0, 32),
    closedByName: 'Brian Mugisha',
    openingFloat: 200_000,
    cashSalesTotal: 840_000,
    mobileMoneyTotal: 0,
    cardSalesTotal: 0,
    creditSalesTotal: 0,
    cashRefundsTotal: 0,
    expectedCashInDrawer: 1_040_000,
    countedCashInDrawer: 1_040_000,
    varianceAmount: 0,
    status: 'closed',
    notes: 'Yesterday counter drawer reconciled cleanly with zero variance.',
    authorizedEmails: buckets.posFinance,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const openShiftId = makeSafeId('shf');
  batch.set(doc(db, 'shiftRegisters', openShiftId), {
    ownerId,
    shiftNumber: 'SHF-840205',
    cashierName: 'Brian Mugisha',
    cashierEmail: auth.currentUser?.email || 'brian.cashier@host256erp.ug',
    openedByUid: creator,
    openedAt: new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 32),
    closedAt: '',
    closedByName: '',
    openingFloat: 250_000,
    cashSalesTotal: 0,
    mobileMoneyTotal: 0,
    cardSalesTotal: 0,
    creditSalesTotal: 0,
    cashRefundsTotal: 0,
    expectedCashInDrawer: 250_000,
    countedCashInDrawer: 0,
    varianceAmount: 0,
    status: 'open',
    notes: 'Morning opening float verified by store supervisor.',
    authorizedEmails: buckets.posFinance,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 6. Sample Sales + Subcollection Items (with Serial/IMEI & 7-Day Warranty)
  const s1Id = makeSafeId('sale');
  const s1Total = 1_680_000;
  batch.set(doc(db, 'sales', s1Id), {
    ownerId,
    receiptNumber: 'RCP-840211',
    customerId: c1Id,
    customerName: 'Nakato Sarah Enterprises',
    cashierName: 'Brian Mugisha',
    paymentMethod: 'MTN Mobile Money',
    itemCount: 3,
    itemsSummary:
      '1x Hisense 43" 4K Smart UHD LED TV, 2x Ninja Commercial Heavy-Duty Blender 1500W',
    serialsSummary: 'LQU-TV-43SM: SN-HIS43-992014 | LQU-APP-BLD: SN-NJ15-4410, SN-NJ15-4411',
    warrantyUntil: sevenDaysAhead,
    shiftId: openShiftId,
    subtotal: 1_680_000,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: s1Total,
    cogsAmount: 1_240_000,
    amountPaid: s1Total,
    changeDue: 0,
    status: 'completed',
    notes: 'Wholesale counter pickup · 7-day warranty verified',
    saleDate: new Date().toISOString().slice(0, 32),
    createdByUid: creator,
    authorizedEmails: buckets.posFinance,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'sales', s1Id, 'items', makeSafeId('item')), {
    ownerId,
    saleId: s1Id,
    productId: p1Id,
    sku: 'LQU-TV-43SM',
    productName: 'Hisense 43" 4K Smart UHD LED TV',
    quantity: 1,
    unitPrice: 1_050_000,
    unitCost: 820_000,
    lineDiscount: 0,
    lineTotal: 1_050_000,
    serialNumbers: 'SN-HIS43-992014',
    warrantyDays: 7,
    warrantyExpiryDate: sevenDaysAhead,
    createdByUid: creator,
    authorizedEmails: buckets.posFinance,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'sales', s1Id, 'items', makeSafeId('item')), {
    ownerId,
    saleId: s1Id,
    productId: p2Id,
    sku: 'LQU-APP-BLD',
    productName: 'Ninja Commercial Heavy-Duty Blender 1500W',
    quantity: 2,
    unitPrice: 315_000,
    unitCost: 210_000,
    lineDiscount: 0,
    lineTotal: 630_000,
    serialNumbers: 'SN-NJ15-4410, SN-NJ15-4411',
    warrantyDays: 7,
    warrantyExpiryDate: sevenDaysAhead,
    createdByUid: creator,
    authorizedEmails: buckets.posFinance,
    createdAt: serverTimestamp(),
  });

  const s2Id = makeSafeId('sale');
  const solarWarrantyExpiry = addDaysToIsoDate(89);
  batch.set(doc(db, 'sales', s2Id), {
    ownerId,
    receiptNumber: 'RCP-840195',
    customerId: c2Id,
    customerName: 'David Ochieng',
    cashierName: 'Brian Mugisha',
    paymentMethod: 'Cash',
    itemCount: 2,
    itemsSummary: '2x Monocrystalline Solar Panel 200W + Controller',
    serialsSummary: 'LQU-SOL-200: SN-SOL200-7781, SN-SOL200-7782',
    warrantyUntil: solarWarrantyExpiry,
    shiftId: closedShiftId,
    subtotal: 840_000,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 840_000,
    cogsAmount: 580_000,
    amountPaid: 850_000,
    changeDue: 10_000,
    status: 'completed',
    notes: 'Includes charge controller kit · 90-day panel warranty',
    saleDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 32),
    createdByUid: creator,
    authorizedEmails: buckets.posFinance,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'sales', s2Id, 'items', makeSafeId('item')), {
    ownerId,
    saleId: s2Id,
    productId: p4Id,
    sku: 'LQU-SOL-200',
    productName: 'Monocrystalline Solar Panel 200W + Controller',
    quantity: 2,
    unitPrice: 420_000,
    unitCost: 290_000,
    lineDiscount: 0,
    lineTotal: 840_000,
    serialNumbers: 'SN-SOL200-7781, SN-SOL200-7782',
    warrantyDays: 90,
    warrantyExpiryDate: solarWarrantyExpiry,
    createdByUid: creator,
    authorizedEmails: buckets.posFinance,
    createdAt: serverTimestamp(),
  });

  // 7. Sample Supplier Purchase Orders (Paid + Credit Accounts Payable)
  const po1Id = makeSafeId('po');
  batch.set(doc(db, 'purchaseOrders', po1Id), {
    ownerId,
    poNumber: 'PO-550102',
    supplierName: 'UK Pallet Liquidators Ltd',
    supplierInvoiceNo: 'INV-UKP-1092',
    productId: p6Id,
    productName: 'Philips Digital Air Fryer XL 6.2L',
    quantity: 10,
    unitCost: 240_000,
    totalCost: 2_400_000,
    amountPaid: 1_500_000,
    balanceDue: 900_000,
    paymentStatus: 'partial',
    dueDate: sixDaysAhead,
    paymentMethod: 'Card',
    status: 'received',
    notes: 'Container batch #UK-19 · UGX 1.5M deposit paid, UGX 900k supplier credit due',
    createdByUid: creator,
    authorizedEmails: buckets.inventoryFinance,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const po2Id = makeSafeId('po');
  batch.set(doc(db, 'purchaseOrders', po2Id), {
    ownerId,
    poNumber: 'PO-550148',
    supplierName: 'Crown Electronics Kampala',
    supplierInvoiceNo: 'CEK-8821',
    productId: p1Id,
    productName: 'Hisense 43" 4K Smart UHD LED TV',
    quantity: 5,
    unitCost: 820_000,
    totalCost: 4_100_000,
    amountPaid: 0,
    balanceDue: 4_100_000,
    paymentStatus: 'unpaid',
    dueDate: sevenDaysAhead,
    paymentMethod: 'Supplier Credit',
    status: 'received',
    notes: '14-day wholesale supplier trade credit invoice',
    createdByUid: creator,
    authorizedEmails: buckets.inventoryFinance,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 8. Accounting Ledger Entries
  const seedLedger: Omit<
    LedgerEntry,
    'id' | 'ownerId' | 'createdAt' | 'updatedAt' | 'createdByUid' | 'authorizedEmails'
  >[] = [
    {
      entryRef: 'RCP-840211',
      entryType: 'income',
      category: 'POS Sales Revenue',
      description: 'Receipt RCP-840211 · Nakato Sarah Enterprises',
      amount: 1_680_000,
      paymentMethod: 'MTN Mobile Money',
      sourceModule: 'POS',
      entryDate: today,
    },
    {
      entryRef: 'RCP-840195',
      entryType: 'income',
      category: 'POS Sales Revenue',
      description: 'Receipt RCP-840195 · David Ochieng',
      amount: 840_000,
      paymentMethod: 'Cash',
      sourceModule: 'POS',
      entryDate: yesterday,
    },
    {
      entryRef: 'PO-550102',
      entryType: 'expense',
      category: 'Inventory Deposit (Partial)',
      description: 'Stock purchase (partial): 10 unit × Philips Digital Air Fryer XL 6.2L',
      amount: 1_500_000,
      paymentMethod: 'Card',
      sourceModule: 'Inventory',
      entryDate: twoDaysAgo,
    },
    {
      entryRef: 'PAY-309112',
      entryType: 'expense',
      category: 'Staff Payroll & Salaries',
      description: 'Monthly salary disbursement: Brian Mugisha (Senior POS Cashier)',
      amount: 950_000,
      paymentMethod: 'MTN Mobile Money',
      sourceModule: 'HR',
      entryDate: twoDaysAgo,
    },
    {
      entryRef: 'EXP-110420',
      entryType: 'expense',
      category: 'Rent & Store Utilities',
      description: 'Umeme Commercial Power & Shop Internet Fiber',
      amount: 380_000,
      paymentMethod: 'Airtel Money',
      sourceModule: 'Manual',
      entryDate: yesterday,
    },
  ];

  for (const entry of seedLedger) {
    batch.set(doc(db, 'ledgerEntries', makeSafeId('led')), {
      ownerId,
      ...entry,
      createdByUid: creator,
      authorizedEmails: buckets.financeOnly,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedSampleErpWorkspace');
  }
}
