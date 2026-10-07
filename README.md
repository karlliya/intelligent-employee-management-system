# SecureHAM IEMS

For public HTTPS deployment, see [Ubuntu VPS deployment](docs/DEPLOY_UBUNTU.md).

SecureHAM IEMS is a web-based Intelligent Employee Management System for an engineering company.

The system uses:

- `frontend/` for the React dashboard UI
- `backend/` for the Node.js Express API
- `database/` for MySQL schema and sample data
- `ai/` for AI helper scripts
- `index.php` as a simple Laragon/PHP launcher page

## Easy Run

Double-click:

```text
START_IEMS_LIVE.bat
```

It starts:

- MySQL
- Backend API on port `5000`
- Frontend dashboard on port `3000`

Then open:

```text
http://localhost:3000
```

## Open From Phone Or Another Laptop

Make sure the other device is on the same WiFi.

Open:

```text
http://192.168.100.155:3000
```

If it cannot open, allow Node.js through Windows Firewall for Private Network.

## PHP Launcher

If using Laragon/Apache, open the project folder URL and use:

```text
index.php
```

The PHP page shows:

- Frontend status
- Backend status
- MySQL status
- Local dashboard link
- Same-WiFi dashboard link

## Stop The System

Double-click:

```text
STOP_IEMS.bat
```

## Check Status

Double-click:

```text
CHECK_IEMS_STATUS.bat
```

## Login Accounts

Password for sample accounts:

```text
Admin123456!
```

Accounts:

```text
admin@iems.local
employee.sofia@iems.local
employee.hakim@iems.local
employee.mei@iems.local
```

Only Admin and Employee roles can sign in. Existing HR/Manager records remain in the database but their access is disabled. Run `seed-database.bat` to add the sample accounts without deleting existing data. The sample password applies to newly created accounts; existing passwords are not reset.

For a sample account such as `employee.hakim@iems.local`, double-click `start-local-sample.bat` and open `http://127.0.0.1:5001`. Sign in with the sample password above. Its six-digit verification code appears on the OTP page because `.local` addresses cannot receive email. This local server listens only on your PC and is separate from the public demo; sample OTP is not available through the public link. Keep Laragon MySQL running.

### Real Gmail OTP

Sample `@iems.local` accounts cannot receive email. For real OTP, each login account must use a reachable email address in `users.email`. Configure the sender in the root `.env`: set `GMAIL_USER` to the sending Gmail address and `GMAIL_PASSWORD` to its Google App Password (not the normal Gmail password). Enable 2-Step Verification on that Google account first. Set `DEV_OTP_FALLBACK=0` when you no longer need local sample OTP.

When Admin adds a new Employee with a real email address, IEMS sends one invitation link to that address. The employee sets their own password through the link (valid for one hour), then signs in and receives an email OTP. No temporary password is sent by email. If Gmail cannot accept the invitation, the account is not created. Changing an existing employee's email sends a verification link to the new address.

On this Windows/Laragon setup, create a new App Password at Google's App Passwords page and copy it. Then double-click `SETUP_GMAIL_OTP.bat`. The script reads the clipboard automatically; do not type or paste the code into the terminal. It clears the clipboard, tests SMTP, and restores the previous `.env` value if verification fails. Restart IEMS after it reports success.

Test SMTP authentication from the project root without sending an email:

```powershell
& 'C:\laragon\bin\nodejs\node-v22\node.exe' backend/check-email.js
```

Restart the backend after changing `.env`. Do not paste App Passwords into source files or chat.

## Project Structure

```text
SecureHAM IEMS
├── index.php                 PHP launcher for easy access
├── START_IEMS_LIVE.bat       One-click live run
├── STOP_IEMS.bat             Stop frontend/backend
├── CHECK_IEMS_STATUS.bat     Check running status
├── backend/                  API, auth, OTP, RBAC, uploads
├── frontend/                 React pages and Apple-style UI
├── database/                 MySQL schema and seed data
├── ai/                       AI scripts and fallback logic
└── docs/                     Simple project documentation
```

## Main Pages

- Dashboard
- Employees / My Profile
- Attendance / My Attendance
- Leaves / My Leave
- Performance / My Performance
- Employee Feedback (Employee only)
- AI Analytics
- Reports
- Audit Logs
- Settings

Role-based access controls what each user can see.

## Employee Feedback and Sentiment

Employees submit a category and their own feedback on Employee Feedback. Named submissions appear in My Feedback History; anonymous submissions store no employee identifier and therefore cannot appear in personal history. Admin opens AI Analytics > Employee Sentiment, filters submitted feedback, and analyzes a pending record. The result and management recommendation remain Admin-only; employees can see their own sentiment label after analysis, not the recommendation. Analysis creates an audit log entry and cannot be run twice on the same feedback.

The sentiment script is a keyword-based decision-support prototype. Its confidence is intentionally shown as "Not calibrated" rather than a fabricated probability. It does not make employment decisions.

The existing `sentiment_feedback` table is upgraded automatically when the backend restarts. The idempotent manual migration is `database/migrations/002_employee_feedback.sql`; on this Laragon setup it can also be run from PowerShell with:

```powershell
& 'C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe' --host=127.0.0.1 --user=root employee_management --execute="SOURCE C:/laragon/Intelligent-Employee-Management-System/database/migrations/002_employee_feedback.sql"
```

## QR Attendance Demo

For phone login, double-click `start-public-demo.bat`. It creates a temporary Cloudflare HTTPS link and refreshes `presentation-assets/project-demo-qr.png`, the demo presentation PDF, and the slide preview to open `/login`. Check `presentation-assets/project-demo-url.txt` before presenting; the QR stops working when this PC or the tunnel stops. Use a real email account for OTP. The `@iems.local` sample accounts remain PC-only.

1. Admin opens Attendance and generates a shared check-in or check-out QR. One QR is valid for every eligible Employee for 10 minutes. Repeating Generate while it is still valid reuses the same QR.
2. Each Employee signs in on their own device, opens Attendance, taps Open camera scanner, and scans the QR displayed by Admin. The QR contains a short-lived token, not a login link. Each employee can use the session once; their own JWT identifies the attendance record.
3. Employees can see QR availability in the page and notification bell, but neither reveals the QR token. Admin generates a separate shared QR for check-out.

Camera access needs HTTPS or localhost. Use the HTTPS public demo link on phones; an ordinary HTTP LAN address cannot open the browser camera. Browser alerts require the employee to grant permission and work only while the page is running. The temporary public demo URL works only while this PC, MySQL, backend, and tunnel are running.
