$headers = @{
  "Content-Type"  = "application/json"
  "x-admin-token" = "dev-reset-token"
}
$body = '{"mode":"preview"}'
try {
  $res = Invoke-WebRequest -Uri "http://localhost:3000/api/admin/scan-flow-reset" -Method POST -Headers $headers -Body $body -UseBasicParsing
  Write-Host "HTTP $($res.StatusCode)"
  Write-Host $res.Content
} catch {
  Write-Host "ERROR: $_"
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host "BODY: $($reader.ReadToEnd())"
  }
}