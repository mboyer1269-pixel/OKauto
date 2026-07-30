const CLASS: Record<string, string> = {
  ACTIVE: 'badge-active',
  SOLD: 'badge-sold',
  NEEDS_ATTENTION: 'badge-attn',
  DRAFT: 'badge-draft',
  READY: 'badge-ready',
  PENDING: 'badge-ready',
  REMOVED: 'badge-sold',
  FAILED: 'badge-sold',
  AVAILABLE: 'badge-active',
  PENDING_SALE: 'badge-attn',
  ARCHIVED: 'badge-draft',
};

const LABEL: Record<string, string> = {
  NEEDS_ATTENTION: 'Needs attention',
  PENDING_SALE: 'Pending sale',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = CLASS[status] ?? 'badge-draft';
  const label = LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return <span className={`badge ${cls}`}>{label}</span>;
}
