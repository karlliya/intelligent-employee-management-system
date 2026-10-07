@echo off
cd /d "%~dp0"
if exist "C:\laragon\bin\nodejs\node-v22\node.exe" (
  "C:\laragon\bin\nodejs\node-v22\node.exe" scripts\generate-demo-qr.js
) else (
  node scripts\generate-demo-qr.js
)
echo.
pause
