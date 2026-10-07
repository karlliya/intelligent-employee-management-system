# Deploy IEMS on an Ubuntu VPS

This is the recommended path for a small company pilot: one Ubuntu VPS, one domain,
Nginx for HTTPS, Node.js for the API and built React app, and MySQL on the same VPS.
The Windows batch files and Laragon are for local development only. Do not publish
port 5000 directly to the internet.

## 1. Prepare the server

Point a domain such as `iems.example.com` to the VPS public IP (DNS A record).
Install Node.js (matching the project-tested major version, currently 22), npm,
MySQL Server, Nginx, and Certbot using their official Ubuntu installation guides.
Allow only SSH (22), HTTP (80), and HTTPS (443) through the VPS firewall. Confirm
`node --version`, `npm --version`, and `mysql --version` before proceeding.

Create a dedicated unprivileged Linux account (example: `iems`) and deploy the
project into `/opt/iems` owned by that account. Copy the source via a private Git
repository or a secure file transfer. Never transfer `.env`, `node_modules`, or
local sample data from your Windows machine.

## 2. Database

Create a dedicated MySQL user with a long random password and rights only to the
IEMS database. As a MySQL administrator:

```sql
CREATE DATABASE employee_management CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'iems_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_LONG_RANDOM_PASSWORD';
GRANT ALL PRIVILEGES ON employee_management.* TO 'iems_app'@'localhost';
```

From the project directory, import the schema:

```bash
mysql -u iems_app -p employee_management < database/schema.sql
```

Do **not** run `database/seed.js` on a public server: it creates sample accounts.
To create the first administrator, register a real company email in the UI and
complete email verification. Then, as the database administrator, promote only
that verified account:

```sql
UPDATE users SET role = 'Admin'
WHERE email = 'admin@your-company.com' AND email_verified = 1;
```

Confirm exactly one row changed. Sign in again to receive a JWT with the new
role. Keep a tested database backup before upgrades.

## 3. Configure and build

Copy `.env.example` to `.env` on the VPS and set at least:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=5000
FRONTEND_URL=https://iems.example.com
CORS_ORIGIN=https://iems.example.com
VITE_API_URL=
DB_HOST=localhost
DB_PORT=3306
DB_USER=iems_app
DB_PASS=REPLACE_WITH_DATABASE_PASSWORD
DB_NAME=employee_management
JWT_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES
DEV_OTP_FALLBACK=0
GMAIL_USER=company-mailbox@gmail.com
GMAIL_PASSWORD=REPLACE_WITH_GMAIL_APP_PASSWORD
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_ENCRYPTION=tls
SMTP_FROM_EMAIL=company-mailbox@gmail.com
```

Set `.env` permissions to `600` and ownership to the IEMS service account.
Generate secrets on the VPS, for example `openssl rand -hex 32` for `JWT_SECRET`.
Gmail needs an App Password or an approved SMTP relay; a regular Gmail password
will not work. Do not commit `.env` or paste its values into logs or screenshots.
The site deliberately refuses to start in production with the example JWT secret
or local OTP fallback enabled.

Install dependencies and build the frontend from the project root:

```bash
cd /opt/iems/backend && npm ci --omit=dev
cd /opt/iems/frontend && npm ci && npm run build
```

The Express server serves `frontend/dist` and `/api` on the same domain. Keep
`VITE_API_URL` empty for this deployment; a localhost URL baked into the build
would break access from phones and other computers. The `ai/` Python scripts are
optional; install Python 3 and their dependencies if you need the Python engine.

## 4. Run as a service

Create `/etc/systemd/system/iems.service` (adjust the Node path from `which node`):

```ini
[Unit]
Description=IEMS web application
After=network.target mysql.service

[Service]
Type=simple
User=iems
Group=iems
WorkingDirectory=/opt/iems/backend
EnvironmentFile=/opt/iems/.env
ExecStart=/usr/bin/node /opt/iems/backend/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now iems
sudo systemctl status iems
curl http://127.0.0.1:5000/api/health
```

If health is not `ok`, inspect `sudo journalctl -u iems -n 100 --no-pager`.
The backend initializes missing schema pieces at startup but cannot replace
proper schema migration and backups.

## 5. HTTPS reverse proxy

Create an Nginx site for your domain:

```nginx
server {
    listen 80;
    server_name iems.example.com;

    client_max_body_size 3m;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site, run `sudo nginx -t`, reload Nginx, then use Certbot's Nginx
instructions to issue an HTTPS certificate for the domain and enable renewal.
Verify `https://iems.example.com/api/health` and the login page from a phone on
mobile data. Check registration verification, login OTP, password reset, and
document upload with real email addresses before inviting employees.

## Before real company use

- Back up MySQL **and** `backend/uploads/` regularly; test restoration.
- Use real mailboxes, not the sample `@iems.local` users, and do not run seed scripts.
- Keep Ubuntu, Node.js, npm dependencies, MySQL, and Nginx patched.
- Perform a security review and test role permissions before storing actual HR data.
- If a cloud host terminates TLS or manages MySQL differently, adapt host,
  service, and database steps rather than exposing the database publicly.
