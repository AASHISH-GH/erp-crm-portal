import { useState, type FormEvent } from 'react';
import { useList } from '../lib/useList';
import { api, getErrorMessage } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Role, User } from '../lib/types';
import {
  Alert,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHead,
  Pagination,
  StatusBadge,
} from '../components/ui';
import { useAuth } from '../lib/auth';

const ROLE_SCOPES: Record<Role, string> = {
  ADMIN: 'Everything, including user management',
  SALES: 'Customers, follow-ups, challans',
  WAREHOUSE: 'Products, stock movements, dispatch',
  ACCOUNTS: 'Read-only across modules + invoices',
};

export const Users = () => {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { items, meta, loading, error, reload } = useList<User>('/users', {
    page,
    limit: 10,
    search,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'SALES' as Role });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.post('/auth/register', form);
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'SALES' });
      reload();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (target: User) => {
    try {
      await api.patch(`/users/${target.id}`, { isActive: !target.isActive });
      reload();
    } catch (err) {
      window.alert(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHead
        title="Users"
        subtitle="Portal accounts and their role-based access."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Add user
          </button>
        }
      />

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search name or email…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState icon="⚙" title="No users found" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((user) => (
                    <tr key={user.id}>
                      <td className="cell-title">
                        {user.name}
                        {user.id === currentUser?.id && (
                          <span className="badge badge-info" style={{ marginLeft: 8 }}>
                            You
                          </span>
                        )}
                      </td>
                      <td className="cell-sub">{user.email}</td>
                      <td>
                        <StatusBadge value={user.role} />
                      </td>
                      <td className="cell-sub">{ROLE_SCOPES[user.role]}</td>
                      <td>
                        <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                          {user.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="cell-sub">{formatDate(user.createdAt)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={user.id === currentUser?.id}
                          onClick={() => toggleActive(user)}
                        >
                          {user.isActive ? 'Disable' : 'Enable'}
                        </button>
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

      {showCreate && (
        <Modal
          title="Add user"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" form="user-form" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create user'}
              </button>
            </>
          }
        >
          <form id="user-form" onSubmit={createUser} style={{ display: 'contents' }}>
            {formError && <Alert kind="error">{formError}</Alert>}

            <Field label="Full name" required>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </Field>

            <Field label="Email" required>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </Field>

            <Field label="Password" required hint="Minimum 8 characters">
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                minLength={8}
                required
              />
            </Field>

            <Field label="Role" required hint={ROLE_SCOPES[form.role]}>
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
              >
                <option value="ADMIN">Admin</option>
                <option value="SALES">Sales</option>
                <option value="WAREHOUSE">Warehouse</option>
                <option value="ACCOUNTS">Accounts</option>
              </select>
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
};
