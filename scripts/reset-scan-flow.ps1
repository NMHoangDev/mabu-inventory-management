# scripts/reset-scan-flow.ps1
# Wrapper tiện lợi để gọi endpoint reset scan flow trên dev server.
#
# CÁCH DÙNG:
#   1) Đảm bảo `npm run dev` đang chạy ở terminal khác.
#   2) Mở PowerShell ở root project và chạy một trong:
#        pwsh -File scripts/reset-scan-flow.ps1 -Mode preview
#        pwsh -File scripts/reset-scan-flow.ps1 -Mode backup
#        pwsh -File scripts/reset-scan-flow.ps1 -Mode cleanup -ConfirmBackupId "scan-flow-xxxx"
#   3) Token mặc định "dev-reset-token" — trùng với LOCAL_DEV_TOKEN trong route.ts.

param(
  [ValidateSet("preview","backup","cleanup")]
  [string]$Mode = "preview",

  [string]$ConfirmBackupId = "",

  [string]$Token = "dev-reset-token"
)

$ErrorActionPreference = "Stop"
$base = "http://localhost:3000/api/admin/scan-flow-reset"

$body = @{ mode = $Mode } | ConvertTo-Json
if ($ConfirmBackupId) {
  $body = @{ mode = $Mode; confirmBackupId = $ConfirmBackupId } | ConvertTo-Json
}

$headers = @{
  "Content-Type"  = "application/json"
  "x-admin-token" = $Token
}

Write-Host "→ POST $base  mode=$Mode" -ForegroundColor Cyan
$res = Invoke-WebRequest -Uri $base -Method POST -Headers $headers -Body $body -UseBasicParsing
Write-Host "← HTTP $($res.StatusCode)" -ForegroundColor Green
Write-Host $res.Content