const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db');

async function main() {
  const [[admin]] = await db.query('SELECT id, email, role FROM users WHERE role = ? LIMIT 1', ['Admin']);
  const [[documentOwner]] = await db.query('SELECT emp_id, user_id FROM employees WHERE document_path IS NOT NULL LIMIT 1');
  const [[otherEmployee]] = await db.query('SELECT u.id, u.email, u.role FROM users u JOIN employees e ON e.user_id = u.id WHERE u.role = ? AND e.emp_id <> ? LIMIT 1', ['Employee', documentOwner.emp_id]);
  assert.ok(admin && documentOwner && otherEmployee, 'Admin, document, and a different employee are required');

  const url = `http://localhost:5000/api/employees/${encodeURIComponent(documentOwner.emp_id)}/documents`;
  const tokenFor = (user) => jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1m' });
  const unauthorized = await fetch(url);
  assert.equal(unauthorized.status, 401);
  const forbidden = await fetch(url, { headers: { authorization: `Bearer ${tokenFor(otherEmployee)}` } });
  assert.equal(forbidden.status, 403);
  const allowed = await fetch(url, { headers: { authorization: `Bearer ${tokenFor(admin)}` } });
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get('content-type'), /^(application\/pdf|image\/(jpeg|png))/);
  assert.ok((await allowed.arrayBuffer()).byteLength > 0);
  console.log('Document preview: anonymous 401, other employee 403, Admin 200 with nonempty file.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.end());
