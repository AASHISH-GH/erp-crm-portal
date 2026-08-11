import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { currency } from '../lib/format';
import type { Customer, Product } from '../lib/types';
import { Alert, Field, Loading, PageHead } from '../components/ui';

interface Line {
  key: number;
  productId: string;
  quantity: string;
  unitPrice: string;
}

const emptyLine = (key: number): Line => ({ key, productId: '', quantity: '1', unitPrice: '' });

export const ChallanForm = () => {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'DRAFT' | 'CONFIRMED' | null>(null);

  useEffect(() => {
    // The picker lists are small in this dataset, so both are loaded once up front
    // rather than paginated inside a dropdown.
    Promise.all([
      api.get('/customers', { params: { limit: 100 } }),
      api.get('/products', { params: { limit: 100, isActive: 'true' } }),
    ])
      .then(([customerRes, productRes]) => {
        setCustomers(customerRes.data.data);
        setProducts(productRes.data.data);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const onProductChange = (key: number, productId: string) => {
    const product = productById.get(productId);
    // Prefill the rate from the product master; the user can still override it.
    updateLine(key, { productId, unitPrice: product ? String(product.unitPrice) : '' });
  };

  const addLine = () => {
    setLines((current) => [...current, emptyLine(nextKey)]);
    setNextKey((key) => key + 1);
  };

  const removeLine = (key: number) =>
    setLines((current) => (current.length === 1 ? current : current.filter((l) => l.key !== key)));

  const validLines = lines.filter((line) => line.productId && Number(line.quantity) > 0);

  const totals = validLines.reduce(
    (acc, line) => {
      const quantity = Number(line.quantity);
      const price = Number(line.unitPrice || 0);
      return { quantity: acc.quantity + quantity, amount: acc.amount + quantity * price };
    },
    { quantity: 0, amount: 0 },
  );

  // Client-side mirror of the server's stock rule. This is a convenience only — the
  // authoritative check happens inside the confirm transaction on the server.
  const insufficient = validLines.filter((line) => {
    const product = productById.get(line.productId);
    return product ? Number(line.quantity) > product.currentStock : false;
  });

  const duplicateProducts =
    new Set(validLines.map((line) => line.productId)).size !== validLines.length;

  const submit = async (status: 'DRAFT' | 'CONFIRMED') => {
    setError(null);
    setSaving(status);

    try {
      const { data } = await api.post('/challans', {
        customerId,
        notes: notes || undefined,
        status,
        items: validLines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice || 0),
        })),
      });
      navigate(`/challans/${data.data.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <Loading />;

  const canSubmit = Boolean(customerId) && validLines.length > 0 && !duplicateProducts;

  return (
    <>
      <PageHead
        title="New sales challan"
        subtitle="Save as draft to keep working, or confirm to dispatch and deduct stock."
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/challans')}>
            ← Back
          </button>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Customer</h3>
        </div>
        <div className="card-body">
          <div className="form-grid">
            <Field label="Select customer" required>
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">— Choose a customer —</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.businessName
                      ? `${customer.businessName} — ${customer.name}`
                      : customer.name}{' '}
                    ({customer.mobile})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Notes" hint="Delivery instructions, vehicle number, etc." full>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Deliver with the Thursday route van."
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Products</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}>
            + Add line
          </button>
        </div>

        <div className="card-body">
          {duplicateProducts && (
            <Alert kind="warning">
              The same product appears on more than one line. Combine the quantities instead.
            </Alert>
          )}

          {insufficient.length > 0 && (
            <Alert kind="warning">
              {insufficient.length} line(s) exceed available stock. You can still save this as a
              draft — confirming will be rejected by the server.
            </Alert>
          )}

          <div className="line-head" style={{ marginBottom: 8 }}>
            <span>Product</span>
            <span>Quantity</span>
            <span>Rate (₹)</span>
            <span style={{ textAlign: 'right' }}>Line total</span>
            <span />
          </div>

          <div className="line-items">
            {lines.map((line) => {
              const product = productById.get(line.productId);
              const quantity = Number(line.quantity || 0);
              const isShort = product ? quantity > product.currentStock : false;

              return (
                <div className="line-item" key={line.key}>
                  <div>
                    <select
                      value={line.productId}
                      onChange={(event) => onProductChange(line.key, event.target.value)}
                    >
                      <option value="">— Select product —</option>
                      {products.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} · {option.sku} (stock {option.currentStock})
                        </option>
                      ))}
                    </select>
                    {product && (
                      <div className={`stock-hint${isShort ? ' insufficient' : ''}`}>
                        {isShort
                          ? `Only ${product.currentStock} in stock`
                          : `${product.currentStock} in stock · ${product.location}`}
                      </div>
                    )}
                  </div>

                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    aria-label="Quantity"
                  />

                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                    aria-label="Unit price"
                  />

                  <div className="line-total">
                    {currency(quantity * Number(line.unitPrice || 0))}
                  </div>

                  <button
                    type="button"
                    className="line-remove"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="totals-bar">
          <div className="item">
            <div className="label">Total quantity</div>
            <div className="value">{totals.quantity}</div>
          </div>
          <div className="item">
            <div className="label">Total amount</div>
            <div className="value">{currency(totals.amount)}</div>
          </div>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canSubmit || saving !== null}
          onClick={() => submit('DRAFT')}
        >
          {saving === 'DRAFT' ? 'Saving…' : 'Save as draft'}
        </button>
        <button
          type="button"
          className="btn btn-success"
          disabled={!canSubmit || saving !== null}
          onClick={() => submit('CONFIRMED')}
        >
          {saving === 'CONFIRMED' ? 'Confirming…' : 'Save & confirm (deducts stock)'}
        </button>
      </div>
    </>
  );
};
