import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { currency, formatDate, formatDateTime, relativeDay } from '../lib/format';
import type { Customer } from '../lib/types';
import { Alert, EmptyState, Field, Loading, Modal, PageHead, StatusBadge } from '../components/ui';
import { useAuth } from '../lib/auth';

export const CustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showFollowUp, setShowFollowUp] = useState(false);
  const [note, setNote] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api
      .get(`/customers/${id}`)
      .then(({ data }) => setCustomer(data.data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const submitFollowUp = async (event: FormEvent) => {
    event.preventDefault();
    setNoteError(null);
    setSavingNote(true);
    try {
      await api.post(`/customers/${id}/follow-ups`, {
        note,
        nextFollowUp: nextFollowUp || undefined,
        status: newStatus || undefined,
      });
      setShowFollowUp(false);
      setNote('');
      setNextFollowUp('');
      setNewStatus('');
      load();
    } catch (err) {
      setNoteError(getErrorMessage(err));
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!customer) return null;

  const canWrite = can('ADMIN', 'SALES');

  return (
    <>
      <PageHead
        title={customer.name}
        subtitle={customer.businessName ?? 'No business name on file'}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/customers')}>
              ← All customers
            </button>
            {canWrite && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(`/customers/${customer.id}/edit`)}
                >
                  Edit
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setShowFollowUp(true)}>
                  + Add follow-up
                </button>
              </>
            )}
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Profile</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <StatusBadge value={customer.type} />
            <StatusBadge value={customer.status} />
          </div>
        </div>
        <div className="card-body">
          <div className="detail-grid">
            <div className="detail-item">
              <div className="label">Mobile</div>
              <div className="value">{customer.mobile}</div>
            </div>
            <div className="detail-item">
              <div className="label">Email</div>
              <div className="value">{customer.email ?? '—'}</div>
            </div>
            <div className="detail-item">
              <div className="label">GST number</div>
              <div className="value mono">{customer.gstNumber ?? '—'}</div>
            </div>
            <div className="detail-item">
              <div className="label">Next follow-up</div>
              <div className="value">
                {formatDate(customer.followUpDate)}
                {customer.followUpDate && (
                  <span
                    className="cell-sub"
                    style={{
                      marginLeft: 8,
                      color:
                        new Date(customer.followUpDate) <= new Date() ? 'var(--danger)' : undefined,
                    }}
                  >
                    {relativeDay(customer.followUpDate)}
                  </span>
                )}
              </div>
            </div>
            <div className="detail-item">
              <div className="label">Added by</div>
              <div className="value">{customer.createdBy?.name ?? '—'}</div>
            </div>
            <div className="detail-item">
              <div className="label">Created</div>
              <div className="value">{formatDate(customer.createdAt)}</div>
            </div>
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <div className="label">Address</div>
              <div className="value">{customer.address ?? '—'}</div>
            </div>
            {customer.notes && (
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                <div className="label">Notes</div>
                <div className="value" style={{ whiteSpace: 'pre-wrap' }}>
                  {customer.notes}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h3>Follow-up history</h3>
            <span className="cell-sub">{customer.followUps?.length ?? 0} entries</span>
          </div>
          <div className="card-body">
            {!customer.followUps || customer.followUps.length === 0 ? (
              <EmptyState
                icon="📞"
                title="No follow-ups logged yet"
                hint="Record every call or visit so the next person has context."
              />
            ) : (
              <div className="timeline">
                {customer.followUps.map((followUp) => (
                  <div className="timeline-item" key={followUp.id}>
                    <div className="timeline-dot" />
                    <div className="timeline-body">
                      <div className="note">{followUp.note}</div>
                      <div className="meta">
                        {followUp.createdBy?.name ?? 'Unknown'} ·{' '}
                        {formatDateTime(followUp.createdAt)}
                        {followUp.nextFollowUp &&
                          ` · next: ${formatDate(followUp.nextFollowUp)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Recent challans</h3>
            <Link to={`/challans?customerId=${customer.id}`} className="btn btn-ghost btn-sm">
              View all →
            </Link>
          </div>
          {!customer.challans || customer.challans.length === 0 ? (
            <EmptyState icon="🧾" title="No challans for this customer yet" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th className="num">Qty</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.challans.map((challan) => (
                    <tr
                      key={challan.id}
                      className="clickable"
                      onClick={() => navigate(`/challans/${challan.id}`)}
                    >
                      <td className="mono" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                        {challan.challanNumber}
                      </td>
                      <td className="cell-sub">{formatDate(challan.createdAt)}</td>
                      <td>
                        <StatusBadge value={challan.status} />
                      </td>
                      <td className="num">{challan.totalQuantity}</td>
                      <td className="num">{currency(challan.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showFollowUp && (
        <Modal
          title="Add follow-up"
          onClose={() => setShowFollowUp(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowFollowUp(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="follow-up-form"
                className="btn btn-primary"
                disabled={savingNote}
              >
                {savingNote ? 'Saving…' : 'Save follow-up'}
              </button>
            </>
          }
        >
          <form id="follow-up-form" onSubmit={submitFollowUp} style={{ display: 'contents' }}>
            {noteError && <Alert kind="error">{noteError}</Alert>}

            <Field label="What happened?" required>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Called about the monthly order. Wants 20 cases of oil next week."
                rows={4}
                required
              />
            </Field>

            <Field label="Next follow-up date" hint="Updates the customer's follow-up reminder">
              <input
                type="date"
                value={nextFollowUp}
                onChange={(event) => setNextFollowUp(event.target.value)}
              />
            </Field>

            <Field label="Move status to" hint="Leave blank to keep the current status">
              <select value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>
                <option value="">No change ({customer.status})</option>
                <option value="LEAD">Lead</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
};
