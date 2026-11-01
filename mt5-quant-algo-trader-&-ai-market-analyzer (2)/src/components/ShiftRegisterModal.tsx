import React, { useMemo, useState } from 'react';
import {
  Calculator,
  Printer,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  BusinessSettings,
  SaleTransaction,
  ShiftRegister,
} from '../types/erp';
import {
  exportRowsToCsv,
  formatCurrency,
  formatDateTimeLabel,
} from '../utils/formatters';
import {
  calculateShiftReconciliation,
  closeShiftRegister,
  openShiftRegister,
  RoleEmailBuckets,
} from '../services/erpService';

interface ShiftRegisterModalProps {
  ownerId: string;
  cashierName: string;
  cashierEmail: string;
  shifts: ShiftRegister[];
  sales: SaleTransaction[];
  settings: BusinessSettings;
  roleEmailBuckets: RoleEmailBuckets;
  onClose: () => void;
}

export const ShiftRegisterModal: React.FC<ShiftRegisterModalProps> = ({
  ownerId,
  cashierName,
  cashierEmail,
  shifts,
  sales,
  settings,
  roleEmailBuckets,
  onClose,
}) => {
  const openShift = useMemo(
    () => shifts.find((s) => s.status === 'open') || null,
    [shifts]
  );

  const closedShifts = useMemo(
    () => shifts.filter((s) => s.status === 'closed'),
    [shifts]
  );

  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [openingFloatInput, setOpeningFloatInput] = useState('200000');
  const [shiftNotesInput, setShiftNotesInput] = useState('');
  const [countedCashInput, setCountedCashInput] = useState('');
  const [closeNotesInput, setCloseNotesInput] = useState('');
  const [selectedZReport, setSelectedZReport] = useState<ShiftRegister | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const liveRecon = useMemo(() => {
    if (!openShift) return null;
    return calculateShiftReconciliation(openShift, sales);
  }, [openShift, sales]);

  const parsedCountedCash = useMemo(() => {
    if (!liveRecon) return 0;
    if (countedCashInput.trim() === '') return liveRecon.expectedCashInDrawer;
    return Math.max(0, Number(countedCashInput) || 0);
  }, [countedCashInput, liveRecon]);

  const liveVariance = useMemo(() => {
    if (!liveRecon) return 0;
    return parsedCountedCash - liveRecon.expectedCashInDrawer;
  }, [parsedCountedCash, liveRecon]);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await openShiftRegister({
        ownerId,
        cashierName,
        cashierEmail,
        openingFloat: Math.max(0, Number(openingFloatInput) || 0),
        notes: shiftNotesInput || 'Opening counter cash float verified',
        authorizedEmails: roleEmailBuckets.posFinance,
      });
      setShiftNotesInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to open shift.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openShift || !liveRecon) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const closed = await closeShiftRegister({
        shift: openShift,
        sales,
        countedCashInDrawer: parsedCountedCash,
        closedByName: cashierName,
        notes: closeNotesInput || openShift.notes,
      });
      setSelectedZReport(closed);
      setCountedCashInput('');
      setCloseNotesInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to close shift.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportHistory = () => {
    exportRowsToCsv(
      `host256_shift_zreports_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Shift Number',
        'Cashier',
        'Opened At',
        'Closed At',
        'Opening Float',
        'Cash Sales',
        'Mobile Money',
        'Card Sales',
        'Credit Sales',
        'Cash Refunds',
        'Expected Cash',
        'Counted Cash',
        'Variance',
        'Status',
      ],
      shifts.map((s) => [
        s.shiftNumber,
        s.cashierName,
        s.openedAt,
        s.closedAt || 'OPEN',
        s.openingFloat,
        s.cashSalesTotal,
        s.mobileMoneyTotal,
        s.cardSalesTotal,
        s.creditSalesTotal,
        s.cashRefundsTotal,
        s.expectedCashInDrawer,
        s.countedCashInDrawer,
        s.varianceAmount,
        s.status,
      ])
    );
  };

  const reportToPrint = selectedZReport || (openShift && liveRecon
    ? {
        ...openShift,
        cashSalesTotal: liveRecon.cashSalesTotal,
        mobileMoneyTotal: liveRecon.mobileMoneyTotal,
        cardSalesTotal: liveRecon.cardSalesTotal,
        creditSalesTotal: liveRecon.creditSalesTotal,
        cashRefundsTotal: liveRecon.cashRefundsTotal,
        expectedCashInDrawer: liveRecon.expectedCashInDrawer,
        countedCashInDrawer: parsedCountedCash,
        varianceAmount: liveVariance,
      }
    : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-2xl border border-slate-200 bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-slate-800" />
            <h3 className="text-sm font-semibold text-slate-900">
              Cashier Shift Register &amp; Z-Report Reconciliation
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-800"
            aria-label="Close shift register"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedZReport(null);
                setActiveTab('current');
              }}
              className={`px-3 py-1.5 text-xs font-semibold ${
                activeTab === 'current'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {openShift ? `Active Drawer (${openShift.shiftNumber})` : 'Open New Shift'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 text-xs font-semibold ${
                activeTab === 'history'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Closed Z-Reports ({closedShifts.length})
            </button>
          </div>

          {shifts.length > 0 && (
            <button
              type="button"
              onClick={handleExportHistory}
              className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 border border-red-200 bg-red-50 p-3 text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {selectedZReport ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border border-emerald-200 bg-emerald-50/70 p-3">
                <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  <span>Z-Report Sealed · {selectedZReport.shiftNumber}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedZReport(null)}
                  className="text-xs font-medium text-slate-700 underline"
                >
                  Back to Drawer
                </button>
              </div>

              <div className="border border-slate-200 p-4 font-mono text-xs space-y-2 tabular-nums">
                <div className="border-b border-dashed border-slate-300 pb-2 text-center font-sans">
                  <div className="font-bold text-sm text-slate-900">{settings.businessName}</div>
                  <div className="text-[11px] text-slate-500">
                    OFFICIAL END-OF-SHIFT Z-REPORT · {selectedZReport.shiftNumber}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cashier:</span>
                  <span className="font-semibold text-slate-900">{selectedZReport.cashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Opened:</span>
                  <span>{formatDateTimeLabel(selectedZReport.openedAt)}</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-slate-300 pb-2">
                  <span className="text-slate-500">Closed:</span>
                  <span>{formatDateTimeLabel(selectedZReport.closedAt)}</span>
                </div>

                <div className="flex justify-between">
                  <span>Opening Cash Float (+)</span>
                  <span>{formatCurrency(selectedZReport.openingFloat, settings.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cash POS Sales (+)</span>
                  <span>{formatCurrency(selectedZReport.cashSalesTotal, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-red-700">
                  <span>Cash Refunds (-)</span>
                  <span>-{formatCurrency(selectedZReport.cashRefundsTotal, settings.currency)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
                  <span>Expected Physical Cash (=)</span>
                  <span>{formatCurrency(selectedZReport.expectedCashInDrawer, settings.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Counted Physical Cash</span>
                  <span>{formatCurrency(selectedZReport.countedCashInDrawer, settings.currency)}</span>
                </div>
                <div
                  className={`flex justify-between border-b border-dashed border-slate-300 pb-2 font-bold ${
                    selectedZReport.varianceAmount === 0
                      ? 'text-emerald-700'
                      : selectedZReport.varianceAmount > 0
                      ? 'text-amber-700'
                      : 'text-red-700'
                  }`}
                >
                  <span>
                    Cash Drawer Variance (
                    {selectedZReport.varianceAmount === 0
                      ? 'Balanced'
                      : selectedZReport.varianceAmount > 0
                      ? 'Overage'
                      : 'Shortage'}
                    )
                  </span>
                  <span>
                    {selectedZReport.varianceAmount > 0 ? '+' : ''}
                    {formatCurrency(selectedZReport.varianceAmount, settings.currency)}
                  </span>
                </div>

                <div className="pt-1 text-[11px] text-slate-500 font-sans font-semibold uppercase">
                  Non-Cash Tender Summary
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Mobile Money (MTN / Airtel)</span>
                  <span>{formatCurrency(selectedZReport.mobileMoneyTotal, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Card / Bank POS</span>
                  <span>{formatCurrency(selectedZReport.cardSalesTotal, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Customer Credit Invoices</span>
                  <span>{formatCurrency(selectedZReport.creditSalesTotal, settings.currency)}</span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Z-Report
                </button>
              </div>
            </div>
          ) : activeTab === 'current' ? (
            !openShift ? (
              <form onSubmit={handleOpenShift} className="space-y-4">
                <div className="border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <Unlock className="h-4 w-4 text-emerald-700" />
                    <span>Start Counter Shift &amp; Declare Opening Float</span>
                  </div>
                  <p className="mt-1 text-slate-600">
                    Count the starting notes and coins in the cash till before serving customers. Every Cash POS sale and Cash refund during this shift will reconcile against this float.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block font-medium text-slate-700">
                      Cashier on Duty
                    </label>
                    <input
                      type="text"
                      disabled
                      value={cashierName}
                      className="mt-1 w-full border border-slate-200 bg-slate-100 px-3 py-2 text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700">
                      Opening Cash Float ({settings.currency})
                    </label>
                    <input
                      required
                      type="number"
                      min={0}
                      value={openingFloatInput}
                      onChange={(e) => setOpeningFloatInput(e.target.value)}
                      className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono text-sm font-semibold tabular-nums focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700">
                    Opening Shift Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={shiftNotesInput}
                    onChange={(e) => setShiftNotesInput(e.target.value)}
                    placeholder="e.g., Morning Counter 1 · Small change verified"
                    className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {submitting ? 'Opening Drawer...' : 'Open Shift Register'}
                  </button>
                </div>
              </form>
            ) : (
              liveRecon && (
                <form onSubmit={handleCloseShift} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <div className="font-mono font-semibold text-slate-900">
                        {openShift.shiftNumber} · Cashier: {openShift.cashierName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Opened {formatDateTimeLabel(openShift.openedAt)} · {liveRecon.shiftSalesCount} completed shift sale(s)
                      </div>
                    </div>
                    {reportToPrint && (
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print X-Reading
                      </button>
                    )}
                  </div>

                  {/* Drawer Math Grid */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="border border-slate-200 p-3.5 space-y-2 font-mono tabular-nums">
                      <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Physical Cash Drawer Math
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Opening Float (+)</span>
                        <span>{formatCurrency(openShift.openingFloat, settings.currency)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>Cash Sales (+)</span>
                        <span>+{formatCurrency(liveRecon.cashSalesTotal, settings.currency)}</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>Cash Refunds (-)</span>
                        <span>-{formatCurrency(liveRecon.cashRefundsTotal, settings.currency)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                        <span>Expected Cash</span>
                        <span>{formatCurrency(liveRecon.expectedCashInDrawer, settings.currency)}</span>
                      </div>
                    </div>

                    <div className="border border-slate-200 p-3.5 space-y-2 font-mono tabular-nums">
                      <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Non-Cash Channels (Auto-Reconciled)
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Mobile Money</span>
                        <span>{formatCurrency(liveRecon.mobileMoneyTotal, settings.currency)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Card / Bank</span>
                        <span>{formatCurrency(liveRecon.cardSalesTotal, settings.currency)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Customer Credit</span>
                        <span>{formatCurrency(liveRecon.creditSalesTotal, settings.currency)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                        <span>Non-Cash Total</span>
                        <span>
                          {formatCurrency(
                            liveRecon.mobileMoneyTotal +
                              liveRecon.cardSalesTotal +
                              liveRecon.creditSalesTotal,
                            settings.currency
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Counted Physical Cash & Variance */}
                  <div className="border border-slate-200 p-4 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block font-medium text-slate-700">
                          Counted Physical Cash in Drawer ({settings.currency})
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={countedCashInput}
                          onChange={(e) => setCountedCashInput(e.target.value)}
                          placeholder={String(Math.round(liveRecon.expectedCashInDrawer))}
                          className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono text-sm font-semibold tabular-nums focus:border-slate-900 focus:outline-none"
                        />
                      </div>

                      <div className="flex flex-col justify-end">
                        <div className="border border-slate-200 bg-slate-50 px-3 py-2 font-mono tabular-nums">
                          <div className="font-sans text-[11px] text-slate-500">
                            Drawer Variance (Counted − Expected)
                          </div>
                          <div
                            className={`text-sm font-bold ${
                              liveVariance === 0
                                ? 'text-emerald-700'
                                : liveVariance > 0
                                ? 'text-amber-700'
                                : 'text-red-700'
                            }`}
                          >
                            {liveVariance > 0 ? '+' : ''}
                            {formatCurrency(liveVariance, settings.currency)} ·{' '}
                            {liveVariance === 0
                              ? 'Balanced'
                              : liveVariance > 0
                              ? 'Overage'
                              : 'Shortage'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">
                        Closing Handover / Variance Explanation
                      </label>
                      <input
                        type="text"
                        value={closeNotesInput}
                        onChange={(e) => setCloseNotesInput(e.target.value)}
                        placeholder="e.g., Handed over sealed cash bag to store safe"
                        className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Keep Shift Open
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      {submitting ? 'Sealing Z-Report...' : 'Close Shift & Seal Z-Report'}
                    </button>
                  </div>
                </form>
              )
            )
          ) : closedShifts.length === 0 ? (
            <div className="py-10 text-center text-slate-500">
              No closed Z-Reports recorded yet. Close an active cashier shift to archive its reconciliation report.
            </div>
          ) : (
            <div className="border border-slate-200 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2.5">Shift &amp; Cashier</th>
                    <th className="px-3 py-2.5">Closed</th>
                    <th className="px-3 py-2.5 text-right">Expected Cash</th>
                    <th className="px-3 py-2.5 text-right">Counted Cash</th>
                    <th className="px-3 py-2.5 text-right">Variance</th>
                    <th className="px-3 py-2.5 text-right">Z-Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {closedShifts.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <div className="font-mono font-semibold text-slate-900">
                          {s.shiftNumber}
                        </div>
                        <div className="text-[11px] text-slate-500">{s.cashierName}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 tabular-nums">
                        {formatDateTimeLabel(s.closedAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatCurrency(s.expectedCashInDrawer, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
                        {formatCurrency(s.countedCashInDrawer, settings.currency)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${
                          s.varianceAmount === 0
                            ? 'text-emerald-700'
                            : s.varianceAmount > 0
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {s.varianceAmount > 0 ? '+' : ''}
                        {formatCurrency(s.varianceAmount, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedZReport(s)}
                          className="font-semibold text-slate-800 hover:underline"
                        >
                          View / Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
