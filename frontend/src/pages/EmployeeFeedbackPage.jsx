import { useCallback, useEffect, useState } from 'react';
import { MessageSquareText, Send } from 'lucide-react';
import { request } from '../lib/api';

const categories = ['Workload', 'Management', 'Workplace Environment', 'Training', 'Team / Communication', 'General'];

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}

export default function EmployeeFeedbackPage() {
  const [category, setCategory] = useState('General');
  const [feedback, setFeedback] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await request('/feedback/my'));
      setError('');
    } catch (err) {
      setError(err.message || 'Feedback history could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const submitFeedback = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (!feedback.trim()) return setError('Please enter your feedback before submitting.');
    setSubmitting(true);
    try {
      const result = await request('/feedback', {
        method: 'POST',
        body: JSON.stringify({ category, feedback_text: feedback.trim(), is_anonymous: anonymous })
      });
      setMessage(result.message);
      setFeedback('');
      if (!anonymous) await loadHistory();
    } catch (err) {
      setError(err.message || 'Feedback could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="space-y-6">
    <div><p className="section-kicker">Employee voice</p><h1 className="page-title">Employee Feedback</h1><p className="page-subtitle">Share a workplace concern or positive experience with the administration team.</p></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <form onSubmit={submitFeedback} className="glass-card min-w-0 rounded-3xl p-6 sm:p-8">
        <div className="ai-form-heading"><MessageSquareText /><div><p>Submit Feedback</p><span>Your response is reviewed by an Administrator.</span></div></div>
        <div className="space-y-5">
          <label className="ai-field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="ai-field"><span>Feedback</span><textarea rows="7" maxLength="2000" required value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Describe your experience or concern" /></label>
          <label className="feedback-anonymous"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /><span>Submit as anonymous feedback</span></label>
          {anonymous && <p className="text-sm text-[var(--muted)]">Anonymous feedback has no employee identity attached, so it will not appear in your history.</p>}
        </div>
        <button type="submit" disabled={submitting} className="btn-neon mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:opacity-60"><Send className="h-4 w-4" />{submitting ? 'Submitting...' : 'Submit Feedback'}</button>
        {message && <p role="status" className="mt-4 text-sm text-[var(--success)]">{message}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
      </form>

      <div className="glass-card min-w-0 overflow-hidden rounded-3xl">
        <div className="border-b border-[var(--border)] px-6 py-5"><h2 className="text-lg font-semibold">My Feedback History</h2><p className="mt-1 text-sm text-[var(--muted)]">Feedback submitted with your employee account.</p></div>
        <div className="max-h-[620px] overflow-auto">
          <table className="min-w-[680px] w-full text-left text-sm">
            <thead><tr><th>Date</th><th>Category</th><th>Feedback</th><th>Analysis Status</th><th>Sentiment</th></tr></thead>
            <tbody>{loading ? <tr><td colSpan="5" className="px-6 py-10 text-center">Loading feedback...</td></tr> : history.length === 0 ? <tr><td colSpan="5" className="px-6 py-10 text-center text-[var(--muted)]">No feedback submitted yet.</td></tr> : history.map((item) => <tr key={item.id}>
              <td className="whitespace-nowrap">{formatDate(item.submitted_at)}</td>
              <td>{item.category}</td>
              <td className="max-w-[340px] whitespace-normal break-words leading-relaxed">{item.feedback_text}</td>
              <td><span className={`status-pill ${item.analysis_status === 'Analyzed' ? 'approved' : 'pending'}`}>{item.analysis_status === 'Analyzed' ? 'Analyzed' : 'Pending Analysis'}</span></td>
              <td>{item.analysis_status === 'Analyzed' && item.sentiment ? <span className={`ai-sentiment-tone ${item.sentiment.toLowerCase()}`}>{item.sentiment}</span> : '-'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  </section>;
}
