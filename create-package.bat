@echo off
echo.
echo Creating installation package...
PowerShell -ExecutionPolicy Bypass -File "%~dp0create-package.ps1"
pause
