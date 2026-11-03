@echo off
title Push to GitHub - UET-lifesavers
echo ========================================================
echo   Pushing UET-lifesavers to the configured GitHub origin
echo ========================================================
echo.

set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo Configure a GitHub origin remote first.
    pause
    exit /b 1
)
git branch -M main

echo Running git push...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Code pushed successfully to GitHub!
) else (
    echo.
    echo If prompted, enter your GitHub Personal Access Token (PAT) as the password.
    echo You can create a token at: https://github.com/settings/tokens
)

pause
