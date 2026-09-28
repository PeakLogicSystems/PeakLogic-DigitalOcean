@echo off
title Stop PeakLogic
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 exit /b 1
node scripts/stop-server.js
echo PeakLogic stopped.
timeout /t 2 >nul
