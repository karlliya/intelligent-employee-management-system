const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db');

async function main() {
  const [[admin]] = await db.query('SELECT id, email, role FROM users WHERE role = ? LIMIT 1', ['Admin']);
  const [[existing]] = await db.query('SELECT emp_id, email, department_id FROM employees WHERE department_id IS NOT NULL LIMIT 1');
  assert.ok(admin, 'Admin account is required');
  assert.ok(existing, 'Existing employee is required');

  const token = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '1m' });
  const payload = {
    emp_id: existing.emp_id,
    name: 'Creation Smoke Test',
    department: 'Administration',
    position: 'Test',
    salary: 1000,
    role: 'Employee',
    email: existing.email
  };
  const response = await fetch('http://localhost:5000/api/employees', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      origin: 'http://localhost:3000'
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  assert.equal(response.status, 409, JSON.stringify(body));
  assert.match(body.error, /already in use/i);
  console.log('Admin Add Employee API: authorization and duplicate validation passed (409).');

  const filtered = await fetch(`http://localhost:5000/api/employees?department=${existing.department_id}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(filtered.status, 200);
  assert.ok((await filtered.json()).some((employee) => employee.emp_id === existing.emp_id));
  console.log('Department filter includes linked employee profiles.');

  const invalidDepartmentId = `SMOKE${Date.now()}`;
  const invalidDepartment = await fetch('http://localhost:5000/api/employees', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({
      emp_id: invalidDepartmentId,
      name: 'Temporary Test',
      department: 'Not a real department',
      position: 'Test',
      salary: 1000,
      role: 'Employee',
      email: `${invalidDepartmentId.toLowerCase()}@example.invalid`
    })
  });
  assert.equal(invalidDepartment.status, 400);
  assert.match((await invalidDepartment.json()).error, /valid department/i);
  const [[notCreated]] = await db.query('SELECT COUNT(*) AS total FROM users WHERE email = ?', [`${invalidDepartmentId.toLowerCase()}@example.invalid`]);
  assert.equal(notCreated.total, 0);
  console.log('Invalid department rejected without creating a login account.');

  const connection = await db.getConnection();
  const testId = `SMOKE${Date.now()}`;
  try {
    await connection.beginTransaction();
    const [user] = await connection.query(
      'INSERT INTO users (email, password, role, email_verified, name) VALUES (?, ?, ?, 0, ?)',
      [`${testId.toLowerCase()}@example.invalid`, 'not-a-usable-password', 'Employee', 'Temporary Test']
    );
    await connection.query(
      `INSERT INTO employees (emp_id, user_id, name, department, position, role, email, phone, salary, skills, experience_duration, joined_date, project_assigned, site_location, certification, years_experience, employment_status, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [testId, user.insertId, 'Temporary Test', 'Administration', 'Test', 'Employee', `${testId.toLowerCase()}@example.invalid`, null, 1000, null, 0, null, null, null, null, 0, 'Active', 'Active']
    );
    await connection.query('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))', [user.insertId, 'smoke-test-token']);
    console.log('Employee, login account, and invitation token insertions passed.');
  } finally {
    await connection.rollback();
    connection.release();
  }
  const [[remaining]] = await db.query('SELECT COUNT(*) AS count FROM employees WHERE emp_id = ?', [testId]);
  assert.equal(remaining.count, 0, 'Smoke test employee must not be persisted');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.end());
