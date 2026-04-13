@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

set GITHUB_USERNAME=stefanostracquadaneo9-max
set REPO_NAME=shopnow
set GITHUB_REPO_URL=https://github.com/%GITHUB_USERNAME%/%REPO_NAME%.git

echo.
echo ============================================
echo  ShopNow - Complete Automated Deployment
echo ============================================
echo.
echo GitHub Username: %GITHUB_USERNAME%
echo Repository: %REPO_NAME%
echo.

REM Configure git remote
echo [Step 1/4] Configuring Git remote...
git remote remove origin 2>nul
git remote add origin %GITHUB_REPO_URL%
echo ✓ Remote configured: %GITHUB_REPO_URL%
echo.

REM Create repository using PowerShell and GitHub API
echo [Step 2/4] Creating repository on GitHub...
echo.
echo To create the repository, I need your GitHub Personal Access Token.
echo.
echo Steps to get your token:
echo  1. Go to: https://github.com/settings/tokens/new
echo  2. Select scopes: repo (all), user
echo  3. Generate and copy the token
echo.

set /p GITHUB_TOKEN="Paste your GitHub Personal Access Token here: "

if "!GITHUB_TOKEN!"=="" (
    echo.
    echo Error: No token provided. Cannot continue.
    echo.
    echo Alternative: Create the repository manually at:
    echo https://github.com/new?name=%REPO_NAME%^&owner=%GITHUB_USERNAME%
    echo.
    echo Then run: git push -u origin main
    echo.
    pause
    exit /b 1
)

REM Create repo via GitHub API using PowerShell
powershell -NoProfile -Command " ^
    $header = @{ ^
        'Authorization' = 'token %GITHUB_TOKEN%' ^
        'Accept' = 'application/vnd.github.v3+json' ^
    } ^
    $body = @{ ^
        'name' = '%REPO_NAME%' ^
        'description' = 'E-commerce Platform with Stripe and Railway' ^
        'private' = $false ^
        'auto_init' = $false ^
    } | ConvertTo-Json ^
    try { ^
        $response = Invoke-RestMethod -Uri 'https://api.github.com/user/repos' `
            -Method Post `
            -Headers $header `
            -Body $body ^
        Write-Host 'Repository created successfully!' ^
        exit 0 ^
    } catch { ^
        if ($_.Exception.Response.StatusCode -eq 422) { ^
            Write-Host 'Repository already exists!' ^
            exit 0 ^
        } ^
        Write-Host 'Error creating repository:' $_.Exception.Message ^
        exit 1 ^
    } ^
"

if !ERRORLEVEL! neq 0 (
    echo.
    echo Warning: Could not create repository via API.
    echo Please create it manually at: https://github.com/new?name=%REPO_NAME%
    echo.
    set /p manual="Press Enter after creating the repository: "
)

echo ✓ Repository ready
echo.

REM Push to GitHub
echo [Step 3/4] Pushing code to GitHub...
echo.

setlocal enabledelayedexpansion
git push -u origin main 2>&1

if !ERRORLEVEL! equ 0 (
    echo.
    echo ✓ Code pushed to GitHub successfully!
    echo.
) else (
    echo.
    echo Error pushing to GitHub.
    echo Please ensure repository exists and token is valid.
    echo.
    pause
    exit /b 1
)

REM Show next steps
echo [Step 4/4] Railway Deployment
echo.
echo ============================================
echo  ✓ SUCCESS - Ready for Railway!
echo ============================================
echo.
echo Repository:
echo %GITHUB_REPO_URL%
echo.
echo You can now deploy on Railway:
echo.
echo 1. Open https://railway.app
echo 2. Login with GitHub
echo 3. Click "New Project"
echo 4. Click "Deploy from GitHub repo"
echo 5. Select "%REPO_NAME%"
echo 6. Railway auto-deploys!
echo.
echo IMPORTANT: Add these variables in Railway Dashboard:
echo   - STRIPE_SECRET_KEY: ^<your Stripe secret key^>
echo   - STRIPE_PUBLIC_KEY: ^<your Stripe public key^>
echo   - EMAIL_USER: ^<your email address^>
echo   - EMAIL_PASSWORD: ^<your app password^>
echo   - NODE_ENV: production
echo   - PORT: 3000
echo   - SHOP_URL: ^<your frontend URL^>
echo.
echo Your site will be live at:
echo https://shopnow-production.up.railway.app
echo.

pause
