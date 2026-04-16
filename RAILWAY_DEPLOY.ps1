# Script PowerShell per deployare su Railway con variabili d'ambiente e regione Europa
# Execution Policy: Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope CurrentUser

$ErrorActionPreference = "Stop"

# Token e info di Railway
$RAILWAY_TOKEN = "K9C6uCrS4bYISJfYHEQCY8tgr5fJtBkVnFazq6FhXtZ"
$PROJECT_ID = "4f69a0a3-1d8b-4806-bca3-1d8eaf51e272"
$ENVIRONMENT_NAME = "production"

Write-Host "=== Railway Deployment Script ===" -ForegroundColor Cyan
Write-Host "Project: diplomatic-generosity" -ForegroundColor Green
Write-Host "Environment: production (Europa)" -ForegroundColor Green
Write-Host ""

# Imposta il token di Railway
Write-Host "[1/4] Impostando autenticazione Railway..." -ForegroundColor Yellow
$env:RAILWAY_TOKEN = $RAILWAY_TOKEN

# Leggi le variabili dal .env
Write-Host "[2/4] Caricando variabili d'ambiente..." -ForegroundColor Yellow
$envVars = @{}
Get-Content ".env" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.+)$") {
        $envVars[$matches[1]] = $matches[2]
    }
}

# Aggiungi NODE_ENV=production
$envVars["NODE_ENV"] = "production"

# Prepara il comando railway variables
Write-Host "[3/4] Impostando variabili su Railway..." -ForegroundColor Yellow

$setCommands = @()
foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    $setCommands += "railway variables set $key=$value --project $PROJECT_ID --environment $ENVIRONMENT_NAME"
}

# Esegui i comandi via npx railway
foreach ($cmd in $setCommands) {
    Write-Host "  → Impostando: $(($cmd -split ' set ')[1].Split('=')[0])" -ForegroundColor Cyan
    Invoke-Expression "npx @railway/cli $cmd" 2>&1 | Out-Null
}

# Deploy
Write-Host "[4/4] Facendo deploy su Railway..." -ForegroundColor Yellow
Invoke-Expression "npx @railway/cli deploy --project $PROJECT_ID" 2>&1 | Out-Null

Write-Host ""
Write-Host "✓ Deployment completato!" -ForegroundColor Green
Write-Host "App disponibile a: https://shopnow-production.up.railway.app" -ForegroundColor Green
