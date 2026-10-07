# Project Structure

This project is arranged so it is easy to understand:

```text
root
├── index.php
├── START_IEMS_LIVE.bat
├── STOP_IEMS.bat
├── CHECK_IEMS_STATUS.bat
├── frontend/
├── backend/
├── database/
├── ai/
└── docs/
```

## What Each Part Does

`index.php`

Simple PHP launcher page for Laragon. It shows whether the frontend, backend, and database are running.

`START_IEMS_LIVE.bat`

One-click run script. Use this when you want the system to go live on your PC and same WiFi.

`frontend/`

React dashboard interface. This is what users see in the browser.

`backend/`

Node.js Express API. This handles login, OTP, RBAC, employees, attendance, leave, performance, reports, and AI endpoints.

`database/`

MySQL schema and seed data.

`ai/`

Python AI scripts. If Python is not available, the backend uses local JavaScript fallback logic.

## Daily Use

1. Double-click `START_IEMS_LIVE.bat`
2. Open `http://localhost:3000`
3. For phone/laptop on same WiFi, open `http://192.168.100.155:3000`

## Development Rule

Keep new UI work inside `frontend/src`.

Keep API/database logic inside `backend`.

Keep database setup inside `database`.

Use `index.php` only as the simple PHP launcher, not as a second duplicated system.
