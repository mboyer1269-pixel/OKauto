import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'AVAILABLE':
    case 'ACTIVE':
      return 'badge-success';
    case 'PENDING':
    case 'DRAFT':
      return 'badge-warning';
    case 'SOLD':
      return 'badge-danger';
    case 'ARCHIVED':
    case 'REMOVED':
    case 'STALE':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
}
