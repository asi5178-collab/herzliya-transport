@echo off
echo.
echo ============================================================
echo   Herzliya Transport System
echo ============================================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo [!] Running npm install first...
    call npm install
)

if not exist ".env" (
    copy .env.example .env >nul
    echo [!] Created .env - add your ANTHROPIC_API_KEY
)

if not exist "database\herzliya.db" (
    echo [*] Initializing database...
    call node database/init.js
    call node database/seed.js
)

echo   Starting server...
echo   Local:   http://localhost:3000
echo   Network: see below
echo   Stop:    Ctrl+C
echo ============================================================
echo.
node server.js
pause
