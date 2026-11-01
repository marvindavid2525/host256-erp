import React from 'react';
import { Printer, Download, X, CheckCircle2, RotateCcw } from 'lucide-react';
import { BusinessSettings, SaleItem, SaleTransaction } from '../types/erp';
import { formatCurrency, formatDateTimeLabel } from '../utils/formatters';

interface ReceiptModalProps {
  sale: SaleTransaction;
  items: SaleItem[];
  settings: BusinessSettings;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  items,
  settings,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const handleDownloadTxt = () => {
    const divider = '------------------------------------------------';
    const lines = [
      settings.businessName.toUpperCase(),
      settings.receiptHeader,
      settings.branchAddress,
      `Tel: ${settings.businessPhone}`,
      divider,
      `RECEIPT: ${sale.receiptNumber}`,
      `DATE:    ${formatDateTimeLabel(sale.saleDate)}`,
      `STATUS:  ${sale.status.toUpperCase()}`,
      `CASHIER: ${sale.cashierName}`,
      `CLIENT:  ${sale.customerName}`,
      `PAYMENT: ${sale.paymentMethod}`,
      divider,
      ...items.map((it) => {
        const base = `${it.productName} (${it.sku})\n  ${it.quantity} x ${formatCurrency(it.unitPrice, settings.currency)} = ${formatCurrency(it.lineTotal, settings.currency)}`;
        const serialLine = it.serialNumbers ? `\n  SN/IMEI: ${it.serialNumbers}` : '';
        const warrantyLine = it.warrantyExpiryDate
          ? `\n  Warranty Until: ${it.warrantyExpiryDate} (${it.warrantyDays ?? 7}d)`
          : '';
        return `${base}${serialLine}${warrantyLine}`;
      }),
      divider,
      `Subtotal:  ${formatCurrency(sale.subtotal, settings.currency)}`,
      `Discount: -${formatCurrency(sale.discountAmount, settings.currency)}`,
      `Tax/VAT:   ${formatCurrency(sale.taxAmount, settings.currency)}`,
      `TOTAL:     ${formatCurrency(sale.totalAmount, settings.currency)}`,
      `Paid:      ${formatCurrency(sale.amountPaid, settings.currency)}`,
      `Change:    ${formatCurrency(sale.changeDue, settings.currency)}`,
      ...(sale.warrantyUntil ? [`Warranty Valid Through: ${sale.warrantyUntil}`] : []),
      divider,
      settings.receiptFooter,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sale.receiptNumber}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {sale.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <RotateCcw className="h-4 w-4 text-red-600" />
            )}
            <span>Official POS Receipt · {sale.receiptNumber}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700"
            aria-label="Close receipt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div id="printable-receipt-area" className="max-h-[72vh] overflow-y-auto px-6 py-5 text-xs text-slate-800">
          <div className="border-b border-dashed border-slate-300 pb-4 text-center">
            <h3 className="text-base font-bold tracking-tight text-slate-900">
              {settings.businessName}
            </h3>
            {settings.receiptHeader && (
              <p className="mt-0.5 text-slate-600">{settings.receiptHeader}</p>
            )}
            <p className="mt-0.5 text-slate-500">
              {settings.branchAddress} · {settings.businessPhone}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-y-1 border-b border-dashed border-slate-300 py-3 font-mono text-[11px]">
            <span className="text-slate-500">Receipt No:</span>
            <span className="text-right font-semibold text-slate-900">{sale.receiptNumber}</span>
            <span className="text-slate-500">Date & Time:</span>
            <span className="text-right text-slate-800">{formatDateTimeLabel(sale.saleDate)}</span>
            <span className="text-slate-500">Customer:</span>
            <span className="text-right text-slate-800">{sale.customerName}</span>
            <span className="text-slate-500">Cashier:</span>
            <span className="text-right text-slate-800">{sale.cashierName}</span>
            <span className="text-slate-500">Payment:</span>
            <span className="text-right text-slate-800">{sale.paymentMethod}</span>
            {sale.warrantyUntil && (
              <>
                <span className="text-slate-500">Warranty Until:</span>
                <span className="text-right font-semibold text-slate-900">{sale.warrantyUntil}</span>
              </>
            )}
            <span className="text-slate-500">Status:</span>
            <span
              className={`text-right font-semibold uppercase ${
                sale.status === 'completed' ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {sale.status}
            </span>
          </div>

          <div className="border-b border-dashed border-slate-300 py-3">
            <div className="mb-2 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Item / Qty</span>
              <span>Line Total</span>
            </div>
            {items.length > 0 ? (
              <div className="space-y-2.5">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{item.productName}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {item.sku} · {item.quantity} × {formatCurrency(item.unitPrice, settings.currency)}
                        {item.lineDiscount > 0
                          ? ` (-${formatCurrency(item.lineDiscount, settings.currency)})`
                          : ''}
                      </div>
                      {item.serialNumbers && (
                        <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-800">
                          SN/IMEI: {item.serialNumbers}
                        </div>
                      )}
                      {item.warrantyExpiryDate && (
                        <div className="font-mono text-[10px] text-slate-500">
                          Warranty: {item.warrantyDays ?? 7}d (valid through {item.warrantyExpiryDate})
                        </div>
                      )}
                    </div>
                    <div className="font-mono font-medium text-slate-900 tabular-nums">
                      {formatCurrency(item.lineTotal, settings.currency)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-slate-600">{sale.itemsSummary}</p>
                {sale.serialsSummary && (
                  <p className="font-mono text-[11px] text-slate-700">
                    SN/IMEI: {sale.serialsSummary}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5 border-b border-dashed border-slate-300 py-3 font-mono text-xs tabular-nums">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(sale.subtotal, settings.currency)}</span>
            </div>
            {sale.discountAmount > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Discount</span>
                <span>-{formatCurrency(sale.discountAmount, settings.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>VAT / Tax ({settings.taxRate}%)</span>
              <span>{formatCurrency(sale.taxAmount, settings.currency)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900">
              <span>TOTAL</span>
              <span>{formatCurrency(sale.totalAmount, settings.currency)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Amount Tendered</span>
              <span>{formatCurrency(sale.amountPaid, settings.currency)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Change Due</span>
              <span>{formatCurrency(sale.changeDue, settings.currency)}</span>
            </div>
          </div>

          {settings.receiptFooter && (
            <p className="pt-3 text-center text-[11px] leading-relaxed text-slate-500">
              {settings.receiptFooter}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={handleDownloadTxt}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <Download className="h-3.5 w-3.5" />
            Download .TXT
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
};
