import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import { getUser } from '../lib/auth';
import { Building2, Plus, ShieldCheck, Trash2 } from 'lucide-react';

const SettingsPage = () => {
  const user = getUser();
  const canEdit = user?.role === 'Admin';
  const [settings, setSettings] = useState({
    company_name: 'IEMS Dashboard',
    work_start_time: '09:00',
    session_timeout_minutes: '120',
    leave_conflict_limit: '3',
    security_2fa: '1',
    security_rbac: '1',
    security_audit_logging: '1',
    security_csrf: '1',
    security_file_upload_protection: '1'
  });
  const [departments, setDepartments] = useState([]);
  const [departmentForm, setDepartmentForm] = useState({ name: '', code: '', description: '' });
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [settingData, departmentData] = await Promise.all([
        request('/settings'),
        request('/departments')
      ]);
      setSettings((current) => ({ ...current, ...settingData }));
      setDepartments(departmentData);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  const saveSettings = async (event) => {
    event.preventDefault();
    setMessage('Saving settings...');
    try {
      await Promise.all(Object.entries(settings).map(([key, value]) =>
        request(`/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) })
      ));
      setMessage('Settings updated successfully.');
    } catch (error) {
      setMessage(error.message);
    }
  };

  const addDepartment = async (event) => {
    event.preventDefault();
    setMessage('Creating department...');
    try {
      await request('/departments', { method: 'POST', body: JSON.stringify(departmentForm) });
      setDepartmentForm({ name: '', code: '', description: '' });
      setMessage('Department created successfully.');
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteDepartment = async (id) => {
    if (!window.confirm('Delete this department?')) return;
    setMessage('Deleting department...');
    try {
      await request(`/departments/${id}`, { method: 'DELETE' });
      setMessage('Department deleted successfully.');
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section className="space-y-6">
      <div><p className="section-kicker">Administration</p><h1 className="page-title">System Settings</h1><p className="page-subtitle">Manage company security, working rules and departments.</p></div>

      {message && <div className="status-banner">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <form onSubmit={saveSettings} className="panel-card">
          <div className="panel-heading"><div><h2 className="panel-title">Company & Security</h2><p className="mt-1 text-sm text-[var(--muted)]">Core rules applied across IEMS.</p></div><ShieldCheck className="h-5 w-5 text-[var(--primary)]" /></div>
          <div className="mt-5 space-y-4">
            <label className="form-label">
              Company name
              <input value={settings.company_name} onChange={(e) => updateSetting('company_name', e.target.value)} disabled={!canEdit} className="form-control disabled:opacity-60" />
            </label>
            <label className="form-label">
              Work start time
              <input type="time" value={settings.work_start_time} onChange={(e) => updateSetting('work_start_time', e.target.value)} disabled={!canEdit} className="form-control disabled:opacity-60" />
            </label>
            <label className="form-label">
              Session timeout minutes
              <input type="number" min="15" value={settings.session_timeout_minutes} onChange={(e) => updateSetting('session_timeout_minutes', e.target.value)} disabled={!canEdit} className="form-control disabled:opacity-60" />
            </label>
            <label className="form-label">
              Leave conflict limit
              <input type="number" min="1" value={settings.leave_conflict_limit} onChange={(e) => updateSetting('leave_conflict_limit', e.target.value)} disabled={!canEdit} className="form-control disabled:opacity-60" />
            </label>
            {[
              ['security_2fa', '2FA'],
              ['security_rbac', 'RBAC'],
              ['security_audit_logging', 'Audit Logging'],
              ['security_csrf', 'CSRF Protection'],
              ['security_file_upload_protection', 'File Upload Protection']
            ].map(([key, label]) => (
              <label key={key} className="setting-toggle">
                <span>{label}</span>
                <input type="checkbox" checked={String(settings[key] ?? '1') === '1'} onChange={(e) => updateSetting(key, e.target.checked ? '1' : '0')} disabled={!canEdit} className="h-4 w-4" />
              </label>
            ))}
            {canEdit && <button type="submit" className="w-full rounded-xl btn-neon px-5 py-3 text-sm font-semibold">Save Settings</button>}
          </div>
        </form>

        <div className="panel-card">
          <div className="panel-heading"><div><h2 className="panel-title">Departments</h2><p className="mt-1 text-sm text-[var(--muted)]">Engineering and administration units.</p></div><Building2 className="h-5 w-5 text-[var(--primary)]" /></div>
          {canEdit && (
            <form onSubmit={addDepartment} className="mt-5 grid gap-3 md:grid-cols-[1fr_0.6fr_1fr_auto]">
              <input value={departmentForm.name} onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })} placeholder="Department name" className="rounded-3xl border border-[#1F2937] bg-[#090b14] px-4 py-3 text-white outline-none" required />
              <input value={departmentForm.code} onChange={(e) => setDepartmentForm({ ...departmentForm, code: e.target.value })} placeholder="Code" className="rounded-3xl border border-[#1F2937] bg-[#090b14] px-4 py-3 text-white outline-none" />
              <input value={departmentForm.description} onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })} placeholder="Description" className="rounded-3xl border border-[#1F2937] bg-[#090b14] px-4 py-3 text-white outline-none" />
              <button type="submit" className="btn-secondary inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold"><Plus className="mr-2 h-4 w-4" />Add</button>
            </form>
          )}
          <div className="mt-5 max-h-[520px] space-y-3 overflow-auto">
            {departments.map((department) => (
              <div key={department.id} className="request-row flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-white">{department.name}</div>
                  <div className="text-sm text-slate-400">{department.code || 'No code'} - {department.description || 'No description'}</div>
                </div>
                {canEdit && <button type="button" onClick={() => deleteDepartment(department.id)} className="action-reject"><Trash2 className="h-4 w-4" />Delete</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SettingsPage;
