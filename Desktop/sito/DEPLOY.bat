@echo off
REM Setup script for ShopNow deployment
REM This script initializes git and prepares for deployment to Railway

cd /d "%~dp0"

echo.
echo ========================================
echo   ShopNow Deployment Setup
echo ========================================
echo.

echo [1/4] Initializing Git repository...
git init
git add .
git commit -m "ShopNow: Initial deployment setup for Railway" 2>nul || echo Git already initialized

echo.
echo [2/4] Setting up remote...
set /p GITHUB_URL="Enter your GitHub repository URL (https://github.com/YOUR_USERNAME/shopnow.git): "

if "%GITHUB_URL%"=="" (
    echo Error: GitHub URL required. Exiting.
    exit /b 1
)

git remote remove origin 2>nul
git remote add origin %GITHUB_URL%

echo.
echo [3/4] Pushing to GitHub...
git branch -M main
git push -u origin main

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Push to GitHub failed. Check your credentials and try again.
    echo Make sure you have set up GitHub SSH keys or personal access token.
    exit /b 1
)

echo.
echo [4/4] Deployment preparation complete!
echo.
echo ========================================
echo   Next Steps - Deploy on Railway
echo ========================================
echo.
echo 1. Go to https://railway.app
echo 2. Login with your GitHub account
echo 3. Click "New Project" then "Deploy from GitHub repo"
echo 4. Select your "shopnow" repository
echo 5. Add these environment variables in Railway Dashboard:
echo.
echo    - STRIPE_SECRET_KEY
echo    - STRIPE_PUBLIC_KEY
echo    - EMAIL_USER
echo    - EMAIL_PASSWORD
echo    - NODE_ENV (set to: production)
echo.
echo 6. Railway will auto-deploy!
echo.
echo Your site will be live at: https://shopnow-[random].up.railway.app
echo.
pause
