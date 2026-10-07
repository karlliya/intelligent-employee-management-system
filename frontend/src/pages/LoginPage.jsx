import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import HamarisaLogo from '../components/HamarisaLogo';
import { getToken } from '../lib/auth';
import { apiUrl } from '../lib/api';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo === '/attendance' ? '/attendance' : '/';

  useEffect(() => { if (getToken()) navigate(returnTo, { replace: true }); }, [navigate, returnTo]);
  useEffect(() => { if (location.state?.message) setError(location.state.message); }, [location.state]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLocalOnly(false);
    if (!email || !password) return setError('Email and password are required.');
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) {
        setLocalOnly(result.code === 'LOCAL_SAMPLE_ONLY');
        throw new Error(result.error || 'Login failed');
      }
      navigate('/verify-otp', { state: { userId: result.verificationId, email: result.email, devOtp: result.devOtp || '', returnTo } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <section className="auth-brand-panel">
          <HamarisaLogo className="auth-logo" />
          <div><p className="auth-eyebrow">Hamarisa Trading Sdn Bhd</p><h1>Intelligent Employee Management</h1><p className="auth-copy">Secure workforce operations, engineering attendance, leave, performance and intelligent recommendations in one trusted platform.</p></div>
          <div className="auth-trust-grid"><span><CheckCircle2 /> Email OTP</span><span><CheckCircle2 /> Role access</span><span><CheckCircle2 /> Audit logging</span><span><CheckCircle2 /> Secure QR attendance</span></div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-heading"><div className="auth-lock"><LockKeyhole /></div><p className="auth-eyebrow">Secure access</p><h2>Welcome back</h2><p>Sign in with your company account. A verification code will be sent after your password is confirmed.</p></div>
          {error && <div className="auth-error"><AlertCircle /><span>{error}{localOnly && ['localhost', '127.0.0.1'].includes(window.location.hostname) && <a href="http://127.0.0.1:5001/login" className="mt-2 block font-semibold underline">Open local sample login</a>}</span></div>}
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="auth-label">Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" disabled={loading} required /></label>
            <label className="auth-label">Password<div className="auth-password"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" disabled={loading} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
            <div className="flex items-center justify-end"><Link to="/forgot-password" state={{ email }} className="auth-link">Forgot password?</Link></div>
            <button type="submit" disabled={loading} className="btn-neon w-full rounded-full px-5 py-3.5 font-semibold disabled:opacity-60">{loading ? 'Sending verification code...' : 'Continue securely'}</button>
          </form>
          <p className="auth-footer">Need an account? Contact your administrator.</p>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
