@echo off
title Stop IEMS
echo Stopping IEMS frontend and backend on ports 3000 and 5000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(3000,5000); foreach($port in $ports){ Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo Done.
pause
