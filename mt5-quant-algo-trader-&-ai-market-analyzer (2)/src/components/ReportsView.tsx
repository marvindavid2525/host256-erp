import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import {
  BusinessSettings,
  Customer,
  Employee,
  LedgerEntry,
  Product,
  ROLE_PERMISSION_MATRIX,
  SaleTransaction,
  StaffRole,
} from '../types/erp';
import { exportRowsToCsv, formatCurrency, formatIsoDate } from '../utils/formatters';

interface ReportsViewProps {
  activeRole: StaffRole;
  sales: SaleTransaction[];
  products: Product[];
  ledgerEntries: LedgerEntry[];
  customers: Customer[];
  employees: Employee[];
  settings: BusinessSettings;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  activeRole,
  sales,
  products,
  ledgerEntries,
  customers,
  employees,
  settings,
}) => {
  const canSeeMargins = ROLE_PERMISSION_MATRIX[activeRole].canSeeMargins;

  const analytics = useMemo(() => {
    const completedSales = sales.filter((s) => s.status === 'completed');
    const grossRevenue = completedSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalCogs = completedSales.reduce((acc, s) => acc + s.cogsAmount, 0);
    const grossProfit = grossRevenue - totalCogs;
    const grossMarginPct = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

    const nonCogsExpenses = ledgerEntries
      .filter(
        (e) =>
          e.entryType === 'expense' &&
          e.sourceModule !== 'Inventory' &&
          e.sourceModule !== 'Payables'
      )
      .reduce((acc, e) => acc + e.amount, 0);

    const netOperatingProfit = grossProfit - nonCogsExpenses;

    // Payment Channel Breakdown
    const channelMap = new Map<string, { count: number; amount: number }>();
    for (const s of completedSales) {
      const curr = channelMap.get(s.paymentMethod) || { count: 0, amount: 0 };
      channelMap.set(s.paymentMethod, {
        count: curr.count + 1,
        amount: curr.amount + s.totalAmount,
      });
    }
    const paymentChannels = Array.from(channelMap.entries())
      .map(([channel, val]) => ({
        channel,
        ...val,
        sharePct: grossRevenue > 0 ? (val.amount / grossRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Category Inventory Value Breakdown
    const catMap = new Map<string, { skus: number; units: number; retailValue: number }>();
    for (const p of products.filter((x) => x.status === 'active')) {
      const curr = catMap.get(p.category) || { skus: 0, units: 0, retailValue: 0 };
      catMap.set(p.category, {
        skus: curr.skus + 1,
        units: curr.units + p.stockQty,
        retailValue: curr.retailValue + p.sellingPrice * p.stockQty,
      });
    }
    const totalRetailStock = Array.from(catMap.values()).reduce(
      (acc, v) => acc + v.retailValue,
      0
    );
    const categoryBreakdown = Array.from(catMap.entries())
      .map(([category, val]) => ({
        category,
        ...val,
        sharePct: totalRetailStock > 0 ? (val.retailValue / totalRetailStock) * 100 : 0,
      }))
      .sort((a, b) => b.retailValue - a.retailValue);

    // Daily Cashflow Series (Last 7 active dates)
    const dateMap = new Map<string, { income: number; expense: number }>();
    for (const entry of ledgerEntries) {
      const d = entry.entryDate.slice(0, 10);
      const curr = dateMap.get(d) || { income: 0, expense: 0 };
      if (entry.entryType === 'income') {
        curr.income += entry.amount;
      } else {
        curr.expense += entry.amount;
      }
      dateMap.set(d, curr);
    }
    const dailySeries = Array.from(dateMap.entries())
      .map(([date, val]) => ({ date, ...val }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);

    const maxBarVal = Math.max(
      1,
      ...dailySeries.flatMap((d) => [d.income, d.expense])
    );

    return {
      completedOrders: completedSales.length,
      grossRevenue,
      totalCogs,
      grossProfit,
      grossMarginPct,
      nonCogsExpenses,
      netOperatingProfit,
      totalRetailStock,
      paymentChannels,
      categoryBreakdown,
      dailySeries,
      maxBarVal,
    };
  }, [sales, products, ledgerEntries]);

  const handleExportExecutiveSummary = () => {
    const rows: (string | number)[][] = canSeeMargins
      ? [
          ['Gross POS Revenue', analytics.grossRevenue, settings.currency],
          ['Cost of Goods Sold (COGS)', analytics.totalCogs, settings.currency],
          ['Gross Trading Profit', analytics.grossProfit, settings.currency],
          ['Gross Margin %', Number(analytics.grossMarginPct.toFixed(2)), '%'],
          ['Operating & HR Expenses', analytics.nonCogsExpenses, settings.currency],
          ['Net Operating Profit', analytics.netOperatingProfit, settings.currency],
          ['Active SKUs', products.length, 'items'],
          ['Registered Customers', customers.length, 'accounts'],
          ['Active Employees', employees.length, 'staff'],
        ]
      : [
          ['Gross POS Revenue', analytics.grossRevenue, settings.currency],
          ['Completed Invoices', analytics.completedOrders, 'orders'],
          ['Active SKUs', products.length, 'items'],
          ['Retail Stock Value', analytics.totalRetailStock, settings.currency],
          ['Registered Customers', customers.length, 'accounts'],
        ];

    exportRowsToCsv(
      `host256_${canSeeMargins ? 'executive_pnl' : 'revenue_summary'}_${formatIsoDate()}.csv`,
      ['Metric', 'Value', 'Currency / Unit'],
      rows
    );
  };

  return (
    <div className="space-y-6">
      {/* Executive Statement Strip */}
      <div className="flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {canSeeMargins
              ? 'Executive Profitability & Decision Intelligence'
              : 'Revenue, Cashflow & Channel Analytics'}
          </h2>
          <p className="text-xs text-slate-500">
            {canSeeMargins
              ? 'Consolidated real-time P&L across POS, Inventory, HR, CRM, and General Ledger'
              : 'Top-line sales volume, tender channel mix, and ledger cashflow (profit margins restricted to Admin/Owner)'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportExecutiveSummary}
          className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5" />
          {canSeeMargins ? 'Download Executive P&L (.CSV)' : 'Download Revenue Report (.CSV)'}
        </button>
      </div>

      {canSeeMargins ? (
        <div className="grid grid-cols-1 border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Gross Sales Revenue</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {formatCurrency(analytics.grossRevenue, settings.currency)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Completed POS invoices
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Gross Profit (After COGS)</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
              {formatCurrency(analytics.grossProfit, settings.currency)}
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
              Margin: {analytics.grossMarginPct.toFixed(1)}%
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Operating Overheads</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {formatCurrency(analytics.nonCogsExpenses, settings.currency)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Payroll, utilities, rent &amp; returns
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Net Operating Profit</div>
            <div
              className={`mt-1 font-mono text-xl font-bold tabular-nums ${
                analytics.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {formatCurrency(analytics.netOperatingProfit, settings.currency)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Bottom-line operating earnings
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Gross Sales Revenue</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {formatCurrency(analytics.grossRevenue, settings.currency)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Completed POS invoices
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Completed Orders</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
              {analytics.completedOrders}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Verified receipts issued
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Registered CRM Accounts</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {customers.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Active retail &amp; wholesale buyers
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium text-slate-500">Active Catalog SKUs</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {products.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Merchandise lines tracked
            </div>
          </div>
        </div>
      )}

      {/* Comparative Cashflow Chart + Payment Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="border border-slate-200 bg-white p-5 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Daily Income vs. Outflow Trend
              </h3>
              <p className="text-[11px] text-slate-500">
                Ledger cash movement by posting date
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 bg-emerald-600" />
                Income
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 bg-slate-800" />
                Expense
              </span>
            </div>
          </div>

          {analytics.dailySeries.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Record transactions to visualize daily cashflow trends.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {analytics.dailySeries.map((day) => {
                const incPct = Math.max(2, (day.income / analytics.maxBarVal) * 100);
                const expPct = Math.max(2, (day.expense / analytics.maxBarVal) * 100);
                return (
                  <div key={day.date} className="space-y-1">
                    <div className="flex justify-between font-mono text-[11px] text-slate-600 tabular-nums">
                      <span className="font-semibold text-slate-800">{day.date}</span>
                      <span>
                        +{formatCurrency(day.income, settings.currency)} · -
                        {formatCurrency(day.expense, settings.currency)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-2.5 w-full bg-slate-100">
                        <div
                          className="h-2.5 bg-emerald-600"
                          style={{ width: `${day.income > 0 ? incPct : 0}%` }}
                        />
                      </div>
                      <div className="h-2.5 w-full bg-slate-100">
                        <div
                          className="h-2.5 bg-slate-800"
                          style={{ width: `${day.expense > 0 ? expPct : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border border-slate-200 bg-white p-5 lg:col-span-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Revenue by Payment Channel
            </h3>
            <p className="text-[11px] text-slate-500">
              Cash, Mobile Money (MTN/Airtel), Card &amp; Credit distribution
            </p>
          </div>

          {analytics.paymentChannels.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No completed POS transactions yet.
            </div>
          ) : (
            <div className="mt-4 space-y-3.5">
              {analytics.paymentChannels.map((ch) => (
                <div key={ch.channel} className="space-y-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium text-slate-800">
                      {ch.channel}{' '}
                      <span className="text-[11px] text-slate-400">({ch.count} sales)</span>
                    </span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(ch.amount, settings.currency)} ({ch.sharePct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100">
                    <div
                      className="h-2 bg-slate-900"
                      style={{ width: `${Math.max(3, ch.sharePct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stock Valuation by Category Table */}
      <div className="border border-slate-200 bg-white overflow-x-auto">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            Inventory Valuation by Merchandise Category
          </h3>
        </div>
        {analytics.categoryBreakdown.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No active inventory categories to analyze.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2.5">Category</th>
                <th className="px-5 py-2.5 text-right">Active SKUs</th>
                <th className="px-5 py-2.5 text-right">Total Units</th>
                <th className="px-5 py-2.5 text-right">Retail Stock Value</th>
                <th className="px-5 py-2.5 text-right">Portfolio Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {analytics.categoryBreakdown.map((cat) => (
                <tr key={cat.category} className="hover:bg-slate-50/80">
                  <td className="px-5 py-2.5 font-semibold text-slate-900">
                    {cat.category}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">
                    {cat.skus}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">
                    {cat.units}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(cat.retailValue, settings.currency)}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-slate-600 tabular-nums">
                    {cat.sharePct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
