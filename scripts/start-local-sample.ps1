$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = 'C:\laragon\bin\nodejs\node-v22\node.exe'
$url = 'http://127.0.0.1:5001'

function Test-LocalPort($port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $result = $client.BeginConnect('127.0.0.1', $port, $null, $null)
    if (!$result.AsyncWaitHandle.WaitOne(500)) { return $false }
    $client.EndConnect($result)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

if (!(Test-Path -LiteralPath $node)) { throw "Node.js not found: $node" }
if (!(Test-Path -LiteralPath (Join-Path $root 'frontend\dist\index.html'))) {
  throw 'Frontend build is missing. Run START_IEMS_LIVE.bat first, then retry.'
}
if (!(Test-LocalPort 3306)) {
  throw 'MySQL is not running. Start MySQL in Laragon, then retry.'
}

if (Test-LocalPort 5001) {
  try {
    $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2
    $startupLog = Get-Content -LiteralPath (Join-Path $root 'backend\local-sample.out.log') -Raw -ErrorAction SilentlyContinue
    if ($health.status -eq 'ok' -and $startupLog -match 'Backend server running on port 5001') {
      Write-Host "Local sample login is already running: $url"
      exit 0
    }
  } catch {}
  throw 'Port 5001 is already in use by another process. Nothing was changed.'
}

# Keep the sample OTP server separate from the public demo on port 5000.
$env:PORT = '5001'
$env:HOST = '127.0.0.1'
$env:NODE_ENV = 'development'
$env:DEV_OTP_FALLBACK = '1'
$env:DEMO_PUBLIC_URL = ''
$env:FRONTEND_URL = $url
$env:CORS_ORIGIN = "$url,http://localhost:5001"

$backend = Join-Path $root 'backend'
$process = Start-Process -FilePath $node -ArgumentList 'index.js','--local-sample' -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $backend 'local-sample.out.log') -RedirectStandardError (Join-Path $backend 'local-sample.err.log') -PassThru

for ($attempt = 0; $attempt -lt 15; $attempt++) {
  Start-Sleep -Seconds 1
  if (!$process.HasExited) {
    try {
      $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2
      $startupLog = Get-Content -LiteralPath (Join-Path $backend 'local-sample.out.log') -Raw -ErrorAction SilentlyContinue
      if ($health.status -eq 'ok' -and $startupLog -match 'Backend server running on port 5001') {
        Write-Host "Local sample login is ready: $url"
        Write-Host 'Use employee.hakim@iems.local and the sample password in README.md.'
        exit 0
      }
    } catch {}
  }
  if ($process.HasExited) { break }
}

$errorLog = Join-Path $backend 'local-sample.err.log'
if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog -Tail 20 }
throw 'Local sample server did not start. See backend/local-sample.err.log.'
