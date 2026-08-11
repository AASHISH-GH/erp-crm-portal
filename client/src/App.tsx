import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Customers } from './pages/Customers';
import { CustomerForm } from './pages/CustomerForm';
import { CustomerDetail } from './pages/CustomerDetail';
import { Products } from './pages/Products';
import { ProductForm } from './pages/ProductForm';
import { StockLedger } from './pages/StockLedger';
import { Challans } from './pages/Challans';
import { ChallanForm } from './pages/ChallanForm';
import { ChallanDetail } from './pages/ChallanDetail';
import { Users } from './pages/Users';
import type { Role } from './lib/types';
import type { ReactElement } from 'react';

const RequireAuth = ({ children, roles }: { children: ReactElement; roles?: Role[] }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Route guards mirror the API's role checks. The server is still the enforcement
  // point — this only keeps users out of screens they cannot use.
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />

    <Route
      element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }
    >
      <Route path="/" element={<Dashboard />} />

      <Route path="/customers" element={<Customers />} />
      <Route
        path="/customers/new"
        element={
          <RequireAuth roles={['ADMIN', 'SALES']}>
            <CustomerForm />
          </RequireAuth>
        }
      />
      <Route path="/customers/:id" element={<CustomerDetail />} />
      <Route
        path="/customers/:id/edit"
        element={
          <RequireAuth roles={['ADMIN', 'SALES']}>
            <CustomerForm />
          </RequireAuth>
        }
      />

      <Route path="/products" element={<Products />} />
      <Route
        path="/products/new"
        element={
          <RequireAuth roles={['ADMIN', 'WAREHOUSE']}>
            <ProductForm />
          </RequireAuth>
        }
      />
      <Route
        path="/products/:id/edit"
        element={
          <RequireAuth roles={['ADMIN', 'WAREHOUSE']}>
            <ProductForm />
          </RequireAuth>
        }
      />

      <Route path="/stock" element={<StockLedger />} />

      <Route path="/challans" element={<Challans />} />
      <Route
        path="/challans/new"
        element={
          <RequireAuth roles={['ADMIN', 'SALES']}>
            <ChallanForm />
          </RequireAuth>
        }
      />
      <Route path="/challans/:id" element={<ChallanDetail />} />

      <Route
        path="/users"
        element={
          <RequireAuth roles={['ADMIN']}>
            <Users />
          </RequireAuth>
        }
      />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export const App = () => (
  <AuthProvider>
    <AppRoutes />
  </AuthProvider>
);
