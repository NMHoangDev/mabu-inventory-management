$ports = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($id in $ports) {
  $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Host "Killing PID $id - $($proc.ProcessName) - $($proc.Path)"
    Stop-Process -Id $id -Force
  }
}
Start-Sleep 2
$still = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($still) {
  Write-Host "STILL LISTENING:"
  $still | Format-Table -AutoSize
} else {
  Write-Host "Port 3001 is FREE."
}