const crypto = require('node:crypto');
const db = require('../backend/db');
const { hashPassword, validatePassword } = require('../backend/security');

const [email, empId, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ').trim();

if (!/^[a-z0-9._-]+@iems\.local$/i.test(email || '') || !/^[A-Z0-9-]{3,50}$/.test(empId || '') || name.length < 2 || name.length > 100) {
  throw new Error('Usage: node scripts/create-local-employee.js employee.name@iems.local EMP010 "Employee Name"');
}
if ((process.env.DB_NAME || 'employee_management') !== 'employee_management' || process.env.NODE_ENV === 'production') {
  throw new Error('Local employee setup is only allowed in the local IEMS database.');
}

const password = `${crypto.randomBytes(18).toString('base64url')}Aa1!`;
if (!validatePassword(password)) throw new Error('Generated password did not meet IEMS requirements.');

async function api(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:5001/api${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error || response.status}`);
  return data;
}

async function main() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    const [employees] = await connection.query('SELECT emp_id FROM employees WHERE emp_id = ? OR email = ? LIMIT 1', [empId, email]);
    if (users.length || employees.length) throw new Error('Employee ID or email already exists. No account was changed.');

    const department = 'Mechanical Engineering';
    const [[departmentRow]] = await connection.query('SELECT id FROM departments WHERE name = ? LIMIT 1', [department]);
    if (!departmentRow) throw new Error('Mechanical Engineering department is missing. No account was created.');

    const [result] = await connection.query(
      `INSERT INTO users (email, password, role, email_verified, email_verified_at, name)
       VALUES (?, ?, 'Employee', 1, NOW(), ?)`,
      [email, await hashPassword(password), name]
    );
    await connection.query(
      `INSERT INTO employees (emp_id, user_id, name, department, department_id, position, role, email, status, joined_date, salary, employment_status)
       VALUES (?, ?, ?, ?, ?, 'Demo Engineer', 'Employee', ?, 'Active', CURDATE(), 0, 'Active')`,
      [empId, result.insertId, name, department, departmentRow.id, email]
    );
    await connection.query(
      `INSERT INTO audit_logs (user_email, user, action, ip_address, result, timestamp)
       VALUES ('local-setup@iems.local', 'Local setup', ?, '127.0.0.1', 'Success', NOW())`,
      [`Created local demo employee ${empId}`]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  console.log(`Created ${name} (${empId})`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);

  const login = await api('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!/^\d{6}$/.test(login.devOtp || '')) throw new Error('Local OTP was not returned by the sample server.');
  const verified = await api('/auth/verify-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: login.verificationId, otpCode: login.devOtp })
  });
  if (verified.user.role !== 'Employee' || verified.user.emp_id !== empId) {
    throw new Error('Employee login did not link to the expected profile.');
  }
  const own = await api('/employees', { headers: { Authorization: `Bearer ${verified.token}` } });
  if (own.length !== 1 || own[0].emp_id !== empId) throw new Error('Employee profile access check failed.');
  await api('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${verified.token}` } });
  console.log('Local login, OTP, profile access, and logout verified.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
