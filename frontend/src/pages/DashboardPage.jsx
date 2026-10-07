import { useEffect, useMemo, useState } from 'react';
import { request } from '../lib/api';
import { getUser } from '../lib/auth';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend } from 'chart.js';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardCheck,
  FileBarChart,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  UsersRound
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend);

const chartOptions = {
  animation: { duration: 420 },
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#86868B', boxWidth: 10, usePointStyle: true } },
    tooltip: { backgroundColor: 'rgba(28,28,30,0.94)', padding: 12 }
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#86868B' } },
    y: { beginAtZero: true, grid: { color: 'rgba(142,142,147,0.14)' }, ticks: { color: '#86868B' } }
  }
};

const roleCopy = {
  Admin: 'Manage people, attendance, leave, security, reports, and system settings from one calm workspace.',
  Employee: 'Check your profile, attendance, leave, performance, and recommendations quickly.'
};

const tone = {
  blue: 'text-[#0071E3]',
  green: 'text-[#34C759]',
  amber: 'text-[#FF9F0A]',
  red: 'text-[#FF3B30]',
  purple: 'text-[#AF52DE]'
};

const ProgressRow = ({ label, value }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-semibold text-[var(--text)]">{label}</span>
      <span className="text-[var(--muted)]">{value}%</span>
    </div>
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  </div>
);

const DashboardPage = () => {
  const navigate = useNavigate();
  const user = getUser();
  const role = user?.role || 'Employee';
  const [metrics, setMetrics] = useState({ totalEmployees: 0, presentToday: 0, lateEmployeesToday: 0, pendingLeave: 0, highPerformers: 0, atRiskEmployees: 0, highlights: [] });
  const [reportData, setReportData] = useState({ attendanceByMonth: [], performanceByMonth: [], departmentHeadcount: [] });
  const [summary, setSummary] = useState({ recentAuditLogs: [] });
  const [leaves, setLeaves] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const month = new Date().toISOString().slice(0, 7);
        const [stats, metricData, report, leaveData] = await Promise.all([
          request('/dashboard/stats'),
          request('/dashboard/metrics'),
          request('/dashboard/report-data'),
          request('/leaves')
        ]);
        const reportSummary = role === 'Employee' ? { recentAuditLogs: [] } : await request(`/reports/summary?month=${month}`);
        setMetrics({
          ...metricData,
          ...stats,
          pendingLeave: stats.pendingLeaves ?? metricData.pendingLeave,
          lateEmployeesToday: stats.lateToday ?? metricData.lateEmployeesToday
        });
        setReportData(report);
        setLeaves((leaveData || []).filter((leave) => leave.status === 'Pending').slice(0, 5));
        setSummary(reportSummary);
        setMessage('');
      } catch (error) {
        setMessage(error.message);
      }
    };

    loadData();
  }, [role]);

  const attendanceRate = metrics.totalEmployees ? Math.round(((metrics.presentToday || 0) / metrics.totalEmployees) * 100) : 0;
  const onLeave = Math.max(0, (metrics.totalEmployees || 0) - (metrics.presentToday || 0) - (metrics.lateEmployeesToday || 0));
  const activeProjects = Math.max(4, new Set((reportData.departmentHeadcount || []).map((row) => row.department)).size);
  const aiAlerts = (metrics.atRiskEmployees || 0) + (metrics.securityAlerts || 0) + (metrics.highlights?.length || 0);

  const departmentLabels = useMemo(() => reportData.departmentHeadcount?.map((row) => row.department) || [], [reportData.departmentHeadcount]);
  const departmentValues = useMemo(() => reportData.departmentHeadcount?.map((row) => row.total) || [], [reportData.departmentHeadcount]);
  const attendanceLabels = reportData.attendanceByMonth?.map((row) => row.month) || [];
  const lateSeries = reportData.attendanceByMonth?.map((row) => row.late || 0) || [];
  const presentSeries = reportData.attendanceByMonth?.map((row) => row.present || row.total || 0) || [];
  const performanceLabels = reportData.performanceByMonth?.map((row) => row.month) || [];
  const performanceSeries = reportData.performanceByMonth?.map((row) => Math.round(row.average_score || row.avg_score || row.final_score || 0)) || [];

  const cards = [
    { title: 'Employees', value: metrics.totalEmployees || 0, text: 'Total team members', icon: UsersRound, color: 'blue' },
    { title: 'Present', value: metrics.presentToday || 0, text: `${attendanceRate}% attendance`, icon: UserCheck, color: 'green' },
    { title: 'On Leave', value: onLeave, text: 'Planned absence', icon: CalendarClock, color: 'purple' },
    { title: 'Pending Leave', value: metrics.pendingLeave || metrics.pendingLeaves || 0, text: 'Needs approval', icon: ClipboardCheck, color: 'amber' },
    { title: 'Projects', value: activeProjects, text: 'Active assignments', icon: BriefcaseBusiness, color: 'blue' },
    { title: 'AI Alerts', value: aiAlerts, text: 'Needs attention', icon: Bot, color: 'red' }
  ];
  const canManageEmployees = role === 'Admin';
  const canUseAI = role === 'Admin';
  const canViewReports = role === 'Admin';
  const primaryAction = canManageEmployees ? { label: 'Add Employee', path: '/employees', icon: Plus } : { label: 'Apply Leave', path: '/leaves', icon: Plus };
  const secondaryAction = canViewReports ? { label: 'Report', path: '/reports', icon: FileBarChart } : { label: 'My Performance', path: '/performance', icon: TrendingUp };
  const PrimaryActionIcon = primaryAction.icon;
  const SecondaryActionIcon = secondaryAction.icon;
  const quickActions = [
    canManageEmployees ? ['Employees', UsersRound, '/employees'] : ['My Profile', UsersRound, '/employees'],
    ['Leave', ClipboardCheck, '/leaves'],
    canUseAI ? ['AI Check', Sparkles, '/ai'] : ['Performance', Sparkles, '/performance'],
    role === 'Admin' ? ['Settings', ShieldCheck, '/settings'] : ['Attendance', UserCheck, '/attendance']
  ];

  return (
    <motion.section className="animate-fadein space-y-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="apple-hero">
        <div className="section-header">
          <div>
            <p className="section-kicker">HAMARISA IEMS</p>
            <h1 className="page-title">Good day, {user?.name?.split(' ')?.[0] || role}.</h1>
            <p className="page-subtitle">{roleCopy[role]} Everything important is grouped here so you can act fast.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => navigate(primaryAction.path)} className="btn-neon inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold">
              <PrimaryActionIcon className="h-4 w-4" /> {primaryAction.label}
            </button>
            <button onClick={() => navigate(secondaryAction.path)} className="btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold">
              <SecondaryActionIcon className="h-4 w-4" /> {secondaryAction.label}
            </button>
          </div>
        </div>
      </div>

      {message && <div className="status-banner error">{message}</div>}

      <div className="dashboard-card-grid">
        {cards.map(({ title, value, text, icon: Icon, color }) => (
          <motion.div key={title} className="metric-card" whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
            <div className="metric-card__top">
              <span className={`metric-card__icon ${tone[color]}`}><Icon className="h-5 w-5" /></span>
              <span className="metric-card__label">{title}</span>
            </div>
            <div className="metric-card__value">{value}</div>
            <div className="metric-card__trend">{text}</div>
          </motion.div>
        ))}
      </div>

      <div className="content-grid content-grid--wide">
        <div className="panel-card">
          <div className="panel-heading">
            <div>
              <h2 className="panel-title">Attendance</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Simple view of who is available today.</p>
            </div>
            <span className="panel-chip">Today</span>
          </div>
          <div className="grid gap-5 lg:grid-cols-[0.45fr_0.55fr]">
            <div className="chart-frame compact">
              <Doughnut
                data={{
                  labels: ['Present', 'Late', 'On Leave'],
                  datasets: [{ data: [metrics.presentToday || 0, metrics.lateEmployeesToday || 0, onLeave], backgroundColor: ['#34C759', '#FF9F0A', '#AF52DE'], borderWidth: 0 }]
                }}
                options={{ ...chartOptions, scales: undefined, cutout: '72%' }}
              />
            </div>
            <div className="grid content-center gap-4">
              <ProgressRow label="Attendance rate" value={attendanceRate} />
              <ProgressRow label="Site readiness" value={Math.max(65, attendanceRate - 3)} />
              <ProgressRow label="Workforce coverage" value={Math.max(70, attendanceRate - 1)} />
            </div>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-heading">
            <div>
              <h2 className="panel-title">Quick Actions</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Most-used tasks.</p>
            </div>
          </div>
          <div className="grid gap-3">
            {quickActions.map(([label, Icon, path]) => (
              <button key={label} onClick={() => navigate(path)} className="simple-action">
                <Icon className="h-5 w-5 text-[var(--primary)]" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="content-grid content-grid--charts">
        <div className="panel-card">
          <div className="panel-heading">
            <div>
              <h2 className="panel-title">Monthly Attendance</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Present and late trends.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div className="chart-frame">
            <Bar
              data={{
                labels: attendanceLabels,
                datasets: [
                  { label: 'Present', data: presentSeries, backgroundColor: 'rgba(52,199,89,0.78)', borderRadius: 12 },
                  { label: 'Late', data: lateSeries, backgroundColor: 'rgba(255,159,10,0.78)', borderRadius: 12 }
                ]
              }}
              options={chartOptions}
            />
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-heading">
            <div>
              <h2 className="panel-title">Performance</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">KPI trend and prediction.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div className="chart-frame">
            <Line
              data={{
                labels: performanceLabels.length ? performanceLabels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                  label: 'KPI',
                  data: performanceSeries.length ? performanceSeries : [76, 80, 82, 81, 86, 88],
                  borderColor: '#0071E3',
                  backgroundColor: 'rgba(0,113,227,0.12)',
                  fill: true,
                  tension: 0.35
                }]
              }}
              options={chartOptions}
            />
          </div>
        </div>
      </div>

      <div className="content-grid content-grid--three">
        <div className="panel-card">
          <div className="panel-heading">
            <h2 className="panel-title">Needs Attention</h2>
            <AlertTriangle className="h-5 w-5 text-[#FF9F0A]" />
          </div>
          <div className="stack-list">
            <div className="compact-row">
              <span className="compact-row__title">Pending leave</span>
              <span className="compact-row__meta">{metrics.pendingLeave || metrics.pendingLeaves || 0}</span>
            </div>
            <div className="compact-row">
              <span className="compact-row__title">At-risk employees</span>
              <span className="compact-row__meta">{metrics.atRiskEmployees || 0}</span>
            </div>
            <div className="compact-row">
              <span className="compact-row__title">Late today</span>
              <span className="compact-row__meta">{metrics.lateEmployeesToday || 0}</span>
            </div>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-heading">
            <h2 className="panel-title">Pending Leaves</h2>
            <CalendarClock className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div className="stack-list">
            {leaves.length === 0 ? <div className="empty-state">No pending leave requests.</div> : leaves.map((leave) => (
              <div key={leave.id} className="compact-row">
                <span className="compact-row__title">{leave.name || leave.emp_id}</span>
                <span className="compact-row__meta">{leave.days} day(s)</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-heading">
            <h2 className="panel-title">Departments</h2>
            <BriefcaseBusiness className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div className="chart-frame compact">
            <Doughnut
              data={{
                labels: departmentLabels,
                datasets: [{ data: departmentValues, backgroundColor: ['#0071E3', '#34C759', '#AF52DE', '#FF9F0A', '#FF3B30', '#64D2FF'], borderWidth: 0 }]
              }}
              options={{ ...chartOptions, scales: undefined, cutout: '70%' }}
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default DashboardPage;
