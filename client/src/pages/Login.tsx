import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getErrorMessage } from '../lib/api';
import { Alert } from '../components/ui';

// Surfaced in the UI so a reviewer can try every role without reading the README.
const DEMO_USERS = [
  { role: 'Admin', email: 'admin@erpcrm.test', scope: 'Full access' },
  { role: 'Sales', email: 'sales@erpcrm.test', scope: 'CRM + challans' },
  { role: 'Warehouse', email: 'warehouse@erpcrm.test', scope: 'Stock + dispatch' },
  { role: 'Accounts', email: 'accounts@erpcrm.test', scope: 'Read + invoices' },
];

const DEMO_PASSWORD = 'Password@123';

export const Login = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('admin@erpcrm.test');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-aside">
        <div className="brand">
          <div className="logo" style={{ width: 34, height: 34, borderRadius: 9, background: '#2563eb', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
            ER
          </div>
          <strong style={{ fontSize: 15 }}>ERP · CRM Operations Portal</strong>
        </div>

        <h2>Run sales, stock and dispatch from one screen.</h2>
        <p>
          A compact ERP for wholesale distribution — customer pipeline, live inventory, and
          delivery challans that keep stock honest.
        </p>

        <div className="login-features">
          <div>✓ Role-based access for sales, warehouse and accounts</div>
          <div>✓ Stock that can never go negative, enforced in the database</div>
          <div>✓ Full audit ledger for every unit that moves</div>
          <div>✓ Challans that snapshot prices, so history never rewrites itself</div>
        </div>
      </aside>

      <div className="login-main">
        <div className="login-card">
          <h1>Sign in</h1>
          <p>Use a demo account below or enter your credentials.</p>

          {error && <Alert kind="error">{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="demo-creds">
            <div className="title">Demo accounts · password {DEMO_PASSWORD}</div>
            <div className="demo-list">
              {DEMO_USERS.map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  className="demo-btn"
                  onClick={() => {
                    setEmail(demo.email);
                    setPassword(DEMO_PASSWORD);
                  }}
                >
                  <strong>{demo.role}</strong>
                  <span>{demo.scope}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
