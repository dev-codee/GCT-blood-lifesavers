@echo off
title LifePulse - Blood Donor Directory
echo ========================================================
echo           🩸 LifePulse Blood Donor Directory
echo ========================================================
echo.

where agy-node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Starting server with agy-node...
    start http://localhost:3000/
    agy-node server.js
    goto end
)

where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Starting server with node...
    start http://localhost:3000/
    node server.js
    goto end
)

echo [ERROR] Neither Node.js nor agy-node was found.
echo Please install Node.js (https://nodejs.org) or run with agy-node.
pause

:end
