import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

/** "5m ago", "3h ago", "2d ago" — falls back to a date for anything older than a week. */
export function timeAgo(dateString?: string | null): string {
  if (!dateString) return '';
  const ms = Date.now() - new Date(dateString).getTime();
  if (isNaN(ms)) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateString);
}

/**
 * Money on the server is always integer cents in EUR (no floats, so totals never drift).
 * 125000 → "€1,250.00". Null / undefined render as a dash so tables don't show "€NaN".
 */
export function formatCents(cents?: number | null): string {
  if (cents === null || cents === undefined || isNaN(cents)) return '—';
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "Nov 18, 2026, 3:04 PM" — for timelines where the time of day matters (payments, deadlines). */
export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** Server enums are snake_case ("in_production") — show them as "in production". */
export function humanizeStatus(value?: string | null): string {
  return (value ?? '').replace(/_/g, ' ');
}

/**
 * Downloads rows as a CSV file in the browser (no server round trip).
 * Values are quoted and inner quotes doubled so commas / newlines in titles don't break columns.
 */
export function downloadCsv(fileName: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const escapeCell = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
