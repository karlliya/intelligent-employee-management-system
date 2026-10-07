import { useEffect, useMemo, useRef, useState } from 'react';
import { request } from '../lib/api';
import { getUser } from '../lib/auth';
import { Award, BarChart3, ClipboardCheck, Sparkles, Target, X } from 'lucide-react';

const PerformancePage = () => {
  const user = getUser();
  const canManage = user?.role === 'Admin';
  const [employees, setEmployees] = useState([]);
  const [reviews, setReviews] = useState([]);
  const reviewFormRef = useRef(null);
  const [recommendations, setRecommendations] = useState(null);
  const [adviceLoading, setAdviceLoading] = useState('');
  const [adviceComment, setAdviceComment] = useState('');
  const [adviceSending, setAdviceSending] = useState(false);
  const [adviceStatus, setAdviceStatus] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    emp_id: '',
    review_month: new Date().toISOString().slice(0, 7),
    kpi_score: 80,
    task_completion_score: 80,
    attendance_score: 90
  });

  const averages = useMemo(() => {
    if (!reviews.length) return { kpi: 0, task: 0, attendance: 0, final: 0 };
    const sum = reviews.reduce((acc, item) => ({
      kpi: acc.kpi + Number(item.kpi_score || 0),
      task: acc.task + Number(item.task_completion_score || 0),
      attendance: acc.attendance + Number(item.attendance_score || 0),
      final: acc.final + Number(item.final_score || 0)
    }), { kpi: 0, task: 0, attendance: 0, final: 0 });
    return Object.fromEntries(Object.entries(sum).map(([key, value]) => [key, Math.round(value / reviews.length)]));
  }, [reviews]);

  const employeesWithoutReviews = useMemo(() => {
    const reviewedIds = new Set(reviews.map((review) => review.emp_id));
    return employees.filter((employee) => !reviewedIds.has(employee.emp_id));
  }, [employees, reviews]);

  const load = async () => {
    try {
      const [employeeData, reviewData] = await Promise.all([request('/employees'), request('/performance')]);
      setEmployees(employeeData);
      setReviews(reviewData);
      if (!form.emp_id && employeeData[0]) setForm((current) => ({ ...current, emp_id: employeeData[0].emp_id }));
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitReview = async (event) => {
    event.preventDefault();
    setMessage('Saving performance review...');
    try {
      const result = await request('/performance', { method: 'POST', body: JSON.stringify(form) });
      setMessage(`${result.message} Final score ${result.final_score} (${result.rating}).`);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const loadRecommendations = async (empId) => {
    setAdviceLoading(empId);
    setMessage('');
    try {
      const result = await request(`/recommendations/${encodeURIComponent(empId)}`);
      setRecommendations(result);
      setAdviceComment('');
      setAdviceStatus('');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAdviceLoading('');
    }
  };

  const sendAdvice = async () => {
    if (!recommendations?.employee?.emp_id || !adviceComment.trim()) return;
    setAdviceSending(true);
    setAdviceStatus('');
    try {
      const result = await request(`/recommendations/${encodeURIComponent(recommendations.employee.emp_id)}/advice`, {
        method: 'POST',
        body: JSON.stringify({ message: adviceComment.trim() })
      });
      setAdviceStatus(result.message);
      setAdviceComment('');
    } catch (error) {
      setAdviceStatus(error.message);
    } finally {
      setAdviceSending(false);
    }
  };

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const startReview = (empId) => {
    setForm((current) => ({ ...current, emp_id: empId }));
    reviewFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="space-y-6">
      <div><p className="section-kicker">Performance</p><h1 className="page-title">KPI Reviews</h1><p className="page-subtitle">Record monthly scores and identify employees who need recognition or support.</p></div>
        <div className="simple-stat-grid four">
          {[
            { title: 'Average KPI', value: `${averages.kpi}%`, icon: Target },
            { title: 'Task Completion', value: `${averages.task}%`, icon: ClipboardCheck },
            { title: 'Attendance', value: `${averages.attendance}%`, icon: BarChart3 },
            { title: 'Final Score', value: `${averages.final}%`, icon: Award }
          ].map((metric) => (
            <div key={metric.title}><metric.icon /><span>{metric.title}</span><strong>{metric.value}</strong></div>
          ))}
        </div>

      {message && <div className="status-banner">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        {canManage && (
          <form ref={reviewFormRef} onSubmit={submitReview} className="panel-card">
            <div className="panel-heading"><div><h2 className="panel-title">New Monthly Review</h2><p className="mt-1 text-sm text-[var(--muted)]">Scores are calculated automatically.</p></div><Target className="h-5 w-5 text-[var(--primary)]" /></div>
            <div className="mt-5 space-y-4">
              <select value={form.emp_id} onChange={(e) => updateForm('emp_id', e.target.value)} className="form-control" required>
                <option value="">Choose employee</option>
                {employees.map((employee) => <option key={employee.emp_id} value={employee.emp_id}>{employee.name} ({employee.emp_id})</option>)}
              </select>
              <input type="month" value={form.review_month} onChange={(e) => updateForm('review_month', e.target.value)} className="form-control" required />
              {['kpi_score', 'task_completion_score', 'attendance_score'].map((field) => (
                <label key={field} className="form-label">
                  {field.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
                  <input type="number" min="0" max="100" value={form[field]} onChange={(e) => updateForm(field, Number(e.target.value))} className="form-control" required />
                </label>
              ))}
              <button type="submit" className="w-full rounded-xl btn-neon px-5 py-3 text-sm font-semibold">Save Review</button>
            </div>
          </form>
        )}

        <div className="panel-card">
          <div className="panel-heading"><div><h2 className="panel-title">Review History</h2><p className="mt-1 text-sm text-[var(--muted)]">Monthly scores and performance ratings.</p></div><span className="panel-chip">{reviews.length} reviews{employeesWithoutReviews.length ? ` / ${employeesWithoutReviews.length} awaiting` : ''}</span></div>
          <div className="mt-6 max-h-[620px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Final</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {reviews.length === 0 && employeesWithoutReviews.length === 0 && (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-400">No employees or performance reviews yet.</td></tr>
                )}
                {employeesWithoutReviews.map((employee) => (
                  <tr key={`awaiting-${employee.emp_id}`} className="bg-[var(--surface)]">
                    <td className="px-4 py-4 font-medium text-[var(--text)]">{employee.name} <span className="block text-xs text-[var(--muted)]">{employee.emp_id}</span></td>
                    <td className="px-4 py-4 text-[var(--muted)]">-</td>
                    <td className="px-4 py-4 text-[var(--muted)]">-</td>
                    <td className="px-4 py-4 text-[var(--muted)]">Awaiting first review</td>
                    <td className="px-4 py-4">{canManage ? <button type="button" onClick={() => startReview(employee.emp_id)} className="btn-secondary rounded-lg px-3 py-2 text-xs">Add Review</button> : '-'}</td>
                  </tr>
                ))}
                {reviews.map((review) => (
                  <tr key={review.id} className="hover:bg-[#111827]/70">
                    <td className="px-4 py-4 text-white">{review.name}</td>
                    <td className="px-4 py-4 text-slate-300">{review.review_month}</td>
                    <td className="px-4 py-4 text-slate-300">{review.final_score}%</td>
                    <td className="px-4 py-4">
                      <span className={review.hr_alert ? 'text-rose-200' : 'text-emerald-200'}>{review.rating}{review.hr_alert ? ' - HR Alert' : ''}</span>
                    </td>
                    <td className="px-4 py-4">
                      <button type="button" disabled={adviceLoading === review.emp_id} onClick={() => loadRecommendations(review.emp_id)} className="btn-secondary rounded-lg px-3 py-2 text-xs disabled:opacity-60">{adviceLoading === review.emp_id ? 'Loading...' : 'View Advice'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {recommendations && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={() => setRecommendations(null)}>
          <div className="w-full max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-heading"><div><p className="section-kicker">Smart advice</p><h2 className="panel-title">{recommendations.employee?.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{recommendations.employee?.emp_id}</p></div><button type="button" onClick={() => setRecommendations(null)} className="sidebar-toggle inline-flex items-center justify-center"><X className="h-4 w-4" /></button></div>
            <div className="ai-summary-grid mt-5">
              <div><span>KPI</span><strong>{recommendations.latest_performance?.kpi_score || 0}%</strong></div>
              <div><span>Tasks</span><strong>{recommendations.latest_performance?.task_completion_score || 0}%</strong></div>
              <div><span>Attendance</span><strong>{recommendations.latest_performance?.attendance_score || 0}%</strong></div>
              <div><span>Final</span><strong>{recommendations.latest_performance?.final_score || 0}%</strong></div>
            </div>
            <div className="mt-5 rounded-xl bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--text)]">Recommended action</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {recommendations.recommendations.length ? recommendations.recommendations.map((item) => <span key={item} className="status-pill pending">{item}</span>) : <span className="text-sm text-[var(--muted)]">Maintain the current performance plan. No immediate intervention is required.</span>}
              </div>
            </div>
            {user?.role === 'Admin' && <div className="mt-5"><label className="form-label">Comment for employee<textarea value={adviceComment} onChange={(event) => setAdviceComment(event.target.value)} rows="3" maxLength="1000" className="form-control" placeholder="Write clear performance advice or next action..." /></label><button type="button" disabled={adviceSending || !adviceComment.trim()} onClick={sendAdvice} className="btn-secondary mt-3 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50"><Sparkles className="mr-2 h-4 w-4" />{adviceSending ? 'Sending...' : 'Send to Employee Notification'}</button>{adviceStatus && <div className="status-banner mt-3">{adviceStatus}</div>}</div>}
            <button type="button" onClick={() => setRecommendations(null)} className="btn-neon mt-6 w-full rounded-xl px-5 py-3 text-sm font-semibold">Done</button>
          </div>
        </div>
      )}
    </section>
  );
};

export default PerformancePage;
