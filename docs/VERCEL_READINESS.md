# IEMS Vercel Readiness (1 October 2026)

## Current Local Checks

- React/Vite production build: passed.
- Backend syntax and `/api/health`: passed.
- Admin and Employee read-only API smoke checks: passed for authentication, employees, departments, attendance, leaves, performance, dashboard, notifications, and allowed reports/settings/audit routes.
- Employee requests for reports, settings, and audit logs: correctly denied (403).
- AI performance, team, sentiment, turnover-risk, and employee prediction endpoints: returned 200 with sample inputs.
- Sample Employee password -> local OTP -> JWT -> dashboard: passed.
- Gmail SMTP authentication: passed. One test email and a password reset email were accepted by SMTP.
- Local JWT secret was replaced with a unique value in the ignored `.env` file.

These checks do not prove every write workflow or a production deployment. Employee creation with a new real email, QR use on multiple devices, leave approval, document upload, backup/restore, and concurrency still need dedicated end-to-end tests.

## Why A Direct Vercel Deploy Is Not Ready

1. The API currently connects to MySQL on `localhost` with the local Laragon account. Vercel Functions cannot connect to the PC's local MySQL server without a separate, secure network architecture. A managed MySQL-compatible database and migration/backup plan are required.
2. Employee documents are written to `backend/uploads/documents`. A Vercel Function's local filesystem is not durable file storage. Sensitive employee documents require private object storage with authenticated download routes; do not make them public Blob URLs.
3. `backend/index.js` starts a long-running listener and runs schema-altering `ensureSchema()` on startup. The Vercel deployment should export the Express app as a Function and run database migrations separately, not on each cold start.
4. Set production `JWT_SECRET`, `DB_*`, `GMAIL_*`, `FRONTEND_URL`, and `CORS_ORIGIN` in Vercel project settings. Never upload the local `.env`. Disable `DEV_OTP_FALLBACK` in production.
5. The built frontend currently uses same-origin `/api`. Production must serve the API on that origin or set `VITE_API_URL` to a real HTTPS backend and configure CORS accordingly.
6. Python scripts are launched from the Node process locally. A Vercel Node Function should use the built-in JavaScript fallback or move Python analysis to a separately deployed service. Validate result parity before claiming production AI behavior.
7. Vercel account access, a production domain/URL, and an online database/storage provider must be configured before a working deployment can be verified.

## Practical Architecture

Keep the frontend on Vercel. Host the Express API on a persistent Node host, use managed MySQL, and store documents in private object storage. This preserves the current backend behavior with fewer changes. Serving the Express API as a Vercel Function is possible, but requires the changes above and a full regression test after migration.

Do not deploy a public-facing login page against the local Laragon database or real employee data as a shortcut. For an FYP demonstration, use synthetic data and separate credentials.

## Primary References

- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Vercel Functions](https://vercel.com/docs/functions)
- [Vercel Blob and private storage](https://vercel.com/kb/vercel-blob)
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Hobby terms](https://vercel.com/legal/terms)
