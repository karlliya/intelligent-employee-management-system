@echo off
cd /d "%~dp0"
"C:\laragon\bin\nodejs\node-v22\node.exe" database\seed.js
pause
