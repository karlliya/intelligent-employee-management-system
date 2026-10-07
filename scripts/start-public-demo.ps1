$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = 'C:\laragon\bin\nodejs\node-v22\node.exe'
$npm = 'C:\laragon\bin\nodejs\node-v22\node_modules\npm\bin\npm-cli.js'
$python = 'C:\laragon\bin\python\python-3.13\python.exe'
$cloudflared = Join-Path $root 'tools\cloudflared.exe'
$pdfDeps = Join-Path $root 'tools\pdf-deps'
$mysql = 'C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqld.exe'
$mysqlConfig = 'C:\laragon\bin\mysql\mysql-8.4.3-winx64\my.ini'

foreach ($binary in @($node, $npm, $python, $cloudflared, $mysql)) {
  if (!(Test-Path -LiteralPath $binary)) { throw "Missing: $binary" }
}
if (!(Test-Path -LiteralPath (Join-Path $pdfDeps 'pymupdf'))) { throw 'Missing tools/pdf-deps. Install PyMuPDF for the presentation PDF refresh.' }

if (!(Get-NetTCPConnection -LocalPort 3306 -ErrorAction SilentlyContinue | Where-Object State -eq Listen)) {
  Start-Process -FilePath $mysql -ArgumentList "--defaults-file=$mysqlConfig" -WorkingDirectory (Split-Path $mysql) -WindowStyle Hidden
  Start-Sleep -Seconds 3
}
if (!(Get-NetTCPConnection -LocalPort 3306 -ErrorAction SilentlyContinue | Where-Object State -eq Listen)) {
  throw 'MySQL did not start. Open Laragon and start MySQL before running this script.'
}

$tunnelLog = Join-Path $root 'tools\cloudflared.err.log'
$tunnelOutput = Join-Path $root 'tools\cloudflared.out.log'
$tunnelProcess = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" |
  Where-Object { $_.CommandLine -match 'tunnel.*--url http://127\.0\.0\.1:5000' } |
  Select-Object -First 1
if ($tunnelProcess -and (Test-Path -LiteralPath $tunnelLog) -and (Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Where-Object State -eq Listen)) {
  $previousLog = Get-Content -LiteralPath $tunnelLog -Raw
  $previousUrls = [regex]::Matches($previousLog, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($previousUrls.Count -gt 0) {
    $previousUrl = $previousUrls[$previousUrls.Count - 1].Value
    $previousHealthy = $false
    try { $previousHealthy = (Invoke-WebRequest "$previousUrl/api/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch {}
    if (!$previousHealthy) {
      Stop-Process -Id $tunnelProcess.ProcessId
      Start-Sleep -Seconds 1
      $tunnelProcess = $null
    }
  }
}
if (!$tunnelProcess) {
  $tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList 'tunnel','--no-autoupdate','--url','http://127.0.0.1:5000' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOutput -RedirectStandardError $tunnelLog -PassThru
}

$url = $null
for ($i = 0; $i -lt 30 -and !$url; $i++) {
  Start-Sleep -Seconds 1
  if (!(Test-Path -LiteralPath $tunnelLog)) { continue }
  $log = Get-Content -LiteralPath $tunnelLog -Raw
  $urlMatches = [regex]::Matches($log, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($urlMatches.Count -gt 0 -and $log -match 'Registered tunnel connection') {
    $url = $urlMatches[$urlMatches.Count - 1].Value
  }
}
if (!$url) { throw 'Cloudflare Quick Tunnel did not connect. Check internet access and tools/cloudflared.err.log.' }

Set-Content -LiteralPath (Join-Path $root '.env.demo') -Value "DEMO_PUBLIC_URL=$url" -Encoding Ascii
$env:DEMO_PUBLIC_URL = $url
$env:FRONTEND_URL = $url
$env:NODE_ENV = 'production'
$env:DEV_OTP_FALLBACK = '0'
$env:PATH = "$(Split-Path $node);$env:PATH"

Push-Location (Join-Path $root 'frontend')
try {
  & $node $npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }

$listener = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Where-Object State -eq Listen | Select-Object -First 1
if ($listener) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if (!$process -or $process.CommandLine -notmatch 'node\.exe.*index\.js') {
    throw 'Port 5000 belongs to another application. Stop it manually before continuing.'
  }
  Stop-Process -Id $process.ProcessId
  Start-Sleep -Seconds 1
}

Start-Process -FilePath $node -ArgumentList 'index.js' -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Hidden
$ready = $false
for ($i = 0; $i -lt 12 -and !$ready; $i++) {
  Start-Sleep -Seconds 1
  try { $ready = (Invoke-WebRequest 'http://127.0.0.1:5000/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch {}
}
if (!$ready) { throw 'Backend did not start. Check MySQL and backend configuration.' }

$ready = $false
for ($i = 0; $i -lt 12 -and !$ready; $i++) {
  Start-Sleep -Seconds 1
  try { $ready = (Invoke-WebRequest "$url/api/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch {}
}
if (!$ready) { throw 'Public API health check failed. The QR was not updated.' }

try {
  Invoke-WebRequest "$url/api/auth/login" -Method Post -ContentType 'application/json' -Headers @{ Origin = $url } -Body '{}' -UseBasicParsing -TimeoutSec 10 | Out-Null
  throw 'Login origin check returned an unexpected response.'
} catch {
  if ([int]$_.Exception.Response.StatusCode -ne 400) { throw 'Public login origin check failed. The QR was not updated.' }
}

$env:DEMO_URL = "$url/login"
& $node (Join-Path $root 'scripts\generate-demo-qr.js')
if ($LASTEXITCODE -ne 0) { throw 'QR generation failed.' }
$assets = Join-Path $root 'presentation-assets'
$pdf = Join-Path $assets 'IEMS_FYP_Project_Demo_QR.pdf'
$refreshedPdf = Join-Path $assets 'IEMS_FYP_Project_Demo_QR.refreshing.pdf'
$refreshedPreview = Join-Path $assets 'project-demo-slide-with-qr.refreshing.png'
if (!(Test-Path -LiteralPath $pdf)) { throw 'Presentation PDF is missing. The PNG QR is ready, but the slide was not updated.' }
$env:PYTHONPATH = $pdfDeps
& $python (Join-Path $root 'scripts\insert-demo-qr-pdf.py') $pdf (Join-Path $assets 'project-demo-qr-slide.png') $refreshedPdf $refreshedPreview
if ($LASTEXITCODE -ne 0) { throw 'Presentation PDF refresh failed. Use the new PNG QR instead.' }
Move-Item -LiteralPath $refreshedPdf -Destination $pdf -Force
Move-Item -LiteralPath $refreshedPreview -Destination (Join-Path $assets 'project-demo-slide-with-qr.png') -Force
Write-Host "Phone login ready: $url/login"
Write-Host 'Use a real email account. Local sample OTP fallback is disabled; the URL is temporary.'
