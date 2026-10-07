const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

if (!/^iems_feedback_test_[a-z0-9_]+$/i.test(process.env.DB_NAME || '')) {
  throw new Error('Set DB_NAME to an isolated iems_feedback_test_* database before running this smoke test.');
}

const base = process.env.ATTENDANCE_TEST_URL || 'http://127.0.0.1:5002';

async function api(path, user, method = 'GET', body) {
  const token = user && jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'smoke-test', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, data: await response.json() };
}

async function addUser(role, suffix, password) {
  const email = `qr.${suffix}@test.invalid`;
  const [result] = await db.query(
    'INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)',
    [email, password, role, `QR Test ${suffix}`]
  );
  const user = { id: result.insertId, email, role };
  if (role === 'Employee') {
    const empId = `QR-${suffix}`;
    await db.query(
      'INSERT INTO employees (emp_id, user_id, name, email, department, role) VALUES (?, ?, ?, ?, ?, ?)',
      [empId, user.id, `QR Test ${suffix}`, email, 'Mechanical Engineering', role]
    );
    user.empId = empId;
  }
  return user;
}

async function latestToken(action) {
  const [[row]] = await db.query(
    'SELECT token FROM attendance_qr_sessions WHERE active = 1 AND action = ? ORDER BY id DESC LIMIT 1',
    [action]
  );
  assert.ok(row?.token, `Missing ${action} QR token`);
  return row.token;
}

async function main() {
  const suffix = Date.now().toString(36);
  const password = bcrypt.hashSync(`QR-Test-${suffix}!`, 10);
  const admin = await addUser('Admin', `${suffix}-admin`, password);
  const alex = await addUser('Employee', `${suffix}-a`, password);
  const sam = await addUser('Employee', `${suffix}-b`, password);

  assert.equal((await api('/attendance/qr-submit', null, 'POST', { token: 'invalid' })).status, 401);
  assert.equal((await api('/attendance/qr-submit', admin, 'POST', { token: 'a'.repeat(64) })).status, 403);
  assert.equal((await api('/attendance/qr-submit', alex, 'POST', { token: 'invalid' })).status, 400);

  const checkInQr = await api('/attendance/qr-session', admin, 'POST', { action: 'check-in', minutes: 10 });
  assert.ok([200, 201].includes(checkInQr.status), JSON.stringify(checkInQr.data));
  assert.match(checkInQr.data.qrDataUrl, /^data:image\/png;base64,/);
  const checkInToken = await latestToken('check-in');
  assert.ok((await api('/attendance/qr-active', alex)).data.some((item) => item.action === 'check-in'));

  for (const user of [alex, sam]) {
    const scan = await api('/attendance/qr-submit', user, 'POST', { token: checkInToken });
    assert.equal(scan.status, 200, JSON.stringify(scan.data));
    assert.equal(scan.data.action, 'check-in');
    const history = await api('/attendance', user);
    assert.equal(history.status, 200);
    const today = history.data.find((item) => item.emp_id === user.empId && item.check_in);
    assert.ok(today, `Check-in was not persisted for ${user.empId}`);
    assert.equal(String(today.date).slice(0, 10), scan.data.date);
    assert.equal(today.method, 'Secure QR');
    assert.ok(!history.data.some((item) => item.emp_id !== user.empId));
  }
  assert.equal((await api('/attendance/qr-submit', alex, 'POST', { token: checkInToken })).status, 409);
  assert.ok(!(await api('/attendance/qr-active', alex)).data.some((item) => item.action === 'check-in'));

  const checkOutQr = await api('/attendance/qr-session', admin, 'POST', { action: 'check-out', minutes: 10 });
  assert.ok([200, 201].includes(checkOutQr.status), JSON.stringify(checkOutQr.data));
  const checkOutToken = await latestToken('check-out');
  for (const user of [alex, sam]) {
    const scan = await api('/attendance/qr-submit', user, 'POST', { token: checkOutToken });
    assert.equal(scan.status, 200, JSON.stringify(scan.data));
    assert.equal(scan.data.action, 'check-out');
    const history = await api('/attendance', user);
    const today = history.data.find((item) => item.emp_id === user.empId && item.check_in && item.check_out);
    assert.ok(today, `Check-out was not persisted for ${user.empId}`);
  }
  assert.equal((await api('/attendance/qr-submit', sam, 'POST', { token: checkOutToken })).status, 409);
  console.log('Attendance QR smoke test passed: shared scans, persisted status, ownership, check-out, and duplicate/security checks.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
