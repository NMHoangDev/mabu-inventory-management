# ============================================================
# ROLLBACK SCRIPT — Khôi phục production
#
# Chạy file này (PowerShell) để rollback:
#   1. Xóa .env.local (không còn override local)
#   2. Xóa dòng load .env.local trong config.py
#
# Sau khi rollback, khởi động lại backend là production.
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\CrawlDataLinkedin\linkedin_group_crawler"
$EnvLocal = "$ProjectRoot\.env.local"
$ConfigFile = "$ProjectRoot\app\core\config.py"

Write-Host "=== Rollback Local Dev Config ===" -ForegroundColor Yellow

# Step 1: Xóa .env.local
if (Test-Path $EnvLocal) {
    Remove-Item $EnvLocal -Force
    Write-Host "[OK] Đã xóa .env.local (backend local override)" -ForegroundColor Green
} else {
    Write-Host "[SKIP] .env.local không tồn tại (có thể đã rollback rồi)" -ForegroundColor Gray
}

# Step 2: Xóa dòng load .env.local trong config.py
if (Test-Path $ConfigFile) {
    $content = Get-Content $ConfigFile -Raw
    if ($content -match 'load_dotenv\(BASE_DIR / "\.env\.local"') {
        $newContent = $content -replace '(?m)^load_dotenv\(BASE_DIR / "\.env\.local", override=True\)\r?\n?', ''
        Set-Content -Path $ConfigFile -Value $newContent -NoNewline
        Write-Host "[OK] Đã xóa load_dotenv .env.local trong config.py" -ForegroundColor Green
    } else {
        Write-Host "[SKIP] config.py không chứa dòng load .env.local" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "=== Rollback hoàn tất ===" -ForegroundColor Cyan
Write-Host "Khởi động lại backend để áp dụng production." -ForegroundColor White
