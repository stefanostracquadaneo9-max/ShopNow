@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

set GITHUB_USERNAME=stefanostracquadaneo9-max
set REPO_NAME=shopnow
set GITHUB_REPO_URL=https://github.com/%GITHUB_USERNAME%/%REPO_NAME%.git

echo.
echo ============================================
echo  ShopNow - Automatic GitHub Deployment
echo ============================================
echo.
echo GitHub Username: %GITHUB_USERNAME%
echo Repository: %REPO_NAME%
echo.

REM Step 1: Check if remote already exists
git remote get-url origin >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [Step 1] Updating existing remote...
    git remote set-url origin %GITHUB_REPO_URL%
) else (
    echo [Step 1] Adding GitHub remote...
    git remote add origin %GITHUB_REPO_URL%
)

echo [Step 1] ✓ Remote configured
echo.

REM Step 2: Open browser to create repo
echo [Step 2] Opening GitHub new repository page...
echo.
echo A browser window will open. Follow these steps:
echo   1. Repository name: shopnow (already filled if using my link)
echo   2. Description: E-commerce Platform with Stripe (optional)
echo   3. Choose: Public
echo   4. DO NOT check "Initialize with README"
echo   5. Click "Create repository"
echo   6. Come back to this window and press Enter
echo.

start https://github.com/new?name=%REPO_NAME%^&owner=%GITHUB_USERNAME%

set /p ready="Press Enter when you have created the repository: "

echo.
echo [Step 2] ✓ Repository created
echo.

REM Step 3: Push to GitHub
echo [Step 3] Pushing code to GitHub...
echo.

git push -u origin main 2>&1

if !ERRORLEVEL! equ 0 (
    echo.
    echo ============================================
    echo  ✓ SUCCESS - Repository pushed to GitHub!
    echo ============================================
    echo.
    echo Repository URL:
    echo %GITHUB_REPO_URL%
    echo.
    echo Next Step: Deploy on Railway
    echo 1. Go to https://railway.app
    echo 2. Login with GitHub (if not already)
    echo 3. Click "New Project"
    echo 4. Click "Deploy from GitHub repo"
    echo 5. Select "%REPO_NAME%"
    echo 6. Railway auto-deploys!
    echo.
    echo Then add these variables in Railway Dashboard:
    echo - STRIPE_SECRET_KEY
    echo - STRIPE_PUBLIC_KEY
    echo - EMAIL_USER
    echo - EMAIL_PASSWORD
    echo - NODE_ENV = production
    echo.
) else (
    echo.
    echo ============================================
    echo  ✗ ERROR - Push failed
    echo ============================================
    echo.
    echo Possible issues:
    echo - Repository not created on GitHub
    echo - Wrong GitHub credentials
    echo - Git not properly configured
    echo.
    echo Try these steps:
    echo 1. Check repository exists: https://github.com/%GITHUB_USERNAME%/%REPO_NAME%
    echo 2. Generate Personal Access Token: https://github.com/settings/tokens
    echo 3. Use token as password when Git prompts
    echo.
)

pause
