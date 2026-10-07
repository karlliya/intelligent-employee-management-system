const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.demo') });
const multer = require('multer');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const db = require('./db');
const {
  loginRateLimiter,
  csrfProtection,
  sanitizeInput,
  verifyPassword,
  hashPassword,
  generateRandomToken,
  validatePassword,
  generateOTPSync
} = require('./security');
const { sendOTPEmail, sendPlainEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-jwt-secret';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-jwt-secret' || process.env.DEV_OTP_FALLBACK === '1')) {
  throw new Error('Production requires a unique JWT_SECRET and DEV_OTP_FALLBACK=0.');
}
const PYTHON_PATH = process.env.PYTHON_PATH || 'python';
const AI_DIR = path.join(__dirname, '..', 'ai');
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'documents');
const allowedRoles = ['Admin', 'Employee'];
const BRAND_NAME = 'HAMARISA';
const FEEDBACK_CATEGORIES = ['Workload', 'Management', 'Workplace Environment', 'Training', 'Team / Communication', 'General'];
const demoPublicUrl = (process.env.DEMO_PUBLIC_URL || '').replace(/\/$/, '');
const LOCAL_SAMPLE_ERROR = 'Sample @iems.local accounts cannot receive email OTP. On the IEMS computer, open http://127.0.0.1:5001/login and sign in there.';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const allowedCorsOrigins = new Set([
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:5000', 'http://127.0.0.1:5000',
  'http://localhost:5001', 'http://127.0.0.1:5001',
  ...(process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ...(demoPublicUrl ? [demoPublicUrl] : [])
]);
function isAllowedOrigin(origin) {
  return !origin || allowedCorsOrigins.has(origin) ||
    (process.env.NODE_ENV !== 'production' && /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:3000$/.test(origin));
}

app.use((req, res, next) => {
  if (!isAllowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'This site origin is not allowed.' });
  next();
});

app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true
}));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitizeInput);
app.use(csrfProtection);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'IEMS API' });
});

function safeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function isValidPhone(phone) {
  return !phone || /^[0-9+\-\s()]{7,30}$/.test(String(phone));
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && !Number.isNaN(Date.parse(date));
}

function isScore(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

function malaysiaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

function ratingFor(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Average';
  return 'Needs Improvement';
}

function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) {
    const now = new Date();
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return {
    month,
    start: `${month}-01`,
    endExpr: 'LAST_DAY(?)'
  };
}

function getIp(req) {
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

function isLocalSampleEmail(email) {
  return String(email || '').toLowerCase().endsWith('@iems.local');
}

function shouldShowLocalOtp(email) {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_OTP_FALLBACK === '1' && isLocalSampleEmail(email);
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function frontendOrigin(req) {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.FRONTEND_URL) throw new Error('FRONTEND_URL must be configured in production.');
    return process.env.FRONTEND_URL.replace(/\/$/, '');
  }
  const requestOrigin = req.headers.origin;
  if (demoPublicUrl && requestOrigin === demoPublicUrl) return demoPublicUrl;
  if (typeof requestOrigin === 'string' && /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:3000$/.test(requestOrigin)) {
    return requestOrigin;
  }
  const lanAddress = Object.values(os.networkInterfaces()).flat().find((address) =>
    address && address.family === 'IPv4' && !address.internal && /^192\.168\./.test(address.address)
  );
  return lanAddress ? `http://${lanAddress.address}:3000` : 'http://localhost:3000';
}

async function createEmailVerification(connection, userId, email, name, req) {
  const token = generateRandomToken(32);
  await connection.query('DELETE FROM email_verifications WHERE user_id = ?', [userId]);
  await connection.query(
    'INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))',
    [userId, token]
  );
  const link = `${frontendOrigin(req)}/verify-email?token=${encodeURIComponent(token)}`;
  const emailResult = await sendPlainEmail(
    email,
    `${BRAND_NAME} IEMS Account Verification`,
    `Hello ${name || 'Employee'},\n\nYour ${BRAND_NAME} IEMS account has been created.\n\nPlease verify your account before signing in:\n${link}\n\nThis verification link expires in 24 hours.\n\n${BRAND_NAME} Security Team`
  );
  return { token, link, emailSent: emailResult.success };
}

async function addAuditLog(userEmail, action, ip, result = 'Success') {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_email, user, action, ip_address, result, timestamp)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userEmail || 'unknown', userEmail || 'unknown', action, ip || '127.0.0.1', result]
    );
  } catch (err) {
    console.error('Audit logger failed:', err.message);
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token missing' });

  jwt.verify(token, JWT_SECRET, async (err, payload) => {
    if (err) return res.status(403).json({ error: 'Token expired or invalid' });
    try {
      const [rows] = await db.query('SELECT id, email, role, email_verified, name FROM users WHERE id = ?', [payload.id]);
      const user = rows[0];
      if (!user || !allowedRoles.includes(user.role)) return res.status(401).json({ error: 'Account access is disabled.' });
      req.user = { ...payload, id: user.id, email: user.email, role: user.role, name: user.name || payload.name, email_verified: user.email_verified };
      next();
    } catch (dbErr) {
      console.error('Authentication lookup failed:', dbErr);
      res.status(503).json({ error: 'Authentication service is temporarily unavailable. Please try again.' });
    }
  });
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized role level' });
    }
    next();
  };
}

async function employeeForUser(userId) {
  const [rows] = await db.query('SELECT emp_id, department, department_id FROM employees WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0] || null;
}

async function canAccessEmployee(req, empId) {
  if (req.user.role === 'Admin') return true;
  const own = await employeeForUser(req.user.id);
  if (!own) return false;
  if (req.user.role === 'Employee') return own.emp_id === empId;
  return false;
}

async function employeeScope(req, alias = 'e') {
  if (req.user.role === 'Admin') return { clause: '', params: [] };
  const own = await employeeForUser(req.user.id);
  if (!own) return { clause: ' AND 1=0', params: [] };
  if (req.user.role === 'Employee') return { clause: ` AND ${alias}.emp_id = ?`, params: [own.emp_id] };
  return { clause: ' AND 1=0', params: [] };
}

async function availableAttendanceQrSessions(empId) {
  if (!empId) return [];
  const [sessions] = await db.query(
    `SELECT s.id, s.action,
       DATE_FORMAT(s.expires_at, '%Y-%m-%dT%H:%i:%s+08:00') AS expires_at
     FROM attendance_qr_sessions s
     WHERE s.active = 1 AND s.expires_at > NOW() AND s.target_emp_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM attendance_qr_usage u WHERE u.session_id = s.id AND u.emp_id = ?
       )
     ORDER BY s.id DESC LIMIT 20`,
    [empId]
  );
  const [todayRows] = await db.query(
    'SELECT check_in, check_out FROM attendance WHERE emp_id = ? AND date = ? LIMIT 1',
    [empId, malaysiaDate()]
  );
  const today = todayRows[0] || {};
  const latestByAction = [];
  const seenActions = new Set();
  for (const session of sessions) {
    if (session.action === 'check-in' && today.check_in) continue;
    if (session.action === 'check-out' && (!today.check_in || today.check_out)) continue;
    if (!seenActions.has(session.action)) {
      seenActions.add(session.action);
      latestByAction.push(session);
    }
  }
  return latestByAction;
}

async function createRefreshToken(userId, ip, userAgent) {
  const token = generateRandomToken(64);
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))',
    [userId, token, ip, userAgent || 'unknown']
  );
  return token;
}

function buildEmployeeValidation(body, partial = false) {
  const errors = [];
  const required = ['emp_id', 'name', 'email', 'department', 'position', 'salary'];
  if (!partial) {
    required.forEach((field) => {
      if (!body[field]) errors.push(`${field} is required`);
    });
  }
  if (body.email && !isValidEmail(body.email)) errors.push('email is invalid');
  if (body.phone && !isValidPhone(body.phone)) errors.push('phone is invalid');
  if (body.salary !== undefined && (Number.isNaN(Number(body.salary)) || Number(body.salary) < 0)) errors.push('salary is invalid');
  if (body.joined_date && !isValidDate(body.joined_date)) errors.push('joined_date is invalid');
  if (body.role && !allowedRoles.includes(body.role)) errors.push('role is invalid');
  return errors;
}

const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeEmp = String(req.params.emp_id || 'employee').replace(/[^a-zA-Z0-9_-]/g, '');
      cb(null, `${safeEmp}-${Date.now()}-${generateRandomToken(8)}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
    const mimeOk = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype);
    cb(null, allowed.has(ext) && mimeOk);
  },
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }
});

function localAiFallback(script, args = [], reason = '') {
  if (script === 'predict_performance.py') {
    const attendance = Number(args[0] || 0);
    const leaveFrequency = Number(args[1] || 0);
    const kpi = Number(args[2] || 0);
    const performance = Number(args[3] || 0) * 10;
    const experience = Number(args[4] || 0);
    const score = Math.round((attendance * 0.25) + (Math.max(0, 100 - leaveFrequency * 6) * 0.12) + (kpi * 0.35) + (performance * 0.18) + (Math.min(experience, 10) * 1));
    const prediction = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Average' : 'Needs Improvement';
    return {
      prediction,
      confidence: Math.min(96, Math.max(62, Math.abs(score - 50) + 45)),
      final_score: score,
      recommendation: prediction === 'Excellent' ? 'Promotion Candidate' : prediction === 'Good' ? 'Maintain current development plan' : 'Performance Coaching',
      explanation: 'Calculated from attendance, leave frequency, KPI, performance score, and experience.',
      engine: 'local-js-fallback',
      fallback_reason: reason
    };
  }

  if (script === 'recommend_team.py') {
    const requiredSkills = String(args[0] || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    let employees = [];
    try {
      employees = JSON.parse(args[1] || '[]');
    } catch {
      employees = [];
    }
    const recommendations = employees.map((employee) => {
      const skills = String(employee.skills || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
      const matched = requiredSkills.filter((skill) => skills.includes(skill));
      const skillScore = requiredSkills.length ? matched.length / requiredSkills.length : 0;
      const expScore = Math.min(Number(employee.experience_duration || employee.years_experience || 0), 10) / 10;
      const matchScore = Math.round(((skillScore * 0.7) + (expScore * 0.3)) * 100);
      return {
        emp_id: employee.emp_id,
        name: employee.name,
        skills: employee.skills || '',
        match_score: matchScore,
        recommendation: matchScore >= 70 ? 'Recommended for project team' : 'Backup candidate',
        reason: matched.length ? `Matched skills: ${matched.join(', ')}` : 'No exact skill match; ranked by experience.'
      };
    }).sort((a, b) => b.match_score - a.match_score).slice(0, 5);
    return { recommendations, engine: 'local-js-fallback', fallback_reason: reason };
  }

  if (script === 'sentiment_analyzer.py') {
    const text = String(args[0] || '').toLowerCase();
    const words = text.match(/[a-z]+/g) || [];
    const positive = new Set(['good', 'great', 'excellent', 'happy', 'love', 'supportive', 'learning', 'growth', 'satisfied', 'motivated', 'safe', 'helpful']);
    const negative = new Set(['bad', 'poor', 'unhappy', 'stress', 'stressed', 'stressful', 'exhausted', 'burnout', 'overworked', 'overwhelmed', 'unfair', 'ignored', 'toxic', 'angry', 'unsafe']);
    const pos = words.filter((word) => positive.has(word)).length;
    const neg = words.filter((word) => negative.has(word)).length;
    const sentiment = pos > neg ? 'Positive' : neg > pos ? 'Negative' : 'Neutral';
    return {
      sentiment,
      confidence: null,
      positive_signals: pos,
      negative_signals: neg,
      analysis_method: 'Rule-based prototype',
      engine: 'local-js-fallback',
      fallback_reason: reason
    };
  }

  if (script === 'turnover_risk.py') {
    const attendanceTrend = Number(args[0] || 0);
    const leaveFrequency = Number(args[1] || 0);
    const performanceTrend = Number(args[2] || 0);
    const engagementScore = Number(args[3] || 0);
    const riskScore = Math.min(100, Math.max(0, Math.round((leaveFrequency * 14) + ((10 - engagementScore) * 7) + (attendanceTrend < 0 ? Math.abs(attendanceTrend) * 30 : 0) + (performanceTrend < 0 ? Math.abs(performanceTrend) * 35 : 0))));
    const risk_category = riskScore >= 70 ? 'High Risk' : riskScore >= 40 ? 'Medium Risk' : 'Low Risk';
    return {
      risk_category,
      risk_score: riskScore,
      recommendation: risk_category === 'High Risk' ? 'Schedule urgent HR and manager check-in.' : risk_category === 'Medium Risk' ? 'Monitor workload and engagement closely.' : 'Maintain current engagement plan.',
      explanation: 'Risk is estimated from attendance trend, leave frequency, performance trend, and engagement score.',
      engine: 'local-js-fallback',
      fallback_reason: reason
    };
  }

  return { output: null, engine: 'local-js-fallback', fallback_reason: reason || 'Python execution unavailable.' };
}

function runPython(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON_PATH, [path.join(AI_DIR, script), ...args.map(String)], { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) return resolve(localAiFallback(script, args, stderr || err.message));
      try {
        const parsed = JSON.parse(stdout.trim());
        if (script === 'sentiment_analyzer.py' && !['Positive', 'Neutral', 'Negative'].includes(parsed?.sentiment)) {
          return resolve(localAiFallback(script, args, 'Python returned an invalid sentiment result.'));
        }
        resolve(parsed);
      } catch {
        resolve(script === 'sentiment_analyzer.py'
          ? localAiFallback(script, args, 'Python returned invalid JSON.')
          : stdout.trim() ? { output: stdout.trim() } : localAiFallback(script, args, 'Python returned empty output.'));
      }
    });
  });
}

function feedbackDecisionSupport(category, sentiment) {
  if (sentiment === 'Positive') return {
    key_concern: 'No immediate concern identified',
    recommendation: 'No immediate action required. Continue monitoring employee engagement.'
  };
  if (sentiment === 'Neutral') return {
    key_concern: 'No clear concern identified',
    recommendation: 'No urgent issue detected. Continue monitoring future feedback.'
  };
  const concerns = {
    Workload: ['Workload pressure / employee stress', 'Review workload distribution and discuss workload concerns with the employee.'],
    Management: ['Management-related concern', 'Schedule a confidential discussion to understand the management-related concern.'],
    'Workplace Environment': ['Workplace environment concern', 'Review the workplace issue and identify possible corrective action.'],
    Training: ['Training or development need', 'Review the employee\'s training needs and provide suitable development support.'],
    'Team / Communication': ['Team communication concern', 'Review team communication and consider a discussion with relevant team members.'],
    General: ['Employee wellbeing concern', 'Arrange a supportive discussion to understand the concern and agree on next steps.']
  };
  const [key_concern, recommendation] = concerns[category] || concerns.General;
  return { key_concern, recommendation };
}

async function ensureSchema() {
  async function columnExists(table, column) {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return safeInt(rows[0]?.count) > 0;
  }

  async function addColumn(table, column, definition) {
    if (!(await columnExists(table, column))) {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  async function columnInfo(table, column) {
    const [rows] = await db.query(
      `SELECT DATA_TYPE, COLUMN_TYPE, EXTRA
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return rows[0] || null;
  }

  await db.query("CREATE TABLE IF NOT EXISTS departments (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, code VARCHAR(20), description TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(191) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Employee',
    failed_attempts INT DEFAULT 0,
    lockout_until DATETIME DEFAULT NULL,
    email_verified TINYINT(1) NOT NULL DEFAULT 1,
    email_verified_at DATETIME DEFAULT NULL,
    password_changed_at DATETIME DEFAULT NULL,
    name VARCHAR(100) DEFAULT NULL,
    initials VARCHAR(10) DEFAULT NULL,
    color VARCHAR(20) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query("ALTER TABLE users MODIFY role VARCHAR(50) NOT NULL DEFAULT 'Employee'");
  await addColumn('users', 'failed_attempts', 'INT DEFAULT 0');
  await addColumn('users', 'lockout_until', 'DATETIME DEFAULT NULL');
  await addColumn('users', 'email_verified', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumn('users', 'email_verified_at', 'DATETIME DEFAULT NULL');
  await addColumn('users', 'password_changed_at', 'DATETIME DEFAULT NULL');
  await addColumn('users', 'two_factor_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumn('users', 'initials', 'VARCHAR(10) DEFAULT NULL');
  await addColumn('users', 'color', 'VARCHAR(20) DEFAULT NULL');
  await db.query('ALTER TABLE users MODIFY initials VARCHAR(10) DEFAULT NULL');
  await db.query('ALTER TABLE users MODIFY color VARCHAR(20) DEFAULT NULL');

  await db.query(`CREATE TABLE IF NOT EXISTS employees (
    emp_id VARCHAR(50) PRIMARY KEY,
    user_id INT UNIQUE,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100) DEFAULT NULL,
    department_id INT DEFAULT NULL,
    position VARCHAR(100) DEFAULT NULL,
    role VARCHAR(100) DEFAULT NULL,
    email VARCHAR(191) UNIQUE NOT NULL,
    phone VARCHAR(50),
    ic_number VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    joined_date DATE DEFAULT NULL,
    salary DECIMAL(10,2) NOT NULL DEFAULT 0,
    leave_balance INT NOT NULL DEFAULT 18,
    document_path VARCHAR(255) DEFAULT NULL,
    photo_url VARCHAR(255) DEFAULT NULL,
    skills TEXT,
    experience_duration INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumn('employees', 'user_id', 'INT UNIQUE');
  await addColumn('employees', 'department', 'VARCHAR(100) DEFAULT NULL');
  await addColumn('employees', 'department_id', 'INT DEFAULT NULL');
  await addColumn('employees', 'position', 'VARCHAR(100) DEFAULT NULL');
  await addColumn('employees', 'role', 'VARCHAR(100) DEFAULT NULL');
  await addColumn('employees', 'document_path', 'VARCHAR(255) DEFAULT NULL');
  await addColumn('employees', 'photo_url', 'VARCHAR(255) DEFAULT NULL');
  await addColumn('employees', 'skills', 'TEXT');
  await addColumn('employees', 'experience_duration', 'INT NOT NULL DEFAULT 0');
  await addColumn('employees', 'project_assigned', 'VARCHAR(150) DEFAULT NULL');
  await addColumn('employees', 'site_location', 'VARCHAR(150) DEFAULT NULL');
  await addColumn('employees', 'certification', 'VARCHAR(255) DEFAULT NULL');
  await addColumn('employees', 'years_experience', 'INT NOT NULL DEFAULT 0');
  await addColumn('employees', 'employment_status', "VARCHAR(50) NOT NULL DEFAULT 'Active'");
  await addColumn('employees', 'engagement_score', 'INT NOT NULL DEFAULT 8');
  await addColumn('employees', 'leave_balance', 'INT NOT NULL DEFAULT 18');
  await db.query('ALTER TABLE employees MODIFY phone VARCHAR(50) DEFAULT NULL');
  await db.query('ALTER TABLE employees MODIFY ic_number VARCHAR(50) DEFAULT NULL');
  await db.query('ALTER TABLE employees MODIFY joined_date DATE DEFAULT NULL');
  await db.query("ALTER TABLE employees MODIFY status VARCHAR(50) NOT NULL DEFAULT 'Active'");
  await db.query(`UPDATE employees e
    JOIN departments d ON d.name = e.department
    SET e.department_id = d.id
    WHERE e.department_id IS NULL`);

  await db.query(`CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    check_in TIME DEFAULT NULL,
    check_out TIME DEFAULT NULL,
    working_hours DECIMAL(5,2) DEFAULT 0,
    overtime_hours DECIMAL(5,2) DEFAULT 0,
    late_minutes INT DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'Present',
    method VARCHAR(50) DEFAULT 'QR',
    UNIQUE KEY emp_date_unique (emp_id, date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumn('attendance', 'working_hours', 'DECIMAL(5,2) DEFAULT 0');
  await addColumn('attendance', 'overtime_hours', 'DECIMAL(5,2) DEFAULT 0');
  await addColumn('attendance', 'late_minutes', 'INT DEFAULT 0');
  await db.query("ALTER TABLE attendance MODIFY check_in TIME DEFAULT NULL");
  await db.query("ALTER TABLE attendance MODIFY check_out TIME DEFAULT NULL");
  await db.query(`UPDATE attendance
    SET status = CASE WHEN check_in > '09:30:00' THEN 'Late' ELSE 'Present' END,
        late_minutes = CASE WHEN check_in > '09:30:00' THEN TIMESTAMPDIFF(MINUTE, TIMESTAMP(date, '09:00:00'), TIMESTAMP(date, check_in)) ELSE 0 END
    WHERE check_in IS NOT NULL AND status IN ('Present', 'Late')`);
  await db.query(`UPDATE attendance
    SET overtime_hours = CASE
      WHEN check_out > '18:00:00' THEN ROUND(TIMESTAMPDIFF(MINUTE, TIMESTAMP(date, '18:00:00'), TIMESTAMP(date, check_out)) / 60, 2)
      ELSE 0 END
    WHERE check_out IS NOT NULL`);

  await db.query(`CREATE TABLE IF NOT EXISTS leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    days INT NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    rejection_reason TEXT DEFAULT NULL,
    conflict_warning TINYINT(1) NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumn('leaves', 'rejection_reason', 'TEXT DEFAULT NULL');
  await addColumn('leaves', 'conflict_warning', 'TINYINT(1) NOT NULL DEFAULT 0');
  const leaveIdInfo = await columnInfo('leaves', 'id');
  if (leaveIdInfo && leaveIdInfo.DATA_TYPE !== 'int') {
    await db.query(`CREATE TABLE IF NOT EXISTS leaves_new (
      id INT AUTO_INCREMENT PRIMARY KEY,
      emp_id VARCHAR(50) NOT NULL,
      type VARCHAR(50) NOT NULL,
      from_date DATE NOT NULL,
      to_date DATE NOT NULL,
      days INT NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Pending',
      rejection_reason TEXT DEFAULT NULL,
      conflict_warning TINYINT(1) NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`INSERT INTO leaves_new (emp_id, type, from_date, to_date, days, reason, status, rejection_reason, conflict_warning)
      SELECT emp_id, type, from_date, to_date, days, reason, status, rejection_reason, conflict_warning FROM leaves`);
    await db.query('RENAME TABLE leaves TO leaves_legacy, leaves_new TO leaves');
  } else {
    await db.query('ALTER TABLE leaves MODIFY id INT AUTO_INCREMENT');
  }

  await db.query(`CREATE TABLE IF NOT EXISTS performance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(50) NOT NULL,
    review_month VARCHAR(7) NOT NULL,
    kpi_score DECIMAL(5,2) NOT NULL DEFAULT 0,
    task_completion_score DECIMAL(5,2) NOT NULL DEFAULT 0,
    attendance_score DECIMAL(5,2) NOT NULL DEFAULT 0,
    final_score DECIMAL(5,2) NOT NULL DEFAULT 0,
    rating VARCHAR(50) NOT NULL DEFAULT 'Needs Improvement',
    hr_alert TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY emp_review_month_unique (emp_id, review_month)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumn('performance', 'task_completion_score', 'DECIMAL(5,2) NOT NULL DEFAULT 0');
  await addColumn('performance', 'final_score', 'DECIMAL(5,2) NOT NULL DEFAULT 0');
  await addColumn('performance', 'rating', "VARCHAR(50) NOT NULL DEFAULT 'Needs Improvement'");
  await addColumn('performance', 'hr_alert', 'TINYINT(1) NOT NULL DEFAULT 0');

  await db.query(`CREATE TABLE IF NOT EXISTS employee_advice_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(50) NOT NULL,
    author_user_id INT NOT NULL,
    author_name VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_advice_employee (emp_id, is_read, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS sentiment_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(50) DEFAULT NULL,
    legacy_emp_id VARCHAR(50) DEFAULT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'General',
    feedback_text TEXT NOT NULL,
    is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
    sentiment VARCHAR(50) DEFAULT NULL,
    confidence DECIMAL(5,4) DEFAULT NULL,
    key_concern VARCHAR(255) DEFAULT NULL,
    recommendation TEXT,
    analysis_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analyzed_at DATETIME DEFAULT NULL,
    KEY idx_feedback_status (analysis_status, submitted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumn('sentiment_feedback', 'legacy_emp_id', 'VARCHAR(50) DEFAULT NULL');
  await addColumn('sentiment_feedback', 'category', "VARCHAR(50) NOT NULL DEFAULT 'General'");
  await addColumn('sentiment_feedback', 'is_anonymous', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('sentiment_feedback', 'confidence', 'DECIMAL(5,4) DEFAULT NULL');
  await addColumn('sentiment_feedback', 'key_concern', 'VARCHAR(255) DEFAULT NULL');
  await addColumn('sentiment_feedback', 'recommendation', 'TEXT');
  await addColumn('sentiment_feedback', 'analysis_status', "VARCHAR(20) NOT NULL DEFAULT 'Pending'");
  await addColumn('sentiment_feedback', 'analyzed_at', 'DATETIME DEFAULT NULL');
  const [oldFeedbackFks] = await db.query(
    `SELECT k.CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
     JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'sentiment_feedback'
       AND k.COLUMN_NAME = 'emp_id' AND k.REFERENCED_TABLE_NAME = 'employees'
       AND r.DELETE_RULE <> 'SET NULL'`
  );
  for (const foreignKey of oldFeedbackFks) {
    if (!/^[a-zA-Z0-9_]+$/.test(foreignKey.CONSTRAINT_NAME)) throw new Error('Unexpected feedback foreign key name.');
    await db.query(`ALTER TABLE sentiment_feedback DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
  }
  const [feedbackColumns] = await db.query(
    `SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sentiment_feedback'
       AND COLUMN_NAME IN ('emp_id', 'sentiment')`
  );
  if (feedbackColumns.find((column) => column.COLUMN_NAME === 'emp_id')?.IS_NULLABLE === 'NO') {
    await db.query('ALTER TABLE sentiment_feedback MODIFY emp_id VARCHAR(50) NULL');
  }
  if (feedbackColumns.find((column) => column.COLUMN_NAME === 'sentiment')?.IS_NULLABLE === 'NO') {
    await db.query('ALTER TABLE sentiment_feedback MODIFY sentiment VARCHAR(50) NULL');
  }
  await db.query(
    `UPDATE sentiment_feedback f LEFT JOIN employees e ON e.emp_id = f.emp_id
     SET f.legacy_emp_id = f.emp_id, f.emp_id = NULL
     WHERE f.emp_id IS NOT NULL AND e.emp_id IS NULL`
  );
  await db.query(
    `UPDATE sentiment_feedback SET analysis_status = 'Analyzed', analyzed_at = COALESCE(analyzed_at, submitted_at)
     WHERE sentiment IS NOT NULL AND analysis_status = 'Pending'`
  );
  const [feedbackIndexes] = await db.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sentiment_feedback' AND INDEX_NAME = 'idx_feedback_status' LIMIT 1`
  );
  if (!feedbackIndexes.length) await db.query('ALTER TABLE sentiment_feedback ADD INDEX idx_feedback_status (analysis_status, submitted_at)');
  const [feedbackFks] = await db.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sentiment_feedback'
       AND COLUMN_NAME = 'emp_id' AND REFERENCED_TABLE_NAME = 'employees' LIMIT 1`
  );
  if (!feedbackFks.length) {
    await db.query(
      'ALTER TABLE sentiment_feedback ADD CONSTRAINT fk_sentiment_feedback_employee FOREIGN KEY (emp_id) REFERENCES employees(emp_id) ON DELETE SET NULL'
    );
  }
  await db.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(191) DEFAULT NULL,
    user VARCHAR(100) DEFAULT NULL,
    action TEXT NOT NULL,
    ip_address VARCHAR(50) NOT NULL,
    result VARCHAR(50) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumn('audit_logs', 'user_email', 'VARCHAR(191) DEFAULT NULL');
  await addColumn('audit_logs', 'user', 'VARCHAR(100) DEFAULT NULL');
  await db.query("ALTER TABLE audit_logs MODIFY result VARCHAR(50) NOT NULL");

  await db.query(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(50),
    user_agent VARCHAR(255),
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS otp_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    otp_code VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT DEFAULT 0,
    verified TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_user_verified (user_id, verified),
    KEY idx_expires_at (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query('ALTER TABLE otp_verifications MODIFY otp_code VARCHAR(255) NOT NULL');
  await db.query('DELETE FROM otp_verifications WHERE expires_at < NOW() OR verified = 1');

  await db.query(`CREATE TABLE IF NOT EXISTS email_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_email_verification_user (user_id),
    KEY idx_email_verification_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query('DELETE FROM email_verifications WHERE expires_at < NOW() OR verified = 1');

  await db.query(`CREATE TABLE IF NOT EXISTS attendance_qr_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    action VARCHAR(20) NOT NULL DEFAULT 'check-in',
    created_by INT NOT NULL,
    target_emp_id VARCHAR(50) DEFAULT NULL,
    expires_at DATETIME NOT NULL,
    used_count INT NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_attendance_qr_token (token),
    KEY idx_attendance_qr_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumn('attendance_qr_sessions', 'target_emp_id', 'VARCHAR(50) DEFAULT NULL');
  await db.query('UPDATE attendance_qr_sessions SET active = 0 WHERE expires_at < NOW()');
  await db.query(`CREATE TABLE IF NOT EXISTS attendance_qr_usage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    emp_id VARCHAR(50) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY session_employee_unique (session_id, emp_id),
    KEY idx_qr_usage_employee (emp_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumn('settings', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await db.query('ALTER TABLE settings MODIFY setting_value TEXT');

  await db.query(`INSERT INTO settings (setting_key, setting_value) VALUES
    ('company_name', 'IEMS Dashboard'),
    ('work_start_time', '09:00'),
    ('session_timeout_minutes', '120'),
    ('leave_conflict_limit', '3'),
    ('security_2fa', '1'),
    ('security_rbac', '1'),
    ('security_audit_logging', '1'),
    ('security_csrf', '1'),
    ('security_file_upload_protection', '1')
    ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)`);
}

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  const ip = getIp(req);
  if (!isValidEmail(email) || !password) return res.status(400).json({ error: 'Valid email and password are required.' });

  try {
    const [users] = await db.query('SELECT id, email, password, role, failed_attempts, lockout_until > NOW() AS is_locked, email_verified FROM users WHERE email = ?', [email]);
    const user = users[0];
    if (!user) {
      await addAuditLog(email, 'Login failed: user not found', ip, 'Failed');
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!allowedRoles.includes(user.role)) {
      await addAuditLog(email, 'Login blocked: role disabled', ip, 'Failed');
      return res.status(403).json({ error: 'This account role can no longer sign in. Contact your administrator.' });
    }
    if (user.is_locked) {
      return res.status(403).json({ error: 'Account is temporarily locked.' });
    }
    if (!(await verifyPassword(password, user.password))) {
      const attempts = safeInt(user.failed_attempts) + 1;
      const lockSql = attempts >= 5 ? ', lockout_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE)' : '';
      await db.query(`UPDATE users SET failed_attempts = ? ${lockSql} WHERE id = ?`, [attempts, user.id]);
      await addAuditLog(email, `Failed login attempt (${attempts}/5)`, ip, 'Failed');
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (isLocalSampleEmail(user.email) && !shouldShowLocalOtp(user.email)) {
      await addAuditLog(user.email, 'Local sample login blocked outside local demo', ip, 'Failed');
      return res.status(403).json({ error: LOCAL_SAMPLE_ERROR, code: 'LOCAL_SAMPLE_ONLY' });
    }

    if (user.email_verified === 0) {
      await addAuditLog(user.email, 'Login blocked: email not verified', ip, 'Failed');
      return res.status(403).json({ error: 'Please verify your email before signing in.' });
    }

    await db.query('UPDATE users SET failed_attempts = 0, lockout_until = NULL WHERE id = ?', [user.id]);
    const [employees] = await db.query('SELECT emp_id, name FROM employees WHERE user_id = ?', [user.id]);
    const emp = employees[0] || {};
    const otpCode = generateOTPSync(6);
    const otpHash = await hashPassword(otpCode);
    await db.query('DELETE FROM otp_verifications WHERE user_id = ? AND verified = 0', [user.id]);
    await db.query(
      'INSERT INTO otp_verifications (user_id, otp_code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))',
      [user.id, otpHash]
    );
    const useLocalOtp = shouldShowLocalOtp(user.email);
    const emailResult = useLocalOtp
      ? { success: false, localOnly: true }
      : await sendOTPEmail(user.email, emp.name || user.email, otpCode);
    if (!emailResult.success && !useLocalOtp) {
      await db.query('DELETE FROM otp_verifications WHERE user_id = ? AND verified = 0', [user.id]);
      await addAuditLog(email, 'OTP email delivery failed', ip, 'Failed');
      return res.status(503).json({ error: 'Email verification is unavailable. Please contact the administrator.' });
    }
    await addAuditLog(email, emailResult.success ? 'Login OTP generated and sent' : 'Login OTP generated using local fallback', ip, 'Success');
    res.json({
      message: emailResult.success ? 'Verification code sent to your email' : 'Local verification code generated',
      verificationId: user.id,
      email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
      expiresIn: 300,
      devOtp: useLocalOtp ? otpCode : undefined
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login process failed.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { userId, otpCode } = req.body;
  const ip = getIp(req);
  if (!userId || !/^\d{6}$/.test(String(otpCode || ''))) return res.status(400).json({ error: 'User ID and 6-digit OTP are required.' });

  try {
    const [users] = await db.query('SELECT id, email, role FROM users WHERE id = ?', [userId]);
    const user = users[0];
    if (!user || !allowedRoles.includes(user.role)) return res.status(401).json({ error: 'Invalid verification session.' });
    if (isLocalSampleEmail(user.email) && !shouldShowLocalOtp(user.email)) {
      return res.status(403).json({ error: LOCAL_SAMPLE_ERROR, code: 'LOCAL_SAMPLE_ONLY' });
    }

    const [records] = await db.query(
      'SELECT id, otp_code, expires_at <= NOW() AS expired, attempts FROM otp_verifications WHERE user_id = ? AND verified = 0 ORDER BY created_at DESC, id DESC LIMIT 1',
      [userId]
    );
    const record = records[0];
    if (!record) return res.status(400).json({ error: 'No active verification code.' });
    if (record.expired) {
      await db.query('UPDATE otp_verifications SET verified = 1 WHERE id = ?', [record.id]);
      await addAuditLog(user.email, 'OTP verification failed: expired', ip, 'Failed');
      return res.status(400).json({ error: 'Verification code expired.' });
    }
    const attempts = safeInt(record.attempts) + 1;
    if (attempts > 5) {
      await db.query('UPDATE otp_verifications SET verified = 1 WHERE id = ?', [record.id]);
      await addAuditLog(user.email, 'OTP verification failed: max attempts', ip, 'Failed');
      return res.status(429).json({ error: 'Too many failed attempts.' });
    }
    if (!(await verifyPassword(otpCode, record.otp_code))) {
      await db.query('UPDATE otp_verifications SET attempts = ? WHERE id = ?', [attempts, record.id]);
      await addAuditLog(user.email, `OTP verification failed (${attempts}/5)`, ip, 'Failed');
      return res.status(401).json({ error: `Invalid verification code. ${5 - attempts} attempts remaining.` });
    }

    await db.query('UPDATE otp_verifications SET verified = 1, attempts = ? WHERE id = ?', [attempts, record.id]);
    const [employees] = await db.query('SELECT emp_id, name, department FROM employees WHERE user_id = ?', [user.id]);
    const emp = employees[0] || {};
    const payload = { id: user.id, email: user.email, role: user.role, emp_id: emp.emp_id, name: emp.name, department: emp.department };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
    const refreshToken = await createRefreshToken(user.id, ip, req.headers['user-agent']);
    await addAuditLog(user.email, 'User logged in successfully via OTP', ip, 'Success');
    res.json({ token, refreshToken, user: payload });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

app.post('/api/auth/resend-otp', loginRateLimiter, async (req, res) => {
  const { userId } = req.body;
  const ip = getIp(req);
  try {
    const [users] = await db.query('SELECT id, email, role FROM users WHERE id = ?', [userId]);
    const user = users[0];
    if (!user || !allowedRoles.includes(user.role)) return res.status(401).json({ error: 'Invalid verification session.' });
    if (isLocalSampleEmail(user.email) && !shouldShowLocalOtp(user.email)) {
      return res.status(403).json({ error: LOCAL_SAMPLE_ERROR, code: 'LOCAL_SAMPLE_ONLY' });
    }
    const otpCode = generateOTPSync(6);
    await db.query('DELETE FROM otp_verifications WHERE user_id = ? AND verified = 0', [user.id]);
    await db.query('INSERT INTO otp_verifications (user_id, otp_code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))', [user.id, await hashPassword(otpCode)]);
    const useLocalOtp = shouldShowLocalOtp(user.email);
    const emailResult = useLocalOtp
      ? { success: false, localOnly: true }
      : await sendOTPEmail(user.email, user.email, otpCode);
    if (!emailResult.success && !useLocalOtp) {
      await db.query('DELETE FROM otp_verifications WHERE user_id = ? AND verified = 0', [user.id]);
      await addAuditLog(user.email, 'OTP resend email delivery failed', ip, 'Failed');
      return res.status(503).json({ error: 'Email verification is unavailable. Please contact the administrator.' });
    }
    await addAuditLog(user.email, emailResult.success ? 'OTP resent' : 'OTP resent using local fallback', ip, 'Success');
    res.json({
      message: emailResult.success ? 'Verification code resent to your email' : 'Local verification code generated',
      expiresIn: 300,
      devOtp: useLocalOtp ? otpCode : undefined
    });
  } catch (err) {
    res.status(500).json({ error: 'Resend failed.' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => res.json({ user: req.user }));

app.get('/api/auth/security', authenticateToken, async (req, res) => {
  const [rows] = await db.query('SELECT two_factor_enabled, password_changed_at FROM users WHERE id = ?', [req.user.id]);
  const security = rows[0] || {};
  res.json({
    two_factor_enabled: security.two_factor_enabled !== 0,
    password_changed_at: security.password_changed_at
  });
});

app.put('/api/auth/security/2fa', authenticateToken, async (req, res) => {
  const enabled = req.body.enabled ? 1 : 0;
  await db.query('UPDATE users SET two_factor_enabled = ? WHERE id = ?', [enabled, req.user.id]);
  await addAuditLog(req.user.email, `${enabled ? 'Enabled' : 'Disabled'} 2FA`, getIp(req), 'Success');
  res.json({ message: `2FA ${enabled ? 'enabled' : 'disabled'} successfully.`, two_factor_enabled: !!enabled });
});

app.put('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !validatePassword(newPassword)) {
    return res.status(400).json({ error: 'Current password and a strong new password are required.' });
  }
  const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
  const user = rows[0];
  if (!user || !(await verifyPassword(currentPassword, user.password))) {
    await addAuditLog(req.user.email, 'Change password failed', getIp(req), 'Failed');
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  await db.query('UPDATE users SET password = ?, password_changed_at = NOW() WHERE id = ?', [await hashPassword(newPassword), req.user.id]);
  await addAuditLog(req.user.email, 'Changed password', getIp(req), 'Success');
  res.json({ message: 'Password changed successfully.' });
});

app.get('/api/auth/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Verification token is required.' });
  try {
    const [records] = await db.query(
      `SELECT ev.id, ev.user_id, u.email
       FROM email_verifications ev JOIN users u ON u.id = ev.user_id
       WHERE ev.token = ? AND ev.verified = 0 AND ev.expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    const record = records[0];
    if (!record) return res.status(400).json({ error: 'Verification link is invalid or expired.' });
    await db.query('UPDATE users SET email_verified = 1, email_verified_at = NOW() WHERE id = ?', [record.user_id]);
    await db.query('UPDATE email_verifications SET verified = 1 WHERE id = ?', [record.id]);
    await addAuditLog(record.email, 'Email address verified', getIp(req), 'Success');
    res.json({ message: 'Email verified successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Email verification failed.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  const role = 'Employee';
  if (!isValidEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ error: 'Valid email and strong password are required.' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({ error: 'Email already registered.' });
    }
    const [result] = await connection.query('INSERT INTO users (email, password, role, email_verified, name) VALUES (?, ?, ?, 0, ?)', [email, await hashPassword(password), role, name || null]);
    const verification = await createEmailVerification(connection, result.insertId, email, name, req);
    if (!verification.emailSent && process.env.NODE_ENV === 'production') {
      throw new Error('Verification email delivery failed.');
    }
    await connection.commit();
    await addAuditLog(email, 'User registered new account', getIp(req), 'Success');
    res.status(201).json({
      message: verification.emailSent
        ? 'Account created. Check your email to verify the account.'
        : 'Account created. Email delivery is unavailable, so use the local verification link below.',
      userId: result.insertId,
      verificationToken: verification.emailSent || process.env.NODE_ENV === 'production' ? undefined : verification.token,
      verificationLink: verification.emailSent || process.env.NODE_ENV === 'production' ? undefined : verification.link
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: 'Account registration failed.' });
  } finally {
    connection.release();
  }
});

app.get('/api/departments', authenticateToken, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM departments ORDER BY name');
  res.json(rows);
});

app.post('/api/departments', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const { name, code, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required.' });
  try {
    const [result] = await db.query('INSERT INTO departments (name, code, description) VALUES (?, ?, ?)', [name, code || null, description || null]);
    await addAuditLog(req.user.email, `Created department ${name}`, getIp(req), 'Success');
    res.status(201).json({ id: result.insertId, name, code, description });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/departments/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const { name, code, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required.' });
  await db.query('UPDATE departments SET name = ?, code = ?, description = ? WHERE id = ?', [name, code || null, description || null, req.params.id]);
  await addAuditLog(req.user.email, `Updated department ${name}`, getIp(req), 'Success');
  res.json({ message: 'Department updated successfully.' });
});

app.delete('/api/departments/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  await db.query('DELETE FROM departments WHERE id = ?', [req.params.id]);
  await addAuditLog(req.user.email, `Deleted department ${req.params.id}`, getIp(req), 'Success');
  res.json({ message: 'Department deleted successfully.' });
});

app.post('/api/auth/forgot-password', loginRateLimiter, async (req, res) => {
  const { email } = req.body;
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Valid email is required.' });
  if (isLocalSampleEmail(email) && !shouldShowLocalOtp(email)) {
    return res.status(403).json({ error: LOCAL_SAMPLE_ERROR, code: 'LOCAL_SAMPLE_ONLY' });
  }
  try {
    const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    const user = users[0];
    let resetToken = null;
    let emailSent = false;
    const useLocalReset = shouldShowLocalOtp(email);
    if (user) {
      resetToken = generateRandomToken(48);
      await db.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
      await db.query('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))', [user.id, hashResetToken(resetToken)]);
      const resetUrl = `${frontendOrigin(req)}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;
      const emailResult = useLocalReset
        ? { success: false }
        : await sendPlainEmail(email, 'IEMS Password Reset', `Open this link to reset your IEMS password within 1 hour:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`);
      emailSent = emailResult.success;
      if (!emailSent && !useLocalReset) await db.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
      await addAuditLog(email, 'Requested password reset', getIp(req), 'Success');
    }
    res.json({
      message: emailSent || !user
        ? 'If the email exists, a reset link has been sent.'
        : useLocalReset ? 'Use the local reset token shown below.' : 'Email delivery is unavailable. Please contact the administrator.',
      resetToken: useLocalReset ? resetToken : undefined
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/reset-password', loginRateLimiter, async (req, res) => {
  const { email, token, password } = req.body;
  if (!isValidEmail(email) || !token || !validatePassword(password)) return res.status(400).json({ error: 'Valid reset details are required.' });
  try {
    const [rows] = await db.query(
      'SELECT prt.* FROM password_reset_tokens prt JOIN users u ON prt.user_id = u.id WHERE u.email = ? AND prt.token IN (?, ?) AND prt.expires_at > NOW()',
      [email, hashResetToken(token), token]
    );
    const record = rows[0];
    if (!record) return res.status(400).json({ error: 'Invalid or expired reset token.' });
    await db.query('UPDATE users SET password = ?, password_changed_at = NOW(), email_verified = 1, email_verified_at = NOW() WHERE id = ?', [await hashPassword(password), record.user_id]);
    await db.query('DELETE FROM password_reset_tokens WHERE id = ?', [record.id]);
    await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [record.user_id]);
    await addAuditLog(email, 'Password reset completed', getIp(req), 'Success');
    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required.' });
  try {
    const [rows] = await db.query('SELECT rt.*, u.email, u.role FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token = ? AND rt.expires_at > NOW()', [refreshToken]);
    const record = rows[0];
    if (!record || !allowedRoles.includes(record.role)) return res.status(401).json({ error: 'Refresh token invalid or expired.' });
    const [employees] = await db.query('SELECT emp_id, name, department FROM employees WHERE user_id = ? LIMIT 1', [record.user_id]);
    const emp = employees[0] || {};
    const payload = { id: record.user_id, email: record.email, role: record.role, emp_id: emp.emp_id, name: emp.name, department: emp.department };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, user: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [req.user.id]);
  await addAuditLog(req.user.email, 'User logged out', getIp(req), 'Success');
  res.json({ message: 'Logged out successfully.' });
});

app.get('/api/employees', authenticateToken, async (req, res) => {
  const { department, search } = req.query;
  const params = [];
  let sql = `SELECT e.*, COALESCE(d.name, e.department) AS department_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE 1=1`;
  if (req.user.role === 'Employee') {
    sql += ' AND e.user_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'Manager') {
    const own = await employeeForUser(req.user.id);
    sql += ' AND (e.department = ? OR e.department_id = ?)';
    params.push(own?.department || '', own?.department_id || 0);
  }
  if (department) {
    sql += ' AND (e.department_id = ? OR e.department = (SELECT name FROM departments WHERE id = ?))';
    params.push(department);
    params.push(department);
  }
  if (search) {
    sql += ' AND (e.name LIKE ? OR e.emp_id LIKE ? OR e.email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY e.name';
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

app.get('/api/employees/:emp_id', authenticateToken, async (req, res) => {
  if (!(await canAccessEmployee(req, req.params.emp_id))) return res.status(403).json({ error: 'Unauthorized employee access.' });
  const [rows] = await db.query('SELECT * FROM employees WHERE emp_id = ?', [req.params.emp_id]);
  if (!rows[0]) return res.status(404).json({ error: 'Employee not found.' });
  res.json(rows[0]);
});

app.post('/api/employees', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const errors = buildEmployeeValidation(req.body);
  if (errors.length) return res.status(400).json({ errors });
  const { emp_id, name, department, position, salary, role = 'Employee', email, phone, skills, experience_duration, joined_date, project_assigned, site_location, certification, years_experience, employment_status } = req.body;
  if (role !== 'Employee') return res.status(400).json({ error: 'New employee accounts must use the Employee role.' });
  if (email.toLowerCase().endsWith('.local')) return res.status(400).json({ error: 'Use a real email address that can receive an invitation.' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existingUsers] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    const [existingEmployees] = await connection.query('SELECT emp_id FROM employees WHERE emp_id = ? OR email = ? LIMIT 1', [emp_id, email]);
    if (existingUsers.length || existingEmployees.length) {
      await connection.rollback();
      return res.status(409).json({ error: 'Employee ID or email is already in use.' });
    }
    const [departments] = await connection.query('SELECT id FROM departments WHERE name = ? LIMIT 1', [department]);
    if (!departments.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'Choose a valid department.' });
    }
    const [userResult] = await connection.query('INSERT INTO users (email, password, role, email_verified, name) VALUES (?, ?, ?, 0, ?)', [email, await hashPassword(generateRandomToken(32)), 'Employee', name]);
    const userId = userResult.insertId;
    await connection.query(
      `INSERT INTO employees (emp_id, user_id, name, department, department_id, position, role, email, phone, salary, skills, experience_duration, joined_date, project_assigned, site_location, certification, years_experience, employment_status, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [emp_id, userId, name, department, departments[0].id, position, role, email, phone || null, Number(salary), skills || null, safeInt(experience_duration), joined_date || null, project_assigned || null, site_location || null, certification || null, safeInt(years_experience, safeInt(experience_duration)), employment_status || 'Active', employment_status || 'Active']
    );
    const inviteToken = generateRandomToken(48);
    await connection.query('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))', [userId, hashResetToken(inviteToken)]);
    const inviteUrl = `${frontendOrigin(req)}/reset-password?token=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}`;
    const emailResult = await sendPlainEmail(email, `${BRAND_NAME} IEMS Employee Invitation`, `Hello ${name},\n\nAn Employee account has been created for you. Set your password using this link within 1 hour:\n\n${inviteUrl}\n\nAfter setting your password, sign in with this email address. A verification code will then be sent to your inbox.\n\nIf you did not expect this invitation, contact your administrator.\n\n${BRAND_NAME} Security Team`);
    if (!emailResult.success) throw new Error('EMPLOYEE_INVITATION_FAILED');
    await connection.commit();
    await addAuditLog(req.user.email, `Created employee ${emp_id}`, getIp(req), 'Success');
    res.status(201).json({
      message: 'Employee created. An invitation to set a password was sent to their email.'
    });
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Employee ID or email is already in use.' });
    if (err.message === 'EMPLOYEE_INVITATION_FAILED') return res.status(503).json({ error: 'Invitation email could not be sent. Employee was not created.' });
    console.error('Employee creation failed:', err);
    res.status(500).json({ error: 'Employee could not be created.' });
  } finally {
    connection.release();
  }
});

app.put('/api/employees/:emp_id', authenticateToken, async (req, res) => {
  const isAdmin = req.user.role === 'Admin';
  const isEmployeeSelf = req.user.role === 'Employee' && await canAccessEmployee(req, req.params.emp_id);
  if (!isAdmin && !isEmployeeSelf) return res.status(403).json({ error: 'Unauthorized employee update.' });
  if (!isAdmin && req.body.role !== undefined) return res.status(403).json({ error: 'Only Admin can assign roles.' });
  const errors = buildEmployeeValidation(req.body, true);
  if (errors.length) return res.status(400).json({ errors });
  const allowed = isEmployeeSelf
    ? ['phone', 'skills', 'site_location', 'certification']
    : ['name', 'department', 'position', 'email', 'phone', 'salary', 'skills', 'experience_duration', 'status', 'joined_date', 'project_assigned', 'site_location', 'certification', 'years_experience', 'employment_status'];
  const fields = allowed.filter((field) => req.body[field] !== undefined);
  if (!fields.length) return res.status(400).json({ error: 'No valid fields to update.' });
  const sets = fields.map((field) => `${field} = ?`);
  const values = fields.map((field) => field === 'salary' ? Number(req.body[field]) : field === 'joined_date' && !req.body[field] ? null : req.body[field]);
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT emp_id, user_id, email, name FROM employees WHERE emp_id = ? FOR UPDATE', [req.params.emp_id]);
    const employee = rows[0];
    if (!employee) {
      await connection.rollback();
      return res.status(404).json({ error: 'Employee not found.' });
    }
    if (isAdmin && fields.includes('department')) {
      const [departments] = await connection.query('SELECT id FROM departments WHERE name = ? LIMIT 1', [req.body.department]);
      if (!departments.length) {
        await connection.rollback();
        return res.status(400).json({ error: 'Choose a valid department.' });
      }
      sets.push('department_id = ?');
      values.push(departments[0].id);
    }
    const emailChanged = isAdmin && fields.includes('email') && req.body.email !== employee.email;
    if (emailChanged) {
      if (req.body.email.toLowerCase().endsWith('.local')) {
        await connection.rollback();
        return res.status(400).json({ error: 'Use a real email address.' });
      }
      if (!employee.user_id) {
        await connection.rollback();
        return res.status(400).json({ error: 'This profile has no linked login account.' });
      }
      const [duplicates] = await connection.query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [req.body.email, employee.user_id]);
      const [profileDuplicates] = await connection.query('SELECT emp_id FROM employees WHERE email = ? AND emp_id <> ? LIMIT 1', [req.body.email, employee.emp_id]);
      if (duplicates.length || profileDuplicates.length) {
        await connection.rollback();
        return res.status(409).json({ error: 'Email is already in use.' });
      }
      await connection.query('UPDATE users SET email = ?, email_verified = 0, email_verified_at = NULL WHERE id = ?', [req.body.email, employee.user_id]);
      const verification = await createEmailVerification(connection, employee.user_id, req.body.email, req.body.name || employee.name, req);
      if (!verification.emailSent) throw new Error('EMAIL_CHANGE_DELIVERY_FAILED');
      await connection.query('DELETE FROM refresh_tokens WHERE user_id = ?', [employee.user_id]);
    }
    if (isAdmin && fields.includes('name') && employee.user_id) {
      await connection.query('UPDATE users SET name = ? WHERE id = ?', [req.body.name, employee.user_id]);
    }
    await connection.query(`UPDATE employees SET ${sets.join(', ')} WHERE emp_id = ?`, [...values, req.params.emp_id]);
    await connection.commit();
    await addAuditLog(req.user.email, `Updated employee profile/salary ${req.params.emp_id}`, getIp(req), 'Success');
    res.json({ message: emailChanged ? 'Employee updated. Verification was sent to the new email address.' : 'Employee updated successfully.' });
  } catch (err) {
    if (connection) await connection.rollback();
    if (['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(err.code)) {
      return res.status(503).json({ error: 'Database is unavailable. Start MySQL in Laragon and try again.' });
    }
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email is already in use.' });
    if (err.message === 'EMAIL_CHANGE_DELIVERY_FAILED') return res.status(503).json({ error: 'Verification email could not be sent. No changes were saved.' });
    console.error('Employee update failed:', err);
    res.status(500).json({ error: 'Employee could not be updated.' });
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/api/employees/:emp_id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const [rows] = await db.query('SELECT e.user_id, u.role AS user_role FROM employees e LEFT JOIN users u ON e.user_id = u.id WHERE e.emp_id = ?', [req.params.emp_id]);
  if (rows[0]?.user_role === 'Admin' && rows[0]?.user_id === req.user.id) return res.status(403).json({ error: 'You cannot delete your own account.' });
  await db.query('DELETE FROM employees WHERE emp_id = ?', [req.params.emp_id]);
  if (rows[0]?.user_id) await db.query('DELETE FROM users WHERE id = ?', [rows[0].user_id]);
  await addAuditLog(req.user.email, `Deleted employee ${req.params.emp_id}`, getIp(req), 'Success');
  res.json({ message: 'Employee deleted successfully.' });
});

app.post('/api/employees/:emp_id/documents', authenticateToken, async (req, res) => {
  const allowed = req.user.role === 'Admin' || (req.user.role === 'Employee' && await canAccessEmployee(req, req.params.emp_id));
  if (!allowed) return res.status(403).json({ error: 'Unauthorized document upload.' });
  documentUpload.single('document')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'PDF, JPG, or PNG document up to 2MB is required.' });
    const relativePath = `/uploads/documents/${req.file.filename}`;
    await db.query('UPDATE employees SET document_path = ? WHERE emp_id = ?', [relativePath, req.params.emp_id]);
    await addAuditLog(req.user.email, `Uploaded document for ${req.params.emp_id}`, getIp(req), 'Success');
    res.json({ message: 'Document uploaded successfully.', document_path: relativePath });
  });
});

app.get('/api/employees/:emp_id/documents', authenticateToken, async (req, res) => {
  if (!(await canAccessEmployee(req, req.params.emp_id))) return res.status(403).json({ error: 'Unauthorized document access.' });
  const [rows] = await db.query('SELECT document_path FROM employees WHERE emp_id = ? LIMIT 1', [req.params.emp_id]);
  if (!rows[0]) return res.status(404).json({ error: 'Employee not found.' });
  const storedPath = rows[0].document_path;
  if (!storedPath) return res.status(404).json({ error: 'No document has been uploaded for this employee.' });
  const prefix = '/uploads/documents/';
  const filename = String(storedPath).startsWith(prefix) ? String(storedPath).slice(prefix.length) : '';
  if (!/^[a-zA-Z0-9_-]+-\d+-[a-f0-9]+\.(pdf|jpe?g|png)$/i.test(filename)) {
    return res.status(404).json({ error: 'Document is unavailable.' });
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  const mime = filename.toLowerCase().endsWith('.pdf') ? 'application/pdf'
    : filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  res.set({ 'Content-Type': mime, 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: 'Document file was not found.' });
  });
});

app.get('/api/attendance', authenticateToken, async (req, res) => {
  const params = [];
  let sql = 'SELECT a.*, e.name, e.department FROM attendance a JOIN employees e ON a.emp_id = e.emp_id WHERE 1=1';
  if (req.user.role === 'Employee') {
    const own = await employeeForUser(req.user.id);
    sql += ' AND a.emp_id = ?';
    params.push(own?.emp_id || '');
  } else if (req.user.role === 'Manager') {
    const own = await employeeForUser(req.user.id);
    sql += ' AND (e.department = ? OR e.department_id = ?)';
    params.push(own?.department || '', own?.department_id || 0);
  }
  sql += ' ORDER BY a.date DESC, a.check_in DESC';
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

app.post('/api/attendance/qr-session', authenticateToken, requireRole(['Admin']), async (req, res) => {
  let connection;
  try {
    if (req.body.target_emp_id) return res.status(400).json({ error: 'Individual QR codes are no longer used. Refresh the page to generate a shared QR.' });
    const action = req.body.action === 'check-out' ? 'check-out' : 'check-in';
    const minutes = Math.min(Math.max(safeInt(req.body.minutes, 10), 1), 60);
    const today = malaysiaDate();
    const attendanceCondition = action === 'check-in' ? 'a.check_in IS NULL' : 'a.check_in IS NOT NULL AND a.check_out IS NULL';
    const [recipients] = await db.query(
      `SELECT e.emp_id
       FROM employees e JOIN users u ON u.id = e.user_id
       LEFT JOIN attendance a ON a.emp_id = e.emp_id AND a.date = ?
       WHERE u.role = 'Employee' AND e.status <> 'Inactive' AND ${attendanceCondition}`,
      [today]
    );
    if (!recipients.length) return res.status(409).json({ error: action === 'check-in'
      ? 'All active employees have already checked in today.'
      : 'No employees are waiting to check out today.' });

    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.query("SELECT id FROM users WHERE role = 'Admin' ORDER BY id LIMIT 1 FOR UPDATE");
    const [recent] = await connection.query(
      `SELECT token, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_left
       FROM attendance_qr_sessions
       WHERE action = ? AND target_emp_id IS NULL AND active = 1
         AND expires_at > DATE_ADD(NOW(), INTERVAL 2 MINUTE)
       ORDER BY id DESC LIMIT 1`,
      [action]
    );
    const reused = !!recent.length;
    const token = reused ? recent[0].token : generateRandomToken(32);
    if (!reused) {
      await connection.query('UPDATE attendance_qr_sessions SET active = 0 WHERE action = ? AND active = 1', [action]);
      await connection.query(
        'INSERT INTO attendance_qr_sessions (token, action, created_by, target_emp_id, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
        [token, action, req.user.id, null, minutes]
      );
    }
    await connection.commit();
    const qrDataUrl = await QRCode.toDataURL(token, {
      width: 320,
      margin: 2,
      color: { dark: '#080808', light: '#FFF8E8' }
    });
    if (!reused) await addAuditLog(req.user.email, `Published shared ${action} attendance QR for ${recipients.length} eligible employees`, getIp(req), 'Success');
    res.status(reused ? 200 : 201).json({
      action, target_emp_id: null,
      expiresIn: reused ? Math.max(0, safeInt(recent[0].seconds_left)) : minutes * 60,
      qrDataUrl, reused, recipientCount: recipients.length
    });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Unable to generate attendance QR code.' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/attendance/qr-active', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Employee') return res.json([]);
    const employee = await employeeForUser(req.user.id);
    const sessions = await availableAttendanceQrSessions(employee?.emp_id);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Unable to load active attendance access.' });
  }
});

app.post('/api/attendance/qr-submit', authenticateToken, requireRole(['Employee']), async (req, res) => {
  const token = String(req.body.token || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ error: 'A valid attendance QR code is required.' });
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [sessions] = await connection.query(
      'SELECT id, action, target_emp_id FROM attendance_qr_sessions WHERE token = ? AND active = 1 AND expires_at > NOW() LIMIT 1 FOR UPDATE',
      [token]
    );
    const session = sessions[0];
    if (!session) {
      await connection.rollback();
      return res.status(410).json({ error: 'This QR code is invalid or has expired.' });
    }

    const [employees] = await connection.query('SELECT emp_id FROM employees WHERE user_id = ? LIMIT 1', [req.user.id]);
    const employee = employees[0];
    if (!employee?.emp_id) {
      await connection.rollback();
      return res.status(403).json({ error: 'Your account is not linked to an employee profile.' });
    }
    if (session.target_emp_id && session.target_emp_id !== employee.emp_id) {
      await connection.rollback();
      return res.status(403).json({ error: 'This attendance access was issued to another employee.' });
    }
    const [usageRows] = await connection.query(
      'SELECT id FROM attendance_qr_usage WHERE session_id = ? AND emp_id = ? LIMIT 1',
      [session.id, employee.emp_id]
    );
    if (usageRows.length) {
      await connection.rollback();
      return res.status(409).json({ error: 'You have already used this attendance access.' });
    }

    const now = new Date();
    const date = malaysiaDate(now);
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(now);
    const [existingAttendance] = await connection.query(
      'SELECT check_in, check_out FROM attendance WHERE emp_id = ? AND date = ? LIMIT 1 FOR UPDATE',
      [employee.emp_id, date]
    );
    if (session.action === 'check-in' && existingAttendance[0]?.check_in) {
      await connection.rollback();
      return res.status(409).json({ error: 'You have already checked in today.' });
    }
    if (session.action === 'check-out' && existingAttendance[0]?.check_out) {
      await connection.rollback();
      return res.status(409).json({ error: 'You have already checked out today.' });
    }

    if (session.action === 'check-in') {
      const status = time > '09:30:00' ? 'Late' : 'Present';
      const [hours, minutes] = time.split(':').map(Number);
      const lateMinutes = status === 'Late' ? Math.max(0, (hours * 60 + minutes) - 540) : 0;
      await connection.query(
        `INSERT INTO attendance (emp_id, date, check_in, status, late_minutes, method)
         VALUES (?, ?, ?, ?, ?, 'Secure QR')
         ON DUPLICATE KEY UPDATE status = IF(check_in IS NULL, VALUES(status), status), late_minutes = IF(check_in IS NULL, VALUES(late_minutes), late_minutes), check_in = COALESCE(check_in, VALUES(check_in)), method = 'Secure QR'`,
        [employee.emp_id, date, time, status, lateMinutes]
      );
      await connection.query('UPDATE attendance_qr_sessions SET used_count = used_count + 1 WHERE id = ?', [session.id]);
      await connection.query('INSERT INTO attendance_qr_usage (session_id, emp_id) VALUES (?, ?)', [session.id, employee.emp_id]);
      await connection.commit();
      await addAuditLog(req.user.email, `Secure QR check-in ${employee.emp_id} at ${time} (${status})`, getIp(req), 'Success');
      return res.json({ message: `Check-in recorded at ${time}${status === 'Late' ? ` (${lateMinutes} minutes late)` : ''}.`, action: session.action, date, time, status, late_minutes: lateMinutes });
    }

    const [result] = await connection.query(
      `UPDATE attendance
       SET check_out = ?,
           working_hours = ROUND(TIMESTAMPDIFF(MINUTE, TIMESTAMP(date, check_in), TIMESTAMP(date, ?)) / 60, 2),
           overtime_hours = GREATEST(0, ROUND(TIMESTAMPDIFF(MINUTE, TIMESTAMP(date, '18:00:00'), TIMESTAMP(date, ?)) / 60, 2)),
           method = 'Secure QR'
       WHERE emp_id = ? AND date = ? AND check_in IS NOT NULL AND check_out IS NULL`,
      [time, time, time, employee.emp_id, date]
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(400).json({ error: 'Check in first before scanning a check-out QR code.' });
    }
    await connection.query('UPDATE attendance_qr_sessions SET used_count = used_count + 1 WHERE id = ?', [session.id]);
    await connection.query('INSERT INTO attendance_qr_usage (session_id, emp_id) VALUES (?, ?)', [session.id, employee.emp_id]);
    await connection.commit();
    await addAuditLog(req.user.email, `Secure QR check-out ${employee.emp_id} at ${time}`, getIp(req), 'Success');
    const overtimeHours = time > '18:00:00' ? Math.round((((Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))) - 1080) / 60) * 100) / 100 : 0;
    res.json({ message: `Check-out recorded at ${time}${overtimeHours > 0 ? ` with ${overtimeHours} hours OT` : ''}.`, action: session.action, date, time, overtime_hours: overtimeHours });
  } catch (err) {
    if (connection) await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You have already used this attendance access.' });
    console.error('QR attendance error:', err);
    res.status(500).json({ error: 'Unable to record QR attendance.' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/api/attendance/check-in', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const empId = req.body.emp_id || req.user.emp_id || (await employeeForUser(req.user.id))?.emp_id;
  if (!empId || !(await canAccessEmployee(req, empId))) return res.status(403).json({ error: 'Unauthorized employee access.' });
  const now = new Date();
  const date = req.body.date && isValidDate(req.body.date) ? req.body.date : now.toISOString().slice(0, 10);
  const time = req.body.time || now.toTimeString().slice(0, 8);
  const status = time > '09:30:00' ? 'Late' : 'Present';
  const [hours, minutes] = time.split(':').map(Number);
  const lateMinutes = status === 'Late' ? Math.max(0, (hours * 60 + minutes) - 540) : 0;
  await db.query(
    `INSERT INTO attendance (emp_id, date, check_in, status, late_minutes, method)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), status = VALUES(status), late_minutes = VALUES(late_minutes)`,
    [empId, date, time, status, lateMinutes, req.body.method || 'QR']
  );
  await addAuditLog(req.user.email, `Check-in ${empId} at ${time} (${status})`, getIp(req), 'Success');
  res.json({ message: 'Checked in successfully.', emp_id: empId, date, time, status, late_minutes: lateMinutes });
});

app.post('/api/attendance/check-out', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const empId = req.body.emp_id || req.user.emp_id || (await employeeForUser(req.user.id))?.emp_id;
  if (!empId || !(await canAccessEmployee(req, empId))) return res.status(403).json({ error: 'Unauthorized employee access.' });
  const date = req.body.date && isValidDate(req.body.date) ? req.body.date : new Date().toISOString().slice(0, 10);
  const time = req.body.time || new Date().toTimeString().slice(0, 8);
  await db.query(
    `UPDATE attendance
     SET check_out = ?,
         working_hours = ROUND(TIMESTAMPDIFF(MINUTE, TIMESTAMP(date, check_in), TIMESTAMP(date, ?)) / 60, 2),
         overtime_hours = GREATEST(0, ROUND(TIMESTAMPDIFF(MINUTE, TIMESTAMP(date, '18:00:00'), TIMESTAMP(date, ?)) / 60, 2))
     WHERE emp_id = ? AND date = ?`,
    [time, time, time, empId, date]
  );
  await addAuditLog(req.user.email, `Check-out ${empId} at ${time}`, getIp(req), 'Success');
  const overtimeHours = time > '18:00:00' ? Math.round((((Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))) - 1080) / 60) * 100) / 100 : 0;
  res.json({ message: 'Checked out successfully.', emp_id: empId, date, time, overtime_hours: overtimeHours });
});

app.get('/api/attendance/report', authenticateToken, async (req, res) => {
  const { month, start } = monthBounds(req.query.month);
  const scope = await employeeScope(req, 'e');
  const [rows] = await db.query(
    `SELECT e.emp_id, e.name, e.department,
      COUNT(a.id) AS recorded_days,
      SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) AS present_days,
      SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_days,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_days,
      ROUND(SUM(IFNULL(a.working_hours, 0)), 2) AS total_working_hours,
      ROUND(SUM(IFNULL(a.overtime_hours, 0)), 2) AS total_overtime_hours
     FROM employees e
     LEFT JOIN attendance a ON e.emp_id = a.emp_id AND a.date BETWEEN ? AND LAST_DAY(?)
     WHERE 1=1 ${scope.clause}
     GROUP BY e.emp_id, e.name, e.department
     ORDER BY e.name`,
    [start, start, ...scope.params]
  );
  res.json(rows.map((row) => ({
    ...row,
    month,
    attendance_label: safeInt(row.recorded_days) === 0 ? 'No records yet' : safeInt(row.late_days) > 3 ? 'Poor Attendance' : 'Normal'
  })));
});

app.get('/api/leaves', authenticateToken, async (req, res) => {
  const params = [];
  let sql = `SELECT l.*, e.name, e.department FROM leaves l JOIN employees e ON l.emp_id = e.emp_id WHERE 1=1`;
  if (req.user.role === 'Employee') {
    const own = await employeeForUser(req.user.id);
    sql += ' AND l.emp_id = ?';
    params.push(own?.emp_id || '');
  } else if (req.user.role === 'Manager') {
    const own = await employeeForUser(req.user.id);
    sql += ' AND (e.department = ? OR e.department_id = ?)';
    params.push(own?.department || '', own?.department_id || 0);
  }
  sql += ' ORDER BY l.id DESC';
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

app.post('/api/leaves', authenticateToken, async (req, res) => {
  const own = await employeeForUser(req.user.id);
  const empId = req.body.emp_id || own?.emp_id;
  if (!empId || !(await canAccessEmployee(req, empId))) return res.status(403).json({ error: 'Unauthorized employee access.' });
  const { type, from_date, to_date, reason } = req.body;
  if (!type || !isValidDate(from_date) || !isValidDate(to_date) || new Date(to_date) < new Date(from_date)) {
    return res.status(400).json({ error: 'Valid leave type and date range are required.' });
  }
  const days = Math.ceil((new Date(to_date) - new Date(from_date)) / 86400000) + 1;
  const [empRows] = await db.query('SELECT leave_balance, department FROM employees WHERE emp_id = ?', [empId]);
  const emp = empRows[0];
  if (!emp || emp.leave_balance < days) return res.status(400).json({ error: 'Insufficient leave balance.' });
  const [conflicts] = await db.query(
    `SELECT COUNT(DISTINCT l.emp_id) AS count
     FROM leaves l JOIN employees e ON l.emp_id = e.emp_id
     WHERE e.department = ? AND l.status IN ('Pending','Approved') AND NOT (l.to_date < ? OR l.from_date > ?)`,
    [emp.department, from_date, to_date]
  );
  const conflictWarning = safeInt(conflicts[0]?.count) >= 3 ? 1 : 0;
  const [result] = await db.query(
    'INSERT INTO leaves (emp_id, type, from_date, to_date, days, reason, status, conflict_warning) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [empId, type, from_date, to_date, days, reason || '', 'Pending', conflictWarning]
  );
  await addAuditLog(req.user.email, `Submitted leave request ${result.insertId}`, getIp(req), 'Success');
  res.status(201).json({ message: 'Leave application submitted.', leave_id: result.insertId, conflict_warning: !!conflictWarning });
});

app.put('/api/leaves/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const { status, rejection_reason } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Status must be Approved or Rejected.' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM leaves WHERE id = ? FOR UPDATE', [req.params.id]);
    const leave = rows[0];
    if (!leave) {
      await connection.rollback();
      return res.status(404).json({ error: 'Leave request not found.' });
    }
    if (req.user.role === 'Manager' && !(await canAccessEmployee(req, leave.emp_id))) {
      await connection.rollback();
      return res.status(403).json({ error: 'Managers can only approve leave for their own department.' });
    }
    if (status === 'Approved') {
      const [empRows] = await connection.query('SELECT leave_balance FROM employees WHERE emp_id = ? FOR UPDATE', [leave.emp_id]);
      if (!empRows[0] || empRows[0].leave_balance < leave.days) {
        await connection.rollback();
        return res.status(400).json({ error: 'Insufficient leave balance.' });
      }
      if (leave.status !== 'Approved') {
        await connection.query('UPDATE employees SET leave_balance = leave_balance - ? WHERE emp_id = ?', [leave.days, leave.emp_id]);
      }
    }
    await connection.query('UPDATE leaves SET status = ?, rejection_reason = ? WHERE id = ?', [status, rejection_reason || null, req.params.id]);
    await connection.commit();
    await addAuditLog(req.user.email, `Leave ${req.params.id} ${status}`, getIp(req), 'Success');
    res.json({ message: `Leave ${status.toLowerCase()} successfully.`, conflict_warning: !!leave.conflict_warning });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

app.get('/api/performance', authenticateToken, async (req, res) => {
  const params = [];
  let sql = 'SELECT p.*, e.name, e.department FROM performance p JOIN employees e ON p.emp_id = e.emp_id WHERE 1=1';
  if (req.user.role === 'Employee') {
    const own = await employeeForUser(req.user.id);
    sql += ' AND p.emp_id = ?';
    params.push(own?.emp_id || '');
  } else if (req.user.role === 'Manager') {
    const own = await employeeForUser(req.user.id);
    sql += ' AND (e.department = ? OR e.department_id = ?)';
    params.push(own?.department || '', own?.department_id || 0);
  }
  sql += ' ORDER BY p.review_month DESC, e.name';
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

app.get('/api/performance/:emp_id', authenticateToken, async (req, res) => {
  if (!(await canAccessEmployee(req, req.params.emp_id))) return res.status(403).json({ error: 'Unauthorized employee access.' });
  const [rows] = await db.query(
    'SELECT p.*, e.name, e.department FROM performance p JOIN employees e ON p.emp_id = e.emp_id WHERE p.emp_id = ? ORDER BY p.review_month DESC',
    [req.params.emp_id]
  );
  res.json(rows);
});

app.post('/api/performance', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const { emp_id, review_month, kpi_score, task_completion_score, attendance_score } = req.body;
  if (!emp_id || !/^\d{4}-\d{2}$/.test(String(review_month || '')) || ![kpi_score, task_completion_score, attendance_score].every(isScore)) {
    return res.status(400).json({ error: 'Valid employee, month, KPI, task, and attendance scores are required.' });
  }
  if (req.user.role === 'Manager' && !(await canAccessEmployee(req, emp_id))) {
    return res.status(403).json({ error: 'Managers can only manage performance for their own department.' });
  }
  const finalScore = Math.round(((Number(kpi_score) * 0.4) + (Number(task_completion_score) * 0.35) + (Number(attendance_score) * 0.25)) * 100) / 100;
  const rating = ratingFor(finalScore);
  const [previous] = await db.query('SELECT final_score FROM performance WHERE emp_id = ? AND review_month < ? ORDER BY review_month DESC LIMIT 2', [emp_id, review_month]);
  const hrAlert = previous.length >= 2 && finalScore < Number(previous[0].final_score) && Number(previous[0].final_score) < Number(previous[1].final_score) ? 1 : 0;
  await db.query(
    `INSERT INTO performance (emp_id, review_month, kpi_score, task_completion_score, attendance_score, final_score, rating, hr_alert)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE kpi_score=VALUES(kpi_score), task_completion_score=VALUES(task_completion_score), attendance_score=VALUES(attendance_score), final_score=VALUES(final_score), rating=VALUES(rating), hr_alert=VALUES(hr_alert)`,
    [emp_id, review_month, kpi_score, task_completion_score, attendance_score, finalScore, rating, hrAlert]
  );
  await addAuditLog(req.user.email, `Saved performance ${emp_id} ${review_month}`, getIp(req), 'Success');
  res.status(201).json({ message: 'Performance review saved.', final_score: finalScore, rating, hr_alert: !!hrAlert });
});

app.get('/api/dashboard/metrics', authenticateToken, async (req, res) => {
  const scope = await employeeScope(req, 'e');
  const [totalEmployees] = await db.query(`SELECT COUNT(*) AS total FROM employees e WHERE 1=1 ${scope.clause}`, scope.params);
  const [presentToday] = await db.query(`SELECT COUNT(*) AS total FROM attendance a JOIN employees e ON a.emp_id = e.emp_id WHERE a.date = CURDATE() AND a.status IN ('Present','Late') ${scope.clause}`, scope.params);
  const [lateToday] = await db.query(`SELECT COUNT(*) AS total FROM attendance a JOIN employees e ON a.emp_id = e.emp_id WHERE a.date = CURDATE() AND a.status = 'Late' ${scope.clause}`, scope.params);
  const [pendingLeave] = await db.query(`SELECT COUNT(*) AS total FROM leaves l JOIN employees e ON l.emp_id = e.emp_id WHERE l.status = 'Pending' ${scope.clause}`, scope.params);
  const [highPerformers] = await db.query(`SELECT COUNT(DISTINCT p.emp_id) AS total FROM performance p JOIN employees e ON p.emp_id = e.emp_id WHERE p.final_score >= 85 AND p.review_month >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 MONTH), '%Y-%m') ${scope.clause}`, scope.params);
  const [atRisk] = await db.query(`SELECT COUNT(DISTINCT p.emp_id) AS total FROM performance p JOIN employees e ON p.emp_id = e.emp_id WHERE (p.final_score < 50 OR p.hr_alert = 1) ${scope.clause}`, scope.params);
  const [highlights] = await db.query(`
    SELECT e.emp_id, e.name, e.department,
      IFNULL(MAX(CASE WHEN p.final_score < 50 OR p.hr_alert = 1 THEN 1 ELSE 0 END), 0) AS low_performance,
      IFNULL(SUM(CASE WHEN a.status = 'Late' AND a.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END), 0) AS late_days
    FROM employees e
    LEFT JOIN performance p ON e.emp_id = p.emp_id
    LEFT JOIN attendance a ON e.emp_id = a.emp_id
    WHERE 1=1 ${scope.clause}
    GROUP BY e.emp_id, e.name, e.department
    HAVING low_performance = 1 OR late_days > 3
    ORDER BY low_performance DESC, late_days DESC
    LIMIT 10
  `, scope.params);
  const [personal] = req.user.role === 'Employee'
    ? await db.query(`
      SELECT e.leave_balance, p.rating
      FROM employees e
      LEFT JOIN performance p ON e.emp_id = p.emp_id
      WHERE e.user_id = ?
      ORDER BY p.review_month DESC
      LIMIT 1
    `, [req.user.id])
    : [[]];
  res.json({
    totalEmployees: totalEmployees[0].total,
    presentToday: presentToday[0].total,
    lateEmployeesToday: lateToday[0].total,
    pendingLeave: pendingLeave[0].total,
    highPerformers: highPerformers[0].total,
    atRiskEmployees: atRisk[0].total,
    leaveBalance: personal[0]?.leave_balance,
    performanceRating: personal[0]?.rating,
    personalRecommendations: req.user.role === 'Employee' ? highlights.length : undefined,
    highlights: highlights.map((row) => ({ ...row, poor_attendance: safeInt(row.late_days) > 3 }))
  });
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  const scope = await employeeScope(req, 'e');
  const [totalEmployees] = await db.query(`SELECT COUNT(*) AS total FROM employees e WHERE 1=1 ${scope.clause}`, scope.params);
  const [presentToday] = await db.query(`SELECT COUNT(*) AS total FROM attendance a JOIN employees e ON a.emp_id = e.emp_id WHERE a.date = CURDATE() AND a.status IN ('Present','Late') ${scope.clause}`, scope.params);
  const [lateToday] = await db.query(`SELECT COUNT(*) AS total FROM attendance a JOIN employees e ON a.emp_id = e.emp_id WHERE a.date = CURDATE() AND a.status = 'Late' ${scope.clause}`, scope.params);
  const [pendingLeave] = await db.query(`SELECT COUNT(*) AS total FROM leaves l JOIN employees e ON l.emp_id = e.emp_id WHERE l.status = 'Pending' ${scope.clause}`, scope.params);
  const [highPerformers] = await db.query(`SELECT COUNT(DISTINCT p.emp_id) AS total FROM performance p JOIN employees e ON p.emp_id = e.emp_id WHERE p.final_score >= 85 ${scope.clause}`, scope.params);
  const [atRisk] = await db.query(`SELECT COUNT(DISTINCT p.emp_id) AS total FROM performance p JOIN employees e ON p.emp_id = e.emp_id WHERE (p.final_score < 50 OR p.hr_alert = 1) ${scope.clause}`, scope.params);
  const [activeUsers] = await db.query('SELECT COUNT(*) AS total FROM users');
  const [securityAlerts] = req.user.role === 'Admin'
    ? await db.query("SELECT COUNT(*) AS total FROM audit_logs WHERE result <> 'Success' AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)")
    : [[{ total: 0 }]];
  res.json({
    totalEmployees: totalEmployees[0].total,
    presentToday: presentToday[0].total,
    lateToday: lateToday[0].total,
    pendingLeaves: pendingLeave[0].total,
    highPerformers: highPerformers[0].total,
    atRiskEmployees: atRisk[0].total,
    activeUsers: activeUsers[0]?.total || 0,
    securityAlerts: securityAlerts[0]?.total || 0
  });
});

app.get('/api/dashboard/report-data', authenticateToken, async (req, res) => {
  const scope = await employeeScope(req, 'e');
  const [attendanceByMonth] = await db.query(`
    SELECT DATE_FORMAT(a.date, '%Y-%m') AS month,
      SUM(a.status = 'Present') AS present,
      SUM(a.status = 'Late') AS late,
      SUM(a.status = 'Absent') AS absent
    FROM attendance a
    JOIN employees e ON a.emp_id = e.emp_id
    WHERE a.date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) ${scope.clause}
    GROUP BY DATE_FORMAT(a.date, '%Y-%m')
    ORDER BY month
  `, scope.params);
  const [performanceByMonth] = await db.query(`
    SELECT p.review_month AS month, ROUND(AVG(p.final_score), 2) AS avg_score
    FROM performance p
    JOIN employees e ON p.emp_id = e.emp_id
    WHERE 1=1 ${scope.clause}
    GROUP BY p.review_month
    ORDER BY p.review_month
  `, scope.params);
  const [departmentHeadcount] = await db.query(`
    SELECT COALESCE(e.department, 'Unassigned') AS department, COUNT(*) AS total
    FROM employees e
    WHERE e.status <> 'Inactive' ${scope.clause}
    GROUP BY COALESCE(e.department, 'Unassigned')
    ORDER BY total DESC
  `, scope.params);
  res.json({ attendanceByMonth, performanceByMonth, departmentHeadcount });
});

app.get('/api/recommendations/:emp_id', authenticateToken, async (req, res) => {
  if (!(await canAccessEmployee(req, req.params.emp_id))) return res.status(403).json({ error: 'Unauthorized employee access.' });
  const [employees] = await db.query('SELECT emp_id, name, leave_balance FROM employees WHERE emp_id = ?', [req.params.emp_id]);
  const employee = employees[0];
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  const [perfRows] = await db.query('SELECT * FROM performance WHERE emp_id = ? ORDER BY review_month DESC LIMIT 1', [req.params.emp_id]);
  const perf = perfRows[0] || {};
  const recommendations = [];
  if (Number(perf.kpi_score) > 80 && Number(perf.attendance_score) > 90) recommendations.push('Promotion Candidate');
  if (Number(perf.attendance_score) < 70 && Number(perf.kpi_score) >= 80) recommendations.push('Attendance Improvement Training');
  if (Number(perf.kpi_score) < 50 && Number(perf.task_completion_score) < 50) recommendations.push('Performance Coaching');
  if (safeInt(employee.leave_balance) <= 3) recommendations.push('Leave Balance Low Warning');
  res.json({ employee, latest_performance: perf, recommendations });
});

app.post('/api/recommendations/:emp_id/advice', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 1000) {
    return res.status(400).json({ error: 'Advice must contain between 1 and 1000 characters.' });
  }
  const [employees] = await db.query('SELECT emp_id, name FROM employees WHERE emp_id = ? LIMIT 1', [req.params.emp_id]);
  const employee = employees[0];
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  const authorName = req.user.name || req.user.email || 'Administrator';
  const [result] = await db.query(
    'INSERT INTO employee_advice_notifications (emp_id, author_user_id, author_name, message) VALUES (?, ?, ?, ?)',
    [employee.emp_id, req.user.id, authorName, message]
  );
  await addAuditLog(req.user.email, `Sent performance advice to ${employee.emp_id}`, getIp(req), 'Success');
  res.status(201).json({ id: result.insertId, message: 'Advice sent to the employee notification center.' });
});

app.post('/api/ai/predict-performance', authenticateToken, async (req, res) => {
  try {
    const { attendance_rate, leave_frequency, kpi_score, performance_score, experience_duration } = req.body;
    res.json(await runPython('predict_performance.py', [attendance_rate, leave_frequency, kpi_score, performance_score, experience_duration]));
  } catch (err) {
    res.status(500).json({ error: 'AI performance prediction failed.', detail: err.message });
  }
});

app.post('/api/ai/predict-employee', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const { emp_id, month } = req.body;
  if (!emp_id || !/^\d{4}-\d{2}$/.test(String(month || ''))) {
    return res.status(400).json({ error: 'Employee and report month are required.' });
  }
  try {
    const [employees] = await db.query(
      'SELECT emp_id, name, department, position, years_experience, experience_duration FROM employees WHERE emp_id = ? LIMIT 1',
      [emp_id]
    );
    const employee = employees[0];
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });

    const monthStart = `${month}-01`;
    const [attendanceRows] = await db.query(
      `SELECT
         SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) AS present_days,
         SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late_days,
         SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_days,
         COUNT(*) AS recorded_days
       FROM attendance
       WHERE emp_id = ? AND date BETWEEN ? AND LAST_DAY(?)`,
      [emp_id, monthStart, monthStart]
    );
    const [performanceRows] = await db.query(
      `SELECT review_month, kpi_score, task_completion_score, attendance_score, final_score, rating
       FROM performance
       WHERE emp_id = ? AND review_month <= ?
       ORDER BY review_month DESC LIMIT 1`,
      [emp_id, month]
    );

    const attendance = attendanceRows[0] || {};
    const absentDays = safeInt(attendance.absent_days);
    const lateDays = safeInt(attendance.late_days);
    const presentDays = safeInt(attendance.present_days);
    const recordedDays = safeInt(attendance.recorded_days);
    const attendanceRate = recordedDays > 0 ? Math.round((presentDays / recordedDays) * 100) : 0;
    const performance = performanceRows[0] || {};
    const kpiScore = Number(performance.kpi_score || 0);
    const taskScore = Number(performance.task_completion_score || 0);
    const attendanceScore = Math.max(0, 100 - (absentDays * 15) - (lateDays * 3));
    let finalScore = Math.round((kpiScore * 0.45) + (taskScore * 0.35) + (attendanceScore * 0.2));
    let prediction = ratingFor(finalScore);
    let recommendation = finalScore >= 85 ? 'Promotion Candidate' : finalScore >= 70 ? 'Maintain Performance' : finalScore >= 50 ? 'Performance Coaching' : 'Immediate Improvement Plan';
    let alert = null;

    if (absentDays > 3) {
      finalScore = Math.min(finalScore, 49);
      prediction = 'Needs Improvement';
      recommendation = 'Immediate Attendance Improvement Plan';
      alert = `Poor attendance detected: ${absentDays} absent days in ${month}.`;
    }

    await addAuditLog(req.user.email, `Generated AI performance prediction for ${emp_id} (${month})`, getIp(req), 'Success');
    res.json({
      employee,
      month,
      prediction,
      confidence: recordedDays > 0 && performanceRows.length ? 92 : 72,
      final_score: finalScore,
      recommendation,
      alert,
      attendance_summary: { present_days: presentDays, late_days: lateDays, absent_days: absentDays, attendance_rate: attendanceRate },
      performance_summary: { kpi_score: kpiScore, task_completion_score: taskScore, source_month: performance.review_month || null },
      explanation: absentDays > 3
        ? `${employee.name} recorded more than three absences. The prediction is marked Needs Improvement regardless of the KPI result.`
        : `${employee.name}'s result combines recorded attendance, KPI and task completion data for an objective monthly prediction.`
    });
  } catch (err) {
    console.error('Employee prediction error:', err);
    res.status(500).json({ error: 'Unable to generate employee performance prediction.' });
  }
});

app.get('/api/ai/recommend-team', authenticateToken, async (req, res) => {
  try {
    const { required_skills = '' } = req.query;
    const scope = await employeeScope(req, 'e');
    const [employees] = await db.query(`SELECT e.emp_id, e.name, e.skills, e.experience_duration, e.years_experience FROM employees e WHERE e.status = ? ${scope.clause}`, ['Active', ...scope.params]);
    res.json(await runPython('recommend_team.py', [required_skills, JSON.stringify(employees)]));
  } catch (err) {
    res.status(500).json({ error: 'AI team recommendation failed.', detail: err.message });
  }
});

app.post('/api/ai/recommend-team', authenticateToken, async (req, res) => {
  try {
    const { required_skills = '' } = req.body;
    const scope = await employeeScope(req, 'e');
    const [employees] = await db.query(`SELECT e.emp_id, e.name, e.skills, e.experience_duration, e.years_experience FROM employees e WHERE e.status = ? ${scope.clause}`, ['Active', ...scope.params]);
    res.json(await runPython('recommend_team.py', [required_skills, JSON.stringify(employees)]));
  } catch (err) {
    res.status(500).json({ error: 'AI team recommendation failed.', detail: err.message });
  }
});

app.post('/api/feedback', authenticateToken, requireRole(['Employee']), async (req, res) => {
  try {
    const { category, feedback_text, is_anonymous = false } = req.body || {};
    if (!FEEDBACK_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Choose a valid feedback category.' });
    if (typeof feedback_text !== 'string' || !feedback_text.trim() || feedback_text.length > 2000) {
      return res.status(400).json({ error: 'Feedback must contain 1 to 2000 characters.' });
    }
    if (typeof is_anonymous !== 'boolean') return res.status(400).json({ error: 'Invalid anonymous setting.' });
    const employee = await employeeForUser(req.user.id);
    if (!employee?.emp_id) return res.status(403).json({ error: 'Your account is not linked to an employee profile.' });
    const [result] = await db.query(
      `INSERT INTO sentiment_feedback (emp_id, category, feedback_text, is_anonymous, analysis_status)
       VALUES (?, ?, ?, ?, 'Pending')`,
      [is_anonymous ? null : employee.emp_id, category, feedback_text.trim(), is_anonymous ? 1 : 0]
    );
    res.status(201).json({ id: result.insertId, message: 'Your feedback has been submitted successfully.' });
  } catch (err) {
    console.error('Employee feedback submission failed:', { userId: req.user.id, error: err });
    res.status(500).json({ error: 'Feedback could not be submitted. Please try again.' });
  }
});

app.get('/api/feedback/my', authenticateToken, requireRole(['Employee']), async (req, res) => {
  try {
    const employee = await employeeForUser(req.user.id);
    if (!employee?.emp_id) return res.status(403).json({ error: 'Your account is not linked to an employee profile.' });
    const [rows] = await db.query(
      `SELECT id, category, feedback_text, sentiment, analysis_status, submitted_at, analyzed_at
       FROM sentiment_feedback WHERE emp_id = ? AND is_anonymous = 0
       ORDER BY submitted_at DESC, id DESC LIMIT 100`,
      [employee.emp_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Employee feedback history failed:', { userId: req.user.id, error: err });
    res.status(500).json({ error: 'Feedback history could not be loaded. Please try again.' });
  }
});

const adminFeedbackSelect = `SELECT f.id,
  CASE WHEN f.is_anonymous = 1 THEN NULL ELSE f.emp_id END AS emp_id,
  CASE WHEN f.is_anonymous = 1 THEN 'Anonymous Employee'
       WHEN f.emp_id IS NULL THEN 'Former employee'
       ELSE e.name END AS employee_name,
  f.category, f.feedback_text, f.is_anonymous, f.sentiment, f.confidence,
  f.key_concern, f.recommendation, f.analysis_status, f.submitted_at, f.analyzed_at
  FROM sentiment_feedback f LEFT JOIN employees e ON e.emp_id = f.emp_id`;

app.get('/api/admin/feedback', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const status = String(req.query.status || 'All');
  if (!['All', 'Pending', 'Analyzed'].includes(status)) return res.status(400).json({ error: 'Invalid feedback status.' });
  try {
    const params = status === 'All' ? [] : [status];
    const where = status === 'All' ? '' : ' WHERE f.analysis_status = ?';
    const [items] = await db.query(`${adminFeedbackSelect}${where} ORDER BY f.submitted_at DESC, f.id DESC LIMIT 200`, params);
    const [[counts]] = await db.query(
      `SELECT COUNT(*) AS all_count,
       SUM(analysis_status = 'Pending') AS pending_count,
       SUM(analysis_status = 'Analyzed') AS analyzed_count
       FROM sentiment_feedback`
    );
    res.json({ items, counts: {
      All: Number(counts.all_count || 0), Pending: Number(counts.pending_count || 0), Analyzed: Number(counts.analyzed_count || 0)
    } });
  } catch (err) {
    console.error('Admin feedback list failed:', err);
    res.status(500).json({ error: 'Employee feedback could not be loaded. Please try again.' });
  }
});

app.post('/api/admin/feedback/:id/analyze', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const feedbackId = Number(req.params.id);
  if (!Number.isSafeInteger(feedbackId) || feedbackId < 1) return res.status(400).json({ error: 'Invalid feedback ID.' });
  try {
    const [[feedback]] = await db.query(
      'SELECT id, category, feedback_text, analysis_status FROM sentiment_feedback WHERE id = ? LIMIT 1',
      [feedbackId]
    );
    if (!feedback) return res.status(404).json({ error: 'Feedback was not found.' });
    if (feedback.analysis_status === 'Analyzed') return res.status(409).json({ error: 'This feedback has already been analyzed.' });
    const analysis = await runPython('sentiment_analyzer.py', [feedback.feedback_text]);
    if (!['Positive', 'Neutral', 'Negative'].includes(analysis?.sentiment)) throw new Error('Invalid sentiment engine output');
    if (analysis.engine === 'local-js-fallback') {
      console.warn('Sentiment Python process unavailable; using local rules:', { feedbackId, reason: analysis.fallback_reason });
    }
    const decision = feedbackDecisionSupport(feedback.category, analysis.sentiment);
    const confidence = Number.isFinite(Number(analysis.confidence)) && analysis.confidence !== null
      && Number(analysis.confidence) >= 0 && Number(analysis.confidence) <= 1 ? Number(analysis.confidence) : null;
    const [updated] = await db.query(
      `UPDATE sentiment_feedback
       SET sentiment = ?, confidence = ?, key_concern = ?, recommendation = ?,
           analysis_status = 'Analyzed', analyzed_at = NOW()
       WHERE id = ? AND analysis_status = 'Pending'`,
      [analysis.sentiment, confidence, decision.key_concern, decision.recommendation, feedbackId]
    );
    if (!updated.affectedRows) return res.status(409).json({ error: 'This feedback has already been analyzed.' });
    await addAuditLog(req.user.email, `ANALYZE_EMPLOYEE_FEEDBACK ID ${feedbackId}`, getIp(req), 'Success');
    const [[item]] = await db.query(`${adminFeedbackSelect} WHERE f.id = ? LIMIT 1`, [feedbackId]);
    res.json({ ...item, analysis_method: analysis.analysis_method || 'Rule-based prototype' });
  } catch (err) {
    console.error('Employee sentiment analysis failed:', { feedbackId, error: err });
    res.status(500).json({ error: 'Sentiment analysis could not be completed. Please try again.' });
  }
});

app.post('/api/ai/sentiment', authenticateToken, requireRole(['Admin']), (_req, res) => {
  res.status(410).json({ error: 'Select submitted employee feedback from AI Analytics to run sentiment analysis.' });
});

app.post('/api/ai/turnover-risk', authenticateToken, async (req, res) => {
  try {
    const { attendance_trend, leave_frequency, performance_trend, engagement_score } = req.body;
    res.json(await runPython('turnover_risk.py', [attendance_trend, leave_frequency, performance_trend, engagement_score]));
  } catch (err) {
    res.status(500).json({ error: 'AI turnover risk prediction failed.', detail: err.message });
  }
});

app.get('/api/audit-logs', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const [rows] = await db.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100');
  res.json(rows);
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
  const scope = await employeeScope(req, 'e');
  const [auditLogs] = req.user.role === 'Admin'
    ? await db.query('SELECT id, action, result, timestamp FROM audit_logs ORDER BY id DESC LIMIT 5')
    : [[]];
  const [pendingLeaves] = await db.query(`SELECT COUNT(*) AS total FROM leaves l JOIN employees e ON l.emp_id = e.emp_id WHERE l.status = 'Pending' ${scope.clause}`, scope.params);
  const [poorAttendance] = await db.query(`
    SELECT e.name, COUNT(*) AS late_days
    FROM attendance a JOIN employees e ON a.emp_id = e.emp_id
    WHERE a.status = 'Late' AND a.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ${scope.clause}
    GROUP BY e.emp_id, e.name
    HAVING late_days > 3
    LIMIT 5
  `, scope.params);
  const [performanceAlerts] = await db.query(`
    SELECT e.name, p.review_month, p.final_score
    FROM performance p JOIN employees e ON p.emp_id = e.emp_id
    WHERE (p.hr_alert = 1 OR p.final_score < 50) ${scope.clause}
    ORDER BY p.review_month DESC
    LIMIT 5
  `, scope.params);
  const ownEmployee = await employeeForUser(req.user.id);
  const qrAccess = req.user.role === 'Employee' ? await availableAttendanceQrSessions(ownEmployee?.emp_id) : [];
  const [adviceNotifications] = ownEmployee
    ? await db.query(
      `SELECT id, author_name, message, is_read, created_at
       FROM employee_advice_notifications WHERE emp_id = ? ORDER BY created_at DESC LIMIT 10`,
      [ownEmployee.emp_id]
    )
    : [[]];
  res.json({ auditLogs, pendingLeaves: pendingLeaves[0]?.total || 0, poorAttendance, performanceAlerts, adviceNotifications, qrAccess });
});

app.put('/api/notifications/advice/read', authenticateToken, async (req, res) => {
  const ownEmployee = await employeeForUser(req.user.id);
  if (!ownEmployee) return res.json({ message: 'No employee notifications to update.' });
  await db.query('UPDATE employee_advice_notifications SET is_read = 1 WHERE emp_id = ?', [ownEmployee.emp_id]);
  res.json({ message: 'Advice notifications marked as read.' });
});

app.get('/api/reports/summary', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const { month, start } = monthBounds(req.query.month);
  const scope = await employeeScope(req, 'e');
  const [auditCount] = req.user.role === 'Admin' ? await db.query('SELECT COUNT(*) AS total FROM audit_logs') : [[{ total: 0 }]];
  const [attendanceRows] = await db.query(
    `SELECT e.emp_id, e.name, e.department,
      COUNT(a.id) AS recorded_days,
      SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) AS present_days,
      SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_days,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_days,
      ROUND(SUM(IFNULL(a.working_hours, 0)), 2) AS total_working_hours
     FROM employees e
     LEFT JOIN attendance a ON e.emp_id = a.emp_id AND a.date BETWEEN ? AND LAST_DAY(?)
     WHERE 1=1 ${scope.clause}
     GROUP BY e.emp_id, e.name, e.department
     ORDER BY e.name`,
    [start, start, ...scope.params]
  );
  const [performanceMonths] = await db.query(`SELECT COUNT(DISTINCT p.review_month) AS total FROM performance p JOIN employees e ON p.emp_id = e.emp_id WHERE 1=1 ${scope.clause}`, scope.params);
  const [auditLogs] = req.user.role === 'Admin' ? await db.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 25') : [[]];
  const monthlyAttendance = attendanceRows.map((row) => ({
    ...row,
    month,
    attendance_label: safeInt(row.recorded_days) === 0 ? 'No records yet' : safeInt(row.late_days) > 3 ? 'Poor Attendance' : 'Normal'
  }));
  res.json({
    auditEventCount: auditCount[0]?.total || 0,
    poorAttendanceEmployees: monthlyAttendance.filter((row) => row.attendance_label === 'Poor Attendance').length,
    performanceMonths: performanceMonths[0]?.total || 0,
    monthlyAttendance,
    recentAuditLogs: auditLogs
  });
});

app.get('/api/settings', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const [rows] = await db.query('SELECT setting_key, setting_value, updated_at FROM settings ORDER BY setting_key');
  res.json(rows.reduce((acc, row) => {
    acc[row.setting_key] = row.setting_value;
    return acc;
  }, {}));
});

app.put('/api/settings', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const allowed = ['company_name', 'work_start_time', 'session_timeout_minutes', 'leave_conflict_limit'];
  const updates = Object.entries(req.body).filter(([key]) => allowed.includes(key));
  if (!updates.length) return res.status(400).json({ error: 'No valid settings supplied.' });
  for (const [key, value] of updates) {
    await db.query(
      `INSERT INTO settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, String(value)]
    );
  }
  await addAuditLog(req.user.email, 'Updated system settings', getIp(req), 'Success');
  res.json({ message: 'Settings updated successfully.' });
});

app.put('/api/settings/:key', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const allowed = [
    'company_name',
    'work_start_time',
    'session_timeout_minutes',
    'leave_conflict_limit',
    'security_2fa',
    'security_rbac',
    'security_audit_logging',
    'security_csrf',
    'security_file_upload_protection'
  ];
  const { key } = req.params;
  const value = req.body.value;
  if (!allowed.includes(key)) return res.status(400).json({ error: 'Invalid setting key.' });
  await db.query(
    `INSERT INTO settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, String(value ?? '')]
  );
  await addAuditLog(req.user.email, `Updated setting ${key}`, getIp(req), 'Success');
  res.json({ message: 'Setting updated successfully.' });
});

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error('Unhandled API request failed:', { method: req.method, path: req.path, error: err });
  if (res.headersSent) return;
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request body.' });
  res.status(500).json({ error: 'The request could not be completed. Please try again.' });
});

function startBackendServer(initialPort, retries = 3) {
  const port = Number(initialPort) || 5000;
  const host = process.env.HOST || '0.0.0.0';
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve({ server, port }));
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE' && process.env.NODE_ENV !== 'production' && retries > 0) {
        const nextPort = port + 1;
        console.warn(`Port ${port} already in use. Trying port ${nextPort}...`);
        startBackendServer(nextPort, retries - 1).then(resolve).catch(reject);
      } else {
        reject(error);
      }
    });
  });
}

ensureSchema()
  .then(() => startBackendServer(PORT).then(({ port }) => console.log(`Backend server running on port ${port}`)))
  .catch((err) => {
    console.error('Failed to initialize backend schema:', err);
    process.exit(1);
  });
