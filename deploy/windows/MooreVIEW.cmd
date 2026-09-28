@echo off
title PeakLogic MVP Suite
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Node.js 18 or newer is required.
  echo  Download: https://nodejs.org/
  echo.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

if not defined PEAKLOGIC_DATA set "PEAKLOGIC_DATA=%LOCALAPPDATA%\PeakLogic\data"
if not exist "%PEAKLOGIC_DATA%" mkdir "%PEAKLOGIC_DATA%" 2>nul

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install --omit=dev
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "" "http://127.0.0.1:3090"
echo PeakLogic MVP Suite — http://127.0.0.1:3090
echo Data: %PEAKLOGIC_DATA%
echo Press Ctrl+C to stop.
node server.js
