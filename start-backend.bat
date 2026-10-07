@echo off
pushd "%~dp0backend" || exit /b 1
if exist "C:\laragon\bin\nodejs\node-v22\node.exe" (
  "C:\laragon\bin\nodejs\node-v22\node.exe" index.js
) else (
  node index.js
)
popd
pause
