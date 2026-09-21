@echo off
setlocal
chcp 65001 >nul
title Sanad v15 Foundation - Local Trial
cd /d "%~dp0"

echo.
echo ===============================================
echo        Sanad v15 Foundation - Local Trial
echo ===============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  echo Install Node.js 20 LTS or newer, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Installing packages. This happens only on the first run...
  call npm install
  if errorlevel 1 goto :failed
) else (
  echo [1/3] Packages are already installed.
)

if not exist "data\sanad.db" (
  echo [2/3] Creating local demo data for the first run...
  call npm run demo
  if errorlevel 1 goto :failed
) else (
  echo [2/3] Existing local trial data found. It will not be reset.
)

echo [3/3] Starting Sanad at http://localhost:3000
echo The owner platform is inside the Sanad admin account.
echo Keep this command window open while testing.
start "" "http://localhost:3000"
call npm start
if errorlevel 1 goto :failed
goto :end

:failed
echo.
echo Sanad could not start. Copy the error shown above and send it for review.
pause
exit /b 1

:end
endlocal
