import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles?: Role[]; // omitted = visible to every signed-in role
}

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: '▦' }],
  },
  {
    section: 'CRM',
    items: [{ to: '/customers', label: 'Customers', icon: '👥' }],
  },
  {
    section: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: '📦' },
      { to: '/stock', label: 'Stock Ledger', icon: '🔁' },
    ],
  },
  {
    section: 'Sales',
    items: [{ to: '/challans', label: 'Sales Challans', icon: '🧾' }],
  },
  {
    section: 'Administration',
    items: [{ to: '/users', label: 'Users', icon: '⚙' }],
  },
];

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Dashboard'],
  [/^\/customers\/new/, 'New Customer'],
  [/^\/customers\/[^/]+\/edit/, 'Edit Customer'],
  [/^\/customers\/[^/]+/, 'Customer Detail'],
  [/^\/customers/, 'Customers'],
  [/^\/products\/new/, 'New Product'],
  [/^\/products\/[^/]+\/edit/, 'Edit Product'],
  [/^\/products/, 'Products'],
  [/^\/stock/, 'Stock Ledger'],
  [/^\/challans\/new/, 'New Sales Challan'],
  [/^\/challans\/[^/]+/, 'Challan Detail'],
  [/^\/challans/, 'Sales Challans'],
  [/^\/users/, 'User Management'],
];

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const title = TITLES.find(([pattern]) => pattern.test(location.pathname))?.[1] ?? 'Portal';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Admin-only sections are hidden rather than shown-and-blocked, so the sidebar
  // reflects what each role can actually do. The API enforces the same rules.
  const visibleSections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || (user && item.roles.includes(user.role))),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="logo">ER</div>
          <strong>ERP · CRM Portal</strong>
        </div>

        <nav className="sidebar-nav">
          {visibleSections.map((section) => (
            <div key={section.section}>
              <div className="nav-section">{section.section}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          Signed in as <strong style={{ color: '#e2e8f0' }}>{user?.role}</strong>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} role="presentation" />
      )}

      <div className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <button
              type="button"
              className="hamburger"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <h1>{title}</h1>
          </div>

          <div className="topbar-user">
            <div className="avatar">{initials(user?.name ?? '?')}</div>
            <div className="user-meta">
              <div className="name">{user?.name}</div>
              <div className="role">{user?.email}</div>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
