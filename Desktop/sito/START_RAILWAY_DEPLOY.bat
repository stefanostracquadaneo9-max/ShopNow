@echo off
setlocal enabledelayedexpansion

set REPO_URL=https://github.com/stefanostracquadaneo9-max/ShopNow
set RAILWAY_APP=https://railway.app
set GITHUB_AUTH_URL=%RAILWAY_APP%?referralCode=GithubCopilot

echo.
echo ============================================
echo  ShopNow - Railway Deployment Automation
echo ============================================
echo.
echo [INFO] Opening Railway in your browser...
echo.
echo Steps to complete the deployment:
echo.
echo 1. You'll be taken to Railway.app
echo 2. Login with your GitHub account (stefanostracquadaneo9-max)
echo 3. Click "New Project"
echo 4. Click "Deploy from GitHub repo"
echo 5. Find and select "ShopNow" repository
echo 6. Railway will automatically build and deploy
echo.
echo After deployment, you MUST add these variables:
echo.
echo Environment Variables to Add:
echo ════════════════════════════════════════════
echo STRIPE_SECRET_KEY
echo  sk_test_51TGkIERvM5OkkW7hF4AjFpXp8fXarIfPpO9aPN4B9AuJ1hRZXRCoEOKoOpY3Zs4KSsl2K7a88ulao80G27lpUtR100EezxAXae
echo.
echo STRIPE_PUBLIC_KEY
echo  pk_test_51TGkIERvM5OkkW7h1NvqiFG8AqpnLGpt0mN33khefwGpqVYvOH9KZzAPt997HnvxgQ4WFRH0YmqOHvBLcp444Syw00olM66h78
echo.
echo EMAIL_USER
echo  stefanostracquadaneo9@gmail.com
echo.
echo EMAIL_PASSWORD
echo  ovqvuktgrevsbwur
echo.
echo NODE_ENV
echo  production
echo.
echo DATABASE_URL
echo  (Railway will auto-generate this when PostgreSQL is added to your project)
echo ════════════════════════════════════════════
echo.

set /p continue="Press Enter to open Railway in your browser: "

echo.
echo [STEP 1] Opening Railway.app...
start %RAILWAY_APP%

echo [STEP 2] Opening your GitHub repository...
timeout /t 3 /nobreak >nul
start %REPO_URL%

echo.
echo ============================================
echo  Next Steps
echo ============================================
echo.
echo 1. In Railway:
echo    - Click "New Project"
echo    - Choose "Deploy from GitHub"
echo    - Select "ShopNow"
echo    - Wait for auto-deploy (2-3 minutes)
echo.
echo 2. Add Environment Variables:
echo    - Go to Project Settings → Variables
echo    - Copy-paste the values from above
echo.
echo 3. Your domain will appear in Deployments tab
echo    - Click it to verify your site is live!
echo.
echo Repository Status:
echo   ✓ Code pushed to GitHub
echo   ✓ Database migrated to PostgreSQL
echo   ✓ Docker + Nixpacks configuration added
echo   ✓ Ready for Railway deployment
echo   Repository: %REPO_URL%
echo.
echo Estimated Deploy Time: 5-10 minutes total
echo.
echo ============================================
echo.

set /p done="Press Enter when Railway deployment is complete: "

echo.
echo Congratulations!
echo.
echo Your ShopNow site is now live 24/7 on Railway!
echo.
echo Check the Railway Dashboard for your live domain.
echo.

pause
