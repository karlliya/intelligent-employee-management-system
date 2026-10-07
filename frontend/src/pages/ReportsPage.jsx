import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import { AlertTriangle, CalendarRange, ClipboardList } from 'lucide-react';

const ReportsPage = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [summary, setSummary] = useState({ auditEventCount: 0, poorAttendanceEmployees: 0, performanceMonths: 0 });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const data = await request(`/reports/summary?month=${encodeURIComponent(month)}`);
      setAuditLogs(data.recentAuditLogs || []);
      setAttendance(data.monthlyAttendance || []);
      setSummary(data);
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load();
  }, [month]);

  return (
    <section className="space-y-6">
      <div className="section-header">
          <div>
            <p className="section-kicker">Reports</p>
            <h1 className="page-title">Monthly Summary</h1>
            <p className="page-subtitle">Attendance, performance coverage and recent system activity.</p>
          </div>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="form-control max-w-[190px]" />
      </div>

      {message && <div className="status-banner error">{message}</div>}

      <div className="simple-stat-grid">
        <div><ClipboardList /><span>Audit Events</span><strong>{summary.auditEventCount}</strong></div>
        <div><AlertTriangle /><span>Poor Attendance</span><strong>{summary.poorAttendanceEmployees}</strong></div>
        <div><CalendarRange /><span>Performance Months</span><strong>{summary.performanceMonths}</strong></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="panel-card">
          <div className="panel-heading"><div><h2 className="panel-title">Attendance</h2><p className="mt-1 text-sm text-[var(--muted)]">Employee attendance for the selected month.</p></div></div>
          <div className="mt-5 max-h-[520px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Present</th>
                  <th className="px-4 py-3">Late</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {attendance.length === 0 ? (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400">No attendance data for this month.</td></tr>
                ) : attendance.map((row) => (
                  <tr key={row.emp_id}>
                    <td className="px-4 py-3 text-white">{row.name}</td>
                    <td className="px-4 py-3 text-slate-300">{row.present_days || 0}</td>
                    <td className="px-4 py-3 text-slate-300">{row.late_days || 0}</td>
                    <td className="px-4 py-3 text-slate-300">{row.attendance_label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-heading"><div><h2 className="panel-title">Recent Activity</h2><p className="mt-1 text-sm text-[var(--muted)]">Latest security and management actions.</p></div></div>
          <div className="mt-5 max-h-[520px] space-y-3 overflow-auto">
            {auditLogs.length === 0 ? (
              <div className="empty-state">No audit logs available.</div>
            ) : auditLogs.map((log) => (
              <div key={log.id} className="request-row">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-white">{log.user_email || log.user}</span>
                  <span className={log.result === 'Success' ? 'text-emerald-200' : 'text-rose-200'}>{log.result}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{log.action}</p>
                <p className="mt-2 text-xs text-slate-500">{log.timestamp} - {log.ip_address}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ReportsPage;
