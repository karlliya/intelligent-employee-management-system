$ErrorActionPreference = 'Stop'
$envPath = Join-Path $PSScriptRoot '.env'
$nodePath = 'C:\laragon\bin\nodejs\node-v22\node.exe'

if (-not (Test-Path -LiteralPath $envPath) -or -not (Test-Path -LiteralPath $nodePath)) {
    Write-Host 'IEMS .env or Laragon Node.js was not found.' -ForegroundColor Red
    exit 1
}

$original = [System.IO.File]::ReadAllText($envPath)
$sender = [regex]::Match($original, '(?m)^GMAIL_USER=([^\r\n]+)').Groups[1].Value.Trim()
if ($sender -ne 'musthaffahaikal@gmail.com') {
    Write-Host 'The configured Gmail sender is not musthaffahaikal@gmail.com. No changes were made.' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'IEMS Gmail OTP setup' -ForegroundColor Cyan
Write-Host 'Copy a NEW Google App Password before running this file.'
Write-Host 'This setup reads the clipboard automatically. Do not type or paste the code here.'
Write-Host ''
try {
    $appPassword = (Get-Clipboard -Raw) -replace '\s', ''
} finally {
    Set-Clipboard -Value ' '
}

if ($appPassword -notmatch '^[A-Za-z0-9]{16}$') {
    Write-Host 'Clipboard did not contain a 16-character App Password. No changes were made.' -ForegroundColor Yellow
    Write-Host 'Create a new App Password at https://myaccount.google.com/apppasswords, copy it, then run this file again.'
    exit 1
}

$updated = [regex]::Replace($original, '(?m)^GMAIL_PASSWORD=[^\r\n]*', "GMAIL_PASSWORD=$appPassword")
if ($updated -eq $original -and $original -notmatch '(?m)^GMAIL_PASSWORD=') {
    $updated = $original.TrimEnd() + [Environment]::NewLine + "GMAIL_PASSWORD=$appPassword" + [Environment]::NewLine
}
$appPassword = $null
[System.IO.File]::WriteAllText($envPath, $updated, [System.Text.UTF8Encoding]::new($false))
$updated = $null

Write-Host 'Checking Gmail SMTP...' -ForegroundColor Cyan
& $nodePath (Join-Path $PSScriptRoot 'backend\check-email.js')
if ($LASTEXITCODE -eq 0) {
    Write-Host 'Success. Restart IEMS, then sign in with your Gmail address.' -ForegroundColor Green
    exit 0
}

[System.IO.File]::WriteAllText($envPath, $original, [System.Text.UTF8Encoding]::new($false))
Write-Host 'Gmail rejected that App Password. The previous .env was restored.' -ForegroundColor Yellow
exit 1
