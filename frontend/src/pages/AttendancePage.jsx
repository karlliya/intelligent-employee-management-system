import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, Clock3, QrCode, ScanLine, ShieldCheck } from 'lucide-react';
import { request } from '../lib/api';
import { getUser } from '../lib/auth';
import AttendanceQrScanner from '../components/AttendanceQrScanner';

const malaysiaToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const displayTime = (value) => {
  if (!value) return 'Not recorded';
  const [hours, minutes] = String(value).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(value);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
};

const AttendancePage = () => {
  const user = getUser();
  const canGenerateQr = user?.role === 'Admin';
  const [records, setRecords] = useState([]);
  const [report, setReport] = useState([]);
  const [today, setToday] = useState(malaysiaToday);
  const [month, setMonth] = useState(() => malaysiaToday().slice(0, 7));
  const [status, setStatus] = useState('');
  const [attendanceError, setAttendanceError] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrSession, setQrSession] = useState(null);
  const [activeSessions, setActiveSessions] = useState([]);
  const [alertPermission, setAlertPermission] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  useEffect(() => {
    if (!qrSession) return undefined;
    const timeout = window.setTimeout(() => {
      setQrSession(null);
      setStatus('Shared QR expired. Generate a new one.');
    }, Math.max(0, qrSession.expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [qrSession]);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    const [history, monthly] = await Promise.allSettled([
      request('/attendance'), request(`/attendance/report?month=${encodeURIComponent(month)}`)
    ]);
    if (history.status === 'fulfilled') {
      setRecords(history.value);
      setAttendanceError('');
    } else {
      setRecords([]);
      setAttendanceError('Attendance status could not be loaded. Refresh the page to try again.');
    }
    setReport(monthly.status === 'fulfilled' ? monthly.value : []);
    setLoading(false);
  }, [month]);

  const loadActive = useCallback(async () => {
    try {
      setActiveSessions(await request('/attendance/qr-active'));
    } catch (error) {
      setStatus(error.message);
    }
  }, []);

  const submitQr = useCallback(async (rawValue) => {
    setScanResult(null);
    const token = String(rawValue || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(token || '')) {
      setStatus('This is not an IEMS attendance QR. Ask Admin to show a new code.');
      return;
    }
    setBusy(true);
    setStatus('Validating secure attendance QR...');
    try {
      const result = await request('/attendance/qr-submit', { method: 'POST', body: JSON.stringify({ token }) });
      setScanResult(result);
      setStatus(result.message);
      await loadAttendance();
      await loadActive();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }, [loadAttendance, loadActive]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(malaysiaToday()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (canGenerateQr) return undefined;
    loadActive();
    const timer = window.setInterval(loadActive, 10000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadActive();
        loadAttendance();
        setToday(malaysiaToday());
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [canGenerateQr, loadActive, loadAttendance]);

  const todayRecord = !canGenerateQr ? records.find((item) => String(item.date).slice(0, 10) === today) : null;
  const checkedIn = Boolean(todayRecord?.check_in);
  const checkedOut = Boolean(todayRecord?.check_out);
  const markedAbsent = todayRecord?.status === 'Absent';
  const isLate = todayRecord?.status === 'Late';
  const overtime = Number(todayRecord?.overtime_hours || 0);
  const pendingCheckIn = !canGenerateQr && !loading && !attendanceError && !todayRecord;
  const attendanceRows = pendingCheckIn ? [
    { id: 'today-pending', name: user?.name || 'You', date: today, status: 'Pending check-in', pending: true },
    ...records.filter((item) => String(item.date).slice(0, 10) !== today)
  ] : records;

  const generateQr = async (action) => {
    setBusy(true);
    setStatus(`Generating shared ${action} QR...`);
    try {
      const result = await request('/attendance/qr-session', { method: 'POST', body: JSON.stringify({ action, minutes: 10 }) });
      setQrSession({ ...result, expiresAt: Date.now() + result.expiresIn * 1000 });
      setStatus(result.reused
        ? `The shared ${action} QR is already active. Display this code for employees to scan.`
        : `Shared ${action} QR is ready for ${result.recipientCount} eligible employees.`);
    } catch (error) {
      await loadAttendance();
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  const enableAlerts = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setAlertPermission(permission);
    setStatus(permission === 'granted' ? 'Browser attendance alerts enabled on this device.' : 'Browser alerts are off. QR availability will still appear here.');
  };

  return (
    <section className="space-y-6">
      <div className="section-header">
        <div><p className="section-kicker">Secure attendance</p><h1 className="page-title">QR Attendance</h1><p className="page-subtitle">Time-limited QR verification keeps every scan linked to an authenticated employee.</p></div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-2xl border px-4 py-3" />
      </div>

      <div className="attendance-policy">
        <div><span>Start work</span><strong>9:00 AM</strong></div>
        <div><span>Late after</span><strong>9:30 AM</strong></div>
        <div><span>End work</span><strong>6:00 PM</strong></div>
        <div><span>After 6:00 PM</span><strong>Overtime</strong></div>
      </div>

      {!canGenerateQr && <div className={`attendance-today ${attendanceError || markedAbsent ? 'is-error' : checkedIn ? 'is-present' : pendingCheckIn ? 'is-pending' : ''}`} aria-live="polite">
        <div className="attendance-today-mark">{attendanceError || markedAbsent ? <AlertCircle aria-hidden="true" /> : checkedIn ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}</div>
        <div className="attendance-today-copy">
          <p className="section-kicker">My attendance today</p>
          <h2>{attendanceError ? 'Attendance unavailable' : loading ? 'Checking attendance...' : checkedOut ? 'Attendance completed' : checkedIn ? 'Present today' : markedAbsent ? 'Absent today' : 'Not checked in yet'}</h2>
          <p>{attendanceError || (loading ? 'Loading your attendance record.' : checkedIn ? checkedOut ? 'Your check-in and check-out are recorded.' : "Your check-in is recorded. Scan Admin's check-out QR at the end of work." : markedAbsent ? 'No check-in was recorded for this date.' : 'Scan the check-in QR displayed by Admin to record your arrival.')}</p>
          {pendingCheckIn && <span className="attendance-pending"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> Pending check-in</span>}
          {!attendanceError && isLate && <span className="attendance-late">Late{todayRecord.late_minutes ? ` by ${todayRecord.late_minutes} min` : ''}</span>}
          {!attendanceError && overtime > 0 && <span className="attendance-ot">{overtime}h overtime</span>}
        </div>
        <div className="attendance-today-times">
          <div><span>Check-in</span><strong>{loading || attendanceError ? '-' : displayTime(todayRecord?.check_in)}</strong></div>
          <div><span>Check-out</span><strong>{loading || attendanceError ? '-' : displayTime(todayRecord?.check_out)}</strong></div>
        </div>
      </div>}

      <div className="grid gap-5 lg:grid-cols-2">
        {canGenerateQr ? (
          <div className="glass-card rounded-3xl p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="section-kicker">Admin control</p><h2 className="mt-2 text-xl font-semibold">Shared attendance QR</h2><p className="mt-2 text-sm text-[var(--muted)]">One QR can be scanned by every eligible employee. Each employee scans using their own account.</p></div><div className="icon-tile"><QrCode className="h-5 w-5" /></div></div>
            <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => generateQr('check-in')} className="btn-neon rounded-xl px-5 py-3 text-sm font-semibold">Generate Check-In QR</button><button type="button" disabled={busy} onClick={() => generateQr('check-out')} className="btn-secondary rounded-xl px-5 py-3 text-sm font-semibold">Generate Check-Out QR</button></div>
            {qrSession && <div className="mt-6 flex flex-wrap items-center gap-5"><div className="w-[min(100%,260px)] rounded-lg border border-[var(--primary)] bg-[#fff8e8] p-3"><img src={qrSession.qrDataUrl} alt={`Shared ${qrSession.action} attendance QR`} className="w-full" /></div><div className="space-y-2"><span className="status-pill pending">{qrSession.action === 'check-in' ? 'Check-in' : 'Check-out'}</span><p className="text-sm text-[var(--text)]">For all eligible employees</p><p className="text-xs text-[var(--muted)]">Expires {new Date(qrSession.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div></div>}
          </div>
        ) : (
          <div className="glass-card rounded-3xl p-6">
            <div className="flex items-start gap-4"><div className="icon-tile"><QrCode className="h-5 w-5" /></div><div><p className="section-kicker">Employee access</p><h2 className="mt-2 text-xl font-semibold">Admin QR availability</h2><p className="mt-2 text-sm text-[var(--muted)]">Open the scanner and point your camera at Admin's QR.</p></div></div>
            {alertPermission === 'default' && <button type="button" onClick={enableAlerts} className="btn-secondary mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"><BellRing className="h-4 w-4" /> Enable phone alerts</button>}
            <div className="mt-5 space-y-3">{activeSessions.length === 0 ? <div className="empty-state">No active QR from Admin right now.</div> : activeSessions.map((session) => (
              <div key={session.id} className="request-row">
                <div className="flex flex-wrap items-center justify-between gap-3"><span className="status-pill pending">{session.action === 'check-in' ? 'Check-in QR ready' : 'Check-out QR ready'}</span><span className="text-xs text-[var(--muted)]">Until {new Date(session.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
              </div>
            ))}</div>
          </div>
        )}

        <div className="glass-card rounded-3xl p-6">
          <div className="flex items-start gap-4"><div className="icon-tile">{canGenerateQr ? <ShieldCheck className="h-5 w-5" /> : <ScanLine className="h-5 w-5" />}</div><div className="flex-1"><p className="section-kicker">Secure attendance</p><h2 className="mt-2 text-xl font-semibold">{canGenerateQr ? 'QR status' : 'Scan Admin QR'}</h2></div></div>
          <div role="status" className={`attendance-scan-status mt-5 ${scanResult ? 'is-success' : ''}`}>
            {scanResult && <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />}
            <span>{status || (canGenerateQr ? 'Generate a shared QR to begin.' : 'Open your camera and scan the QR displayed by Admin.')}</span>
          </div>
          {!canGenerateQr && <AttendanceQrScanner onScan={submitQr} disabled={busy} />}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-card overflow-hidden rounded-3xl">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-5 text-lg font-semibold"><Clock3 className="h-5 w-5 text-[var(--primary)]" /> Attendance History</div>
          <div className="max-h-[520px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr><th>Employee</th><th>Date</th><th>Check In</th><th>Check Out</th><th>Work</th><th>OT</th><th>Status</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="7" className="px-6 py-10 text-center">Loading attendance records...</td></tr>
                  : attendanceError ? <tr><td colSpan="7" className="px-6 py-10 text-center">Attendance records could not be loaded.</td></tr>
                    : attendanceRows.length === 0 ? <tr><td colSpan="7" className="px-6 py-10 text-center">No attendance records available.</td></tr>
                      : attendanceRows.map((item) => (
                        <tr key={item.id} className={item.pending ? 'attendance-pending-row' : undefined}>
                          <td>{item.employee_name || item.name}</td>
                          <td>{String(item.date).slice(0, 10)}</td>
                          <td>{item.check_in || '-'}</td>
                          <td>{item.check_out || '-'}</td>
                          <td>{item.pending ? '-' : `${item.working_hours || 0}h`}</td>
                          <td>{Number(item.overtime_hours || 0) > 0 ? <span className="attendance-ot">{item.overtime_hours}h OT</span> : '-'}</td>
                          <td><span className={item.pending ? 'attendance-pending' : item.status === 'Late' ? 'attendance-late' : item.status === 'Present' && item.check_in ? 'attendance-present' : 'attendance-absent'}>
                            {item.pending ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> : item.check_in && ['Present', 'Late'].includes(item.status) && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                            {item.status}{item.status === 'Late' && item.late_minutes ? ` (${item.late_minutes}m)` : ''}
                          </span></td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="glass-card rounded-3xl p-6"><h2 className="text-xl font-semibold">Monthly Report</h2><div className="mt-5 max-h-[520px] space-y-3 overflow-auto">{report.length === 0 ? <p className="py-10 text-center text-sm text-[var(--muted)]">No monthly data available.</p> : report.map((row) => <div key={row.emp_id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="flex items-center justify-between gap-3"><span className="font-semibold">{row.name}</span><span className={row.attendance_label === 'Poor Attendance' ? 'text-amber-500' : 'text-emerald-500'}>{row.attendance_label}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-[var(--muted)]"><div>Present<br /><strong>{row.present_days || 0}</strong></div><div>Late<br /><strong>{row.late_days || 0}</strong></div><div>Absent<br /><strong>{row.absent_days || 0}</strong></div></div></div>)}</div></div>
      </div>
    </section>
  );
};

export default AttendancePage;
