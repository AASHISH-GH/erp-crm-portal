import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { toDateInput } from '../lib/format';
import type { Customer } from '../lib/types';
import { Alert, Field, Loading, PageHead } from '../components/ui';

interface FormState {
  name: string;
  mobile: string;
  email: string;
  businessName: string;
  gstNumber: string;
  type: string;
  address: string;
  status: string;
  followUpDate: string;
  notes: string;
}

const EMPTY: FormState = {
  name: '',
  mobile: '',
  email: '',
  businessName: '',
  gstNumber: '',
  type: 'RETAIL',
  address: '',
  status: 'LEAD',
  followUpDate: '',
  notes: '',
};

export const CustomerForm = () => {
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
      .get(`/customers/${id}`)
      .then(({ data }) => {
        const customer = data.data as Customer;
        setForm({
          name: customer.name,
          mobile: customer.mobile,
          email: customer.email ?? '',
          businessName: customer.businessName ?? '',
          gstNumber: customer.gstNumber ?? '',
          type: customer.type,
          address: customer.address ?? '',
          status: customer.status,
          followUpDate: toDateInput(customer.followUpDate),
          notes: customer.notes ?? '',
        });
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      // Blank optional fields are sent as undefined, not "", so the API's optional
      // validators (email, GST) do not reject an empty string.
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value === '' ? undefined : value]),
      );

      if (isEdit) {
        await api.put(`/customers/${id}`, payload);
        navigate(`/customers/${id}`);
      } else {
        const { data } = await api.post('/customers', payload);
        navigate(`/customers/${data.data.id}`);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <>
      <PageHead
        title={isEdit ? 'Edit customer' : 'Add customer'}
        subtitle={isEdit ? 'Update the customer record.' : 'Create a new lead or account.'}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            ← Back
          </button>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header">
            <h3>Customer details</h3>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <Field label="Customer name" required>
                <input
                  value={form.name}
                  onChange={(event) => set('name')(event.target.value)}
                  placeholder="Suresh Patel"
                  required
                />
              </Field>

              <Field label="Mobile number" required hint="10-digit Indian mobile">
                <input
                  value={form.mobile}
                  onChange={(event) => set('mobile')(event.target.value)}
                  placeholder="9822011223"
                  required
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => set('email')(event.target.value)}
                  placeholder="suresh@example.in"
                />
              </Field>

              <Field label="Business name">
                <input
                  value={form.businessName}
                  onChange={(event) => set('businessName')(event.target.value)}
                  placeholder="Patel General Stores"
                />
              </Field>

              <Field label="GST number" hint="Optional · 15 characters">
                <input
                  value={form.gstNumber}
                  onChange={(event) => set('gstNumber')(event.target.value.toUpperCase())}
                  placeholder="27AAPFU0939F1ZV"
                  maxLength={15}
                />
              </Field>

              <Field label="Customer type" required>
                <select value={form.type} onChange={(event) => set('type')(event.target.value)}>
                  <option value="RETAIL">Retail</option>
                  <option value="WHOLESALE">Wholesale</option>
                  <option value="DISTRIBUTOR">Distributor</option>
                </select>
              </Field>

              <Field label="Status" required>
                <select value={form.status} onChange={(event) => set('status')(event.target.value)}>
                  <option value="LEAD">Lead</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </Field>

              <Field label="Next follow-up date">
                <input
                  type="date"
                  value={form.followUpDate}
                  onChange={(event) => set('followUpDate')(event.target.value)}
                />
              </Field>

              <Field label="Address" full>
                <textarea
                  value={form.address}
                  onChange={(event) => set('address')(event.target.value)}
                  placeholder="Shop 4, Market Road, Pune 411002"
                  rows={2}
                />
              </Field>

              <Field label="Notes" full>
                <textarea
                  value={form.notes}
                  onChange={(event) => set('notes')(event.target.value)}
                  placeholder="Payment terms, delivery preferences, anything the team should know."
                  rows={3}
                />
              </Field>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
};
