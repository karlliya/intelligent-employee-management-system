import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, Moon, SunMedium, Menu, LogOut, Sparkles, QrCode } from 'lucide-react';
import { request } from '../lib/api';

const Topbar = ({ theme, setTheme, user, onMenuClick, onLogout }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState({ auditLogs: [], pendingLeaves: 0, poorAttendance: [], performanceAlerts: [], adviceNotifications: [], qrAccess: [] });
  const wrapperRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    let active = true;
    const loadNotifications = async () => {
      try {
        const data = await request('/notifications');
        if (!active) return;
        setNotifications(data);
        if (user?.role === 'Employee' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const key = `iems_qr_notified_${user.id}`;
          let seen = [];
          try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch { seen = []; }
          if (!Array.isArray(seen)) seen = [];
          for (const session of data.qrAccess || []) {
            if (seen.includes(session.id)) continue;
            try {
              const alert = new Notification('HAMARISA attendance access', {
                body: `Admin ${session.action === 'check-in' ? 'check-in' : 'check-out'} QR is ready. Open the scanner to scan it.`,
                tag: `iems-attendance-${session.id}`
              });
              alert.onclick = () => { window.focus(); navigate('/attendance'); alert.close(); };
            } catch { /* The in-app bell remains available. */ }
            seen.push(session.id);
          }
          localStorage.setItem(key, JSON.stringify(seen.slice(-30)));
        }
      } catch {
        if (active) setNotifications({ auditLogs: [], pendingLeaves: 0, poorAttendance: [], performanceAlerts: [], adviceNotifications: [], qrAccess: [] });
      }
    };
    loadNotifications();
    const timer = window.setInterval(loadNotifications, user?.role === 'Employee' ? 10000 : 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') loadNotifications(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [user?.id, user?.role, navigate]);

  useEffect(() => {
    if (!notificationsOpen || !notifications.adviceNotifications?.some((item) => !item.is_read)) return;
    request('/notifications/advice/read', { method: 'PUT', body: JSON.stringify({}) })
      .then(() => setNotifications((current) => ({ ...current, adviceNotifications: current.adviceNotifications.map((item) => ({ ...item, is_read: 1 })) })))
      .catch(() => {});
  }, [notificationsOpen, notifications.adviceNotifications]);

  const goToAI = () => {
    if (user?.role === 'Admin') navigate('/ai');
    else navigate('/performance');
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const value = search.trim().toLowerCase();
    if (!value) return;

    if (value.includes('leave')) navigate('/leaves');
    else if (value.includes('feedback') || value.includes('sentiment')) navigate(user?.role === 'Admin' ? '/ai' : '/feedback');
    else if (value.includes('attendance')) navigate('/attendance');
    else if (value.includes('performance') || value.includes('kpi')) navigate('/performance');
    else if (value.includes('ai')) goToAI();
    else if (value.includes('report') && user?.role === 'Admin') navigate('/reports');
    else if (value.includes('setting') && user?.role === 'Admin') navigate('/settings');
    else navigate('/employees');

    setSearch('');
  };

  return (
    <div ref={wrapperRef} className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--input)] text-[var(--text)] md:hidden" aria-label="Open sidebar">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden text-[var(--text)] sm:block">
            <p className="text-sm font-extrabold">HAMARISA IEMS</p>
            <p className="text-xs text-[var(--muted)]">{user?.role || 'Employee'} workspace</p>
          </div>
        </div>
        <form onSubmit={submitSearch} className="hidden min-w-0 max-w-md flex-1 items-center rounded-full border border-[var(--border)] bg-[var(--input)] px-4 py-2.5 text-[var(--muted)] shadow-sm md:flex">
          <Search className="h-4 w-4" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} type="text" placeholder="Search pages..." className="ml-3 w-full border-none bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]" />
        </form>
      </div>

      <div className="relative flex items-center gap-3">
        <button type="button" onClick={goToAI} className="hidden h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-4 text-sm font-bold text-white shadow-sm transition hover:opacity-90 lg:inline-flex" aria-label="Open AI assistant">
          <Sparkles className="h-4 w-4" /> AI
        </button>

        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--input)] text-[var(--text)] transition hover:bg-[var(--surface-strong)]" aria-label="Toggle theme">
          {theme === 'dark' ? <SunMedium className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <button onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false); }} className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--input)] text-[var(--text)] transition hover:bg-[var(--surface-strong)]" aria-label="Open notifications">
          <Bell className="h-5 w-5" />
          {(notifications.qrAccess?.length > 0 || notifications.pendingLeaves > 0 || notifications.poorAttendance.length > 0 || notifications.performanceAlerts.length > 0 || notifications.adviceNotifications?.some((item) => !item.is_read)) && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />}
        </button>

        <button onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false); }} className="hidden items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-[var(--text)] shadow-sm md:flex" aria-label="Open profile menu">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-sm">{user?.name?.[0] || 'I'}</div>
          <div className="text-left">
            <p className="text-sm font-semibold text-[var(--text)]">{user?.name || 'Team Member'}</p>
            <p className="text-xs text-[var(--muted)]">{user?.role || 'Employee'}</p>
          </div>
        </button>

        {notificationsOpen && (
          <div className="absolute right-0 top-14 z-40 w-[min(92vw,420px)] rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl backdrop-blur-2xl">
            <h3 className="text-sm font-semibold text-[var(--text)]">Notifications</h3>
            <div className="mt-4 space-y-3 text-sm">
              {notifications.qrAccess?.map((session) => <button type="button" key={`qr-${session.id}`} onClick={() => { setNotificationsOpen(false); navigate('/attendance'); }} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-left text-[var(--text)]"><QrCode className="h-5 w-5 flex-none text-[var(--primary)]" /><span className="flex-1">Admin {session.action === 'check-in' ? 'check-in' : 'check-out'} QR is ready to scan</span><span className="text-xs font-semibold text-[var(--primary)]">Scan</span></button>)}
              <div className="rounded-2xl bg-[var(--surface)] p-3 text-[var(--text)]">Pending leaves: {notifications.pendingLeaves}</div>
              {notifications.adviceNotifications?.map((item) => <div key={`advice-${item.id}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-3"><div className="flex items-center gap-2 text-xs font-semibold text-[var(--primary)]"><Sparkles className="h-4 w-4" />Performance advice from {item.author_name}</div><p className="mt-2 text-sm leading-6 text-[var(--text)]">{item.message}</p><p className="mt-2 text-xs text-[var(--muted)]">{new Date(item.created_at).toLocaleString()}</p></div>)}
              {notifications.poorAttendance.map((item) => <div key={item.name} className="rounded-2xl bg-amber-500/10 p-3 text-amber-200">{item.name} has {item.late_days} late days.</div>)}
              {notifications.performanceAlerts.map((item) => <div key={`${item.name}-${item.review_month}`} className="rounded-2xl bg-rose-500/10 p-3 text-rose-200">{item.name} performance alert: {item.final_score}%</div>)}
              {notifications.auditLogs.map((log) => <div key={log.id} className="rounded-2xl bg-[var(--surface)] p-3 text-[var(--muted)]">{log.action}</div>)}
              {!notifications.qrAccess?.length && !notifications.pendingLeaves && !notifications.poorAttendance.length && !notifications.performanceAlerts.length && !notifications.auditLogs.length && !notifications.adviceNotifications?.length && <div className="rounded-2xl bg-[var(--surface)] p-3 text-[var(--muted)]">No notifications.</div>}
            </div>
          </div>
        )}

        {profileOpen && (
          <div className="absolute right-0 top-14 z-40 w-[min(92vw,320px)] rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-white">{user?.name?.[0] || 'I'}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text)]">{user?.name || 'Team Member'}</p>
                <p className="truncate text-xs text-[var(--muted)]">{user?.email || 'No email'}</p>
                <p className="text-xs text-[var(--muted)]">{user?.role || 'Employee'}</p>
              </div>
            </div>
            <button onClick={onLogout} className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[var(--text)] px-3 py-2 text-sm font-semibold text-[var(--bg)]">
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Topbar;
