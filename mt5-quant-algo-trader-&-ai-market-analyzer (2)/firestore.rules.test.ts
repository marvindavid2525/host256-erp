/**
 * Security Rules Verification Suite — Dirty Dozen Adversarial Payloads
 * Verifies that all 12 adversarial payloads defined in security_spec.md
 * return PERMISSION_DENIED against firestore.rules.
 */

export interface AdversarialCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: AdversarialCase[] = [
  {
    id: 1,
    name: 'Shadow / Ghost Field Injection on Product',
    collectionPath: 'products/prod_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'merchant@example.com', email_verified: true },
    payload: {
      ownerId: 'user_1',
      sku: 'SKU-001',
      name: 'Wireless Barcode Scanner',
      category: 'Hardware',
      unit: 'pcs',
      costPrice: 80000,
      sellingPrice: 120000,
      stockQty: 15,
      reorderLevel: 5,
      supplierName: 'Kampala Tech Supplies',
      status: 'active',
      isSuperAdmin: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Bootstrapped Admin Email Spoof',
    collectionPath: 'products/prod_01',
    operation: 'get',
    auth: { uid: 'spoof_uid', email: 'amarvinmulindwa2004@gmail.com', email_verified: false },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Uninvited Cross-Tenant Identity Spoofing on Sale Creation',
    collectionPath: 'sales/sale_01',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: {
      ownerId: 'victim_uid',
      receiptNumber: 'RCP-1001',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Path ID Poisoning Over 128 Characters',
    collectionPath: `products/${'a'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'user_1', email: 'merchant@example.com', email_verified: true },
    payload: { ownerId: 'user_1' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Cashier Attempting Unauthorized Payroll List on Employees',
    collectionPath: 'employees',
    operation: 'list',
    auth: { uid: 'cashier_uid', email: 'cashier@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Forged Past Client Timestamp on LedgerEntry',
    collectionPath: 'ledgerEntries/led_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'merchant@example.com', email_verified: true },
    payload: {
      ownerId: 'user_1',
      entryRef: 'LED-01',
      entryType: 'income',
      category: 'POS Sales',
      description: 'Backdated revenue entry',
      amount: 500000,
      paymentMethod: 'Cash',
      sourceModule: 'Manual',
      entryDate: '2020-01-01',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immortal Field Mutation on Product ownerId',
    collectionPath: 'products/prod_01',
    operation: 'update',
    auth: { uid: 'user_1', email: 'merchant@example.com', email_verified: true },
    payload: { ownerId: 'user_2' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Terminal State Reversal on Closed ShiftRegister',
    collectionPath: 'shiftRegisters/shift_closed_01',
    operation: 'update',
    auth: { uid: 'cashier_uid', email: 'cashier@example.com', email_verified: true },
    payload: { status: 'open', countedCashInDrawer: 9999999 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning on PurchaseOrder Supplier Payable Status',
    collectionPath: 'purchaseOrders/po_01',
    operation: 'update',
    auth: { uid: 'user_1', email: 'merchant@example.com', email_verified: true },
    payload: { paymentStatus: 'FORGED_PAID_STATE', balanceDue: -50000 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Orphaned Subcollection SaleItem Without Parent Sale',
    collectionPath: 'sales/non_existent_sale/items/item_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'merchant@example.com', email_verified: true },
    payload: {
      ownerId: 'user_1',
      saleId: 'non_existent_sale',
      productId: 'prod_01',
      sku: 'SKU-001',
      productName: 'Item',
      quantity: 1,
      unitPrice: 1000,
      unitCost: 500,
      lineDiscount: 0,
      lineTotal: 1000,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Privilege Escalation on WorkspaceBinding Role',
    collectionPath: 'workspaceBindings/owner_1/members/cashier_uid',
    operation: 'create',
    auth: { uid: 'cashier_uid', email: 'cashier@example.com', email_verified: true },
    payload: {
      ownerId: 'owner_1',
      staffUid: 'cashier_uid',
      staffEmail: 'cashier@example.com',
      inviteId: 'inv_cashier_01',
      role: 'Admin',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Orphaned Foreign Product Reference on Credit PurchaseOrder',
    collectionPath: 'purchaseOrders/po_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'merchant@example.com', email_verified: true },
    payload: {
      ownerId: 'user_1',
      poNumber: 'PO-999',
      supplierName: 'Ghost Supplier',
      productId: 'non_existent_product_id',
      productName: 'Ghost Item',
      quantity: 10,
      unitCost: 1000,
      totalCost: 10000,
      status: 'received',
      notes: '',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
