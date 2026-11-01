import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Truck,
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Download,
  Wallet,
  X,
} from 'lucide-react';
import {
  BusinessSettings,
  Product,
  PurchaseOrder,
  ROLE_PERMISSION_MATRIX,
  StaffRole,
} from '../types/erp';
import {
  addDaysToIsoDate,
  exportRowsToCsv,
  formatCurrency,
  formatIsoDate,
} from '../utils/formatters';
import {
  createOrUpdateProduct,
  recordSupplierPurchase,
  removeProduct,
  RoleEmailBuckets,
  settleSupplierPayable,
} from '../services/erpService';

interface InventoryViewProps {
  ownerId: string;
  activeRole: StaffRole;
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  settings: BusinessSettings;
  roleEmailBuckets: RoleEmailBuckets;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  ownerId,
  activeRole,
  products,
  purchaseOrders,
  settings,
  roleEmailBuckets,
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'purchases'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [payableFilter, setPayableFilter] = useState<'all' | 'open' | 'overdue'>('all');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [settlingPo, setSettlingPo] = useState<PurchaseOrder | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSeeMargins = ROLE_PERMISSION_MATRIX[activeRole].canSeeMargins;
  const defaultWarranty = settings.defaultWarrantyDays ?? 7;

  // Product form state
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Electronics');
  const [unit, setUnit] = useState('unit');
  const [costPrice, setCostPrice] = useState('0');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [stockQty, setStockQty] = useState('0');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [supplierName, setSupplierName] = useState('');
  const [warrantyDays, setWarrantyDays] = useState(String(defaultWarranty));
  const [requiresSerial, setRequiresSerial] = useState(false);

  // Restock / Supplier Credit Purchase form state
  const [poSupplier, setPoSupplier] = useState('');
  const [poInvoiceNo, setPoInvoiceNo] = useState('');
  const [poQty, setPoQty] = useState('10');
  const [poUnitCost, setPoUnitCost] = useState('0');
  const [poTermsMode, setPoTermsMode] = useState<'paid' | 'partial' | 'credit'>('paid');
  const [poAmountPaidInput, setPoAmountPaidInput] = useState('0');
  const [poDueDate, setPoDueDate] = useState(addDaysToIsoDate(14));
  const [poPaymentMethod, setPoPaymentMethod] = useState('Cash');
  const [poNotes, setPoNotes] = useState('');

  // Payable settlement state
  const [settleAmountInput, setSettleAmountInput] = useState('');
  const [settleChannel, setSettleChannel] = useState('MTN Mobile Money');
  const [settleNotes, setSettleNotes] = useState('');

  const openNewProductModal = () => {
    setEditingProduct(null);
    setSku(`LQU-${Math.floor(1000 + Math.random() * 9000)}`);
    setName('');
    setCategory('Electronics');
    setUnit('unit');
    setCostPrice('');
    setSellingPrice('');
    setStockQty('10');
    setReorderLevel('5');
    setSupplierName('');
    setWarrantyDays(String(defaultWarranty));
    setRequiresSerial(false);
    setShowProductModal(true);
  };

  const openEditProductModal = (prod: Product) => {
    setEditingProduct(prod);
    setSku(prod.sku);
    setName(prod.name);
    setCategory(prod.category);
    setUnit(prod.unit);
    setCostPrice(String(prod.costPrice));
    setSellingPrice(String(prod.sellingPrice));
    setStockQty(String(prod.stockQty));
    setReorderLevel(String(prod.reorderLevel));
    setSupplierName(prod.supplierName);
    setWarrantyDays(String(prod.warrantyDays ?? defaultWarranty));
    setRequiresSerial(Boolean(prod.requiresSerial));
    setShowProductModal(true);
  };

  const openRestockModal = (prod: Product) => {
    setRestockProduct(prod);
    setPoSupplier(prod.supplierName || 'Direct Supplier');
    setPoInvoiceNo(`SINV-${Math.floor(1000 + Math.random() * 9000)}`);
    setPoQty('10');
    setPoUnitCost(String(prod.costPrice));
    setPoTermsMode('paid');
    setPoAmountPaidInput(String(prod.costPrice * 10));
    setPoDueDate(addDaysToIsoDate(14));
    setPoPaymentMethod('Cash');
    setPoNotes('');
  };

  const getPoBalance = (po: PurchaseOrder): number => {
    if (po.balanceDue !== undefined) return po.balanceDue;
    if (po.paymentStatus === 'unpaid') return po.totalCost;
    return 0;
  };

  const getPoPaid = (po: PurchaseOrder): number => {
    if (po.amountPaid !== undefined) return po.amountPaid;
    return Math.max(0, po.totalCost - getPoBalance(po));
  };

  const summary = useMemo(() => {
    const active = products.filter((p) => p.status === 'active');
    const costValuation = active.reduce((acc, p) => acc + p.costPrice * p.stockQty, 0);
    const retailValuation = active.reduce((acc, p) => acc + p.sellingPrice * p.stockQty, 0);
    const lowStockCount = active.filter(
      (p) => p.stockQty > 0 && p.stockQty <= p.reorderLevel
    ).length;
    const outOfStockCount = active.filter((p) => p.stockQty <= 0).length;

    const today = formatIsoDate();
    let totalPayables = 0;
    let overdueCount = 0;
    for (const po of purchaseOrders) {
      const bal = po.balanceDue !== undefined ? po.balanceDue : 0;
      if (bal > 0) {
        totalPayables += bal;
        if (po.dueDate && po.dueDate < today) {
          overdueCount++;
        }
      }
    }

    return {
      totalSkus: active.length,
      costValuation,
      retailValuation,
      lowStockCount,
      outOfStockCount,
      totalPayables,
      overdueCount,
    };
  }, [products, purchaseOrders]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (stockFilter === 'low' && !(p.stockQty > 0 && p.stockQty <= p.reorderLevel)) {
        return false;
      }
      if (stockFilter === 'out' && p.stockQty > 0) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, stockFilter]);

  const filteredPOs = useMemo(() => {
    const today = formatIsoDate();
    return purchaseOrders.filter((po) => {
      const bal = getPoBalance(po);
      if (payableFilter === 'open') return bal > 0;
      if (payableFilter === 'overdue') return bal > 0 && Boolean(po.dueDate && po.dueDate < today);
      return true;
    });
  }, [purchaseOrders, payableFilter]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createOrUpdateProduct(
        ownerId,
        {
          sku,
          name,
          category,
          unit,
          costPrice: Number(costPrice) || 0,
          sellingPrice: Number(sellingPrice) || 0,
          stockQty: Number(stockQty) || 0,
          reorderLevel: Number(reorderLevel) || 0,
          supplierName,
          status: 'active',
          warrantyDays: Math.max(0, Number(warrantyDays) || 0),
          requiresSerial,
        },
        editingProduct?.id,
        roleEmailBuckets.allStaff
      );
      setShowProductModal(false);
    } finally {
      setSaving(false);
    }
  };

  const poTotalPreview = (Number(poQty) || 0) * (Number(poUnitCost) || 0);
  const poResolvedPaid =
    poTermsMode === 'paid'
      ? poTotalPreview
      : poTermsMode === 'credit'
      ? 0
      : Math.min(poTotalPreview, Math.max(0, Number(poAmountPaidInput) || 0));
  const poBalancePreview = Math.max(0, poTotalPreview - poResolvedPaid);

  const handleConfirmRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct) return;
    setSaving(true);
    try {
      await recordSupplierPurchase(ownerId, restockProduct, {
        supplierName: poSupplier,
        supplierInvoiceNo: poInvoiceNo,
        quantity: Number(poQty) || 1,
        unitCost: Number(poUnitCost) || 0,
        amountPaid: poResolvedPaid,
        dueDate: poBalancePreview > 0 ? poDueDate : '',
        paymentMethod: poTermsMode === 'credit' ? 'Supplier Credit' : poPaymentMethod,
        notes: poNotes,
        poAuthorizedEmails: roleEmailBuckets.inventoryFinance,
        ledgerAuthorizedEmails: roleEmailBuckets.financeOnly,
      });
      setRestockProduct(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSettleSupplierPayable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingPo) return;
    const amt = Number(settleAmountInput);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await settleSupplierPayable({
        ownerId,
        purchaseOrder: settlingPo,
        paymentAmount: amt,
        paymentMethod: settleChannel,
        notes: settleNotes || settlingPo.notes,
        ledgerAuthorizedEmails: roleEmailBuckets.financeOnly,
      });
      setSettlingPo(null);
      setSettleAmountInput('');
      setSettleNotes('');
    } finally {
      setSaving(false);
    }
  };

  const handleExportInventory = () => {
    exportRowsToCsv(
      `host256_inventory_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'SKU',
        'Product Name',
        'Category',
        'Unit',
        'Cost Price',
        'Selling Price',
        'Stock Qty',
        'Reorder Level',
        'Warranty Days',
        'Requires Serial',
        'Supplier',
      ],
      filteredProducts.map((p) => [
        p.sku,
        p.name,
        p.category,
        p.unit,
        p.costPrice,
        p.sellingPrice,
        p.stockQty,
        p.reorderLevel,
        p.warrantyDays ?? defaultWarranty,
        p.requiresSerial ? 'Yes' : 'No',
        p.supplierName,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Valuation, Payables & Stock Health Strip */}
      <div className="grid grid-cols-1 border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Active Product SKUs</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {summary.totalSkus}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Managed catalog items
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Inventory Cost Value</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(summary.costValuation, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            At supplier purchase cost
          </div>
        </div>
        {canSeeMargins ? (
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Projected Retail Value</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
              {formatCurrency(summary.retailValuation, settings.currency)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Expected revenue on current stock
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Supplier Accounts Payable</div>
            <div className="mt-1 font-mono text-xl font-bold text-amber-700 tabular-nums">
              {formatCurrency(summary.totalPayables, settings.currency)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {summary.overdueCount} overdue supplier invoice(s)
            </div>
          </div>
        )}
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Stock &amp; Payable Alerts</div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-700 tabular-nums">
            {summary.lowStockCount} Low · {summary.outOfStockCount} Out
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Payables due: {formatCurrency(summary.totalPayables, settings.currency)}
          </div>
        </div>
      </div>

      {/* Sub-navigation & Actions */}
      <div className="flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 text-xs font-semibold ${
              activeTab === 'catalog'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Product Stock Catalog ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('purchases')}
            className={`px-3 py-1.5 text-xs font-semibold ${
              activeTab === 'purchases'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Supplier Purchases &amp; Accounts Payable ({purchaseOrders.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportInventory}
            disabled={products.length === 0}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export Stock CSV
          </button>
          <button
            type="button"
            onClick={openNewProductModal}
            className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Product
          </button>
        </div>
      </div>

      {activeTab === 'catalog' ? (
        <div className="border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by SKU, product name, category, or supplier..."
                className="w-full border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 text-xs focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: 'All Stock' },
                  { id: 'low', label: 'Low Stock' },
                  { id: 'out', label: 'Out of Stock' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStockFilter(f.id)}
                  className={`px-3 py-1 text-xs font-medium ${
                    stockFilter === f.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredProducts.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No products match the current filter. Click "Add Product" to register stock.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5">SKU &amp; Item</th>
                    <th className="px-4 py-2.5">Category · Warranty</th>
                    <th className="px-4 py-2.5 text-right">Cost Price</th>
                    <th className="px-4 py-2.5 text-right">Selling Price</th>
                    <th className="px-4 py-2.5 text-right">In Stock</th>
                    <th className="px-4 py-2.5">Stock State</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredProducts.map((p) => {
                    const isOut = p.stockQty <= 0;
                    const isLow = !isOut && p.stockQty <= p.reorderLevel;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {p.sku}
                            {p.requiresSerial ? ' · Serial/IMEI Tracked' : ''}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          <div>{p.category}</div>
                          <div className="text-[11px] text-slate-400">
                            {p.supplierName || 'Direct'} · {p.warrantyDays ?? defaultWarranty}d warranty
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                          {formatCurrency(p.costPrice, settings.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(p.sellingPrice, settings.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {p.stockQty} {p.unit}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {isOut ? (
                            <span className="inline-flex items-center gap-1 font-medium text-red-600">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Out of Stock
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Reorder (≤{p.reorderLevel})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Healthy
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => openRestockModal(p)}
                              className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900"
                            >
                              <Truck className="h-3.5 w-3.5" />
                              Restock
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditProductModal(p)}
                              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-950"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            {deleteConfirmId === p.id ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await removeProduct(p.id);
                                  setDeleteConfirmId(null);
                                }}
                                className="font-semibold text-red-600 hover:text-red-800"
                              >
                                Confirm?
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(p.id)}
                                className="text-slate-400 hover:text-red-600"
                                aria-label="Delete product"
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
      ) : (
        <div className="border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
            <div className="text-xs text-slate-600">
              Outstanding Supplier Payables:{' '}
              <span className="font-mono font-bold text-amber-700 tabular-nums">
                {formatCurrency(summary.totalPayables, settings.currency)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: 'All POs' },
                  { id: 'open', label: 'Unpaid / Partial' },
                  { id: 'overdue', label: 'Overdue' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPayableFilter(f.id)}
                  className={`px-3 py-1 text-xs font-medium ${
                    payableFilter === f.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredPOs.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No supplier purchase orders match this filter. Click "Restock" on any product to log paid or credit purchases.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5">PO &amp; Supplier Invoice</th>
                    <th className="px-4 py-2.5">Supplier · Product</th>
                    <th className="px-4 py-2.5 text-right">Qty</th>
                    <th className="px-4 py-2.5 text-right">Total Cost</th>
                    <th className="px-4 py-2.5 text-right">Paid</th>
                    <th className="px-4 py-2.5 text-right">Balance Due</th>
                    <th className="px-4 py-2.5">Due Date · Status</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredPOs.map((po) => {
                    const bal = getPoBalance(po);
                    const paid = getPoPaid(po);
                    const isOverdue = bal > 0 && Boolean(po.dueDate && po.dueDate < formatIsoDate());
                    return (
                      <tr key={po.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900">
                            {po.poNumber}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {po.supplierInvoiceNo || 'Direct GRN'}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{po.supplierName}</div>
                          <div className="text-[11px] text-slate-500">{po.productName}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          +{po.quantity}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(po.totalCost, settings.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-700 tabular-nums">
                          {formatCurrency(paid, settings.currency)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${
                            bal > 0 ? 'text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {formatCurrency(bal, settings.currency)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {bal === 0 ? (
                            <span className="font-medium text-emerald-700">Paid in Full</span>
                          ) : isOverdue ? (
                            <span className="font-semibold text-red-600">
                              Overdue · Due {po.dueDate}
                            </span>
                          ) : (
                            <span className="font-medium text-amber-700">
                              {po.paymentStatus === 'partial' ? 'Partial' : 'Credit'} · Due{' '}
                              {po.dueDate || 'On Demand'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {bal > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSettlingPo(po);
                                setSettleAmountInput(String(bal));
                                setSettleNotes('');
                              }}
                              className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900"
                            >
                              <Wallet className="h-3.5 w-3.5" />
                              Pay Supplier
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Cleared</span>
                          )}
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

      {/* Add / Edit Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveProduct}
            className="w-full max-w-lg border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingProduct ? 'Edit Product Specification' : 'Register New Inventory Product'}
              </h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 p-5 sm:grid-cols-2 text-xs">
              <div>
                <label className="block font-medium text-slate-700">SKU / Barcode</label>
                <input
                  required
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Category</label>
                <input
                  required
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Electronics, Home Appliances"
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700">Product Name</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full commercial item description"
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">
                  Cost Price ({settings.currency})
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">
                  Selling Price ({settings.currency})
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Current Stock Qty</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Unit &amp; Reorder Alert Level</label>
                <div className="mt-1 flex gap-2">
                  <input
                    required
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="pcs"
                    className="w-20 border border-slate-300 px-2.5 py-2 focus:border-slate-900 focus:outline-none"
                  />
                  <input
                    required
                    type="number"
                    min={0}
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value)}
                    className="flex-1 border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700">
                  Warranty Period (Days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={3650}
                  value={warrantyDays}
                  onChange={(e) => setWarrantyDays(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Preferred Supplier</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Supplier company name"
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2 pt-1">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-800">
                  <input
                    type="checkbox"
                    checked={requiresSerial}
                    onChange={(e) => setRequiresSerial(e.target.checked)}
                    className="h-3.5 w-3.5 accent-slate-900"
                  />
                  <span>
                    Require unit Serial / IMEI number at POS checkout (recommended for TVs, phones, laptops &amp; electronics)
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Supplier Purchase / Credit Restock Modal */}
      {restockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleConfirmRestock}
            className="w-full max-w-lg border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-slate-900">
                Receive Supplier Stock · {restockProduct.sku}
              </h3>
              <button
                type="button"
                onClick={() => setRestockProduct(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 p-5 text-xs max-h-[75vh] overflow-y-auto">
              <div className="border border-slate-200 bg-slate-50 p-3">
                <div className="font-semibold text-slate-900">{restockProduct.name}</div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                  Current Stock: {restockProduct.stockQty} {restockProduct.unit}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700">Supplier Name</label>
                  <input
                    required
                    type="text"
                    value={poSupplier}
                    onChange={(e) => setPoSupplier(e.target.value)}
                    className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Supplier Invoice #</label>
                  <input
                    type="text"
                    value={poInvoiceNo}
                    onChange={(e) => setPoInvoiceNo(e.target.value)}
                    placeholder="e.g., SINV-2041"
                    className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700">Quantity Received</label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={poQty}
                    onChange={(e) => setPoQty(e.target.value)}
                    className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">
                    Unit Cost ({settings.currency})
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    value={poUnitCost}
                    onChange={(e) => setPoUnitCost(e.target.value)}
                    className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Payment Terms Selector */}
              <div>
                <label className="block font-medium text-slate-700">
                  Supplier Payment Terms (Accounts Payable)
                </label>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'paid', label: 'Paid in Full' },
                      { id: 'partial', label: 'Partial Deposit' },
                      { id: 'credit', label: 'Credit (Unpaid)' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPoTermsMode(mode.id)}
                      className={`border py-1.5 text-xs font-semibold ${
                        poTermsMode === mode.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {poTermsMode === 'partial' && (
                <div>
                  <label className="block font-medium text-slate-700">
                    Initial Deposit Paid Now ({settings.currency})
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={Math.max(1, poTotalPreview - 1)}
                    value={poAmountPaidInput}
                    onChange={(e) => setPoAmountPaidInput(e.target.value)}
                    className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {poTermsMode !== 'credit' && (
                  <div>
                    <label className="block font-medium text-slate-700">Disbursement Channel</label>
                    <select
                      value={poPaymentMethod}
                      onChange={(e) => setPoPaymentMethod(e.target.value)}
                      className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none"
                    >
                      <option value="Cash">Cash</option>
                      <option value="MTN Mobile Money">MTN Mobile Money</option>
                      <option value="Airtel Money">Airtel Money</option>
                      <option value="Card">Bank / Card Transfer</option>
                    </select>
                  </div>
                )}

                {poBalancePreview > 0 && (
                  <div>
                    <label className="block font-medium text-slate-700">
                      Supplier Invoice Due Date
                    </label>
                    <input
                      required
                      type="date"
                      value={poDueDate}
                      onChange={(e) => setPoDueDate(e.target.value)}
                      className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700">Delivery Note / Batch Ref</label>
                <input
                  type="text"
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  placeholder="Optional batch details or credit terms"
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="space-y-1 border-t border-slate-200 pt-2.5 font-mono text-xs tabular-nums">
                <div className="flex justify-between text-slate-700">
                  <span>Total Purchase Value:</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(poTotalPreview, settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Paid Immediately:</span>
                  <span>{formatCurrency(poResolvedPaid, settings.currency)}</span>
                </div>
                {poBalancePreview > 0 && (
                  <div className="flex justify-between font-bold text-amber-700">
                    <span>Accounts Payable Balance Due:</span>
                    <span>{formatCurrency(poBalancePreview, settings.currency)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setRestockProduct(null)}
                className="border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving
                  ? 'Posting...'
                  : poBalancePreview > 0
                  ? 'Receive Stock & Record Payable'
                  : 'Receive Stock & Log Expense'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settle Supplier Payable Modal */}
      {settlingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSettleSupplierPayable}
            className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Pay Supplier Invoice · {settlingPo.poNumber}
              </h3>
              <button
                type="button"
                onClick={() => setSettlingPo(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div className="font-semibold text-slate-900">{settlingPo.supplierName}</div>
              <div className="text-[11px] text-slate-500">
                {settlingPo.productName} · Invoice: {settlingPo.supplierInvoiceNo || settlingPo.poNumber}
              </div>
              <div className="font-mono text-xs text-amber-700 font-semibold tabular-nums">
                Balance Due: {formatCurrency(getPoBalance(settlingPo), settings.currency)}
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700">
                Payment Amount ({settings.currency})
              </label>
              <input
                required
                type="number"
                min={1}
                max={getPoBalance(settlingPo)}
                value={settleAmountInput}
                onChange={(e) => setSettleAmountInput(e.target.value)}
                className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700">Payment Channel</label>
              <select
                value={settleChannel}
                onChange={(e) => setSettleChannel(e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none"
              >
                <option value="MTN Mobile Money">MTN Mobile Money</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="Card">Bank Transfer / EFT</option>
                <option value="Cash">Cash Voucher</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700">Payment Reference / Notes</label>
              <input
                type="text"
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
                placeholder="e.g., Bank EFT ref or MoMo TXN ID"
                className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSettlingPo(null)}
                className="border border-slate-300 px-3.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-700 px-4 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Recording...' : 'Pay Supplier & Post Ledger Expense'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
