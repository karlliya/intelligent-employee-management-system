@echo off
setlocal

set "MYSQL=C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe"
set "SCHEMA=%~dp0database\schema.sql"

if not exist "%MYSQL%" (
  echo MySQL client not found:
  echo %MYSQL%
  pause
  exit /b 1
)

if not exist "%SCHEMA%" (
  echo Schema file not found:
  echo %SCHEMA%
  pause
  exit /b 1
)

echo Setting up employee_management database...
"%MYSQL%" -uroot < "%SCHEMA%"

if errorlevel 1 (
  echo Database setup failed.
  pause
  exit /b 1
)

echo Database employee_management is ready.
pause
