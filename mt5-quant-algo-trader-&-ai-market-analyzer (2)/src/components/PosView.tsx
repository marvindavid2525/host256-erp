import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Receipt,
  AlertTriangle,
  Package,
  Camera,
  Calculator,
  ShieldCheck,
} from 'lucide-react';
import {
  BusinessSettings,
  CartItem,
  Customer,
  Employee,
  PaymentMethod,
  Product,
  ROLE_PERMISSION_MATRIX,
  SaleItem,
  SaleTransaction,
  ShiftRegister,
  StaffRole,
} from '../types/erp';
import { formatCurrency } from '../utils/formatters';
import {
  calculateShiftReconciliation,
  processPosCheckout,
  RoleEmailBuckets,
} from '../services/erpService';
import { ReceiptModal } from './ReceiptModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ShiftRegisterModal } from './ShiftRegisterModal';
import { WarrantyLookupModal } from './WarrantyLookupModal';

interface PosViewProps {
  ownerId: string;
  userDisplayName: string;
  userEmail: string;
  activeRole: StaffRole;
  products: Product[];
  customers: Customer[];
  employees: Employee[];
  sales: SaleTransaction[];
  shifts: ShiftRegister[];
  settings: BusinessSettings;
  roleEmailBuckets: RoleEmailBuckets;
  onNavigateToInventory: () => void;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'MTN Mobile Money',
  'Airtel Money',
  'Card',
  'Customer Credit',
];

export const PosView: React.FC<PosViewProps> = ({
  ownerId,
  userDisplayName,
  userEmail,
  activeRole,
  products,
  customers,
  employees,
  sales,
  shifts,
  settings,
  roleEmailBuckets,
  onNavigateToInventory,
}) => {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [applyVat, setApplyVat] = useState<boolean>(false);
  const [amountTenderedInput, setAmountTenderedInput] = useState<string>('');
  const [saleNotes, setSaleNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<{
    sale: SaleTransaction;
    items: SaleItem[];
  } | null>(null);

  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showWarrantyModal, setShowWarrantyModal] = useState(false);

  const defaultWarrantyDays = settings.defaultWarrantyDays ?? 7;

  const openShift = useMemo(
    () => shifts.find((s) => s.status === 'open') || null,
    [shifts]
  );

  const openShiftRecon = useMemo(
    () => (openShift ? calculateShiftReconciliation(openShift, sales) : null),
    [openShift, sales]
  );

  const activeProducts = useMemo(
    () => products.filter((p) => p.status === 'active'),
    [products]
  );

  const categories = useMemo(() => {
    const unique = Array.from(new Set(activeProducts.map((p) => p.category)));
    return ['All', ...unique];
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeProducts.filter((p) => {
      const catMatch = selectedCategory === 'All' || p.category === selectedCategory;
      const queryMatch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return catMatch && queryMatch;
    });
  }, [activeProducts, selectedCategory, searchQuery]);

  const activeCashierName = useMemo(() => {
    if (openShift?.cashierName) return openShift.cashierName;
    const shiftCashier = employees.find(
      (e) =>
        e.employmentStatus === 'active' &&
        (e.attendanceStatus === 'On Shift' || e.attendanceStatus === 'Present')
    );
    return shiftCashier?.fullName || userDisplayName || 'Main Counter Cashier';
  }, [employees, openShift, userDisplayName]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    for (const item of cart) {
      const gross = item.product.sellingPrice * item.quantity;
      subtotal += gross;
      discount += Math.min(gross, item.lineDiscount);
    }
    const net = Math.max(0, subtotal - discount);
    const effectiveTaxRate = applyVat ? settings.taxRate : 0;
    const tax = (net * effectiveTaxRate) / 100;
    const grandTotal = net + tax;
    return { subtotal, discount, tax, grandTotal, effectiveTaxRate };
  }, [cart, applyVat, settings.taxRate]);

  const addToCart = useCallback((product: Product): boolean => {
    setErrorMessage(null);
    if (product.stockQty <= 0) {
      setErrorMessage(`"${product.name}" is out of stock. Restock in Inventory first.`);
      return false;
    }

    let addedOk = true;
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.stockQty) {
          setErrorMessage(`Only ${product.stockQty} ${product.unit} available in stock.`);
          addedOk = false;
          return prev;
        }
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          lineDiscount: 0,
          serialNumbers: '',
        },
      ];
    });
    return addedOk;
  }, []);

  const handleBarcodeScan = useCallback(
    (rawCode: string): { added: boolean; message: string } => {
      const normalized = rawCode.trim().toLowerCase();
      if (!normalized) {
        return { added: false, message: 'Empty barcode scanned.' };
      }

      const exact = activeProducts.find(
        (p) => p.sku.trim().toLowerCase() === normalized
      );
      const partial =
        exact ||
        activeProducts.find(
          (p) =>
            p.sku.toLowerCase().includes(normalized) ||
            p.name.toLowerCase() === normalized
        );

      if (!partial) {
        return {
          added: false,
          message: `No catalog SKU matched barcode "${rawCode}".`,
        };
      }
      if (partial.stockQty <= 0) {
        return {
          added: false,
          message: `${partial.name} (${partial.sku}) is out of stock.`,
        };
      }
      addToCart(partial);
      return {
        added: true,
        message: `Added 1 × ${partial.name} (${partial.sku}) to active sale.`,
      };
    },
    [activeProducts, addToCart]
  );

  const updateCartQuantity = (productId: string, delta: number) => {
    setErrorMessage(null);
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.product.id !== productId) return c;
          const nextQty = c.quantity + delta;
          if (nextQty > c.product.stockQty) {
            setErrorMessage(`Cannot exceed available stock (${c.product.stockQty}).`);
            return c;
          }
          return { ...c, quantity: nextQty };
        })
        .filter((c) => c.quantity > 0)
    );
  };

  const updateLineDiscount = (productId: string, discountValue: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.product.id === productId
          ? { ...c, lineDiscount: Math.max(0, discountValue || 0) }
          : c
      )
    );
  };

  const updateLineSerialNumbers = (productId: string, serialText: string) => {
    setCart((prev) =>
      prev.map((c) =>
        c.product.id === productId ? { ...c, serialNumbers: serialText } : c
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  };

  const handleCompleteSale = useCallback(async () => {
    setErrorMessage(null);
    if (cart.length === 0) {
      setErrorMessage('Add at least one item to process a sale.');
      return;
    }

    const missingSerialItem = cart.find(
      (entry) => entry.product.requiresSerial && !entry.serialNumbers.trim()
    );
    if (missingSerialItem) {
      setErrorMessage(
        `Enter unit Serial / IMEI number for "${missingSerialItem.product.name}" before issuing receipt.`
      );
      return;
    }

    const selectedCustomer =
      customers.find((c) => c.id === selectedCustomerId) || null;
    if (paymentMethod === 'Customer Credit' && !selectedCustomer) {
      setErrorMessage(
        'Select a registered CRM customer to record a Customer Credit sale.'
      );
      return;
    }

    const parsedTendered =
      amountTenderedInput.trim() === ''
        ? totals.grandTotal
        : Number(amountTenderedInput);

    if (
      paymentMethod !== 'Customer Credit' &&
      parsedTendered < totals.grandTotal
    ) {
      setErrorMessage('Amount tendered cannot be less than the total due.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await processPosCheckout({
        ownerId,
        cart,
        customer: selectedCustomer,
        cashierName: activeCashierName,
        paymentMethod,
        taxRate: totals.effectiveTaxRate,
        amountPaid: parsedTendered,
        notes: saleNotes,
        defaultWarrantyDays,
        shiftId: openShift?.id || '',
        posAuthorizedEmails: roleEmailBuckets.posFinance,
        ledgerAuthorizedEmails: roleEmailBuckets.financeOnly,
      });
      setCart([]);
      setAmountTenderedInput('');
      setSaleNotes('');
      setCompletedReceipt(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  }, [
    activeCashierName,
    amountTenderedInput,
    cart,
    customers,
    defaultWarrantyDays,
    openShift,
    ownerId,
    paymentMethod,
    roleEmailBuckets.financeOnly,
    roleEmailBuckets.posFinance,
    saleNotes,
    selectedCustomerId,
    totals.effectiveTaxRate,
    totals.grandTotal,
  ]);

  // Global Counter Keyboard Shortcuts: F2 Search, F4 Camera Scan, F8 Shift Register, F9 Checkout, Esc Close Modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowScannerModal(false);
        setShowShiftModal(false);
        setShowWarrantyModal(false);
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        setShowScannerModal(false);
        setShowShiftModal(false);
        setShowWarrantyModal(false);
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setShowShiftModal(false);
        setShowWarrantyModal(false);
        setShowScannerModal((prev) => !prev);
      } else if (e.key === 'F8') {
        e.preventDefault();
        setShowScannerModal(false);
        setShowWarrantyModal(false);
        setShowShiftModal((prev) => !prev);
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (
          !showScannerModal &&
          !showShiftModal &&
          !showWarrantyModal &&
          !completedReceipt &&
          cart.length > 0 &&
          !submitting
        ) {
          void handleCompleteSale();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    cart.length,
    completedReceipt,
    handleCompleteSale,
    showScannerModal,
    showShiftModal,
    showWarrantyModal,
    submitting,
  ]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = searchQuery.trim();
    if (!q) return;
    e.preventDefault();

    const exactSku = activeProducts.find(
      (p) => p.sku.toLowerCase() === q.toLowerCase()
    );
    if (exactSku) {
      if (addToCart(exactSku)) {
        setSearchQuery('');
      }
      return;
    }

    if (filteredProducts.length === 1) {
      if (addToCart(filteredProducts[0])) {
        setSearchQuery('');
      }
    }
  };

  const canOpenInventory =
    ROLE_PERMISSION_MATRIX[activeRole].allowedModules.includes('inventory');

  return (
    <div className="space-y-4">
      {/* Counter Shift Drawer & Rapid Tools Toolbar */}
      <div className="flex flex-col gap-3 border border-slate-200 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShowShiftModal(true)}
            className={`inline-flex items-center gap-2 border px-3 py-1.5 font-semibold transition-colors ${
              openShift
                ? 'border-emerald-300 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100/70'
                : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
          >
            <Calculator className="h-3.5 w-3.5" />
            {openShift && openShiftRecon ? (
              <span className="font-mono tabular-nums">
                {openShift.shiftNumber} · Expected Cash:{' '}
                {formatCurrency(openShiftRecon.expectedCashInDrawer, settings.currency)}
              </span>
            ) : (
              <span>Drawer Closed · Open Shift Float (F8)</span>
            )}
          </button>

          <span className="hidden sm:inline font-mono text-[11px] text-slate-500">
            Hotkeys: F2 Search · Enter Add SKU · F4 Camera Scan · F8 Shift Z-Report · F9 Charge
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowScannerModal(true)}
            className="inline-flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Camera className="h-3.5 w-3.5" />
            Scan Barcode (F4)
          </button>
          <button
            type="button"
            onClick={() => setShowWarrantyModal(true)}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            Verify Serial / {defaultWarrantyDays}d Warranty
          </button>
          <button
            type="button"
            onClick={() => setShowShiftModal(true)}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Calculator className="h-3.5 w-3.5" />
            Z-Report (F8)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 cols: Product Catalog & Barcode/SKU Search */}
        <div className="space-y-4 lg:col-span-7">
          <div className="border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="F2: Scan USB barcode, type SKU + Enter, or search product..."
                  className="w-full border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
                />
              </div>
              <div className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                {filteredProducts.length} active items
              </div>
            </div>

            {/* Segmented Category Filter Controls */}
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Selection Grid */}
          {activeProducts.length === 0 ? (
            <div className="border border-slate-200 bg-white p-10 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-400" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                No inventory items available yet
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {canOpenInventory
                  ? 'Add products in Inventory & Stock or load the sample catalog to start selling.'
                  : 'Ask the Warehouse Storekeeper or Workspace Admin to register stock items.'}
              </p>
              {canOpenInventory && (
                <button
                  type="button"
                  onClick={onNavigateToInventory}
                  className="mt-4 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Open Inventory &amp; Stock
                </button>
              )}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
              No products matched "{searchQuery}". Clear your search or open Camera Scan (F4).
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredProducts.map((product) => {
                const isOut = product.stockQty <= 0;
                const isLow = !isOut && product.stockQty <= product.reorderLevel;
                const inCart = cart.find((c) => c.product.id === product.id);
                const wDays =
                  product.warrantyDays !== undefined
                    ? product.warrantyDays
                    : defaultWarrantyDays;

                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={isOut}
                    onClick={() => addToCart(product)}
                    className={`flex flex-col justify-between border p-3.5 text-left transition-colors ${
                      isOut
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                        : inCart
                        ? 'border-emerald-600 bg-emerald-50/30'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-500">
                        <span className="font-mono">{product.sku}</span>
                        <span>
                          {product.category}
                          {wDays > 0 ? ` · ${wDays}d warranty` : ''}
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 line-clamp-2">
                        {product.name}
                      </div>
                      {product.requiresSerial && (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Serial / IMEI required at checkout
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-2.5">
                      <div>
                        <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                          {formatCurrency(product.sellingPrice, settings.currency)}
                        </div>
                        <div
                          className={`mt-0.5 text-[11px] tabular-nums ${
                            isOut
                              ? 'font-medium text-red-600'
                              : isLow
                              ? 'font-medium text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {isOut
                            ? 'Out of stock'
                            : `${product.stockQty} ${product.unit} available${
                                isLow ? ' · Low stock' : ''
                              }`}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700">
                        {inCart ? `In Cart (${inCart.quantity})` : '+ Add'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 cols: Active Register Cart & Checkout */}
        <div className="lg:col-span-5">
          <div className="border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-slate-700" />
                <h2 className="text-sm font-semibold text-slate-900">Active Sale Register</h2>
              </div>
              <span className="text-xs text-slate-500 truncate max-w-[180px]">
                Cashier: {activeCashierName}
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* Customer CRM Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Customer Account (CRM)
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  <option value="">Walk-in Customer (Standard Retail)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} · {c.segment} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Cart Line Items with Serial/IMEI & Warranty */}
              <div className="max-h-72 overflow-y-auto border-y border-slate-200 divide-y divide-slate-100">
                {cart.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    Scan a barcode (F4) or select products on the left to build an order.
                  </div>
                ) : (
                  cart.map((entry) => {
                    const lineNet = Math.max(
                      0,
                      entry.product.sellingPrice * entry.quantity - entry.lineDiscount
                    );
                    const itemWarranty =
                      entry.product.warrantyDays !== undefined
                        ? entry.product.warrantyDays
                        : defaultWarrantyDays;

                    return (
                      <div key={entry.product.id} className="py-2.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold text-slate-900">
                              {entry.product.name}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {entry.product.sku} ·{' '}
                              {formatCurrency(entry.product.sellingPrice, settings.currency)} /{' '}
                              {entry.product.unit}
                              {itemWarranty > 0 ? ` · ${itemWarranty}d warranty` : ''}
                            </div>
                          </div>
                          <div className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(lineNet, settings.currency)}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center border border-slate-300">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(entry.product.id, -1)}
                              className="px-2 py-1 text-slate-600 hover:bg-slate-100"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-2.5 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                              {entry.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(entry.product.id, 1)}
                              className="px-2 py-1 text-slate-600 hover:bg-slate-100"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500">Disc:</span>
                            <input
                              type="number"
                              min={0}
                              value={entry.lineDiscount || ''}
                              onChange={(e) =>
                                updateLineDiscount(entry.product.id, Number(e.target.value))
                              }
                              placeholder="0"
                              className="w-20 border border-slate-300 px-2 py-0.5 text-right font-mono text-xs tabular-nums focus:border-slate-900 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => removeFromCart(entry.product.id)}
                              className="p-1 text-slate-400 hover:text-red-600"
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Serial / IMEI Input per Item */}
                        <div>
                          <input
                            type="text"
                            value={entry.serialNumbers}
                            onChange={(e) =>
                              updateLineSerialNumbers(entry.product.id, e.target.value)
                            }
                            placeholder={
                              entry.product.requiresSerial
                                ? 'Required: Scan/type unit Serial or IMEI number(s)...'
                                : 'Unit Serial / IMEI for receipt warranty check (optional)...'
                            }
                            className={`w-full border px-2 py-1 font-mono text-[11px] focus:outline-none ${
                              entry.product.requiresSerial && !entry.serialNumbers.trim()
                                ? 'border-amber-400 bg-amber-50/40 text-slate-900 placeholder:text-amber-700 focus:border-slate-900 focus:bg-white'
                                : 'border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Payment Method & Tax Toggle */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Payment Channel
                  </label>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors ${
                          paymentMethod === method
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Amount Tendered ({settings.currency})
                    </label>
                    <input
                      type="number"
                      min={0}
                      disabled={paymentMethod === 'Customer Credit'}
                      value={amountTenderedInput}
                      onChange={(e) => setAmountTenderedInput(e.target.value)}
                      placeholder={String(Math.round(totals.grandTotal))}
                      className="mt-1 w-full border border-slate-300 px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-slate-900 focus:outline-none disabled:bg-slate-100"
                    />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={applyVat}
                        onChange={(e) => setApplyVat(e.target.checked)}
                        className="h-3.5 w-3.5 accent-slate-900"
                      />
                      <span>Apply VAT ({settings.taxRate}%)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    placeholder="Optional receipt delivery or counter note..."
                    className="w-full border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Totals Calculation Summary */}
              <div className="space-y-1.5 border-t border-slate-200 pt-3 font-mono text-xs tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal, settings.currency)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Line Discounts</span>
                    <span>-{formatCurrency(totals.discount, settings.currency)}</span>
                  </div>
                )}
                {applyVat && (
                  <div className="flex justify-between text-slate-600">
                    <span>VAT ({settings.taxRate}%)</span>
                    <span>{formatCurrency(totals.tax, settings.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                  <span>TOTAL DUE</span>
                  <span>{formatCurrency(totals.grandTotal, settings.currency)}</span>
                </div>
              </div>

              {errorMessage && (
                <div className="flex items-start gap-2 border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={cart.length === 0 || submitting}
                  onClick={() => setCart([])}
                  className="border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0 || submitting}
                  onClick={handleCompleteSale}
                  className="flex flex-1 items-center justify-center gap-2 bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Receipt className="h-4 w-4" />
                  {submitting
                    ? 'Processing...'
                    : `Charge & Receipt (F9) · ${formatCurrency(totals.grandTotal, settings.currency)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showScannerModal && (
        <BarcodeScannerModal
          products={activeProducts}
          currency={settings.currency}
          onScanCode={handleBarcodeScan}
          onClose={() => setShowScannerModal(false)}
        />
      )}

      {showShiftModal && (
        <ShiftRegisterModal
          ownerId={ownerId}
          cashierName={activeCashierName}
          cashierEmail={userEmail}
          shifts={shifts}
          sales={sales}
          settings={settings}
          roleEmailBuckets={roleEmailBuckets}
          onClose={() => setShowShiftModal(false)}
        />
      )}

      {showWarrantyModal && (
        <WarrantyLookupModal
          ownerId={ownerId}
          sales={sales}
          settings={settings}
          onInspectReceipt={(sale, items) => {
            setShowWarrantyModal(false);
            setCompletedReceipt({ sale, items });
          }}
          onClose={() => setShowWarrantyModal(false)}
        />
      )}

      {completedReceipt && (
        <ReceiptModal
          sale={completedReceipt.sale}
          items={completedReceipt.items}
          settings={settings}
          onClose={() => setCompletedReceipt(null)}
        />
      )}
    </div>
  );
};
