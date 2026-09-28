@echo off
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\deploy-hvac-from-onedrive.ps1" %*
if errorlevel 1 pause
