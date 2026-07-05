@echo off
REM Kill anything listening on 3000 and 3001 (Next dev + Zalo bridge)
echo --- Killing port 3000 ---
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /R /C:"[::]:3000 " /C:"0.0.0.0:3000 "') do (
  echo   PID %%P
  taskkill /F /PID %%P
)
echo --- Killing port 3001 ---
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /R /C:"[::]:3001 " /C:"0.0.0.0:3001 "') do (
  echo   PID %%P
  taskkill /F /PID %%P
)
echo --- Killing port 4000 ---
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /R /C:"[::]:4000 " /C:"0.0.0.0:4000 "') do (
  echo   PID %%P
  taskkill /F /PID %%P
)
timeout /t 2 /nobreak >nul
echo --- Done. Remaining listeners on 3000/3001/4000: ---
netstat -aon | findstr /R /C:":3000 " /C:":3001 " /C:":4000 " | findstr LISTENING