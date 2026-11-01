import React, { useEffect, useState } from 'react';
import { Save, Database, CheckCircle2 } from 'lucide-react';
import { BusinessSettings, CurrencyCode, ErpModuleId } from '../types/erp';
import { saveBusinessSettings, seedSampleErpWorkspace } from '../services/erpService';

interface SettingsViewProps {
  ownerId: string;
  settings: BusinessSettings;
  hasPersistedSettings: boolean;
  hasExistingData: boolean;
}

const ALL_MODULES: { id: ErpModuleId; label: string; desc: string }[] = [
  { id: 'pos', label: 'Point of Sale (POS)', desc: 'Process sales, issue receipts & track transactions.' },
  { id: 'sales', label: 'Sales Management', desc: 'Monitor sales, refunds, and monthly targets.' },
  { id: 'inventory', label: 'Inventory & Stock', desc: 'Manage products, supplier purchases & stock levels.' },
  { id: 'accounting', label: 'Accounting & Finance', desc: 'Track income, expenses & general ledger records.' },
  { id: 'hr', label: 'Human Resources (HR)', desc: 'Manage employees, shifts, and staff payroll.' },
  { id: 'crm', label: 'Customer Management (CRM)', desc: 'Organize customer profiles, credit & relationships.' },
  { id: 'reports', label: 'Reports & Analytics', desc: 'Business P&L insights, charts, and CSV exports.' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  ownerId,
  settings,
  hasPersistedSettings,
  hasExistingData,
}) => {
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency);
  const [taxRate, setTaxRate] = useState(String(settings.taxRate));
  const [monthlySalesTarget, setMonthlySalesTarget] = useState(
    String(settings.monthlySalesTarget)
  );
  const [branchAddress, setBranchAddress] = useState(settings.branchAddress);
  const [businessPhone, setBusinessPhone] = useState(settings.businessPhone);
  const [receiptHeader, setReceiptHeader] = useState(settings.receiptHeader);
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter);
  const [defaultWarrantyDays, setDefaultWarrantyDays] = useState(
    String(settings.defaultWarrantyDays ?? 7)
  );
  const [managerPin, setManagerPin] = useState(settings.managerPin ?? '2560');
  const [enabledModules, setEnabledModules] = useState<ErpModuleId[]>(
    settings.enabledModules
  );
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    setBusinessName(settings.businessName);
    setTagline(settings.tagline);
    setCurrency(settings.currency);
    setTaxRate(String(settings.taxRate));
    setMonthlySalesTarget(String(settings.monthlySalesTarget));
    setBranchAddress(settings.branchAddress);
    setBusinessPhone(settings.businessPhone);
    setReceiptHeader(settings.receiptHeader);
    setReceiptFooter(settings.receiptFooter);
    setDefaultWarrantyDays(String(settings.defaultWarrantyDays ?? 7));
    setManagerPin(settings.managerPin ?? '2560');
    setEnabledModules(settings.enabledModules);
  }, [settings]);

  const toggleModule = (modId: ErpModuleId) => {
    setEnabledModules((prev) => {
      if (prev.includes(modId)) {
        if (prev.length === 1) return prev; // Keep at least 1 active module
        return prev.filter((m) => m !== modId);
      }
      return [...prev, modId];
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedBanner(false);
    try {
      await saveBusinessSettings(
        ownerId,
        {
          businessName,
          tagline,
          currency,
          taxRate: Number(taxRate) || 0,
          monthlySalesTarget: Number(monthlySalesTarget) || 0,
          receiptHeader,
          receiptFooter,
          branchAddress,
          businessPhone,
          enabledModules,
          defaultWarrantyDays: Math.max(0, Number(defaultWarrantyDays) || 0),
          managerPin,
          authorizedEmails: settings.authorizedEmails || [],
        },
        hasPersistedSettings
      );
      setSavedBanner(true);
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDemoData = async () => {
    setSeeding(true);
    try {
      await seedSampleErpWorkspace(ownerId);
      setSavedBanner(true);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <form onSubmit={handleSave} className="border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Customizable Business Configuration — HOST256 ERP
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Tailor branding, currency, VAT rate, warranty policy, counter PIN lock, and active modules to fit your exact business workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 text-xs">
          <div>
            <label className="block font-medium text-slate-700">Business / Store Name</label>
            <input
              required
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700">System Tagline</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700">Operating Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
            >
              <option value="UGX">UGX — Ugandan Shilling</option>
              <option value="USD">USD — US Dollar</option>
              <option value="KES">KES — Kenyan Shilling</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700">VAT / Tax Rate (%)</label>
              <input
                required
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700">Monthly Target</label>
              <input
                required
                type="number"
                min={0}
                value={monthlySalesTarget}
                onChange={(e) => setMonthlySalesTarget(e.target.value)}
                className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700">Branch Physical Address</label>
            <input
              type="text"
              value={branchAddress}
              onChange={(e) => setBranchAddress(e.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700">Business Telephone</label>
            <input
              type="text"
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700">
              Default Store Warranty Period (Days)
            </label>
            <input
              type="number"
              min={0}
              max={3650}
              value={defaultWarrantyDays}
              onChange={(e) => setDefaultWarrantyDays(e.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono tabular-nums focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700">
              Counter Role Lock Manager PIN (4–8 chars)
            </label>
            <input
              type="text"
              maxLength={8}
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
              placeholder="e.g., 2560"
              className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-medium text-slate-700">POS Receipt Header Line</label>
            <input
              type="text"
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-medium text-slate-700">POS Receipt Footer / Warranty Policy</label>
            <input
              type="text"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Modular Solutions Toggle */}
        <div className="border-t border-slate-200 px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            Active ERP Solution Modules
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Enable or hide modules in the sidebar navigation to fit your team's daily operations.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {ALL_MODULES.map((mod) => {
              const checked = enabledModules.includes(mod.id);
              return (
                <label
                  key={mod.id}
                  className={`flex cursor-pointer items-start gap-3 border p-3 text-xs transition-colors ${
                    checked
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 bg-white opacity-70'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModule(mod.id)}
                    className="mt-0.5 h-3.5 w-3.5 accent-slate-900"
                  />
                  <div>
                    <div className="font-semibold text-slate-900">{mod.label}</div>
                    <div className="text-[11px] text-slate-500">{mod.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <div>
            {savedBanner && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Configuration saved to cloud database.
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving Settings...' : 'Save Business Configuration'}
          </button>
        </div>
      </form>

      {/* Sample Data Loader */}
      <div className="flex flex-col gap-3 border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Sample Retail &amp; Liquidation Dataset
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {hasExistingData
              ? 'Add sample Ugandan retail/wholesale products, customers, staff, and sample sales records.'
              : 'Your workspace is empty. Load realistic products, customers, employees, and sample POS receipts in one click.'}
          </p>
        </div>
        <button
          type="button"
          disabled={seeding}
          onClick={handleSeedDemoData}
          className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
        >
          <Database className="h-3.5 w-3.5" />
          {seeding ? 'Populating Records...' : 'Load Sample Business Data'}
        </button>
      </div>
    </div>
  );
};
