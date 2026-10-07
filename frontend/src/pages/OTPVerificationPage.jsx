import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { saveAuth } from '../lib/auth';
import { apiUrl } from '../lib/api';
import { Clock, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

const OTPVerificationPage = ({ onLogin }) => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [countdown, setCountdown] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state || {};
  const { userId, email } = state;
  const returnTo = state.returnTo === '/attendance' ? '/attendance' : '/';
  const localSampleWithoutCode = String(email || '').toLowerCase().endsWith('@iems.local') && !devOtp;
  const onProjectComputer = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  useEffect(() => {
    setDevOtp(state.devOtp || '');
  }, [state.devOtp]);

  useEffect(() => {
    if (!userId) {
      navigate('/login');
      return;
    }
  }, [userId, navigate]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const formatCountdown = () => {
    const mins = Math.floor(countdown / 60);
    const secs = countdown % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOTPChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(value);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (otp.length !== 6) {
      setError('Please enter 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl('/auth/verify-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, otpCode: otp })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Verification failed');
      }

      setSuccess('Verification successful! Opening your workspace...');
      saveAuth(result.token, result.user, result.refreshToken);
      onLogin(result.user);

      setTimeout(() => {
        navigate(returnTo, { replace: true });
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(apiUrl('/auth/resend-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Resend failed');
      }

      setSuccess(result.message || 'New verification code is ready.');
      setDevOtp(result.devOtp || '');
      setOtp('');
      setCountdown(300);
      setCanResend(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07070e] px-4 py-10 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(230,0,122,0.15),transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(6,182,212,0.12),transparent_26%)] pointer-events-none" />
      <div className="w-full max-w-2xl rounded-[32px] border border-[#2B2F3B] bg-[#0F1320]/95 p-10 shadow-neon backdrop-blur-xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB]/20 to-[#8B5CF6]/20">
            <Shield className="h-8 w-8 text-[#2563EB]" />
          </div>
          <p className="text-sm uppercase tracking-[0.35em] text-[#06B6D4]">Secure verification</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Verify your identity</h1>
          <p className="mt-3 text-slate-400">
            {devOtp ? 'Use the local 6-digit code for this development login' : localSampleWithoutCode ? 'This sample address cannot receive email OTP' : 'A 6-digit code has been sent to'}<br />
            <span className="font-medium text-slate-300">{email}</span>
          </p>
        </div>

        {localSampleWithoutCode && (
          <div role="alert" className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Sign in again on the IEMS computer at <strong>http://127.0.0.1:5001/login</strong>. The local OTP will appear here.
            {onProjectComputer && <a href="http://127.0.0.1:5001/login" className="mt-2 block font-semibold underline">Open local sample login</a>}
          </div>
        )}

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-3xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-start gap-3 rounded-3xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {devOtp && (
          <div className="mb-5 rounded-3xl bg-slate-900/80 px-4 py-4 text-center text-sm text-slate-300">
            Local OTP
            <div className="mt-2 font-mono text-3xl font-bold tracking-[0.35em] text-white">{devOtp}</div>
          </div>
        )}

        <form onSubmit={handleVerify} className="grid gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Enter 6-digit code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength="6"
              value={otp}
              onChange={handleOTPChange}
              placeholder="000000"
              className="w-full rounded-3xl border border-[#1F2937] bg-[#090b14] px-6 py-4 text-center text-2xl font-bold tracking-[0.5em] text-white outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              disabled={loading || success}
            />
            <p className="mt-2 text-xs text-slate-500">
              Only numbers allowed
            </p>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-slate-900/50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Clock className="h-4 w-4" />
              {countdown > 0 ? (
                <>
                  Code expires in <span className="font-medium">{formatCountdown()}</span>
                </>
              ) : (
                <span className="text-rose-400">Code expired</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleResend}
              disabled={!canResend || resendLoading || success}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition ${
                canResend && !resendLoading && !success
                  ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  : 'cursor-not-allowed text-slate-500'
              }`}
            >
              <RefreshCw className={`h-4 w-4 ${resendLoading ? 'animate-spin' : ''}`} />
              {resendLoading ? 'Sending...' : canResend ? 'Resend code' : 'Resend'}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || success || otp.length !== 6}
            className="inline-flex w-full items-center justify-center rounded-3xl btn-neon px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Verifying...' : success ? 'Redirecting...' : 'Verify and login'}
          </button>
        </form>

        <div className="mt-8 border-t border-[#1F2937] pt-6 text-center text-sm text-slate-500">
          Didn't receive the code? Check your spam folder or <button onClick={handleResend} disabled={!canResend} className="text-[#06B6D4] hover:text-[#8b5cf6] disabled:text-slate-600">try again</button>
        </div>
      </div>
    </div>
  );
};

const Shield = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default OTPVerificationPage;
