import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, BrainCircuit, MessageSquareText, Sparkles, UserRoundSearch } from 'lucide-react';
import { request } from '../lib/api';
import { getUser } from '../lib/auth';

const tools = [
  { key: 'performance', label: 'Performance', note: 'Predict employee rating', icon: BrainCircuit },
  { key: 'team', label: 'Team Match', note: 'Find suitable engineers', icon: UserRoundSearch },
  { key: 'risk', label: 'Turnover Risk', note: 'Identify retention risk', icon: Activity },
  { key: 'sentiment', label: 'Employee Sentiment', note: 'Review submitted feedback', icon: MessageSquareText }
];

const feedbackStatuses = ['Pending', 'Analyzed', 'All'];

function feedbackDate(value) {
  return value ? new Date(value).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}

const Field = ({ label, hint, value, onChange, type = 'number', step = '1', min, max, placeholder }) => (
  <label className="ai-field">
    <span>{label}</span><small>{hint}</small>
    <input type={type} step={step} min={min} max={max} value={value} placeholder={placeholder} onChange={(event) => onChange(type === 'number' ? Number(event.target.value) : event.target.value)} />
  </label>
);

function scoreRecommendation(score) {
  if (score >= 85) return 'Strongly Recommended';
  if (score >= 65) return 'Recommended';
  return 'Partially Recommended';
}

const ResultRow = ({ label, children, highlight = false }) => (
  <div className="ai-result-row"><span>{label}</span><strong className={highlight ? 'text-[var(--primary)]' : ''}>{children || 'Not available'}</strong></div>
);

function ResultReport({ result }) {
  if (!result) return null;
  const { title, data } = result;

  if (title === 'Employee Performance Prediction') {
    const attendance = data.attendance_summary || {};
    const performance = data.performance_summary || {};
    return <div className="ai-report">
      {data.alert && <div className="ai-risk-alert"><Activity /><div><strong>Attendance warning</strong><span>{data.alert}</span></div></div>}
      <div className="ai-employee-summary"><div><small>Employee</small><h3>{data.employee?.name}</h3><p>{data.employee?.emp_id} · {data.employee?.department}</p></div><span className={`ai-rating ${data.prediction === 'Needs Improvement' ? 'bad' : ''}`}>{data.prediction}</span></div>
      <div className="ai-summary-grid"><div><span>Present</span><strong>{attendance.present_days || 0}</strong></div><div><span>Late</span><strong>{attendance.late_days || 0}</strong></div><div className={Number(attendance.absent_days) > 3 ? 'bad' : ''}><span>Absent</span><strong>{attendance.absent_days || 0}</strong></div><div><span>Attendance</span><strong>{attendance.attendance_rate || 0}%</strong></div></div>
      <ResultRow label="Final prediction score" highlight>{data.final_score}%</ResultRow>
      <ResultRow label="KPI score">{performance.kpi_score}%</ResultRow>
      <ResultRow label="Task completion">{performance.task_completion_score}%</ResultRow>
      <ResultRow label="Recommended action">{data.recommendation}</ResultRow>
      <div className="ai-assessment"><span>AI assessment</span><p>{data.explanation}</p></div>
    </div>;
  }

  if (title === 'Team Recommendation') {
    const candidates = Array.isArray(data) ? data : data.recommendations || [];
    return candidates.length ? <div className="space-y-3">{candidates.map((candidate, index) => {
      const score = Number(candidate.match_score || 0);
      return <div className="ai-candidate" key={candidate.emp_id || candidate.name || index}><div className="flex items-start justify-between gap-4"><div><small>Candidate {index + 1}</small><h3>{candidate.name}</h3></div><span className="ai-score">{score}% match</span></div><p>{candidate.reason || 'Skills and experience match the selected project requirements.'}</p><div className="ai-skill-list">{String(candidate.skills || '').split(',').filter(Boolean).slice(0, 5).map((skill) => <span key={skill}>{skill.trim()}</span>)}</div><ResultRow label="Recommendation">{scoreRecommendation(score)}</ResultRow></div>;
    })}</div> : <div className="ai-empty-result"><UserRoundSearch /><p>No matching candidate found</p><span>Try using fewer or broader skills.</span></div>;
  }

  if (title === 'Performance Prediction') {
    return <div className="ai-report"><ResultRow label="Predicted rating" highlight>{data.prediction}</ResultRow><ResultRow label="Confidence">{data.confidence}%</ResultRow><ResultRow label="Recommendation">{data.recommendation || scoreRecommendation(Number(data.final_score || data.confidence || 0))}</ResultRow><div className="ai-assessment"><span>Assessment</span><p>{data.explanation || 'The prediction combines attendance, leave, KPI, manager rating and work experience.'}</p></div></div>;
  }

  if (title === 'Turnover Risk Prediction') {
    const score = Number(data.risk_score || 0);
    return <div className="ai-report"><ResultRow label="Risk level" highlight>{data.risk_category || (score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low')}</ResultRow><ResultRow label="Risk score">{score}%</ResultRow><ResultRow label="Recommended action">{data.recommendation}</ResultRow><div className="ai-assessment"><span>Assessment</span><p>{data.explanation || 'The assessment combines attendance, leave, performance and engagement trends.'}</p></div></div>;
  }

  return null;
}

const AIPanel = () => {
  const user = getUser();
  const isAdmin = user?.role === 'Admin';
  const [activeTool, setActiveTool] = useState('performance');
  const [performance, setPerformance] = useState({ attendance_rate: 95, leave_frequency: 1, kpi_score: 88, performance_score: 9, experience_duration: 4 });
  const [recommend, setRecommend] = useState({ required_skills: 'HVAC, Commissioning, Site Coordination' });
  const [risk, setRisk] = useState({ attendance_trend: -0.1, leave_frequency: 2, performance_trend: -0.2, engagement_score: 6 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [predictionMonth, setPredictionMonth] = useState(new Date().toISOString().slice(0, 7));
  const [feedbackFilter, setFeedbackFilter] = useState('Pending');
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [feedbackCounts, setFeedbackCounts] = useState({ Pending: 0, Analyzed: 0, All: 0 });
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const feedbackRequestId = useRef(0);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    request('/employees').then((rows) => {
      setEmployees(rows);
      if (rows[0]) setSelectedEmployee(rows[0].emp_id);
    }).catch((error) => setMessage(error.message));
  }, [isAdmin]);

  const loadFeedback = useCallback(async () => {
    const requestId = ++feedbackRequestId.current;
    setFeedbackLoading(true);
    try {
      const data = await request(`/admin/feedback?status=${encodeURIComponent(feedbackFilter)}`);
      if (requestId !== feedbackRequestId.current) return;
      setFeedbackItems(data.items);
      setFeedbackCounts(data.counts);
      setMessage('');
    } catch (error) {
      if (requestId !== feedbackRequestId.current) return;
      setMessage(error.message || 'Employee feedback could not be loaded. Please try again.');
    } finally {
      if (requestId === feedbackRequestId.current) setFeedbackLoading(false);
    }
  }, [feedbackFilter]);

  useEffect(() => { if (isAdmin && activeTool === 'sentiment') loadFeedback(); }, [isAdmin, activeTool, loadFeedback]);

  const analyzeFeedback = async (item) => {
    setAnalysisBusy(true);
    setMessage('');
    try {
      const analyzed = await request(`/admin/feedback/${item.id}/analyze`, { method: 'POST', body: JSON.stringify({}) });
      setSelectedFeedback(analyzed);
      await loadFeedback();
    } catch (error) {
      setMessage(/\((500|503)\)$/.test(error.message || '')
        ? 'Sentiment analysis could not be completed. Please try again.'
        : error.message || 'Sentiment analysis could not be completed. Please try again.');
    } finally {
      setAnalysisBusy(false);
    }
  };

  const runAi = async (title, path, body) => {
    setLoading(true); setMessage(''); setResult(null);
    try {
      const data = await request(path, { method: 'POST', body: JSON.stringify(body) });
      setResult({ title, data });
    } catch (error) {
      setMessage(error.message || 'Unable to complete the analysis.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div><p className="section-kicker">Engineering Intelligence</p><h1 className="page-title">AI Analytics</h1><p className="page-subtitle">{activeTool === 'sentiment' ? 'Review employee-submitted feedback and decide on appropriate follow-up.' : 'Select one analysis, enter the employee information, and review the recommendation.'}</p></div>

      <div className="ai-tool-tabs" role="tablist">
        {tools.map(({ key, label, note, icon: Icon }) => <button key={key} type="button" onClick={() => { if (key === 'sentiment' && activeTool !== 'sentiment') setFeedbackLoading(true); setActiveTool(key); setMessage(''); setResult(null); setSelectedFeedback(null); }} className={`ai-tool-tab ${activeTool === key ? 'active' : ''}`}><Icon /><span><strong>{label}</strong><small>{note}</small></span></button>)}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
        <div className="glass-card rounded-3xl p-6 sm:p-8">
          {activeTool === 'performance' && (isAdmin
            ? <form onSubmit={(e) => { e.preventDefault(); runAi('Employee Performance Prediction', '/ai/predict-employee', { emp_id: selectedEmployee, month: predictionMonth }); }}><FormHeading icon={BrainCircuit} title="Employee Performance Prediction" note="Prediction using attendance and performance records" /><div className="space-y-5"><label className="ai-field"><span>Select employee</span><small>Choose an employee from the company database</small><select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} required>{employees.length === 0 && <option value="">No employee available</option>}{employees.map((employee) => <option key={employee.emp_id} value={employee.emp_id}>{employee.name} ({employee.emp_id}) · {employee.department}</option>)}</select></label><label className="ai-field"><span>Prediction month</span><small>Attendance and latest KPI data will be analyzed</small><input type="month" value={predictionMonth} onChange={(e) => setPredictionMonth(e.target.value)} required /></label><div className="ai-rule-note"><Activity /><div><strong>Attendance rule</strong><span>More than 3 absent days automatically produces a Needs Improvement result.</span></div></div></div><SubmitButton loading={loading || !selectedEmployee}>Predict Employee Performance</SubmitButton></form>
            : <form onSubmit={(e) => { e.preventDefault(); runAi('Performance Prediction', '/ai/predict-performance', performance); }}><FormHeading icon={BrainCircuit} title="Performance Prediction" note="Employee performance outlook" /><div className="ai-fields-grid"><Field label="Attendance" hint="Percentage, 0 to 100" min="0" max="100" value={performance.attendance_rate} onChange={(value) => setPerformance({ ...performance, attendance_rate: value })} /><Field label="Leave taken" hint="Number of leave days" min="0" value={performance.leave_frequency} onChange={(value) => setPerformance({ ...performance, leave_frequency: value })} /><Field label="KPI score" hint="Percentage, 0 to 100" min="0" max="100" value={performance.kpi_score} onChange={(value) => setPerformance({ ...performance, kpi_score: value })} /><Field label="Manager rating" hint="Score from 1 to 10" min="1" max="10" value={performance.performance_score} onChange={(value) => setPerformance({ ...performance, performance_score: value })} /><Field label="Experience" hint="Years of experience" min="0" value={performance.experience_duration} onChange={(value) => setPerformance({ ...performance, experience_duration: value })} /></div><SubmitButton loading={loading}>Predict Performance</SubmitButton></form>)}
          {activeTool === 'team' && <form onSubmit={(e) => { e.preventDefault(); runAi('Team Recommendation', '/ai/recommend-team', recommend); }}><FormHeading icon={UserRoundSearch} title="Team Recommendation" note="Match engineers to project skills" /><label className="ai-field"><span>Skills required</span><small>Separate each skill with a comma</small><textarea rows="6" value={recommend.required_skills} onChange={(e) => setRecommend({ required_skills: e.target.value })} required /></label><SubmitButton loading={loading}>Find Candidates</SubmitButton></form>}
          {activeTool === 'risk' && <form onSubmit={(e) => { e.preventDefault(); runAi('Turnover Risk Prediction', '/ai/turnover-risk', risk); }}><FormHeading icon={Activity} title="Turnover Risk" note="Employee retention assessment" /><div className="ai-fields-grid"><Field label="Attendance change" hint="Negative means declining" step="0.1" value={risk.attendance_trend} onChange={(value) => setRisk({ ...risk, attendance_trend: value })} /><Field label="Leave taken" hint="Number of leave days" min="0" value={risk.leave_frequency} onChange={(value) => setRisk({ ...risk, leave_frequency: value })} /><Field label="Performance change" hint="Negative means declining" step="0.1" value={risk.performance_trend} onChange={(value) => setRisk({ ...risk, performance_trend: value })} /><Field label="Engagement" hint="Score from 1 to 10" min="1" max="10" value={risk.engagement_score} onChange={(value) => setRisk({ ...risk, engagement_score: value })} /></div><SubmitButton loading={loading}>Check Risk Level</SubmitButton></form>}
          {activeTool === 'sentiment' && <>
            <FormHeading icon={MessageSquareText} title="Employee Sentiment Analysis" note="Feedback submitted by employees" />
            <div className="feedback-status-tabs" role="tablist" aria-label="Feedback status">
              {feedbackStatuses.map((status) => <button key={status} type="button" role="tab" aria-selected={feedbackFilter === status} disabled={analysisBusy} className={feedbackFilter === status ? 'active' : ''} onClick={() => { if (feedbackFilter !== status) setFeedbackLoading(true); setFeedbackFilter(status); setSelectedFeedback(null); }}>
                {status === 'Pending' ? 'Pending Feedback' : status === 'Analyzed' ? 'Analyzed Feedback' : 'All Feedback'} <span>{feedbackCounts[status] || 0}</span>
              </button>)}
            </div>
            <div className="feedback-list">
              {feedbackLoading ? <div className="empty-state">Loading employee feedback...</div> : feedbackItems.length === 0 ? <div className="empty-state">No feedback in this category.</div> : feedbackItems.map((item) => <div key={item.id} className="feedback-list-item">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.is_anonymous ? 'Anonymous Employee' : item.emp_id ? `${item.emp_id} - ${item.employee_name}` : item.employee_name}</strong><span className={`status-pill ${item.analysis_status === 'Analyzed' ? 'approved' : 'pending'}`}>{item.analysis_status === 'Analyzed' ? 'Analyzed' : 'Pending Analysis'}</span></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]"><span>{item.category}</span><span>{feedbackDate(item.submitted_at)}</span></div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text)]">{item.feedback_text}</p>
                <button type="button" disabled={analysisBusy} className={`${item.analysis_status === 'Analyzed' ? 'btn-secondary' : 'btn-neon'} mt-4 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60`} onClick={() => item.analysis_status === 'Analyzed' ? setSelectedFeedback(item) : analyzeFeedback(item)}>{item.analysis_status === 'Analyzed' ? 'View Result' : analysisBusy ? 'Analyzing...' : 'Analyze Sentiment'}</button>
              </div>)}
            </div>
          </>}
        </div>

        <div className="glass-card min-h-[430px] min-w-0 rounded-3xl p-6 sm:p-8">
          <div className="ai-result-heading"><div><p className="section-kicker">Analysis result</p><h2>{activeTool === 'sentiment' ? 'Employee Feedback Analysis' : result?.title || 'Ready for analysis'}</h2></div><Sparkles /></div>
          {activeTool === 'sentiment' ? (selectedFeedback ? <div className="ai-report mt-6">
            <ResultRow label="Employee">{selectedFeedback.is_anonymous ? 'Anonymous Employee' : selectedFeedback.emp_id ? `${selectedFeedback.emp_id} - ${selectedFeedback.employee_name}` : selectedFeedback.employee_name}</ResultRow>
            <ResultRow label="Category">{selectedFeedback.category}</ResultRow>
            <ResultRow label="Submitted">{feedbackDate(selectedFeedback.submitted_at)}</ResultRow>
            <div className="ai-assessment"><span>Submitted feedback</span><p className="whitespace-pre-wrap break-words">{selectedFeedback.feedback_text}</p></div>
            <ResultRow label="Sentiment"><span className={`ai-sentiment-tone ${String(selectedFeedback.sentiment || 'neutral').toLowerCase()}`}>{selectedFeedback.sentiment || 'Not available'}</span></ResultRow>
            <ResultRow label="Confidence">{selectedFeedback.confidence == null ? 'Not calibrated (rule-based)' : `${Math.round(Number(selectedFeedback.confidence) * 100)}%`}</ResultRow>
            <ResultRow label="Key Concern">{selectedFeedback.key_concern}</ResultRow>
            <div className="ai-assessment"><span>Recommended Action</span><p>{selectedFeedback.recommendation || 'No recommendation stored for this legacy feedback.'}</p></div>
            <ResultRow label="Analysis Status">{selectedFeedback.analysis_status}</ResultRow>
            <ResultRow label="Analyzed Date">{feedbackDate(selectedFeedback.analyzed_at)}</ResultRow>
            <p className="text-xs leading-relaxed text-[var(--muted)]">Rule-based decision-support analytics. An Administrator reviews the result; no employment action is automated.</p>
          </div> : <div className="ai-empty-result"><MessageSquareText /><p>Select employee feedback to review.</p><span>Analysis results and management recommendations appear here.</span></div>) : <>
            {!result && !loading && <div className="ai-empty-result"><BrainCircuit /><p>Your AI report will appear here</p><span>Choose an analysis and submit the employee information.</span></div>}
            {loading && <div className="ai-empty-result"><div className="ai-spinner" /><p>Analyzing workforce data...</p><span>Please wait a moment.</span></div>}
            {result && !loading && <div className="mt-6">{result.data?.engine === 'local-js-fallback' && <div className="mb-4 rounded-xl bg-[var(--surface-strong)] p-4 text-sm text-[var(--muted)]">Analysis completed using the built-in IEMS intelligence engine.</div>}<ResultReport result={result} /></div>}
          </>}
          {message && <div role="alert" className="mt-6 rounded-xl bg-rose-500/10 p-4 text-sm text-[var(--danger)]">{message}</div>}
        </div>
      </div>
    </section>
  );
};

const FormHeading = ({ icon: Icon, title, note }) => <div className="ai-form-heading"><Icon /><div><p>{title}</p><span>{note}</span></div></div>;
const SubmitButton = ({ loading, children }) => <button disabled={loading} className="btn-neon mt-7 w-full rounded-xl px-5 py-3 font-semibold disabled:opacity-60">{loading ? 'Analyzing...' : children}</button>;

export default AIPanel;
