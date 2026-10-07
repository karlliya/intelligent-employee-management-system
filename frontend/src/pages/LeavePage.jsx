import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import { getUser } from '../lib/auth';
import { CalendarDays, Check, Clock3, Plus, X } from 'lucide-react';

const LeavePage = () => {
  const user = getUser();
  const canApprove = user?.role === 'Admin';
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ type: 'Annual', from_date: '', to_date: '', reason: '' });
  const [status, setStatus] = useState('');

  const loadLeaves = async () => {
    try {
      const data = await request('/leaves');
      setRequests(data);
    } catch (error) {
      setStatus(error.message);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  const submitLeave = async (event) => {
    event.preventDefault();
    setStatus('Submitting leave application...');
    try {
      const result = await request('/leaves', { method: 'POST', body: JSON.stringify(form) });
      setStatus(result.conflict_warning ? 'Leave submitted. Department conflict warning detected.' : 'Leave applied successfully.');
      setForm({ type: 'Annual', from_date: '', to_date: '', reason: '' });
      await loadLeaves();
    } catch (error) {
      setStatus(error.message);
    }
  };

  const decideLeave = async (id, decision) => {
    const rejection_reason = decision === 'Rejected' ? window.prompt('Reason for rejection?') || '' : '';
    setStatus(`${decision} leave request...`);
    try {
      const result = await request(`/leaves/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: decision, rejection_reason })
      });
      setStatus(result.conflict_warning ? `${result.message} Conflict warning was present.` : result.message);
      await loadLeaves();
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <section className="space-y-6">
      <div><p className="section-kicker">Time off</p><h1 className="page-title">Leave Management</h1><p className="page-subtitle">Apply for leave and track every request in one place.</p></div>

      <div className="simple-stat-grid">
        <div><Clock3 /><span>Pending</span><strong>{requests.filter((item) => item.status === 'Pending').length}</strong></div>
        <div><Check /><span>Approved</span><strong>{requests.filter((item) => item.status === 'Approved').length}</strong></div>
        <div><X /><span>Rejected</span><strong>{requests.filter((item) => item.status === 'Rejected').length}</strong></div>
      </div>

      {status && <div className="status-banner">{status}</div>}

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="panel-card">
          <div className="panel-heading"><div><h2 className="panel-title">New Leave Request</h2><p className="mt-1 text-sm text-[var(--muted)]">Complete the dates and reason below.</p></div><Plus className="h-5 w-5 text-[var(--primary)]" /></div>
          <form onSubmit={submitLeave} className="space-y-5">
            <div>
              <label className="form-label">Leave Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="form-control">
                <option>Annual</option>
                <option>Sick</option>
                <option>Maternity</option>
                <option>Emergency</option>
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">
                From
                <input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} className="form-control" required />
              </label>
              <label className="form-label">
                To
                <input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} className="form-control" required />
              </label>
            </div>
            <label className="form-label">
              Reason
              <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows="4" className="form-control" required />
            </label>
            <button type="submit" className="w-full rounded-xl btn-neon px-5 py-3 text-sm font-semibold">Submit Request</button>
          </form>
        </div>

        <div className="panel-card">
          <div className="panel-heading"><div><h2 className="panel-title">Leave Requests</h2><p className="mt-1 text-sm text-[var(--muted)]">Latest applications and approval status.</p></div><span className="panel-chip">{requests.length} requests</span></div>
          <div className="max-h-[620px] space-y-3 overflow-auto pr-1">
            {requests.length === 0 ? (
              <div className="empty-state"><CalendarDays className="mx-auto mb-3 h-8 w-8" />No leave requests yet.</div>
            ) : requests.map((leave) => (
              <div key={leave.id} className="request-row">
                <div className="flex items-center justify-between gap-4">
                  <div><span className="font-semibold text-[var(--text)]">{leave.name || leave.emp_id}</span><p className="mt-1 text-xs text-[var(--muted)]">{leave.type} · {leave.days} day(s)</p></div>
                  <span className={`status-pill ${String(leave.status).toLowerCase()}`}>{leave.status}</span>
                </div>
                <div className="mt-3 text-sm text-[var(--muted)]">{String(leave.from_date).slice(0,10)} to {String(leave.to_date).slice(0,10)}</div>
                {leave.conflict_warning ? <div className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-500">Department leave conflict detected</div> : null}
                <div className="mt-2 text-sm text-[var(--text)]">{leave.reason}</div>
                {leave.rejection_reason ? <div className="mt-2 text-xs text-rose-400">Reason: {leave.rejection_reason}</div> : null}
                {canApprove && leave.status === 'Pending' && (
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => decideLeave(leave.id, 'Approved')} className="action-approve"><Check className="h-4 w-4" />Approve</button>
                    <button type="button" onClick={() => decideLeave(leave.id, 'Rejected')} className="action-reject"><X className="h-4 w-4" />Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default LeavePage;
