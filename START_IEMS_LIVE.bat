@echo off
setlocal
title IEMS Live Launcher

set "ROOT=%~dp0"
set "MYSQL=C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqld.exe"
set "NODE_DIR=C:\laragon\bin\nodejs\node-v22"
set "NODE=%NODE_DIR%\node.exe"

if exist "%NODE%" set "PATH=%NODE_DIR%;%PATH%"

echo.
echo ==========================================
echo   SecureHAM IEMS - Live Launcher
echo ==========================================
echo.

echo [1/4] Starting MySQL...
tasklist /FI "IMAGENAME eq mysqld.exe" 2>NUL | find /I "mysqld.exe" >NUL
if errorlevel 1 (
  if exist "%MYSQL%" (
    start "IEMS MySQL" /min "%MYSQL%"
    timeout /t 5 /nobreak >NUL
  ) else (
    echo MySQL not found at "%MYSQL%".
  )
) else (
  echo MySQL is already running.
)

echo [2/4] Freeing ports 3000 and 5000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(3000,5000); foreach($port in $ports){ Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

echo [3/4] Starting backend API...
start "IEMS Backend API" cmd /k "cd /d %ROOT%backend && %NODE% index.js"

echo [4/4] Starting frontend dashboard...
start "IEMS Frontend" cmd /k "cd /d %ROOT%frontend && npm run dev -- --host 0.0.0.0"

timeout /t 7 /nobreak >NUL

echo.
echo IEMS is starting.
echo.
echo Open on this PC:
echo   http://localhost:3000
echo.
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /R /C:"IPv4 Address"') do (
  set "IP=%%A"
  goto :showip
)
:showip
if defined IP (
  set "IP=%IP: =%"
  echo Open from phone/laptop on same WiFi:
  echo   http://%IP%:3000
)
echo.
echo Login:
echo   Use your registered email and IEMS password.
echo   Admin email: musthaffahaikal@gmail.com
echo.
pause
