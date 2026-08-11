import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { compactCurrency, currency, formatDateTime } from '../lib/format';
import type { DashboardSummary } from '../lib/types';
import { Alert, EmptyState, Loading, PageHead, Stat, StatusBadge } from '../components/ui';
import { useAuth } from '../lib/auth';

export const Dashboard = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/dashboard/summary')
      .then(({ data }) => {
        if (!cancelled) setSummary(data.data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!summary) return null;

  return (
    <>
      <PageHead
        title={`Good day, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle="Snapshot of customers, stock and dispatch across the business."
      />

      <div className="stat-grid">
        <Stat
          label="Customers"
          value={summary.customers.total}
          sub={`${summary.customers.active} active · ${summary.customers.leads} leads`}
        />
        <Stat
          label="Follow-ups due"
          value={summary.customers.dueFollowUps}
          sub="On or before today"
          accent={summary.customers.dueFollowUps > 0 ? 'warning' : undefined}
        />
        <Stat
          label="Products"
          value={summary.products.total}
          sub={`Stock value ${compactCurrency(summary.products.stockValue)}`}
        />
        <Stat
          label="Low stock alerts"
          value={summary.products.lowStock}
          sub="At or below minimum level"
          accent={summary.products.lowStock > 0 ? 'danger' : 'success'}
        />
        <Stat
          label="Draft challans"
          value={summary.challans.draft}
          sub="No stock impact yet"
          accent={summary.challans.draft > 0 ? 'warning' : undefined}
        />
        <Stat
          label="Dispatched today"
          value={summary.today.quantityDispatched}
          sub={`${summary.today.confirmedChallans} challans · ${currency(summary.today.amount)}`}
          accent="success"
        />
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h3>Low stock alerts</h3>
            <Link to="/products?lowStock=true" className="btn btn-ghost btn-sm">
              View all →
            </Link>
          </div>
          {summary.lowStockList.length === 0 ? (
            <EmptyState icon="✅" title="Everything is above its minimum level" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th className="num">On hand</th>
                    <th className="num">Minimum</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lowStockList.map((product) => (
                    <tr key={product.id}>
                      <td className="cell-title">{product.name}</td>
                      <td className="mono">{product.sku}</td>
                      <td className="num" style={{ color: 'var(--danger)', fontWeight: 700 }}>
                        {product.currentStock}
                      </td>
                      <td className="num">{product.minStockAlert}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Recent challans</h3>
            <Link to="/challans" className="btn btn-ghost btn-sm">
              View all →
            </Link>
          </div>
          {summary.recentChallans.length === 0 ? (
            <EmptyState icon="🧾" title="No challans yet" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentChallans.map((challan) => (
                    <tr key={challan.id}>
                      <td>
                        <Link to={`/challans/${challan.id}`} className="mono" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                          {challan.challanNumber}
                        </Link>
                      </td>
                      <td>{challan.customerName}</td>
                      <td>
                        <StatusBadge value={challan.status} />
                      </td>
                      <td className="num">{currency(challan.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>Latest stock movements</h3>
          <Link to="/stock" className="btn btn-ghost btn-sm">
            Open ledger →
          </Link>
        </div>
        {summary.recentMovements.length === 0 ? (
          <EmptyState icon="🔁" title="No stock movements recorded yet" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th className="num">Qty</th>
                  <th className="num">Balance</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="cell-sub">{formatDateTime(movement.createdAt)}</td>
                    <td>
                      <div className="cell-title">{movement.product?.name}</div>
                      <div className="cell-sub mono">{movement.product?.sku}</div>
                    </td>
                    <td>
                      <StatusBadge value={movement.type} />
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {movement.type === 'IN' ? '+' : '−'}
                      {movement.quantity}
                    </td>
                    <td className="num">{movement.stockAfter}</td>
                    <td className="cell-sub">{movement.reason}</td>
                    <td className="cell-sub">{movement.createdBy?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};
