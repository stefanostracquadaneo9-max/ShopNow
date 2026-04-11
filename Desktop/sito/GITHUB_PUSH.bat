@echo off
REM ============================================
REM ShopNow GitHub Auto-Push Setup
REM ============================================
REM This script automatically pushes to GitHub
REM and prepares for Railway deployment
REM ============================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ============================================
echo  ShopNow GitHub Setup
echo ============================================
echo.
echo Your repository is ready to push!
echo.
echo To create a GitHub repository:
echo 1. Go to https://github.com/new
echo 2. Name it: shopnow
echo 3. DO NOT check "Initialize with README"
echo 4. Click "Create repository"
echo 5. Copy the HTTPS URL from the page
echo.

set /p GITHUB_URL="Paste your GitHub HTTPS URL here: "

if "!GITHUB_URL!"=="" (
    echo Error: No URL provided. Exiting.
    pause
    exit /b 1
)

echo.
echo Setting up remote...
git remote add origin !GITHUB_URL! 2>nul || (
    echo Remote already exists, updating...
    git remote set-url origin !GITHUB_URL!
)

echo Pushing to GitHub...
echo.
git push -u origin main

if !ERRORLEVEL! equ 0 (
    echo.
    echo ============================================
    echo  SUCCESS! Repository pushed to GitHub
    echo ============================================
    echo.
    echo Next Steps:
    echo 1. Go to https://railway.app
    echo 2. Login with GitHub
    echo 3. Click "New Project"
    echo 4. Select "Deploy from GitHub repo"
    echo 5. Choose "shopnow" repository
    echo 6. Railway auto-deploys!
    echo.
    echo Your site will be live soon at:
    echo https://shopnow-[random].up.railway.app
    echo.
    echo Add these environment variables in Railway:
    echo - STRIPE_SECRET_KEY
    echo - STRIPE_PUBLIC_KEY
    echo - EMAIL_USER
    echo - EMAIL_PASSWORD
    echo - NODE_ENV = production
    echo.
) else (
    echo.
    echo ERROR: Push to GitHub failed!
    echo.
    echo Possible issues:
    echo - Invalid GitHub repository URL
    echo - Authentication failed
    echo - Git not properly installed
    echo.
)

pause
