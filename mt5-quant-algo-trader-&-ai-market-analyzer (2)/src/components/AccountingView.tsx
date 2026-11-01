import React, { useMemo, useState } from 'react';
import {
  Plus,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import {
  BusinessSettings,
  LedgerEntry,
  PurchaseOrder,
} from '../types/erp';
import {
  exportRowsToCsv,
  formatCurrency,
  formatIsoDate,
} from '../utils/formatters';
import {
  createManualLedgerEntry,
  deleteLedgerEntry,
  RoleEmailBuckets,
  settleSupplierPayable,
} from '../services/erpService';

interface AccountingViewProps {
  ownerId: string;
  ledgerEntries: LedgerEntry[];
  purchaseOrders: PurchaseOrder[];
  settings: BusinessSettings;
  roleEmailBuckets: RoleEmailBuckets;
}

export const AccountingView: React.FC<AccountingViewProps> = ({
  ownerId,
  ledgerEntries,
  purchaseOrders,
  settings,
  roleEmailBuckets,
}) => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'payables'>('ledger');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [payableStatusFilter, setPayableStatusFilter] = useState<'open' | 'overdue' | 'all'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [settlingPo, setSettlingPo] = useState<PurchaseOrder | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState('');
  const [settleChannel, setSettleChannel] = useState('MTN Mobile Money');
  const [settleNotes, setSettleNotes] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Manual Entry Form State
  const [entryType, setEntryType] = useState<'income' | 'expense'>('expense');
  const [category, setCategory] = useState('Rent & Store Utilities');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [entryDate, setEntryDate] = useState(formatIsoDate());

  const getPoBalance = (po: PurchaseOrder): number => {
    if (po.balanceDue !== undefined) return po.balanceDue;
    if (po.paymentStatus === 'unpaid') return po.totalCost;
    return 0;
  };

  const getPoPaid = (po: PurchaseOrder): number => {
    if (po.amountPaid !== undefined) return po.amountPaid;
    return Math.max(0, po.totalCost - getPoBalance(po));
  };

  const financials = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    let inventoryAndPayablesSpend = 0;
    let operatingExpenses = 0;

    for (const e of ledgerEntries) {
      if (e.entryType === 'income') {
        totalIncome += e.amount;
      } else {
        totalExpenses += e.amount;
        if (e.sourceModule === 'Inventory' || e.sourceModule === 'Payables') {
          inventoryAndPayablesSpend += e.amount;
        } else {
          operatingExpenses += e.amount;
        }
      }
    }

    const today = formatIsoDate();
    let totalPayablesDue = 0;
    let overduePayablesCount = 0;
    let openPayablesCount = 0;
    for (const po of purchaseOrders) {
      const bal = getPoBalance(po);
      if (bal > 0) {
        totalPayablesDue += bal;
        openPayablesCount++;
        if (po.dueDate && po.dueDate < today) {
          overduePayablesCount++;
        }
      }
    }

    const netCashflow = totalIncome - totalExpenses;
    return {
      totalIncome,
      totalExpenses,
      inventoryAndPayablesSpend,
      operatingExpenses,
      netCashflow,
      totalPayablesDue,
      openPayablesCount,
      overduePayablesCount,
    };
  }, [ledgerEntries, purchaseOrders]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ledgerEntries.filter((e) => {
      if (typeFilter !== 'all' && e.entryType !== typeFilter) return false;
      if (!q) return true;
      return (
        e.entryRef.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.paymentMethod.toLowerCase().includes(q) ||
        e.sourceModule.toLowerCase().includes(q)
      );
    });
  }, [ledgerEntries, typeFilter, searchQuery]);

  const filteredPayables = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const today = formatIsoDate();
    return purchaseOrders.filter((po) => {
      const bal = getPoBalance(po);
      if (payableStatusFilter === 'open' && bal <= 0) return false;
      if (
        payableStatusFilter === 'overdue' &&
        !(bal > 0 && Boolean(po.dueDate && po.dueDate < today))
      ) {
        return false;
      }
      if (!q) return true;
      return (
        po.poNumber.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q) ||
        (po.supplierInvoiceNo || '').toLowerCase().includes(q) ||
        po.productName.toLowerCase().includes(q)
      );
    });
  }, [purchaseOrders, payableStatusFilter, searchQuery]);

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0 || !description.trim()) return;
    setSaving(true);
    try {
      await createManualLedgerEntry(ownerId, {
        entryType,
        category,
        description,
        amount: numericAmount,
        paymentMethod,
        entryDate,
        authorizedEmails: roleEmailBuckets.financeOnly,
      });
      setDescription('');
      setAmount('');
      setShowEntryModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSettlePayable = async (e: React.FormEvent) => {
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

  const handleExportLedger = () => {
    exportRowsToCsv(
      `host256_ledger_${formatIsoDate()}.csv`,
      [
        'Reference',
        'Date',
        'Type',
        'Category',
        'Description',
        'Source Module',
        'Payment Method',
        'Amount',
      ],
      filteredEntries.map((e) => [
        e.entryRef,
        e.entryDate,
        e.entryType,
        e.category,
        e.description,
        e.sourceModule,
        e.paymentMethod,
        e.entryType === 'income' ? e.amount : -e.amount,
      ])
    );
  };

  const handleExportPayables = () => {
    exportRowsToCsv(
      `host256_supplier_payables_${formatIsoDate()}.csv`,
      [
        'PO Number',
        'Supplier Invoice',
        'Supplier',
        'Product',
        'Total Cost',
        'Amount Paid',
        'Balance Due',
        'Due Date',
        'Status',
      ],
      filteredPayables.map((po) => [
        po.poNumber,
        po.supplierInvoiceNo || '',
        po.supplierName,
        po.productName,
        po.totalCost,
        getPoPaid(po),
        getPoBalance(po),
        po.dueDate || '',
        po.paymentStatus || 'paid',
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Financial Summary Strip */}
      <div className="grid grid-cols-1 border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Total Recorded Income</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
            {formatCurrency(financials.totalIncome, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            POS sales, credit settlements &amp; other income
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Supplier Accounts Payable</div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-700 tabular-nums">
            {formatCurrency(financials.totalPayablesDue, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {financials.openPayablesCount} unpaid PO(s) · {financials.overduePayablesCount} overdue
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Total Outflows Paid</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(financials.totalExpenses, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Stock paid: {formatCurrency(financials.inventoryAndPayablesSpend, settings.currency)}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Net Cash Position</div>
          <div
            className={`mt-1 font-mono text-xl font-bold tabular-nums ${
              financials.netCashflow >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {formatCurrency(financials.netCashflow, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Total inflows minus cash outflows
          </div>
        </div>
      </div>

      {/* Sub-Tabs & Toolbar */}
      <div className="flex flex-col gap-3 border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={`px-3 py-1.5 text-xs font-semibold ${
                activeTab === 'ledger'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              General Ledger ({ledgerEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('payables')}
              className={`px-3 py-1.5 text-xs font-semibold ${
                activeTab === 'payables'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Supplier Accounts Payable ({financials.openPayablesCount} Open)
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'ledger' ? (
              <button
                type="button"
                onClick={handleExportLedger}
                disabled={filteredEntries.length === 0}
                className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Export Ledger CSV
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExportPayables}
                disabled={filteredPayables.length === 0}
                className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Export Payables CSV
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowEntryModal(true)}
              className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Record Income / Expense
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'ledger'
                  ? 'Search reference, category, description, or source...'
                  : 'Search supplier name, invoice #, PO #, or item...'
              }
              className="w-full border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 text-xs focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          {activeTab === 'ledger' ? (
            <div className="flex items-center gap-1">
              {(['all', 'income', 'expense'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize ${
                    typeFilter === t
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'open', label: 'Unpaid / Partial' },
                  { id: 'overdue', label: 'Overdue' },
                  { id: 'all', label: 'All Supplier POs' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPayableStatusFilter(f.id)}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    payableStatusFilter === f.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Table */}
      {activeTab === 'ledger' ? (
        <div className="border border-slate-200 bg-white overflow-x-auto">
          {filteredEntries.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No financial records match the current filter. POS sales, supplier settlements, payroll, and manual vouchers appear here.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5">Date &amp; Ref</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Category &amp; Source</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5">Channel</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-900">
                        {entry.entryRef}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {entry.entryDate}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {entry.entryType === 'income' ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          Income
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-red-600">
                          <ArrowDownRight className="h-3.5 w-3.5" />
                          Expense
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{entry.category}</div>
                      <div className="text-[11px] text-slate-400">
                        Module · {entry.sourceModule}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-sm">
                      {entry.description}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                      {entry.paymentMethod}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap tabular-nums ${
                        entry.entryType === 'income' ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {entry.entryType === 'income' ? '+' : '-'}
                      {formatCurrency(entry.amount, settings.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {entry.sourceModule === 'Manual' ? (
                        confirmDeleteId === entry.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteLedgerEntry(entry.id);
                              setConfirmDeleteId(null);
                            }}
                            className="font-semibold text-red-600 hover:text-red-800"
                          >
                            Confirm?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(entry.id)}
                            className="text-slate-400 hover:text-red-600"
                            aria-label="Delete manual entry"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )
                      ) : (
                        <span className="text-[11px] text-slate-400">Synced</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="border border-slate-200 bg-white overflow-x-auto">
          {filteredPayables.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No unpaid supplier invoices match this filter. Credit purchases logged in Inventory appear here for partial or full settlement.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5">PO &amp; Supplier Invoice</th>
                  <th className="px-4 py-2.5">Supplier · Merchandise</th>
                  <th className="px-4 py-2.5 text-right">Total Billed</th>
                  <th className="px-4 py-2.5 text-right">Amount Paid</th>
                  <th className="px-4 py-2.5 text-right">Balance Due</th>
                  <th className="px-4 py-2.5">Due Date &amp; State</th>
                  <th className="px-4 py-2.5 text-right">Settle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPayables.map((po) => {
                  const bal = getPoBalance(po);
                  const paid = getPoPaid(po);
                  const isOverdue =
                    bal > 0 && Boolean(po.dueDate && po.dueDate < formatIsoDate());

                  return (
                    <tr key={po.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900">
                          {po.poNumber}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {po.supplierInvoiceNo || 'No invoice ref'}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">{po.supplierName}</div>
                        <div className="text-[11px] text-slate-500">
                          {po.quantity} × {po.productName}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-900 tabular-nums">
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
                          <span className="font-medium text-emerald-700">Paid</span>
                        ) : isOverdue ? (
                          <span className="font-semibold text-red-600">
                            Overdue · {po.dueDate}
                          </span>
                        ) : (
                          <span className="font-medium text-amber-700">
                            Due {po.dueDate || 'On Demand'}
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
                            Pay Balance
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
      )}

      {/* Record Manual Income / Expense Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveEntry}
            className="w-full max-w-md border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-slate-900">
                Record Financial Voucher
              </h3>
              <button
                type="button"
                onClick={() => setShowEntryModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 p-5 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Voucher Type</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEntryType('expense');
                      setCategory('Rent & Store Utilities');
                    }}
                    className={`border py-2 font-semibold ${
                      entryType === 'expense'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    Expense Outflow
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEntryType('income');
                      setCategory('Other Service Income');
                    }}
                    className={`border py-2 font-semibold ${
                      entryType === 'income'
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    Income Inflow
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Account Category</label>
                <input
                  required
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Rent, Delivery Logistics, Equipment Maintenance"
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700">Description</label>
                <input
                  required
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed narration for audit ledger"
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700">
                    Amount ({settings.currency})
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Entry Date</label>
                  <input
                    required
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Payment Channel</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none"
                >
                  <option value="Cash">Cash</option>
                  <option value="MTN Mobile Money">MTN Mobile Money</option>
                  <option value="Airtel Money">Airtel Money</option>
                  <option value="Card">Bank / Card Transfer</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowEntryModal(false)}
                className="border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Posting...' : 'Post to General Ledger'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settle Supplier Payable Modal */}
      {settlingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSettlePayable}
            className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Settle Supplier Payable · {settlingPo.poNumber}
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
                Invoice: {settlingPo.supplierInvoiceNo || settlingPo.poNumber} · {settlingPo.productName}
              </div>
              <div className="font-mono text-xs font-semibold text-amber-700 tabular-nums">
                Balance Due: {formatCurrency(getPoBalance(settlingPo), settings.currency)}
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700">
                Disbursement Amount ({settings.currency})
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
                <option value="Card">Bank EFT / Cheque</option>
                <option value="Cash">Cash Voucher</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700">Audit Reference / Notes</label>
              <input
                type="text"
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
                placeholder="e.g., Partial supplier payment #1"
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
                {saving ? 'Posting...' : 'Record Supplier Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
