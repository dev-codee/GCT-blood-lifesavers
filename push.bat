@echo off
title Push to GitHub - GCT Lifesavers
echo ========================================================
echo   Pushing code to https://github.com/dev-codee/GCT-blood-lifesavers.git
echo ========================================================
echo.

set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

git remote remove origin 2>nul
git remote add origin https://github.com/dev-codee/GCT-blood-lifesavers.git
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
