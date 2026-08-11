import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useList } from '../lib/useList';
import { currency, formatDate } from '../lib/format';
import type { ChallanSummary } from '../lib/types';
import { Alert, EmptyState, Loading, PageHead, Pagination, StatusBadge } from '../components/ui';
import { useAuth } from '../lib/auth';

export const Challans = () => {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const customerId = searchParams.get('customerId') ?? '';

  const { items, meta, loading, error } = useList<ChallanSummary>('/challans', {
    page,
    limit: 10,
    search,
    status,
    customerId,
  });

  return (
    <>
      <PageHead
        title="Sales challans"
        subtitle="Delivery documents. Stock moves the moment a challan is confirmed."
        actions={
          can('ADMIN', 'SALES') && (
            <Link to="/challans/new" className="btn btn-primary">
              + New challan
            </Link>
          )
        }
      />

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search challan number or customer…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        {customerId && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/challans')}
          >
            Clear customer filter
          </button>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="No challans match these filters"
            hint="Create one from the New challan button."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Challan no.</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th className="num">Lines</th>
                    <th className="num">Total qty</th>
                    <th className="num">Amount</th>
                    <th>Created by</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((challan) => (
                    <tr
                      key={challan.id}
                      className="clickable"
                      onClick={() => navigate(`/challans/${challan.id}`)}
                    >
                      <td className="mono" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                        {challan.challanNumber}
                      </td>
                      <td className="cell-title">{challan.customerName}</td>
                      <td className="cell-sub">{formatDate(challan.createdAt)}</td>
                      <td>
                        <StatusBadge value={challan.status} />
                      </td>
                      <td className="num">{challan._count?.items ?? '—'}</td>
                      <td className="num">{challan.totalQuantity}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {currency(challan.totalAmount)}
                      </td>
                      <td className="cell-sub">{challan.createdBy?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
};
