import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiUrl } from '../lib/api';

const VerifyEmailPage = () => {
  const location = useLocation();
  const [messages, setMessages] = useState({ success: '', error: '', loading: false });

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get('token');
    if (!token) {
      setMessages({ success: '', error: 'Verification token is missing.', loading: false });
      return;
    }

    async function verify() {
      setMessages({ success: '', error: '', loading: true });
      try {
        const response = await fetch(apiUrl(`/auth/verify-email?token=${encodeURIComponent(token)}`));
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Verification failed');
        }
        setMessages({ success: result.message || 'Email verified successfully.', error: '', loading: false });
      } catch (err) {
        setMessages({ success: '', error: err.message, loading: false });
      }
    }

    verify();
  }, [location.search]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07070e] px-4 py-10 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(230,0,122,0.15),transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(6,182,212,0.12),transparent_26%)] pointer-events-none" />
      <div className="w-full max-w-xl rounded-[32px] border border-[#2B2F3B] bg-[#0F1320]/95 p-10 shadow-neon backdrop-blur-xl text-center">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.35em] text-[#06B6D4]">Email verification</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Activate your account</h1>
          <p className="mt-3 text-slate-400">We are checking your verification token. This may take a moment.</p>
        </div>

        {messages.loading && <p className="text-sm text-slate-300">Verifying token…</p>}
        {messages.error && <div className="rounded-3xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{messages.error}</div>}
        {messages.success && <div className="rounded-3xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{messages.success}</div>}

        <div className="mt-8 text-sm text-slate-400">
          <Link to="/login" className="text-[#06B6D4] hover:text-[#8b5cf6]">Return to sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
