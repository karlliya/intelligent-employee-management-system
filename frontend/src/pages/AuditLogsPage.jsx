import { useEffect, useState } from 'react';
import { ClipboardList, ShieldCheck } from 'lucide-react';
import { request } from '../lib/api';

const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadLogs = async () => {
      try {
        setLogs(await request('/audit-logs'));
        setMessage('');
      } catch (error) {
        setMessage(error.message);
      }
    };
    loadLogs();
  }, []);

  return (
    <section className="space-y-6">
      <div className="section-header">
        <div>
          <p className="section-kicker">Admin Security Center</p>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Monitor sensitive login, employee, leave, salary, upload, and system configuration activity.</p>
        </div>
        <div className="hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] px-5 py-4 text-sm text-[var(--muted)] shadow-sm lg:block">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            <span>Admin only</span>
          </div>
        </div>
      </div>

      {message && <div className="status-banner error">{message}</div>}

      <div className="panel-card">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Latest Events</p>
            <h2 className="panel-title">System Audit Trail</h2>
          </div>
          <span className="panel-chip">{logs.length} records</span>
        </div>

        {logs.length === 0 ? (
          <div className="empty-state">
            <ClipboardList className="mx-auto mb-3 h-8 w-8 text-[var(--muted)]" />
            No audit logs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Result</th>
                  <th>IP Address</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-4">{log.user_email || log.user || 'unknown'}</td>
                    <td className="px-5 py-4 text-[var(--muted)]">{log.action}</td>
                    <td className="px-5 py-4"><span className="panel-chip">{log.result}</span></td>
                    <td className="px-5 py-4 text-[var(--muted)]">{log.ip_address || '-'}</td>
                    <td className="px-5 py-4 text-[var(--muted)]">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default AuditLogsPage;
