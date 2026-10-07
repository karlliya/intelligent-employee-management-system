import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUrl } from '../lib/api';

const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationLink, setVerificationLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.errors?.join(', ') || 'Registration failed');
      }

      setSuccess(result.message || 'Registration successful. Verify your email before logging in.');
      setVerificationToken(result.verificationToken || '');
      setVerificationLink(result.verificationLink || '');
      setName('');
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
          <p className="text-sm uppercase tracking-[0.35em] text-[#06B6D4]">Secure onboarding</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Create your account</h1>
          <p className="mt-3 text-slate-400">Register securely with IEMS and join the intelligent employee management dashboard.</p>
        </div>

        {error && <div className="mb-5 rounded-3xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {success && <div className="mb-5 rounded-3xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>}
        {verificationToken && (
          <div className="mb-5 rounded-3xl bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
            Verification token: <span className="font-medium text-white break-words">{verificationToken}</span>
          </div>
        )}
        {verificationLink && (
          <a href={verificationLink} className="mb-5 block rounded-3xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm font-semibold text-amber-200">
            Verify this account now
          </a>
        )}

        <form onSubmit={handleSubmit} className="grid gap-5">
          <label className="block text-sm font-medium text-slate-300">
            Full name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-3 w-full rounded-3xl border border-[#1F2937] bg-[#090b14] px-4 py-3 text-white outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              required
            />
          </label>

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

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-300">
              Password
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

          <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-[#2563EB] focus:ring-[#2563EB]"
              />
              Show password
            </label>
            <Link to="/login" className="text-[#06B6D4] hover:text-[#8b5cf6]">Already have an account?</Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-3xl btn-neon px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Registering…' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 border-t border-[#1F2937] pt-5 text-center text-sm text-slate-500">
          Already registered? <Link to="/login" className="text-[#06B6D4] hover:text-[#8b5cf6]">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
