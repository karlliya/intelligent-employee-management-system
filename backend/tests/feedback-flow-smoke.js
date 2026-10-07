const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const databaseName = process.env.DB_NAME || '';
if (!/^iems_feedback_test_[a-z0-9_]+$/i.test(databaseName)) {
  throw new Error('Set DB_NAME to an isolated iems_feedback_test_* database before running this smoke test.');
}

const base = process.env.FEEDBACK_TEST_URL || 'http://127.0.0.1:5002';
const users = [
  { email: 'feedback.admin@test.invalid', role: 'Admin', name: 'Test Administrator' },
  { email: 'feedback.alex@test.invalid', role: 'Employee', name: 'Alex Test' },
  { email: 'feedback.sam@test.invalid', role: 'Employee', name: 'Sam Test' }
];

async function api(pathname, user, method = 'GET', body) {
  const token = user && jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const response = await fetch(`${base}/api${pathname}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function main() {
  const password = bcrypt.hashSync('TestOnly-Feedback-2026!', 10);
  for (const user of users) {
    await db.query('INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)', [user.email, password, user.role, user.name]);
  }
  const [rows] = await db.query('SELECT id, email, role FROM users WHERE email IN (?, ?, ?)', users.map((user) => user.email));
  const byEmail = Object.fromEntries(rows.map((user) => [user.email, user]));
  const admin = byEmail[users[0].email];
  const alex = byEmail[users[1].email];
  const sam = byEmail[users[2].email];
  await db.query('INSERT INTO employees (emp_id, user_id, name, email, department, role) VALUES (?, ?, ?, ?, ?, ?)', ['TEST-ALEX', alex.id, 'Alex Test', alex.email, 'Mechanical Engineering', 'Employee']);
  await db.query('INSERT INTO employees (emp_id, user_id, name, email, department, role) VALUES (?, ?, ?, ?, ?, ?)', ['TEST-SAM', sam.id, 'Sam Test', sam.email, 'Civil Engineering', 'Employee']);

  assert.equal((await api('/admin/feedback', null)).status, 401);
  assert.equal((await api('/admin/feedback', alex)).status, 403);
  assert.equal((await api('/feedback/my', admin)).status, 403);
  assert.equal((await api('/admin/feedback/not-an-id/analyze', admin, 'POST', {})).status, 400);
  assert.equal((await api('/admin/feedback/999999/analyze', admin, 'POST', {})).status, 404);
  assert.equal((await api('/feedback', alex, 'POST', { category: 'General', feedback_text: '   ', is_anonymous: false })).status, 400);
  assert.equal((await api('/feedback', alex, 'POST', { category: 'Invalid', feedback_text: 'A valid comment', is_anonymous: false })).status, 400);

  const negative = await api('/feedback', alex, 'POST', { category: 'Workload', feedback_text: 'I have too many tasks this month and feel stressed with the current workload.', is_anonymous: false });
  const anonymous = await api('/feedback', alex, 'POST', { category: 'Team / Communication', feedback_text: 'I feel ignored and stressed during team meetings.', is_anonymous: true });
  const neutral = await api('/feedback', alex, 'POST', { category: 'General', feedback_text: 'I have some comments about the project schedule.', is_anonymous: false });
  const positive = await api('/feedback', sam, 'POST', { category: 'Management', feedback_text: 'My manager is supportive and I feel happy with the project.', is_anonymous: false });
  for (const item of [negative, anonymous, neutral, positive]) assert.equal(item.status, 201);

  const myAlex = await api('/feedback/my', alex);
  const mySam = await api('/feedback/my', sam);
  assert.equal(myAlex.status, 200);
  assert.deepEqual(myAlex.data.map((row) => row.id).sort(), [negative.data.id, neutral.data.id].sort());
  assert.deepEqual(mySam.data.map((row) => row.id), [positive.data.id]);
  assert.equal(myAlex.data.some((row) => Object.hasOwn(row, 'recommendation')), false);

  const pending = await api('/admin/feedback?status=Pending', admin);
  assert.equal(pending.status, 200);
  assert.equal(pending.data.counts.Pending, 4);
  const anonymousItem = pending.data.items.find((row) => row.id === anonymous.data.id);
  assert.equal(anonymousItem.emp_id, null);
  assert.equal(anonymousItem.employee_name, 'Anonymous Employee');
  const [[anonymousStored]] = await db.query('SELECT emp_id FROM sentiment_feedback WHERE id = ?', [anonymous.data.id]);
  assert.equal(anonymousStored.emp_id, null);

  const cases = [
    [positive.data.id, 'Positive', 'No immediate action required'],
    [neutral.data.id, 'Neutral', 'No urgent issue detected'],
    [negative.data.id, 'Negative', 'Review workload distribution'],
    [anonymous.data.id, 'Negative', 'Review team communication']
  ];
  for (const [id, expectedSentiment, recommendation] of cases) {
    const analyzed = await api(`/admin/feedback/${id}/analyze`, admin, 'POST', {});
    assert.equal(analyzed.status, 200, JSON.stringify(analyzed.data));
    assert.equal(analyzed.data.sentiment, expectedSentiment);
    assert.equal(analyzed.data.analysis_status, 'Analyzed');
    assert.ok(analyzed.data.recommendation.includes(recommendation));
    assert.equal(analyzed.data.confidence, null);
    if (id === anonymous.data.id) assert.equal(analyzed.data.emp_id, null);
    const [[audit]] = await db.query('SELECT id FROM audit_logs WHERE action = ? LIMIT 1', [`ANALYZE_EMPLOYEE_FEEDBACK ID ${id}`]);
    assert.ok(audit, `Missing audit log for feedback ${id}`);
  }
  assert.equal((await api(`/admin/feedback/${negative.data.id}/analyze`, admin, 'POST', {})).status, 409);
  assert.equal((await api('/admin/feedback?status=Pending', admin)).data.counts.Pending, 0);
  assert.equal((await api('/admin/feedback?status=Analyzed', admin)).data.counts.Analyzed, 4);
  assert.equal((await api('/ai/sentiment', admin, 'POST', { feedback_text: 'manual entry' })).status, 410);
  assert.equal((await api('/ai/sentiment', alex, 'POST', { feedback_text: 'manual entry' })).status, 403);

  const script = path.join(__dirname, '..', '..', 'ai', 'sentiment_analyzer.py');
  const output = execFileSync(process.env.PYTHON_PATH || 'python', [script, 'I feel stressed and overworked.'], { encoding: 'utf8' });
  assert.equal(JSON.parse(output).sentiment, 'Negative');
  console.log('Feedback smoke test passed: validation, ownership, anonymous privacy, positive/neutral/negative analysis, duplicate prevention, audit, Python.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
