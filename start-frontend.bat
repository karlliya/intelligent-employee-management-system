@echo off
pushd "%~dp0frontend" || exit /b 1
if exist "C:\laragon\bin\nodejs\node-v22\node.exe" (
  set "PATH=C:\laragon\bin\nodejs\node-v22;%PATH%"
)
if not exist node_modules (
  if exist "C:\laragon\bin\nodejs\node-v22\npm.cmd" (
    "C:\laragon\bin\nodejs\node-v22\npm.cmd" install
  ) else (
    npm install
  )
)
if exist "C:\laragon\bin\nodejs\node-v22\npm.cmd" (
  "C:\laragon\bin\nodejs\node-v22\npm.cmd" run dev -- --host 0.0.0.0
) else (
  npm run dev -- --host 0.0.0.0
)
popd
pause
