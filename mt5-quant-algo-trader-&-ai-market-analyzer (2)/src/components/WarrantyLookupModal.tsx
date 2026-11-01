import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
} from 'lucide-react';
import {
  BusinessSettings,
  SaleItem,
  SaleTransaction,
} from '../types/erp';
import {
  evaluateWarrantyStatus,
  formatCurrency,
  formatDateTimeLabel,
} from '../utils/formatters';
import { fetchSaleItems } from '../services/erpService';

interface WarrantyLookupModalProps {
  ownerId: string;
  sales: SaleTransaction[];
  settings: BusinessSettings;
  onInspectReceipt?: (sale: SaleTransaction, items: SaleItem[]) => void;
  onClose: () => void;
}

export const WarrantyLookupModal: React.FC<WarrantyLookupModalProps> = ({
  ownerId,
  sales,
  settings,
  onInspectReceipt,
  onClose,
}) => {
  const [queryText, setQueryText] = useState('');
  const [selectedSale, setSelectedSale] = useState<SaleTransaction | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const matchingSales = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) {
      return sales.filter((s) => Boolean(s.serialsSummary || s.warrantyUntil)).slice(0, 12);
    }
    return sales
      .filter(
        (s) =>
          (s.serialsSummary || '').toLowerCase().includes(q) ||
          s.receiptNumber.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.itemsSummary.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [sales, queryText]);

  const handleSelectSale = async (sale: SaleTransaction) => {
    setSelectedSale(sale);
    setLoadingItems(true);
    try {
      const items = await fetchSaleItems(ownerId, sale.id);
      setSaleItems(items);
    } finally {
      setLoadingItems(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-2xl border border-slate-200 bg-white shadow-xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Warranty &amp; Unit Serial / IMEI Verification
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-800"
            aria-label="Close warranty lookup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Scan or type unit Serial / IMEI number, Receipt #, SKU, or Customer name..."
              className="w-full border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          {selectedSale && (
            <div className="border border-slate-300 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div>
                  <div className="font-mono text-sm font-bold text-slate-900">
                    {selectedSale.receiptNumber} · {selectedSale.customerName}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Sold {formatDateTimeLabel(selectedSale.saleDate)} · Cashier: {selectedSale.cashierName}
                  </div>
                </div>
                {onInspectReceipt && !loadingItems && (
                  <button
                    type="button"
                    onClick={() => onInspectReceipt(selectedSale, saleItems)}
                    className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Open Official Receipt
                  </button>
                )}
              </div>

              {loadingItems ? (
                <div className="py-4 text-center text-slate-500">
                  Verifying serialized line items...
                </div>
              ) : (
                <div className="divide-y divide-slate-200 bg-white border border-slate-200">
                  {saleItems.map((it) => {
                    const check = evaluateWarrantyStatus(
                      it.warrantyExpiryDate || selectedSale.warrantyUntil,
                      selectedSale.status
                    );
                    return (
                      <div key={it.id} className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {it.productName}{' '}
                            <span className="font-mono text-[11px] font-normal text-slate-500">
                              ({it.sku} × {it.quantity})
                            </span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-700">
                            Serial / IMEI:{' '}
                            <span className="font-semibold text-slate-950">
                              {it.serialNumbers ? it.serialNumbers : 'Not recorded on receipt'}
                            </span>
                          </div>
                          {it.warrantyExpiryDate && (
                            <div className="font-mono text-[11px] text-slate-500">
                              Coverage window: {it.warrantyDays ?? 7} day(s) · Valid until {it.warrantyExpiryDate}
                            </div>
                          )}
                        </div>

                        <div className="sm:text-right shrink-0">
                          {check.state === 'active' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {check.label}
                            </span>
                          ) : check.state === 'expired' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {check.label}
                            </span>
                          ) : check.state === 'void' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                              <XCircle className="h-3.5 w-3.5" />
                              {check.label}
                            </span>
                          ) : (
                            <span className="text-slate-400">{check.label}</span>
                          )}
                          <div className="font-mono text-[11px] text-slate-600 tabular-nums">
                            {formatCurrency(it.lineTotal, settings.currency)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Matching Sales List */}
          <div className="border border-slate-200 overflow-x-auto">
            {matchingSales.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No matching receipts or Serial/IMEI numbers found for "{queryText}".
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2.5">Receipt &amp; Date</th>
                    <th className="px-3 py-2.5">Customer &amp; Items</th>
                    <th className="px-3 py-2.5">Recorded Serial / IMEI</th>
                    <th className="px-3 py-2.5">Warranty Status</th>
                    <th className="px-3 py-2.5 text-right">Verify</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {matchingSales.map((s) => {
                    const w = evaluateWarrantyStatus(s.warrantyUntil, s.status);
                    return (
                      <tr
                        key={s.id}
                        className={`hover:bg-slate-50 ${
                          selectedSale?.id === s.id ? 'bg-emerald-50/40' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900">
                            {s.receiptNumber}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {s.saleDate.slice(0, 10)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 max-w-[180px]">
                          <div className="font-medium text-slate-900 truncate">
                            {s.customerName}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            {s.itemsSummary}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700 max-w-[200px] truncate">
                          {s.serialsSummary || '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`font-medium ${
                              w.state === 'active'
                                ? 'text-emerald-700'
                                : w.state === 'expired'
                                ? 'text-amber-700'
                                : w.state === 'void'
                                ? 'text-red-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {w.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleSelectSale(s)}
                            className="font-semibold text-slate-900 hover:underline"
                          >
                            Inspect Unit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
