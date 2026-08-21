# ساخت و بالاآوردنِ بیلدِ تولیدی برای تستِ سرتاسری، روی پورتِ ۳۱۰۰.
#
# ★ چرا این اسکریپت وجود دارد: بارها اتفاق افتاد که پکیج ساخته شد ولی
# سرورِ قدیمی هنوز بالا بود و **بیلدِ کهنه** را سرو می‌کرد. نتیجه:
# ساعت‌ها دنبالِ باگی گشتن که وجود نداشت. اینجا کشتن قبل از ساختن است.
param([switch]$SkipBuild)

$port = 3100
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

if (-not $SkipBuild) {
  pnpm --filter '@tamin/markdown' build
  if ($LASTEXITCODE -ne 0) { exit 1 }
  pnpm --filter web build
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

# ★ `Start-Process -WindowStyle Hidden` روی pnpm (که خودش یک shim است)
# پروسه را زنده نگه نمی‌دارد. `cmd /c start` واقعاً جدا می‌کند.
$root = Split-Path $PSScriptRoot -Parent
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c","start","/b","pnpm --filter web start --port $port > `"$env:TEMP	amin-e2e-prod.log`" 2>&1" `
  -WorkingDirectory $root -WindowStyle Hidden

for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    Invoke-WebRequest -Uri "http://localhost:$port/markdown" -UseBasicParsing -TimeoutSec 2 | Out-Null
    Write-Output "ready on http://localhost:$port"
    exit 0
  } catch { }
}
Write-Output "FAILED to start on port $port"
exit 1
