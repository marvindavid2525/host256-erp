import React, { useMemo, useState } from 'react';
import {
  Search,
  FileText,
  RotateCcw,
  Download,
  CheckCircle2,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  BusinessSettings,
  Customer,
  Product,
  ROLE_PERMISSION_MATRIX,
  SaleItem,
  SaleTransaction,
  StaffRole,
} from '../types/erp';
import {
  evaluateWarrantyStatus,
  exportRowsToCsv,
  formatCurrency,
  formatDateTimeLabel,
} from '../utils/formatters';
import {
  fetchSaleItems,
  refundSaleTransaction,
  RoleEmailBuckets,
} from '../services/erpService';
import { ReceiptModal } from './ReceiptModal';
import { WarrantyLookupModal } from './WarrantyLookupModal';

interface SalesManagementViewProps {
  ownerId: string;
  activeRole: StaffRole;
  sales: SaleTransaction[];
  products: Product[];
  customers: Customer[];
  settings: BusinessSettings;
  roleEmailBuckets: RoleEmailBuckets;
  onOpenPos: () => void;
}

export const SalesManagementView: React.FC<SalesManagementViewProps> = ({
  ownerId,
  activeRole,
  sales,
  products,
  customers,
  settings,
  roleEmailBuckets,
  onOpenPos,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded'>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<{
    sale: SaleTransaction;
    items: SaleItem[];
  } | null>(null);
  const [refundTarget, setRefundTarget] = useState<SaleTransaction | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showWarrantyLookup, setShowWarrantyLookup] = useState(false);

  const perms = ROLE_PERMISSION_MATRIX[activeRole];

  const metrics = useMemo(() => {
    const completed = sales.filter((s) => s.status === 'completed');
    const refunded = sales.filter((s) => s.status === 'refunded');
    const netRevenue = completed.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalCogs = completed.reduce((acc, s) => acc + s.cogsAmount, 0);
    const grossMargin = netRevenue - totalCogs;
    const avgOrder = completed.length > 0 ? netRevenue / completed.length : 0;
    const activeWarrantyCount = completed.filter(
      (s) => evaluateWarrantyStatus(s.warrantyUntil, s.status).state === 'active'
    ).length;
    const targetPct =
      settings.monthlySalesTarget > 0
        ? Math.min(100, (netRevenue / settings.monthlySalesTarget) * 100)
        : 0;

    return {
      completedCount: completed.length,
      refundedCount: refunded.length,
      netRevenue,
      grossMargin,
      avgOrder,
      activeWarrantyCount,
      targetPct,
    };
  }, [sales, settings.monthlySalesTarget]);

  const filteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sales.filter((s) => {
      const statusOk = statusFilter === 'all' || s.status === statusFilter;
      const queryOk =
        !q ||
        s.receiptNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.cashierName.toLowerCase().includes(q) ||
        s.paymentMethod.toLowerCase().includes(q) ||
        s.itemsSummary.toLowerCase().includes(q) ||
        (s.serialsSummary || '').toLowerCase().includes(q);
      return statusOk && queryOk;
    });
  }, [sales, statusFilter, searchQuery]);

  const handleInspectReceipt = async (sale: SaleTransaction) => {
    setProcessingId(sale.id);
    try {
      const items = await fetchSaleItems(ownerId, sale.id);
      setSelectedReceipt({ sale, items });
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmRefund = async () => {
    if (!refundTarget) return;
    setProcessingId(refundTarget.id);
    try {
      await refundSaleTransaction({
        ownerId,
        sale: refundTarget,
        products,
        customers,
        reason: refundReason || 'Customer return',
        ledgerAuthorizedEmails: roleEmailBuckets.financeOnly,
      });
      setRefundTarget(null);
      setRefundReason('');
    } finally {
      setProcessingId(null);
    }
  };

  const handleExportCsv = () => {
    exportRowsToCsv(
      `host256_sales_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Receipt No',
        'Date',
        'Customer',
        'Cashier',
        'Payment Method',
        'Items',
        'Serial / IMEI',
        'Warranty Until',
        'Subtotal',
        'Discount',
        'Tax',
        'Total Amount',
        'Status',
      ],
      filteredSales.map((s) => [
        s.receiptNumber,
        s.saleDate,
        s.customerName,
        s.cashierName,
        s.paymentMethod,
        s.itemsSummary,
        s.serialsSummary || '',
        s.warrantyUntil || '',
        s.subtotal,
        s.discountAmount,
        s.taxAmount,
        s.totalAmount,
        s.status,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Net Completed Sales</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(metrics.netRevenue, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
            {metrics.completedCount} orders · {metrics.refundedCount} refunded
          </div>
        </div>

        {perms.canSeeMargins ? (
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Gross Profit Margin</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
              {formatCurrency(metrics.grossMargin, settings.currency)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Net of product cost of goods sold
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Active Warranty Invoices</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
              {metrics.activeWarrantyCount}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Units within store warranty window
            </div>
          </div>
        )}

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Average Basket Size</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(metrics.avgOrder, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Per completed POS invoice
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Monthly Sales Target</span>
            <span className="font-mono font-semibold text-slate-800 tabular-nums">
              {metrics.targetPct.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full bg-slate-100">
            <div
              className="h-2 bg-emerald-600 transition-all"
              style={{ width: `${metrics.targetPct}%` }}
            />
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-slate-500 tabular-nums">
            Target: {formatCurrency(settings.monthlySalesTarget, settings.currency)}
          </div>
        </div>
      </div>

      {/* Filter & Export Toolbar */}
      <div className="flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search receipt #, Serial/IMEI, customer, cashier, or channel..."
              className="w-full border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1">
            {(['all', 'completed', 'refunded'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium capitalize ${
                  statusFilter === status
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowWarrantyLookup(true)}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            Verify Serial / Warranty
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredSales.length === 0}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          {perms.allowedModules.includes('pos') && (
            <button
              type="button"
              onClick={onOpenPos}
              className="bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              + New POS Sale
            </button>
          )}
        </div>
      </div>

      {/* High-Density Sales Register Table */}
      <div className="border border-slate-200 bg-white overflow-x-auto">
        {filteredSales.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">No sales records found</p>
            <p className="mt-1 text-xs text-slate-500">
              Completed POS transactions, unit Serial/IMEI numbers, and receipts appear here automatically.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5">Receipt &amp; Date</th>
                <th className="px-4 py-2.5">Customer &amp; Cashier</th>
                <th className="px-4 py-2.5">Items &amp; Serial / IMEI</th>
                <th className="px-4 py-2.5">Warranty</th>
                <th className="px-4 py-2.5">Channel</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSales.map((sale) => {
                const warranty = evaluateWarrantyStatus(sale.warrantyUntil, sale.status);
                return (
                  <tr key={sale.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-900">
                        {sale.receiptNumber}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {formatDateTimeLabel(sale.saleDate)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{sale.customerName}</div>
                      <div className="text-[11px] text-slate-500">
                        Cashier: {sale.cashierName}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <div className="truncate text-slate-700" title={sale.itemsSummary}>
                        {sale.itemsSummary}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 truncate tabular-nums">
                        {sale.serialsSummary
                          ? `SN: ${sale.serialsSummary}`
                          : `${sale.itemCount} unit(s)`}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-medium ${
                          warranty.state === 'active'
                            ? 'text-emerald-700'
                            : warranty.state === 'expired'
                            ? 'text-amber-700'
                            : warranty.state === 'void'
                            ? 'text-red-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {warranty.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                      {sale.paymentMethod}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                      {formatCurrency(sale.totalAmount, settings.currency)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {sale.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                          Refunded
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={processingId === sale.id}
                          onClick={() => handleInspectReceipt(sale)}
                          className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-950 font-medium"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Receipt
                        </button>
                        {sale.status === 'completed' && perms.canRefundSales && (
                          <button
                            type="button"
                            disabled={processingId === sale.id}
                            onClick={() => {
                              setRefundTarget(sale);
                              setRefundReason('');
                            }}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Refund
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

      {/* Refund Confirmation Modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Refund Sale · {refundTarget.receiptNumber}
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Refunding {formatCurrency(refundTarget.totalAmount, settings.currency)} will restore sold stock quantities in Inventory and post a reversal entry in Accounting.
              </p>
              {refundTarget.serialsSummary && (
                <p className="mt-1.5 border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-700">
                  Recorded Unit Serial / IMEI: {refundTarget.serialsSummary}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Return / Warranty Claim Reason
              </label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g., Verified Serial/IMEI within 7-day warranty — unit returned"
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingId === refundTarget.id}
                onClick={handleConfirmRefund}
                className="bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {processingId === refundTarget.id ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWarrantyLookup && (
        <WarrantyLookupModal
          ownerId={ownerId}
          sales={sales}
          settings={settings}
          onInspectReceipt={(sale, items) => {
            setShowWarrantyLookup(false);
            setSelectedReceipt({ sale, items });
          }}
          onClose={() => setShowWarrantyLookup(false)}
        />
      )}

      {selectedReceipt && (
        <ReceiptModal
          sale={selectedReceipt.sale}
          items={selectedReceipt.items}
          settings={settings}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  );
};
