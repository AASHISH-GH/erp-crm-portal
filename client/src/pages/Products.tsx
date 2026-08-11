import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useList } from '../lib/useList';
import { api, getErrorMessage } from '../lib/api';
import { currency } from '../lib/format';
import type { Product } from '../lib/types';
import {
  Alert,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHead,
  Pagination,
} from '../components/ui';
import { useAuth } from '../lib/auth';

export const Products = () => {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(searchParams.get('lowStock') === 'true');
  const [page, setPage] = useState(1);

  const { items, meta, loading, error, reload } = useList<Product>('/products', {
    page,
    limit: 10,
    search,
    ...(lowStock ? { lowStock: 'true' } : {}),
  });

  // Inline stock adjustment — the warehouse team's most frequent action, so it lives
  // on the list page rather than behind a separate screen.
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('');
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const openAdjust = (product: Product) => {
    setAdjusting(product);
    setQuantity('');
    setMovementType('IN');
    setReason('');
    setAdjustError(null);
  };

  const submitAdjust = async (event: FormEvent) => {
    event.preventDefault();
    if (!adjusting) return;

    setAdjustError(null);
    setSaving(true);
    try {
      await api.post('/stock/movements', {
        productId: adjusting.id,
        quantity: Number(quantity),
        type: movementType,
        reason,
      });
      setAdjusting(null);
      reload();
    } catch (err) {
      setAdjustError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const canWrite = can('ADMIN', 'WAREHOUSE');

  return (
    <>
      <PageHead
        title="Products"
        subtitle="Product master and live on-hand stock."
        actions={
          canWrite && (
            <Link to="/products/new" className="btn btn-primary">
              + Add product
            </Link>
          )
        }
      />

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search name, SKU or category…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <button
          type="button"
          className={`btn btn-sm ${lowStock ? 'btn-danger' : 'btn-secondary'}`}
          onClick={() => {
            setLowStock((value) => !value);
            setPage(1);
          }}
        >
          Low stock only
        </button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState icon="📦" title="No products match these filters" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th className="num">Unit price</th>
                    <th className="num">On hand</th>
                    <th className="num">Min level</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="cell-title">{product.name}</div>
                        <div className="cell-sub mono">{product.sku}</div>
                      </td>
                      <td>{product.category}</td>
                      <td className="mono">{product.location}</td>
                      <td className="num">{currency(product.unitPrice)}</td>
                      <td
                        className="num"
                        style={{
                          fontWeight: 700,
                          color: product.isLowStock ? 'var(--danger)' : undefined,
                        }}
                      >
                        {product.currentStock}
                        {product.isLowStock && (
                          <span className="badge badge-danger" style={{ marginLeft: 8 }}>
                            Low
                          </span>
                        )}
                      </td>
                      <td className="num">{product.minStockAlert}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {canWrite && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => openAdjust(product)}
                            >
                              Adjust stock
                            </button>{' '}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => navigate(`/products/${product.id}/edit`)}
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPageChange={setPage} />
          </>
        )}
      </div>

      {adjusting && (
        <Modal
          title={`Adjust stock — ${adjusting.name}`}
          onClose={() => setAdjusting(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setAdjusting(null)}>
                Cancel
              </button>
              <button
                type="submit"
                form="adjust-form"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Recording…' : 'Record movement'}
              </button>
            </>
          }
        >
          <form id="adjust-form" onSubmit={submitAdjust} style={{ display: 'contents' }}>
            {adjustError && <Alert kind="error">{adjustError}</Alert>}

            <Alert kind="warning">
              Current stock: <strong>{adjusting.currentStock}</strong> · minimum level{' '}
              {adjusting.minStockAlert}
            </Alert>

            <Field label="Movement type" required>
              <select
                value={movementType}
                onChange={(event) => setMovementType(event.target.value as 'IN' | 'OUT')}
              >
                <option value="IN">IN — goods received / returned</option>
                <option value="OUT">OUT — damage, sample, correction</option>
              </select>
            </Field>

            <Field label="Quantity" required>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </Field>

            <Field label="Reason" required hint="Shown in the stock ledger permanently">
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Purchase receipt PO/2026/0114"
                required
              />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
};
