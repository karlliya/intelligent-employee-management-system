import { useEffect, useMemo, useState } from 'react';
import { getUser } from '../lib/auth';
import { buildFormData, request, requestBlob } from '../lib/api';
import { FileText, Mail, Pencil, Phone, Search, UserPlus, X, FileUp } from 'lucide-react';

const emptyForm = {
  emp_id: '',
  name: '',
  department: '',
  position: '',
  role: 'Employee',
  email: '',
  phone: '',
  salary: '',
  skills: '',
  experience_duration: 0,
  years_experience: 0,
  project_assigned: '',
  site_location: '',
  certification: '',
  joined_date: '',
  status: 'Active',
  employment_status: 'Active'
};

const DocumentPreview = ({ preview, onClose }) => preview && (
  <div className="document-preview-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="document-preview" role="dialog" aria-modal="true" aria-label="Employee document preview">
      <div className="document-preview__header">
        <div><strong>Employee document</strong><p>Private document · {preview.employeeName}</p></div>
        <div className="flex items-center gap-2">
          <a href={preview.url} download={`employee-document.${preview.extension}`} className="btn-secondary px-3 py-2 text-sm">Download</a>
          <button type="button" onClick={onClose} aria-label="Close document" title="Close document" className="profile-drawer__close"><X className="h-5 w-5" /></button>
        </div>
      </div>
      {preview.mime === 'application/pdf'
        ? <iframe src={preview.url} title="Employee document" className="document-preview__content" />
        : <img src={preview.url} alt={`Document for ${preview.employeeName}`} className="document-preview__content document-preview__image" />}
    </div>
  </div>
);

const EmployeesPage = () => {
  const user = getUser();
  const canManage = user?.role === 'Admin';
  const canSelfManage = user?.role === 'Employee';
  const canEditProfile = canManage || canSelfManage;
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [documentFile, setDocumentFile] = useState(null);
  const [documentPreview, setDocumentPreview] = useState(null);
  const [openingDocument, setOpeningDocument] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [profileEmployee, setProfileEmployee] = useState(null);
  const [security, setSecurity] = useState({ two_factor_enabled: true, password_changed_at: null });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(() => employees.find((employee) => employee.emp_id === selectedEmployee), [employees, selectedEmployee]);
  const activeProfile = employees.find((employee) => employee.emp_id === profileEmployee?.emp_id) || profileEmployee;

  useEffect(() => () => { if (documentPreview?.url) URL.revokeObjectURL(documentPreview.url); }, [documentPreview]);

  useEffect(() => {
    if (!profileEmployee && !documentPreview) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        if (documentPreview) setDocumentPreview(null);
        else setProfileEmployee(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [profileEmployee, documentPreview]);

  const viewDocument = async (employee) => {
    if (!employee?.document_path || openingDocument) return;
    setOpeningDocument(true);
    try {
      const blob = await requestBlob(`/employees/${encodeURIComponent(employee.emp_id)}/documents`);
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(blob.type)) throw new Error('This document format cannot be previewed.');
      setDocumentPreview({ url: URL.createObjectURL(blob), mime: blob.type, employeeName: employee.name, extension: blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/png' ? 'png' : 'jpg' });
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setOpeningDocument(false);
    }
  };

  const load = async (filters = {}) => {
    const nextSearch = filters.search ?? search;
    const nextDepartment = filters.department ?? department;
    setLoading(true);
    try {
      const [employeeData, departmentData, securityData] = await Promise.all([
        request(`/employees?search=${encodeURIComponent(nextSearch)}&department=${encodeURIComponent(nextDepartment)}`),
        request('/departments'),
        canSelfManage ? request('/auth/security') : Promise.resolve(security)
      ]);
      setEmployees(employeeData);
      setDepartments(departmentData);
      if (canSelfManage) setSecurity(securityData);
      if (!selectedEmployee && employeeData[0]) setSelectedEmployee(employeeData[0].emp_id);
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, department]);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditingId('');
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const startEdit = (employee) => {
    setEditingId(employee.emp_id);
    setSelectedEmployee(employee.emp_id);
    setForm({
      ...emptyForm,
      ...employee,
      salary: employee.salary || '',
      experience_duration: employee.experience_duration || employee.years_experience || 0,
      years_experience: employee.years_experience || employee.experience_duration || 0,
      joined_date: employee.joined_date ? String(employee.joined_date).slice(0, 10) : '',
      employment_status: employee.employment_status || employee.status || 'Active'
    });
    setModalOpen(true);
    setFormError('');
    setMessage('');
  };

  const submitEmployee = async (event) => {
    event.preventDefault();
    if (saving) return;
    setFormError('');
    setSaving(true);
    try {
      let successMessage = 'Employee updated successfully.';
      const payload = {
        ...form,
        salary: Number(form.salary),
        joined_date: form.joined_date || null,
        experience_duration: Number(form.experience_duration || form.years_experience || 0),
        years_experience: Number(form.years_experience || form.experience_duration || 0),
        status: form.employment_status || form.status
      };
      if (editingId) {
        const { emp_id, role, ...updates } = payload;
        const result = await request(`/employees/${encodeURIComponent(editingId)}`, { method: 'PUT', body: JSON.stringify(updates) });
        successMessage = result.message || successMessage;
      } else {
        const result = await request('/employees', { method: 'POST', body: JSON.stringify(payload) });
        successMessage = result.message || 'Employee created and invitation sent.';
        setSearch('');
        setDepartment('');
        setSelectedEmployee(payload.emp_id);
      }
      setModalOpen(false);
      setForm(emptyForm);
      await load(editingId ? {} : { search: '', department: '' });
      setMessage(successMessage);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async (empId) => {
    if (!window.confirm(`Delete employee ${empId}?`)) return;
    try {
      await request(`/employees/${encodeURIComponent(empId)}`, { method: 'DELETE' });
      setMessage('Employee deleted successfully.');
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const uploadDocument = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const targetEmployee = canSelfManage ? employees[0]?.emp_id : selectedEmployee;
    if (!targetEmployee || !documentFile) {
      setMessage('Choose an employee and a PDF/JPG/PNG document first.');
      return;
    }
    try {
      const result = await request(`/employees/${encodeURIComponent(targetEmployee)}/documents`, {
        method: 'POST',
        body: buildFormData({ document: documentFile })
      });
      setDocumentFile(null);
      formElement.reset();
      await load();
      setMessage(result.message);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage('New password and confirmation do not match.');
      return;
    }
    try {
      const result = await request('/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword })
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage(result.message);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const toggle2FA = async () => {
    try {
      const result = await request('/auth/security/2fa', {
        method: 'PUT',
        body: JSON.stringify({ enabled: !security.two_factor_enabled })
      });
      setSecurity((current) => ({ ...current, two_factor_enabled: result.two_factor_enabled }));
      setMessage(result.message);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const fields = [
    ['emp_id', 'Employee ID'],
    ['name', 'Full name'],
    ['email', 'Work email'],
    ['phone', 'Phone'],
    ['position', 'Position'],
    ['salary', 'Salary (MYR)'],
    ['project_assigned', 'Project Assigned'],
    ['site_location', 'Site Location'],
    ['certification', 'Certification'],
    ['skills', 'Skills']
  ];
  const visibleFields = canManage ? fields : fields.filter(([key]) => ['phone', 'skills', 'site_location', 'certification'].includes(key));
  const ownEmployee = employees[0] || null;

  if (canSelfManage) {
    return (
      <section className="space-y-6">
        <div className="section-header">
          <div>
            <p className="section-kicker">Employee Self-Service</p>
            <h1 className="page-title">My Profile</h1>
            <p className="page-subtitle">View your profile, update personal information, upload documents, and manage account security.</p>
          </div>
        </div>

        {message && <div className="status-banner">{message}</div>}

        {loading ? (
          <div className="panel-card text-[var(--muted)]">Loading your profile...</div>
        ) : !ownEmployee ? (
          <div className="panel-card text-[var(--muted)]">No employee profile is linked to this account.</div>
        ) : (
          <>
            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="panel-card">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Personal Record</p>
                    <h2 className="panel-title">{ownEmployee.name}</h2>
                  </div>
                  <button onClick={() => startEdit(ownEmployee)} className="rounded-xl bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300">Update Info</button>
                </div>
                <div className="mt-4 grid gap-3">
                  {[
                    ['Employee ID', ownEmployee.emp_id],
                    ['Department', ownEmployee.department_name || ownEmployee.department],
                    ['Position', ownEmployee.position],
                    ['Email', ownEmployee.email],
                    ['Phone', ownEmployee.phone || '-'],
                    ['Project Assigned', ownEmployee.project_assigned || 'Not assigned'],
                    ['Site Location', ownEmployee.site_location || 'Not assigned'],
                    ['Certification', ownEmployee.certification || 'Not recorded'],
                    ['Skills', ownEmployee.skills || 'Not recorded'],
                    ['Experience', `${ownEmployee.years_experience || ownEmployee.experience_duration || 0} years`],
                    ['Leave Balance', `${ownEmployee.leave_balance ?? 0} days`],
                  ].map(([label, value]) => (
                    <div key={label} className="compact-row">
                      <span className="compact-row__title">{label}</span>
                      <span className="compact-row__meta whitespace-normal text-right">{value}</span>
                    </div>
                  ))}
                  <div className="compact-row"><span className="compact-row__title">Document</span>{ownEmployee.document_path ? <button type="button" onClick={() => viewDocument(ownEmployee)} disabled={openingDocument} className="text-sm font-semibold text-[var(--primary)]">{openingDocument ? 'Opening...' : 'View document'}</button> : <span className="compact-row__meta">Not uploaded</span>}</div>
                </div>
              </div>

              <div className="space-y-5">
                <form onSubmit={uploadDocument} className="panel-card space-y-4">
                  <div className="flex items-center gap-3 text-[var(--text)]">
                    <FileUp className="h-5 w-5 text-cyan-300" />
                    <span className="font-semibold">My Documents</span>
                  </div>
                  <p className="text-sm text-[var(--muted)]">Keep a work certificate or related document with your profile. PDF, JPG or PNG, up to 2MB.</p>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => {
                    setSelectedEmployee(ownEmployee.emp_id);
                    setDocumentFile(e.target.files?.[0] || null);
                  }} className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--muted)]" />
                  <div className="flex flex-wrap gap-2"><button className="btn-secondary rounded-2xl px-4 py-3 text-sm font-semibold">{ownEmployee.document_path ? 'Replace document' : 'Upload document'}</button>{ownEmployee.document_path && <button type="button" onClick={() => viewDocument(ownEmployee)} disabled={openingDocument} className="btn-secondary rounded-2xl px-4 py-3 text-sm font-semibold">{openingDocument ? 'Opening...' : 'View document'}</button>}</div>
                </form>

                <div className="panel-card">
                  <div className="panel-heading">
                    <h2 className="panel-title">Two-Factor Authentication</h2>
                    <span className="panel-chip">{security.two_factor_enabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <p className="text-sm text-[var(--muted)]">OTP verification protects your login session.</p>
                  <button onClick={toggle2FA} className="mt-4 btn-secondary rounded-2xl px-4 py-3 text-sm font-semibold">
                    {security.two_factor_enabled ? 'Disable 2FA' : 'Enable 2FA'}
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={changePassword} className="panel-card max-w-3xl space-y-4">
              <div>
                <p className="section-kicker">Account Security</p>
                <h2 className="panel-title">Change Password</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <input type="password" placeholder="Current password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--text)] outline-none" required />
                <input type="password" placeholder="New strong password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--text)] outline-none" required />
                <input type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--text)] outline-none" required />
              </div>
              <button className="btn-neon rounded-2xl px-5 py-3 text-sm font-semibold">Change Password</button>
            </form>
            <DocumentPreview preview={documentPreview} onClose={() => setDocumentPreview(null)} />
          </>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
            <form onSubmit={submitEmployee} className="panel-card max-h-[92vh] w-full max-w-2xl overflow-auto">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Update Personal Info</p>
                  <h2 className="panel-title">{form.name}</h2>
                </div>
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-2xl bg-[var(--input)] p-2 text-[var(--text)]"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {visibleFields.map(([key, label]) => (
                  <label key={key} className="text-sm text-[var(--muted)]">
                    {label}
                    <input value={form[key] || ''} onChange={(e) => updateForm(key, e.target.value)} className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--text)] outline-none" />
                  </label>
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary rounded-2xl px-4 py-3 text-sm font-semibold">Cancel</button>
                <button className="btn-neon rounded-2xl px-5 py-3 text-sm font-semibold">Save Personal Info</button>
              </div>
            </form>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="section-header">
        <div>
          <p className="section-kicker">Engineering Workforce</p>
          <h1 className="page-title">Employee Management</h1>
          <p className="page-subtitle">Manage engineers, site assignments, certifications, documents, and workforce status.</p>
        </div>
        {canManage && (
          <button onClick={openCreate} className="btn-neon inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
            <UserPlus className="h-4 w-4" /> Add Employee
          </button>
        )}
      </div>

      {message && <div className="status-banner">{message}</div>}

      <div className="panel-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--muted)]">
            <Search className="h-4 w-4" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee name, ID, or email" className="ml-3 w-full border-none bg-transparent text-sm text-[var(--text)] outline-none" />
          </div>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--text)] outline-none">
            <option value="">All Departments</option>
            {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
          </select>
        </div>
      </div>

      <div className="panel-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              <tr>
                <th className="px-5 py-4">Engineer</th>
                <th className="px-5 py-4">Department</th>
                <th className="px-5 py-4">Project / Site</th>
                <th className="px-5 py-4">Certification</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-[var(--muted)]">Loading engineering workforce...</td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-[var(--muted)]">No employees match this filter.</td></tr>
              ) : employees.map((employee) => (
                <tr key={employee.emp_id} className="transition hover:bg-[var(--surface)]">
                  <td className="px-5 py-4">
                    <button onClick={() => setProfileEmployee(employee)} className="text-left">
                      <div className="font-semibold text-[var(--text)]">{employee.name}</div>
                      <div className="text-xs text-[var(--muted)]">{employee.emp_id} | {employee.email}</div>
                    </button>
                  </td>
                  <td className="px-5 py-4 text-[var(--muted)]">{employee.department_name || employee.department || 'Unassigned'}</td>
                  <td className="px-5 py-4 text-[var(--muted)]">
                    <div>{employee.project_assigned || 'No project'}</div>
                    <div className="text-xs">{employee.site_location || 'No site assigned'}</div>
                  </td>
                  <td className="px-5 py-4 text-[var(--muted)]">{employee.certification || '-'}</td>
                  <td className="px-5 py-4"><span className="panel-chip">{employee.employment_status || employee.status}</span></td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setProfileEmployee(employee)} className="rounded-xl bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300">View</button>
                      {canEditProfile && <button onClick={() => startEdit(employee)} className="rounded-xl bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300">Edit</button>}
                      {canManage && <button onClick={() => deleteEmployee(employee.emp_id)} className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEditProfile && (
        <form onSubmit={uploadDocument} className="panel-card flex flex-col gap-3">
          <div className="flex items-center gap-3 text-[var(--text)]"><FileUp className="h-5 w-5 text-cyan-300" /><span className="font-semibold">Employee Documents</span></div>
          <p className="text-sm text-[var(--muted)]">Store work certificates or related records securely. Only Admin and the employee can view them. PDF, JPG or PNG, maximum 2MB.</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--text)] outline-none">
            <option value="">Choose employee</option>
            {employees.map((employee) => <option key={employee.emp_id} value={employee.emp_id}>{employee.name} ({employee.emp_id})</option>)}
          </select>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--muted)]" />
          <button className="btn-secondary rounded-2xl px-4 py-3 text-sm font-semibold">Upload</button>
          {selected?.document_path && <button type="button" onClick={() => viewDocument(selected)} disabled={openingDocument} className="btn-secondary rounded-2xl px-4 py-3 text-sm font-semibold">{openingDocument ? 'Opening...' : 'View document'}</button>}
          </div>
        </form>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form onSubmit={submitEmployee} className="panel-card max-h-[92vh] w-full max-w-5xl overflow-auto">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{editingId ? 'Edit Profile' : 'New Engineering Staff'}</p>
                <h2 className="panel-title">{editingId ? form.name : 'Add Employee'}</h2>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-2xl bg-[var(--input)] p-2 text-[var(--text)]"><X className="h-4 w-4" /></button>
            </div>
            {formError && <div role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{formError}</div>}
            {!editingId && <p className="mb-4 text-sm text-[var(--muted)]">Use the employee's real email address. They will receive an invitation to set their password.</p>}
            <div className="grid gap-4 md:grid-cols-2">
              {visibleFields.map(([key, label]) => (
                <label key={key} className="text-sm text-[var(--muted)]">
                  {label}
                  <input value={form[key] || ''} onChange={(e) => updateForm(key, e.target.value)} disabled={key === 'emp_id' && !!editingId} type={key === 'email' ? 'email' : key === 'salary' ? 'number' : key === 'phone' ? 'tel' : 'text'} min={key === 'salary' ? '0' : undefined} step={key === 'salary' ? '0.01' : undefined} className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--text)] outline-none disabled:opacity-60" required={['emp_id', 'name', 'email', 'position', 'salary'].includes(key)} />
                </label>
              ))}
              {canManage && (
                <>
                  <label className="text-sm text-[var(--muted)]">
                    Department
                    <select value={form.department} onChange={(e) => updateForm('department', e.target.value)} className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--text)] outline-none" required>
                      <option value="">Choose department</option>
                      {departments.map((dept) => <option key={dept.id} value={dept.name}>{dept.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm text-[var(--muted)]">
                    Years Experience
                    <input type="number" min="0" value={form.years_experience || form.experience_duration || 0} onChange={(e) => { updateForm('years_experience', e.target.value); updateForm('experience_duration', e.target.value); }} className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--text)] outline-none" />
                  </label>
                  <label className="text-sm text-[var(--muted)]">
                    Employment Status
                    <select value={form.employment_status || form.status} onChange={(e) => { updateForm('employment_status', e.target.value); updateForm('status', e.target.value); }} className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--text)] outline-none">
                      {['Active', 'On Site', 'On Leave', 'Inactive'].map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="text-sm text-[var(--muted)]">
                    Joined Date
                    <input type="date" value={form.joined_date || ''} onChange={(e) => updateForm('joined_date', e.target.value)} className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-[var(--text)] outline-none" />
                  </label>
                </>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary rounded-2xl px-4 py-3 text-sm font-semibold">Cancel</button>
              <button disabled={saving} className="btn-neon rounded-2xl px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-60">{saving ? (editingId ? 'Saving...' : 'Sending invitation...') : editingId ? 'Save Changes' : 'Create Employee'}</button>
            </div>
          </form>
        </div>
      )}

      {activeProfile && (
        <div className="profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileEmployee(null); }}>
          <aside className="profile-drawer" role="dialog" aria-modal="true" aria-labelledby="profile-title">
            <div className="profile-drawer__header">
              <div className="profile-avatar" aria-hidden="true">{String(activeProfile.name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
              <div className="min-w-0">
                <p className="section-kicker">Employee profile</p>
                <h2 id="profile-title" className="profile-drawer__name">{activeProfile.name}</h2>
                <p className="profile-drawer__subtitle">{activeProfile.position || 'Position not set'} | {activeProfile.department_name || activeProfile.department || 'Department not set'}</p>
                <div className="profile-drawer__badges">
                  <span className="panel-chip">{activeProfile.emp_id}</span>
                  <span className="panel-chip">{activeProfile.employment_status || activeProfile.status || 'Unknown status'}</span>
                </div>
              </div>
              <button type="button" title="Close profile" aria-label="Close profile" onClick={() => setProfileEmployee(null)} className="profile-drawer__close"><X className="h-5 w-5" /></button>
            </div>

            <div className="profile-drawer__body">
              <section className="profile-section">
                <h3>Contact</h3>
                <div className="profile-contact"><Mail className="h-4 w-4" /><span className="break-all">{activeProfile.email || 'No email recorded'}</span></div>
                <div className="profile-contact"><Phone className="h-4 w-4" /><span>{activeProfile.phone || 'No phone recorded'}</span></div>
              </section>

              <section className="profile-section">
                <h3>Work details</h3>
                <dl className="profile-details">
                  <div><dt>Project</dt><dd>{activeProfile.project_assigned || 'Not assigned'}</dd></div>
                  <div><dt>Site</dt><dd>{activeProfile.site_location || 'Not assigned'}</dd></div>
                  <div><dt>Experience</dt><dd>{activeProfile.years_experience ?? activeProfile.experience_duration ?? 0} years</dd></div>
                  <div><dt>Joined</dt><dd>{activeProfile.joined_date ? new Date(activeProfile.joined_date).toLocaleDateString() : 'Not recorded'}</dd></div>
                  {canManage && <div><dt>Salary</dt><dd>MYR {Number(activeProfile.salary || 0).toLocaleString()}</dd></div>}
                </dl>
              </section>

              <section className="profile-section">
                <h3>Skills & certification</h3>
                <div className="profile-skills">
                  {String(activeProfile.skills || '').split(',').map((skill) => skill.trim()).filter(Boolean).map((skill) => <span key={skill}>{skill}</span>)}
                  {!activeProfile.skills && <p className="profile-empty">No skills recorded</p>}
                </div>
                <p className="profile-note">Certification: {activeProfile.certification || 'Not recorded'}</p>
              </section>

              <section className="profile-section">
                <h3>Document</h3>
                <div className="profile-contact"><FileText className="h-4 w-4" /><span>{activeProfile.document_path ? 'Document uploaded' : 'No document uploaded'}</span></div>
                {activeProfile.document_path && <button type="button" onClick={() => viewDocument(activeProfile)} disabled={openingDocument} className="mt-3 text-sm font-semibold text-[var(--primary)]">{openingDocument ? 'Opening...' : 'View document'}</button>}
              </section>
            </div>

            {canManage && <div className="profile-drawer__footer"><button type="button" className="btn-neon inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold" onClick={() => { startEdit(activeProfile); setProfileEmployee(null); }}><Pencil className="h-4 w-4" /> Edit employee</button></div>}
          </aside>
        </div>
      )}
      <DocumentPreview preview={documentPreview} onClose={() => setDocumentPreview(null)} />
    </section>
  );
};

export default EmployeesPage;
