@echo off
title NoteNest Run Interface
cd /d "%~dp0"

:: 1. Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo =============================================================
    echo [ERROR] Node.js was not detected in your PATH!
    echo =============================================================
    echo Please install Node.js 18 or newer from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 2. Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo =============================================================
    echo [SETUP] Installing required dependencies (first run only)...
    echo =============================================================
    call npm install
    echo.
)

:: 3. Ensure .env exists
if not exist ".env" (
    copy .env.example .env >nul
)

:: 4. Run the interactive interface
node launcher.js
