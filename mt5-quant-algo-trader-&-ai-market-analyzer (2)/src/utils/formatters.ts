import { CurrencyCode } from '../types/erp';

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export function clampString(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const trimmed = (val ?? '').trim();
  const resolved = trimmed.length === 0 ? fallback : trimmed;
  return resolved.slice(0, maxLen);
}

export function clampNonNegative(val: number, max = 1_000_000_000_000): number {
  if (!Number.isFinite(val) || Number.isNaN(val)) return 0;
  return Math.max(0, Math.min(max, Math.round(val * 100) / 100));
}

export function clampSignedNumber(val: number, max = 1_000_000_000_000): number {
  if (!Number.isFinite(val) || Number.isNaN(val)) return 0;
  return Math.max(-max, Math.min(max, Math.round(val * 100) / 100));
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'UGX'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  if (currency === 'UGX' || currency === 'KES') {
    return `${sign}${currency} ${Math.round(abs).toLocaleString('en-US')}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatIsoDate(dateInput?: string | Date): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function addDaysToIsoDate(days: number, fromDate?: string | Date): string {
  const base = fromDate ? new Date(fromDate) : new Date();
  const ts = Number.isNaN(base.getTime()) ? Date.now() : base.getTime();
  const target = new Date(ts + Math.max(0, Math.round(days)) * 86_400_000);
  return target.toISOString().slice(0, 10);
}

export interface WarrantyCheckStatus {
  state: 'active' | 'expired' | 'void' | 'none';
  daysRemaining: number;
  label: string;
}

export function evaluateWarrantyStatus(
  warrantyUntil?: string,
  saleStatus?: 'completed' | 'refunded'
): WarrantyCheckStatus {
  if (saleStatus === 'refunded') {
    return { state: 'void', daysRemaining: 0, label: 'Void · Refunded' };
  }
  if (!warrantyUntil || warrantyUntil.trim() === '') {
    return { state: 'none', daysRemaining: 0, label: 'No Warranty' };
  }
  const endOfDay = new Date(`${warrantyUntil.slice(0, 10)}T23:59:59`);
  if (Number.isNaN(endOfDay.getTime())) {
    return { state: 'none', daysRemaining: 0, label: 'No Warranty' };
  }
  const diffMs = endOfDay.getTime() - Date.now();
  const daysRemaining = Math.ceil(diffMs / 86_400_000);
  if (diffMs >= 0) {
    return {
      state: 'active',
      daysRemaining: Math.max(0, daysRemaining),
      label: daysRemaining <= 1 ? 'Active · Last Day' : `Active · ${daysRemaining}d left`,
    };
  }
  const daysPast = Math.abs(daysRemaining);
  return {
    state: 'expired',
    daysRemaining: 0,
    label: `Expired · ${daysPast}d ago`,
  };
}

export function formatDateTimeLabel(isoOrDate: string): string {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function exportRowsToCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (cell: string | number) => {
    let str = String(cell ?? '');

    // Prevent spreadsheet formula injection when exported values are opened in
    // Excel, LibreOffice, or Google Sheets.
    if (/^[=+\-@]/.test(str)) {
      str = `'${str}`;
    }

    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const safeFilename = filename.trim().replace(/[\\/:*?"<>|\r\n]/g, '_') || 'export.csv';

  const csvLines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ];
  const blob = new Blob([`\uFEFF${csvLines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', safeFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
