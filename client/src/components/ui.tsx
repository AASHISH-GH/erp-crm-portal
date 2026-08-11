import type { ReactNode } from 'react';
import type { ChallanStatus, CustomerStatus, CustomerType, MovementType, Role } from '../lib/types';
import type { PaginationMeta } from '../lib/types';

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="loading">{label}</div>
);

export const EmptyState = ({
  icon = '📭',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) => (
  <div className="empty">
    <div className="icon">{icon}</div>
    <p>
      <strong>{title}</strong>
    </p>
    {hint && <p>{hint}</p>}
    {action && <div style={{ marginTop: 14 }}>{action}</div>}
  </div>
);

export const Alert = ({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success' | 'warning';
  children: ReactNode;
}) => <div className={`alert alert-${kind}`}>{children}</div>;

const STATUS_BADGE: Record<string, string> = {
  // Customer pipeline
  LEAD: 'badge-warning',
  ACTIVE: 'badge-success',
  INACTIVE: 'badge',
  // Challan lifecycle
  DRAFT: 'badge-warning',
  CONFIRMED: 'badge-success',
  CANCELLED: 'badge-danger',
  // Stock ledger direction
  IN: 'badge-success',
  OUT: 'badge-danger',
  // Customer segment
  RETAIL: 'badge-info',
  WHOLESALE: 'badge-info',
  DISTRIBUTOR: 'badge-info',
  // Roles
  ADMIN: 'badge-danger',
  SALES: 'badge-info',
  WAREHOUSE: 'badge-warning',
  ACCOUNTS: 'badge-success',
};

export const StatusBadge = ({
  value,
}: {
  value: ChallanStatus | CustomerStatus | CustomerType | MovementType | Role | string;
}) => <span className={`badge ${STATUS_BADGE[value] ?? ''}`}>{value}</span>;

export const Pagination = ({
  meta,
  onPageChange,
}: {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}) => {
  if (meta.total === 0) return null;

  const first = (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="pagination">
      <span className="info">
        Showing {first}–{last} of {meta.total}
      </span>
      <div className="controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!meta.hasPrevPage}
          onClick={() => onPageChange(meta.page - 1)}
        >
          ← Prev
        </button>
        <span className="info">
          Page {meta.page} of {meta.totalPages}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!meta.hasNextPage}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
};

export const PageHead = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) => (
  <div className="page-head">
    <div>
      <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {actions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
  </div>
);

export const Modal = ({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <div
    className="modal-backdrop"
    onClick={onClose}
    role="presentation"
  >
    <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
      <div className="modal-header">
        <h3>{title}</h3>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </div>
  </div>
);

export const Stat = ({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: 'danger' | 'success' | 'warning';
}) => (
  <div className={`stat${accent ? ` accent-${accent}` : ''}`}>
    <div className="label">{label}</div>
    <div className="value">{value}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

export const Field = ({
  label,
  required,
  hint,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) => (
  <div className={`field${full ? ' field-full' : ''}`}>
    <label>
      {label} {required && <span className="required">*</span>}
    </label>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
  </div>
);
