import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useList } from '../lib/useList';
import { formatDate, relativeDay } from '../lib/format';
import type { Customer } from '../lib/types';
import { Alert, EmptyState, Loading, PageHead, Pagination, StatusBadge } from '../components/ui';
import { useAuth } from '../lib/auth';

export const Customers = () => {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [dueFollowUps, setDueFollowUps] = useState(searchParams.get('dueFollowUps') === 'true');
  const [page, setPage] = useState(1);

  const { items, meta, loading, error } = useList<Customer>('/customers', {
    page,
    limit: 10,
    search,
    status,
    type,
    ...(dueFollowUps ? { dueFollowUps: 'true' } : {}),
  });

  // Any filter change invalidates the current page number.
  const onFilterChange = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHead
        title="Customers"
        subtitle="Leads and accounts across retail, wholesale and distribution."
        actions={
          can('ADMIN', 'SALES') && (
            <Link to="/customers/new" className="btn btn-primary">
              + Add customer
            </Link>
          )
        }
      />

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search name, mobile, business, GST…"
          value={search}
          onChange={(event) => onFilterChange(setSearch)(event.target.value)}
        />
        <select value={status} onChange={(event) => onFilterChange(setStatus)(event.target.value)}>
          <option value="">All statuses</option>
          <option value="LEAD">Lead</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select value={type} onChange={(event) => onFilterChange(setType)(event.target.value)}>
          <option value="">All types</option>
          <option value="RETAIL">Retail</option>
          <option value="WHOLESALE">Wholesale</option>
          <option value="DISTRIBUTOR">Distributor</option>
        </select>
        <button
          type="button"
          className={`btn btn-sm ${dueFollowUps ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onFilterChange(setDueFollowUps)(!dueFollowUps)}
        >
          Follow-ups due
        </button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No customers match these filters"
            hint="Try clearing the search or status filter."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Follow-up</th>
                    <th className="num">Challans</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((customer) => (
                    <tr
                      key={customer.id}
                      className="clickable"
                      onClick={() => navigate(`/customers/${customer.id}`)}
                    >
                      <td>
                        <div className="cell-title">{customer.name}</div>
                        <div className="cell-sub">{customer.businessName ?? '—'}</div>
                      </td>
                      <td>
                        <div>{customer.mobile}</div>
                        <div className="cell-sub">{customer.email ?? '—'}</div>
                      </td>
                      <td>
                        <StatusBadge value={customer.type} />
                      </td>
                      <td>
                        <StatusBadge value={customer.status} />
                      </td>
                      <td>
                        <div>{formatDate(customer.followUpDate)}</div>
                        {customer.followUpDate && (
                          <div
                            className="cell-sub"
                            style={{
                              color:
                                new Date(customer.followUpDate) <= new Date()
                                  ? 'var(--danger)'
                                  : undefined,
                            }}
                          >
                            {relativeDay(customer.followUpDate)}
                          </div>
                        )}
                      </td>
                      <td className="num">{customer._count?.challans ?? 0}</td>
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
