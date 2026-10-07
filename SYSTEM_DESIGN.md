# IEMS System Design

## Architecture Overview

- Frontend: React.js with Tailwind CSS and Chart.js
- Backend: Node.js + Express API with MySQL and secure middleware
- AI: Python modules for predictions, recommendation, and sentiment analysis
- Database: Normalized MySQL schema with users, employees, attendance, leaves, performance, projects, sentiment_feedback, audit_logs

### Logical Layers

- Presentation: React UI routes for Dashboard, Employees, Attendance, Leaves, AI Hub
- API: Authentication, employee management, attendance, leave workflow, performance, AI triggers, audit logs
- Data: MySQL normalized schema, prepared statements, role-based access control
- AI: Python scripts executed by backend; results returned as JSON

## Folder Structure

- `backend/`
  - `index.js` - central Express server and API routes
  - `db.js` - MySQL connection pool
  - `security.js` - rate limiting, CSRF protection, sanitization, password utilities
  - `email.js` - Gmail SMTP and OTP email service
  - `uploads/documents/` - secured employee document storage

- `frontend/`
  - `index.html` - application entrypoint
  - `src/`
    - `main.jsx` - React bootstrap
    - `App.jsx` - route definitions and layout
    - `components/` - sidebar and protected route
    - `pages/` - dashboard and management views
    - `lib/` - auth and API helper modules
    - `index.css` - Tailwind styling

- `database/schema.sql` - full schema and seeded data
- `ai/` - standalone model scripts
- `legacy-php/` - archived PHP version kept for reference only

## API Endpoints

- `POST /api/auth/login` - verify password and send or generate OTP
- `POST /api/auth/verify-otp` - verify OTP and issue JWT
- `POST /api/auth/resend-otp` - generate a new OTP
- `GET /api/auth/me` - fetch current user
- `GET /api/employees` - list employees
- `POST /api/employees` - add employee
- `PUT /api/employees/:emp_id` - update employee
- `DELETE /api/employees/:emp_id` - remove employee
- `POST /api/employees/:emp_id/documents` - upload employee PDF/JPG/PNG document
- `GET /api/attendance` - attendance records
- `POST /api/attendance/qr-session` - Admin creates one shared, time-limited QR per action
- `GET /api/attendance/qr-active` - Employee sees QR availability without the secret token
- `POST /api/attendance/qr-submit` - Employee camera scan records own attendance
- `POST /api/attendance/check-in` - Admin-only manual attendance correction
- `POST /api/attendance/check-out` - Admin-only manual checkout correction
- `GET /api/attendance/report` - monthly attendance report
- `GET /api/leaves` - leave requests
- `POST /api/leaves` - submit leave request
- `PUT /api/leaves/:id` - approve/reject leave
- `GET /api/performance` - performance reviews
- `POST /api/performance` - add or update review
- `GET /api/dashboard/metrics` - dashboard KPI metrics
- `GET /api/dashboard/report-data` - graph/report data
- `GET /api/recommendations/:emp_id` - smart employee recommendations
- `POST /api/ai/predict-performance` - performance prediction
- `POST /api/ai/turnover-risk` - turnover risk prediction
- `GET /api/ai/recommend-team` - team recommendation
- `POST /api/feedback` - Employee submits named or anonymous feedback
- `GET /api/feedback/my` - Employee sees only their named feedback history
- `GET /api/admin/feedback` - Admin lists submitted feedback by analysis status
- `POST /api/admin/feedback/:id/analyze` - Admin runs sentiment analysis and records an audit event
- `POST /api/ai/sentiment` - retired direct-text endpoint (410)
- `GET /api/audit-logs` - audit history (Admin only)

## Security Documentation

- Authentication uses JWT tokens with expiration
- Login requires OTP verification before token creation
- Role-Based Access Control enforced via middleware
- Passwords hashed with bcrypt and validated on login
- Login attempts limited; lockout enforced after repeated failures
- Inputs are sanitized to reduce XSS attack surface
- File uploads restricted to PDF/JPG/PNG and 2 MB max
- CSRF middleware validates origin or Authorization header
- Audit logs capture success/failure actions for compliance

## AI Model Workflow

1. Frontend sends feature payload to backend AI endpoint.
2. Backend executes Python script using `PYTHON_PATH` environment setting.
3. Python models compute predictions and serialize JSON.
4. API returns results to the UI for dashboard and recommendation display.

Sentiment follows a separate employee-led workflow: an Employee submits feedback, the existing `sentiment_feedback` table stores it as Pending, and an Admin selects that record for rule-based Python analysis. The backend stores the label and management recommendation, then writes an audit event. Anonymous submissions have no employee ID in the database. Recommendations are Admin-only and never trigger an automated employment decision.

## Deployment Guide

- Provision MySQL and import `database/schema.sql`.
- Configure root `.env` with secure secrets.
- Install backend and frontend dependencies:
  - `cd backend && npm install`
  - `cd frontend && npm install`
- Start local dev servers:
- Use `start-backend.bat` and `start-frontend.bat`, or run npm scripts manually.
- For production, build frontend and serve static assets from Node or CDN.
- Use HTTPS and a managed MySQL instance for production security.
