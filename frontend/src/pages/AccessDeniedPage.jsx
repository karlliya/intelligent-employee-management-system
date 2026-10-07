import { Link, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { getUser } from '../lib/auth';

const AccessDeniedPage = () => {
  const location = useLocation();
  const user = getUser();

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
      <div className="panel-card w-full text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl border border-rose-400/25 bg-rose-500/10 text-rose-300">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <p className="section-kicker">Role-Based Access Control</p>
        <h1 className="page-title">Access Denied</h1>
        <p className="page-subtitle mx-auto max-w-xl">
          Your current role ({user?.role || 'Unknown'}) is not allowed to open this page.
          {location.state?.from ? ` Requested route: ${location.state.from}.` : ''}
        </p>
        <div className="mt-6 flex justify-center">
          <Link className="btn-neon rounded-2xl px-5 py-3 text-sm font-semibold" to="/">Back to Dashboard</Link>
        </div>
      </div>
    </section>
  );
};

export default AccessDeniedPage;
