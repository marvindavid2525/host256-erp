import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Wallet,
  History,
  Download,
  X,
} from 'lucide-react';
import { BusinessSettings, Customer, SaleTransaction } from '../types/erp';
import {
  exportRowsToCsv,
  formatCurrency,
  formatDateTimeLabel,
} from '../utils/formatters';
import {
  removeCustomer,
  RoleEmailBuckets,
  saveCustomer,
  settleCustomerCredit,
} from '../services/erpService';

interface CrmViewProps {
  ownerId: string;
  customers: Customer[];
  sales: SaleTransaction[];
  settings: BusinessSettings;
  roleEmailBuckets: RoleEmailBuckets;
}

export const CrmView: React.FC<CrmViewProps> = ({
  ownerId,
  customers,
  sales,
  settings,
  roleEmailBuckets,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('All');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditPaymentAmount, setCreditPaymentAmount] = useState('');
  const [creditPaymentMethod, setCreditPaymentMethod] = useState('MTN Mobile Money');
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Customer form state
  const [customerCode, setCustomerCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [segment, setSegment] = useState<Customer['segment']>('Retail');
  const [notes, setNotes] = useState('');

  const crmMetrics = useMemo(() => {
    const totalLifetime = customers.reduce((acc, c) => acc + c.totalSpent, 0);
    const totalReceivables = customers.reduce((acc, c) => acc + c.creditBalance, 0);
    const vipWholesale = customers.filter(
      (c) => c.segment === 'VIP' || c.segment === 'Wholesale' || c.segment === 'Corporate'
    ).length;
    return {
      count: customers.length,
      totalLifetime,
      totalReceivables,
      vipWholesale,
    };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customers.filter((c) => {
      if (segmentFilter !== 'All' && c.segment !== segmentFilter) return false;
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.customerCode.toLowerCase().includes(q)
      );
    });
  }, [customers, segmentFilter, searchQuery]);

  const customerSalesHistory = useMemo(() => {
    if (!historyCustomer) return [];
    return sales.filter((s) => s.customerId === historyCustomer.id);
  }, [historyCustomer, sales]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setCustomerCode(`CUS-${Math.floor(1000 + Math.random() * 9000)}`);
    setFullName('');
    setPhone('+256 7');
    setEmail('');
    setAddress('');
    setSegment('Retail');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setCustomerCode(c.customerCode);
    setFullName(c.fullName);
    setPhone(c.phone);
    setEmail(c.email);
    setAddress(c.address);
    setSegment(c.segment);
    setNotes(c.notes);
    setShowModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      await saveCustomer(
        ownerId,
        {
          customerCode,
          fullName,
          phone,
          email,
          address,
          segment,
          loyaltyPoints: editingCustomer?.loyaltyPoints || 0,
          creditBalance: editingCustomer?.creditBalance || 0,
          totalSpent: editingCustomer?.totalSpent || 0,
          ordersCount: editingCustomer?.ordersCount || 0,
          lastOrderDate: editingCustomer?.lastOrderDate || '',
          notes,
        },
        editingCustomer?.id,
        roleEmailBuckets.posFinance
      );
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSettleCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditCustomer) return;
    const amt = Number(creditPaymentAmount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await settleCustomerCredit(
        ownerId,
        creditCustomer,
        amt,
        creditPaymentMethod,
        roleEmailBuckets.financeOnly
      );
      setCreditCustomer(null);
      setCreditPaymentAmount('');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCustomers = () => {
    exportRowsToCsv(
      `host256_crm_customers_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Code',
        'Customer Name',
        'Segment',
        'Phone',
        'Email',
        'Orders',
        'Lifetime Spent',
        'Credit Due',
        'Loyalty Points',
      ],
      filteredCustomers.map((c) => [
        c.customerCode,
        c.fullName,
        c.segment,
        c.phone,
        c.email,
        c.ordersCount,
        c.totalSpent,
        c.creditBalance,
        c.loyaltyPoints,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* CRM Summary Strip */}
      <div className="grid grid-cols-1 border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Registered CRM Accounts</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {crmMetrics.count}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {crmMetrics.vipWholesale} Wholesale / Corporate / VIP
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Customer Lifetime Revenue</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
            {formatCurrency(crmMetrics.totalLifetime, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Cumulative billed purchases
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Accounts Receivable (Credit)</div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-700 tabular-nums">
            {formatCurrency(crmMetrics.totalReceivables, settings.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Outstanding credit balances due
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Loyalty Program</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {customers.reduce((acc, c) => acc + c.loyaltyPoints, 0).toLocaleString()} pts
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Auto-accrued on POS checkout
          </div>
        </div>
      </div>

      {/* Search, Segment Filter & Actions */}
      <div className="flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer name, phone, email, or code..."
              className="w-full border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 text-xs focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(['All', 'Retail', 'Wholesale', 'Corporate', 'VIP'] as const).map((seg) => (
              <button
                key={seg}
                type="button"
                onClick={() => setSegmentFilter(seg)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  segmentFilter === seg
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {seg}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCustomers}
            disabled={filteredCustomers.length === 0}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export CRM CSV
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Customer
          </button>
        </div>
      </div>

      {/* CRM Directory Grid */}
      <div className="border border-slate-200 bg-white overflow-x-auto">
        {filteredCustomers.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No customer profiles found. Click "Add Customer" to build your client directory.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5">Customer · Segment</th>
                <th className="px-4 py-2.5">Contact & Location</th>
                <th className="px-4 py-2.5 text-right">Orders</th>
                <th className="px-4 py-2.5 text-right">Total Spent</th>
                <th className="px-4 py-2.5 text-right">Credit Balance</th>
                <th className="px-4 py-2.5 text-right">Loyalty</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-slate-900">{c.fullName}</div>
                    <div className="text-[11px] text-slate-500">
                      <span className="font-mono">{c.customerCode}</span> · {c.segment}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-slate-700">{c.phone}</div>
                    <div className="text-[11px] text-slate-400 truncate max-w-xs">
                      {c.address || c.email || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {c.ordersCount}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                    {formatCurrency(c.totalSpent, settings.currency)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap tabular-nums ${
                      c.creditBalance > 0 ? 'text-amber-700' : 'text-slate-400'
                    }`}
                  >
                    {formatCurrency(c.creditBalance, settings.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                    {c.loyaltyPoints} pts
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2.5">
                      {c.creditBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCreditCustomer(c);
                            setCreditPaymentAmount(String(c.creditBalance));
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          Receive Pay
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setHistoryCustomer(c)}
                        className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-950"
                      >
                        <History className="h-3.5 w-3.5" />
                        Orders
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-950"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {confirmDeleteId === c.id ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await removeCustomer(c.id);
                            setConfirmDeleteId(null);
                          }}
                          className="font-semibold text-red-600 hover:text-red-800"
                        >
                          Confirm?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(c.id)}
                          className="text-slate-400 hover:text-red-600"
                          aria-label="Delete customer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveCustomer}
            className="w-full max-w-lg border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingCustomer ? 'Edit Customer Account' : 'Create CRM Customer Profile'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 p-5 sm:grid-cols-2 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Customer Code</label>
                <input
                  required
                  type="text"
                  disabled={Boolean(editingCustomer)}
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono disabled:bg-slate-100 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Relationship Segment</label>
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value as Customer['segment'])}
                  className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none"
                >
                  <option value="Retail">Retail</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="Corporate">Corporate</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700">Full Name / Company</label>
                <input
                  required
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Phone Number</label>
                <input
                  required
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700">Delivery / Physical Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700">Account Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Preferred payment method, wholesale terms, etc."
                  className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Customer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settle Credit Balance Modal */}
      {creditCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSettleCredit}
            className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Receive Credit Payment · {creditCustomer.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setCreditCustomer(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-slate-600">
              Current Outstanding Balance:{' '}
              <span className="font-mono font-semibold text-amber-700">
                {formatCurrency(creditCustomer.creditBalance, settings.currency)}
              </span>
            </p>
            <div>
              <label className="block font-medium text-slate-700">
                Amount Received ({settings.currency})
              </label>
              <input
                required
                type="number"
                min={1}
                max={creditCustomer.creditBalance}
                value={creditPaymentAmount}
                onChange={(e) => setCreditPaymentAmount(e.target.value)}
                className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700">Payment Channel</label>
              <select
                value={creditPaymentMethod}
                onChange={(e) => setCreditPaymentMethod(e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none"
              >
                <option value="MTN Mobile Money">MTN Mobile Money</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="Cash">Cash</option>
                <option value="Card">Bank / Card</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreditCustomer(null)}
                className="border border-slate-300 px-3.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-700 px-4 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Recording...' : 'Record Payment & Post Income'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer Purchase History Drawer/Modal */}
      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Purchase History · {historyCustomer.fullName}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {historyCustomer.customerCode} · {historyCustomer.segment}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-5 text-xs">
              {customerSalesHistory.length === 0 ? (
                <p className="py-6 text-center text-slate-500">
                  No direct POS invoices linked to this customer account yet.
                </p>
              ) : (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                      <th className="pb-2">Receipt</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Payment</th>
                      <th className="pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerSalesHistory.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 font-mono font-semibold text-slate-900">
                          {s.receiptNumber}
                        </td>
                        <td className="py-2 font-mono text-slate-500">
                          {formatDateTimeLabel(s.saleDate)}
                        </td>
                        <td className="py-2 text-slate-700">{s.paymentMethod}</td>
                        <td className="py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(s.totalAmount, settings.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
