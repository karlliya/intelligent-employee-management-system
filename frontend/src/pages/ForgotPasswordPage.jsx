import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiUrl } from '../lib/api';

const ForgotPasswordPage = () => {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [message, setMessage] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setResetToken('');
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Unable to process request');
      }
      setMessage(result.message || 'Password reset instructions have been sent.');
      setResetToken(result.resetToken || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07070e] px-4 py-10 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(230,0,122,0.15),transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(6,182,212,0.12),transparent_26%)] pointer-events-none" />
      <div className="w-full max-w-2xl rounded-[32px] border border-[#2B2F3B] bg-[#0F1320]/95 p-10 shadow-neon backdrop-blur-xl">
        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-[#06B6D4]">Reset access</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Forgot your password?</h1>
          <p className="mt-3 text-slate-400">Enter your account email and receive a password reset token or link instantly.</p>
        </div>

        {error && <div className="mb-5 rounded-3xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {message && <div className="mb-5 rounded-3xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
        {resetToken && (
          <div className="mb-5 rounded-3xl bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
            Reset token: <span className="font-medium text-white break-words">{resetToken}</span>
            <div className="mt-3">
              <Link to={`/reset-password?token=${encodeURIComponent(resetToken)}`} className="text-[#06B6D4] hover:text-[#8b5cf6]">
                Continue to reset password
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-5">
          <label className="block text-sm font-medium text-slate-300">
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-3 w-full rounded-3xl border border-[#1F2937] bg-[#090b14] px-4 py-3 text-white outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-3xl btn-neon px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send reset instructions'}
          </button>
        </form>

        <div className="mt-6 border-t border-[#1F2937] pt-5 text-center text-sm text-slate-500">
          Remembered your password? <Link to="/login" className="text-[#06B6D4] hover:text-[#8b5cf6]">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
