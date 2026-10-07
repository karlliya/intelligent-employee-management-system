import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getToken } from '../lib/auth';
import { apiUrl } from '../lib/api';

const ResetPasswordPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tokenParam = searchParams.get('token');
    const emailParam = searchParams.get('email');
    if (tokenParam) setToken(tokenParam);
    if (emailParam) setEmail(emailParam);
  }, [location.search]);

  useEffect(() => {
    if (getToken()) {
      navigate('/');
    }
  }, [navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!token) {
      setError('Reset token is required to complete the process.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl('/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to reset password');
      }

      setMessage(result.message || 'Password reset complete. You can now sign in.');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07070e] px-4 py-10 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(230,0,122,0.15),transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(6,182,212,0.12),transparent_26%)] pointer-events-none" />
      <div className="w-full max-w-3xl rounded-[32px] border border-[#2B2F3B] bg-[#0F1320]/95 p-10 shadow-neon backdrop-blur-xl">
        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-[#06B6D4]">Secure recovery</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Reset your password</h1>
          <p className="mt-3 text-slate-400">Use your reset token to create a stronger password and regain access.</p>
        </div>

        {error && <div className="mb-5 rounded-3xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {message && <div className="mb-5 rounded-3xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}

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

          <label className="block text-sm font-medium text-slate-300">
            Reset token
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-3 w-full rounded-3xl border border-[#1F2937] bg-[#090b14] px-4 py-3 text-white outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              required
            />
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-300">
              New password
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-3 w-full rounded-3xl border border-[#1F2937] bg-[#090b14] px-4 py-3 text-white outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                required
              />
            </label>
            <label className="block text-sm font-medium text-slate-300">
              Confirm password
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-3 w-full rounded-3xl border border-[#1F2937] bg-[#090b14] px-4 py-3 text-white outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                required
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-[#2563EB] focus:ring-[#2563EB]"
            />
            Show password
          </label>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-3xl btn-neon px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>

        <div className="mt-6 border-t border-[#1F2937] pt-5 text-center text-sm text-slate-500">
          Remember your account? <Link to="/login" className="text-[#06B6D4] hover:text-[#8b5cf6]">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
