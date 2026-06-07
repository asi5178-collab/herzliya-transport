@echo off
echo.
echo ============================================================
echo   Herzliya Transport System - Installation
echo ============================================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found!
    echo Download from: https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js found

echo.
echo [1/3] Installing npm packages...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo [OK] Packages installed

echo.
echo [2/3] Creating .env file...
if not exist ".env" (
    copy .env.example .env >nul
    echo [OK] .env created - EDIT IT and add your ANTHROPIC_API_KEY
) else (
    echo [OK] .env already exists
)

echo.
echo [3/3] Initializing database...
call node database/init.js
if errorlevel 1 (
    echo [ERROR] Database init failed
    pause
    exit /b 1
)
echo [OK] Database initialized

echo.
set /p SEED="Add sample data? (y/n): "
if /i "%SEED%"=="y" (
    call node database/seed.js
    echo [OK] Sample data added
)

echo.
echo ============================================================
echo   Installation complete!
echo   Run: start.bat
echo   URL: http://localhost:3000
echo   Users: admin/admin123  manager/manager123  viewer/viewer123
echo ============================================================
pause
