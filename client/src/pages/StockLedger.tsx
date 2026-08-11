import { useState } from 'react';
import { useList } from '../lib/useList';
import { formatDateTime } from '../lib/format';
import type { StockMovement } from '../lib/types';
import { Alert, EmptyState, Loading, PageHead, Pagination, StatusBadge } from '../components/ui';

export const StockLedger = () => {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { items, meta, loading, error } = useList<StockMovement>('/stock/movements', {
    page,
    limit: 15,
    search,
    type,
    from,
    to,
  });

  return (
    <>
      <PageHead
        title="Stock ledger"
        subtitle="Every unit that moved, why it moved, and who moved it."
      />

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search product, SKU or reason…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All movements</option>
          <option value="IN">IN only</option>
          <option value="OUT">OUT only</option>
        </select>
        <input
          type="date"
          value={from}
          style={{ width: 'auto' }}
          onChange={(event) => {
            setFrom(event.target.value);
            setPage(1);
          }}
          aria-label="From date"
        />
        <input
          type="date"
          value={to}
          style={{ width: 'auto' }}
          onChange={(event) => {
            setTo(event.target.value);
            setPage(1);
          }}
          aria-label="To date"
        />
        {(search || type || from || to) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setType('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState icon="🔁" title="No stock movements match these filters" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Product</th>
                    <th>Type</th>
                    <th className="num">Quantity</th>
                    <th className="num">Balance after</th>
                    <th>Reason</th>
                    <th>Source</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((movement) => (
                    <tr key={movement.id}>
                      <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(movement.createdAt)}
                      </td>
                      <td>
                        <div className="cell-title">{movement.product?.name ?? '—'}</div>
                        <div className="cell-sub mono">{movement.product?.sku}</div>
                      </td>
                      <td>
                        <StatusBadge value={movement.type} />
                      </td>
                      <td
                        className="num"
                        style={{
                          fontWeight: 700,
                          color: movement.type === 'IN' ? 'var(--success)' : 'var(--danger)',
                        }}
                      >
                        {movement.type === 'IN' ? '+' : '−'}
                        {movement.quantity}
                      </td>
                      <td className="num">{movement.stockAfter}</td>
                      <td className="cell-sub">{movement.reason}</td>
                      <td className="cell-sub mono">{movement.referenceType ?? '—'}</td>
                      <td className="cell-sub">{movement.createdBy?.name ?? '—'}</td>
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
