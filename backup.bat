@echo off
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set dt=%%a
set BACKUP=backups\herzliya_%dt:~0,8%_%dt:~8,4%.db
if not exist "backups" mkdir backups
copy "database\herzliya.db" "%BACKUP%" >nul
if errorlevel 1 (
    echo [ERROR] Backup failed
) else (
    echo [OK] Backup saved: %BACKUP%
)
pause
