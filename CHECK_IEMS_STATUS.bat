@echo off
title IEMS Status
echo.
echo SecureHAM IEMS status
echo =====================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Write-Host 'Ports:'; netstat -ano | Select-String ':3000|:5000|:3306'; Write-Host ''; Write-Host 'Frontend:'; try { (Invoke-WebRequest -UseBasicParsing http://localhost:3000).StatusCode } catch { $_.Exception.Message }; Write-Host ''; Write-Host 'Backend:'; try { (Invoke-WebRequest -UseBasicParsing http://localhost:5000/api/health).Content } catch { $_.Exception.Message }"
echo.
pause
