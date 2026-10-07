const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Rate limiting configurations
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 failed logins per window
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Simple CSRF Protection middleware
function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const publicPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/verify-otp',
    '/api/auth/resend-otp',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-email',
    '/api/auth/refresh-token'
  ];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'];
  if (!csrfToken && !req.headers.authorization) {
    return res.status(403).json({ error: 'CSRF token missing or invalid request origins.' });
  }
  next();
}

// Input sanitization middleware
function sanitizeInput(req, res, next) {
  const sanitize = (val) => {
    if (typeof val === 'string') {
      // Basic HTML stripping to prevent simple XSS
      return val.replace(/<[^>]*>/g, '').trim();
    }
    return val;
  };

  const sanitizeObject = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      } else {
        obj[key] = sanitize(obj[key]);
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  next();
}

// Password utility functions
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

function generateRandomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

function validatePassword(password) {
  const minLength = 10;
  const requirements = [/[A-Z]/, /[a-z]/, /\d/, /[!@#\$%\^&\*\-_\+=]/];
  return (
    typeof password === 'string' &&
    password.length >= minLength &&
    requirements.every((regex) => regex.test(password))
  );
}

function generateOTP(length = 6) {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += crypto.randomInt(0, 10).toString();
  }
  return otp;
}

function generateOTPSync(length = 6) {
  return generateOTP(length);
}

module.exports = {
  loginRateLimiter,
  csrfProtection,
  sanitizeInput,
  hashPassword,
  verifyPassword,
  generateRandomToken,
  validatePassword,
  generateOTP,
  generateOTPSync
};
