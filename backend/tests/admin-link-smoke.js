const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db');

async function main() {
  const [admins] = await db.query(
    'SELECT u.id, u.email, u.role, e.emp_id, e.email AS profile_email FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE u.role = ? ORDER BY u.id',
    ['Admin']
  );
  assert.equal(admins.length, 3);
  admins.forEach((admin) => {
    assert.ok(admin.emp_id, `Admin ${admin.id} must have a profile`);
    assert.equal(admin.profile_email, admin.email);
  });
  const gmailAdmin = admins.find((admin) => admin.email === 'musthaffahaikal@gmail.com');
  assert.ok(gmailAdmin, 'Gmail Admin must exist');
  const token = jwt.sign({ id: gmailAdmin.id, email: gmailAdmin.email, role: gmailAdmin.role, emp_id: gmailAdmin.emp_id }, process.env.JWT_SECRET, { expiresIn: '1m' });
  for (const route of ['/api/auth/me', '/api/dashboard/stats', '/api/employees']) {
    const response = await fetch(`http://localhost:5000${route}`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200, `${route}: ${await response.text()}`);
  }
  console.log('Three Admin profiles linked; Gmail Admin auth, dashboard, and employees API passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.end());
