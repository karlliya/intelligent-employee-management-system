import { NavLink } from 'react-router-dom';
import { Home, Users, Clock3, FileText, Cpu, BarChart3, Folder, Settings2, ChevronLeft, ChevronRight, LogOut, X, ClipboardList, MessageSquareText } from 'lucide-react';
import HamarisaLogo from './HamarisaLogo';

const links = [
  { label: 'Dashboard', to: '/', icon: Home, roles: ['Admin', 'Employee'] },
  { label: 'Employees', labels: { Employee: 'My Profile' }, to: '/employees', icon: Users, roles: ['Admin', 'Employee'] },
  { label: 'Attendance', labels: { Employee: 'My Attendance' }, to: '/attendance', icon: Clock3, roles: ['Admin', 'Employee'] },
  { label: 'Leaves', labels: { Employee: 'My Leave' }, to: '/leaves', icon: FileText, roles: ['Admin', 'Employee'] },
  { label: 'Performance', labels: { Employee: 'My Performance' }, to: '/performance', icon: BarChart3, roles: ['Admin', 'Employee'] },
  { label: 'Employee Feedback', to: '/feedback', icon: MessageSquareText, roles: ['Employee'] },
  { label: 'AI Analytics', to: '/ai', icon: Cpu, roles: ['Admin'] },
  { label: 'Reports', to: '/reports', icon: Folder, roles: ['Admin'] },
  { label: 'Audit Logs', to: '/audit-logs', icon: ClipboardList, roles: ['Admin'] },
  { label: 'Settings', to: '/settings', icon: Settings2, roles: ['Admin'] }
];

const Sidebar = ({ user, collapsed, mobileOpen, onToggle, onCloseMobile, onLogout }) => (
  <>
  {mobileOpen && <button aria-label="Close sidebar overlay" onClick={onCloseMobile} className="fixed inset-0 z-20 bg-black/60 md:hidden" />}
  <aside className={`sidebar fixed inset-y-0 left-0 z-30 min-h-screen overflow-hidden border-r shadow-sm transition-all duration-300 md:flex ${collapsed ? 'collapsed w-[76px]' : 'w-[260px]'} ${mobileOpen ? 'translate-x-0 flex' : '-translate-x-full md:translate-x-0 md:flex'}`}>
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div>
        <div className={`sidebar-brand ${collapsed ? 'sidebar-brand-collapsed' : ''}`}>
          <div className="flex min-w-0 items-center gap-3">
            <HamarisaLogo compact className={`${collapsed ? 'h-10 w-10' : 'h-11 w-11'} shrink-0`} />
            {!collapsed && (
              <div>
                <p className="text-base font-extrabold text-[var(--text)]">HAMARISA</p>
                <p className="text-xs font-medium text-[var(--muted)]">Intelligent EMS</p>
              </div>
            )}
          </div>
          <button onClick={onToggle} className="sidebar-toggle hidden items-center justify-center md:inline-flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          <button onClick={onCloseMobile} className="sidebar-toggle inline-flex items-center justify-center md:hidden" aria-label="Close sidebar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {links
            .filter((link) => link.roles.includes(user?.role || 'Employee'))
            .map(({ label, labels, to, icon: Icon }) => {
              const displayLabel = labels?.[user?.role] || label;
              return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `sidebar-nav-link ${isActive ? 'active' : ''}`}
                title={collapsed ? displayLabel : undefined}
                end
              >
                <span className="sidebar-nav-icon">
                  <Icon className="h-5 w-5" />
                </span>
                {!collapsed && <span>{displayLabel}</span>}
              </NavLink>
              );
            })}
        </nav>
      </div>

      <div className="sidebar-user mt-auto">
        <div className="flex items-center gap-3">
          <div className="sidebar-avatar">{user?.name?.[0] || 'I'}</div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">{user?.name || 'Team Member'}</p>
              <p className="text-xs text-[var(--muted)]">{user?.role || 'Employee'}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button onClick={onLogout} className="sidebar-logout mt-4 inline-flex w-full items-center justify-center px-3 py-2 text-sm font-semibold">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </button>
        )}
        {collapsed && <button onClick={onLogout} className="sidebar-logout-icon" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>}
      </div>
    </div>
  </aside>
  </>
);

export default Sidebar;
