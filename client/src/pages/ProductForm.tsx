import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import type { Product } from '../lib/types';
import { Alert, Field, Loading, PageHead } from '../components/ui';

interface FormState {
  name: string;
  sku: string;
  category: string;
  unitPrice: string;
  currentStock: string;
  minStockAlert: string;
  location: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: '',
  sku: '',
  category: '',
  unitPrice: '',
  currentStock: '0',
  minStockAlert: '0',
  location: 'MAIN',
  isActive: true,
};

export const ProductForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    api
      .get(`/products/${id}`)
      .then(({ data }) => {
        const product = data.data as Product;
        setForm({
          name: product.name,
          sku: product.sku,
          category: product.category,
          unitPrice: String(product.unitPrice),
          currentStock: String(product.currentStock),
          minStockAlert: String(product.minStockAlert),
          location: product.location,
          isActive: product.isActive,
        });
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const base = {
        name: form.name,
        sku: form.sku,
        category: form.category,
        unitPrice: Number(form.unitPrice),
        minStockAlert: Number(form.minStockAlert),
        location: form.location,
        isActive: form.isActive,
      };

      if (isEdit) {
        // currentStock is deliberately not editable here — stock only changes through
        // the ledger, so the on-hand number always has a movement that explains it.
        await api.put(`/products/${id}`, base);
      } else {
        await api.post('/products', { ...base, currentStock: Number(form.currentStock) });
      }
      navigate('/products');
    } catch (err) {
      setError(getErrorMessage(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof FormState) => (value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  if (loading) return <Loading />;

  return (
    <>
      <PageHead
        title={isEdit ? 'Edit product' : 'Add product'}
        subtitle={isEdit ? 'Update product master data.' : 'Create a new item in the catalogue.'}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/products')}>
            ← Back
          </button>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header">
            <h3>Product details</h3>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <Field label="Product name" required>
                <input
                  value={form.name}
                  onChange={(event) => set('name')(event.target.value)}
                  placeholder="Sunflower Oil 1L Pouch"
                  required
                />
              </Field>

              <Field label="SKU / code" required hint="Letters, numbers, hyphens">
                <input
                  value={form.sku}
                  onChange={(event) => set('sku')(event.target.value.toUpperCase())}
                  placeholder="OIL-SUN-1L"
                  required
                  disabled={isEdit}
                />
              </Field>

              <Field label="Category" required>
                <input
                  value={form.category}
                  onChange={(event) => set('category')(event.target.value)}
                  placeholder="Edible Oil"
                  required
                />
              </Field>

              <Field label="Unit price (₹)" required>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.unitPrice}
                  onChange={(event) => set('unitPrice')(event.target.value)}
                  required
                />
              </Field>

              {!isEdit && (
                <Field label="Opening stock" hint="Recorded as an IN movement in the ledger">
                  <input
                    type="number"
                    min={0}
                    value={form.currentStock}
                    onChange={(event) => set('currentStock')(event.target.value)}
                  />
                </Field>
              )}

              <Field label="Minimum stock alert" hint="Flagged as low at or below this level">
                <input
                  type="number"
                  min={0}
                  value={form.minStockAlert}
                  onChange={(event) => set('minStockAlert')(event.target.value)}
                />
              </Field>

              <Field label="Location / warehouse">
                <input
                  value={form.location}
                  onChange={(event) => set('location')(event.target.value)}
                  placeholder="RACK-A1"
                />
              </Field>

              <Field label="Status">
                <select
                  value={form.isActive ? 'true' : 'false'}
                  onChange={(event) => set('isActive')(event.target.value === 'true')}
                >
                  <option value="true">Active — available to sell</option>
                  <option value="false">Inactive — hidden from new challans</option>
                </select>
              </Field>
            </div>

            {isEdit && (
              <div style={{ marginTop: 16 }}>
                <Alert kind="warning">
                  On-hand stock is not editable here. Use <strong>Adjust stock</strong> on the
                  products list so every change is written to the ledger with a reason.
                </Alert>
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/products')}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
};
