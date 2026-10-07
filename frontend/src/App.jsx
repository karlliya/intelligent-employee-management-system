import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getUser, logout } from './lib/auth';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import OTPVerificationPage from './pages/OTPVerificationPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import AttendancePage from './pages/AttendancePage';
import LeavePage from './pages/LeavePage';
import AIPanel from './pages/AIPanel';
import PerformancePage from './pages/PerformancePage';
import EmployeeFeedbackPage from './pages/EmployeeFeedbackPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import AccessDeniedPage from './pages/AccessDeniedPage';
import AuditLogsPage from './pages/AuditLogsPage';

function App() {
  const [user, setUser] = useState(getUser());
  const [theme, setTheme] = useState(() => localStorage.getItem('iems_theme') || 'dark');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('iems_sidebar_collapsed') === '1');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      const returnTo = window.location.pathname === '/attendance' ? '/attendance' : '/';
      navigate('/login', { replace: true, state: { message: 'Your session expired. Please sign in again.', returnTo } });
    };
    window.addEventListener('iems-auth-expired', handleExpired);
    return () => window.removeEventListener('iems-auth-expired', handleExpired);
  }, [navigate]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('iems_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('iems_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    setUser(null);
    navigate('/login');
  };

  return (
    <div className={`layout relative min-h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)] ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_38%)] pointer-events-none" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-otp" element={<OTPVerificationPage onLogin={setUser} />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <div className="relative flex min-h-screen">
                <Sidebar
                  collapsed={sidebarCollapsed}
                  mobileOpen={mobileSidebarOpen}
                  user={user}
                  onToggle={() => setSidebarCollapsed((prev) => !prev)}
                  onCloseMobile={() => setMobileSidebarOpen(false)}
                  onLogout={handleLogout}
                />
                <main className={`relative flex-1 min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'md:pl-[76px]' : 'md:pl-[260px]'}`}>
                  <div className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl">
                    <Topbar theme={theme} setTheme={setTheme} user={user} onMenuClick={() => setMobileSidebarOpen(true)} onLogout={handleLogout} />
                  </div>
                  <div className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
                    <Routes>
                      <Route path="" element={<DashboardPage />} />
                      <Route path="employees" element={<ProtectedRoute roles={['Admin', 'Employee']}><EmployeesPage /></ProtectedRoute>} />
                      <Route path="attendance" element={<AttendancePage />} />
                      <Route path="leaves" element={<LeavePage />} />
                      <Route path="performance" element={<ProtectedRoute roles={['Admin', 'Employee']}><PerformancePage /></ProtectedRoute>} />
                      <Route path="feedback" element={<ProtectedRoute roles={['Employee']}><EmployeeFeedbackPage /></ProtectedRoute>} />
                      <Route path="ai" element={<ProtectedRoute roles={['Admin']}><AIPanel /></ProtectedRoute>} />
                      <Route path="reports" element={<ProtectedRoute roles={['Admin']}><ReportsPage /></ProtectedRoute>} />
                      <Route path="audit-logs" element={<ProtectedRoute roles={['Admin']}><AuditLogsPage /></ProtectedRoute>} />
                      <Route path="settings" element={<ProtectedRoute roles={['Admin']}><SettingsPage /></ProtectedRoute>} />
                      <Route path="access-denied" element={<AccessDeniedPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </div>
                </main>
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
