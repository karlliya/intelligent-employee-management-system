const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db');

async function main() {
  const [[admin]] = await db.query('SELECT id, email, role, name FROM users WHERE email = ?', ['musthaffahaikal@gmail.com']);
  const [[profile]] = await db.query('SELECT emp_id, name, joined_date FROM employees WHERE user_id = ?', [admin.id]);
  assert.ok(admin && profile, 'Linked Admin profile is required');
  const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1m' });
  const response = await fetch(`http://localhost:5000/api/employees/${encodeURIComponent(profile.emp_id)}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ name: profile.name, joined_date: profile.joined_date ? String(profile.joined_date).slice(0, 10) : '' })
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const [[after]] = await db.query('SELECT name, joined_date FROM employees WHERE emp_id = ?', [profile.emp_id]);
  assert.equal(after.name, profile.name);
  assert.equal(after.joined_date?.toISOString?.() || null, profile.joined_date?.toISOString?.() || null);
  console.log('Admin profile update passed; name and optional joined date unchanged.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.end());
