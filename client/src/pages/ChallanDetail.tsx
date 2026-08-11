import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getErrorMessage, tokenStore } from '../lib/api';
import { currency, formatDateTime } from '../lib/format';
import type { Challan } from '../lib/types';
import { Alert, Field, Loading, Modal, PageHead, StatusBadge } from '../components/ui';
import { useAuth } from '../lib/auth';

export const ChallanDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [challan, setChallan] = useState<Challan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    api
      .get(`/challans/${id}`)
      .then(({ data }) => setChallan(data.data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const confirm = async () => {
    setActionError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.post(`/challans/${id}/confirm`);
      setSuccess('Challan confirmed. Stock has been deducted and logged in the ledger.');
      load();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setActionError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.post(`/challans/${id}/cancel`, { reason: cancelReason });
      setShowCancel(false);
      setCancelReason('');
      setSuccess('Challan cancelled. Any deducted stock has been returned.');
      load();
    } catch (err) {
      setActionError(getErrorMessage(err));
      setShowCancel(false);
    } finally {
      setBusy(false);
    }
  };

  /**
   * The PDF route is authenticated, so a plain <a href> would be rejected — the browser
   * does not attach the bearer token. Fetch it as a blob with the interceptor's header
   * attached, then hand the browser an object URL to download.
   */
  const downloadPdf = async () => {
    setActionError(null);
    try {
      const response = await api.get(`/challans/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${challan?.challanNumber ?? 'challan'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(
        tokenStore.get() ? getErrorMessage(err) : 'Session expired — please sign in again.',
      );
    }
  };

  if (loading) return <Loading />;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!challan) return null;

  const canDispatch = can('ADMIN', 'SALES', 'WAREHOUSE');

  return (
    <>
      <PageHead
        title={challan.challanNumber}
        subtitle={`${challan.customerBusinessName ?? challan.customerName} · ${challan.items.length} line(s)`}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/challans')}>
              ← All challans
            </button>
            <button type="button" className="btn btn-secondary" onClick={downloadPdf}>
              ⤓ Download PDF
            </button>
            {canDispatch && challan.status === 'DRAFT' && (
              <button type="button" className="btn btn-success" onClick={confirm} disabled={busy}>
                {busy ? 'Working…' : 'Confirm & deduct stock'}
              </button>
            )}
            {canDispatch && challan.status !== 'CANCELLED' && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setShowCancel(true)}
                disabled={busy}
              >
                Cancel challan
              </button>
            )}
          </>
        }
      />

      {actionError && <Alert kind="error">{actionError}</Alert>}
      {success && <Alert kind="success">{success}</Alert>}

      {challan.status === 'DRAFT' && (
        <Alert kind="warning">
          This challan is a <strong>draft</strong>. No stock has been deducted yet — confirm it to
          dispatch the goods.
        </Alert>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Challan details</h3>
          <StatusBadge value={challan.status} />
        </div>
        <div className="card-body">
          <div className="detail-grid">
            <div className="detail-item">
              <div className="label">Customer</div>
              <div className="value">{challan.customerName}</div>
            </div>
            <div className="detail-item">
              <div className="label">Business</div>
              <div className="value">{challan.customerBusinessName ?? '—'}</div>
            </div>
            <div className="detail-item">
              <div className="label">Mobile</div>
              <div className="value">{challan.customerMobile ?? '—'}</div>
            </div>
            <div className="detail-item">
              <div className="label">GST number</div>
              <div className="value mono">{challan.customerGstNumber ?? '—'}</div>
            </div>
            <div className="detail-item">
              <div className="label">Created</div>
              <div className="value">{formatDateTime(challan.createdAt)}</div>
            </div>
            <div className="detail-item">
              <div className="label">Created by</div>
              <div className="value">{challan.createdBy?.name ?? '—'}</div>
            </div>
            {challan.confirmedAt && (
              <div className="detail-item">
                <div className="label">Confirmed</div>
                <div className="value">{formatDateTime(challan.confirmedAt)}</div>
              </div>
            )}
            {challan.cancelledAt && (
              <div className="detail-item">
                <div className="label">Cancelled</div>
                <div className="value">{formatDateTime(challan.cancelledAt)}</div>
              </div>
            )}
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <div className="label">Delivery address</div>
              <div className="value">{challan.customerAddress ?? '—'}</div>
            </div>
            {challan.notes && (
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                <div className="label">Notes</div>
                <div className="value" style={{ whiteSpace: 'pre-wrap' }}>
                  {challan.notes}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Line items</h3>
          <span className="cell-sub">Prices captured at the time the challan was raised</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Line total</th>
              </tr>
            </thead>
            <tbody>
              {challan.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="cell-sub">{index + 1}</td>
                  <td className="cell-title">{item.productName}</td>
                  <td className="mono">{item.productSku}</td>
                  <td className="cell-sub">{item.productCategory ?? '—'}</td>
                  <td className="num">{item.quantity}</td>
                  <td className="num">{currency(item.unitPrice)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {currency(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="totals-bar">
          <div className="item">
            <div className="label">Total quantity</div>
            <div className="value">{challan.totalQuantity}</div>
          </div>
          <div className="item">
            <div className="label">Total amount</div>
            <div className="value">{currency(challan.totalAmount)}</div>
          </div>
        </div>
      </div>

      {showCancel && (
        <Modal
          title="Cancel challan"
          onClose={() => setShowCancel(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCancel(false)}>
                Keep challan
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={cancel}
                disabled={busy || cancelReason.trim().length < 2}
              >
                {busy ? 'Cancelling…' : 'Cancel challan'}
              </button>
            </>
          }
        >
          {challan.status === 'CONFIRMED' && (
            <Alert kind="warning">
              This challan is confirmed. Cancelling will return{' '}
              <strong>{challan.totalQuantity} units</strong> to stock and record IN movements in
              the ledger.
            </Alert>
          )}

          <Field label="Reason for cancellation" required>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={3}
              placeholder="Customer cancelled the order before dispatch."
            />
          </Field>
        </Modal>
      )}
    </>
  );
};
