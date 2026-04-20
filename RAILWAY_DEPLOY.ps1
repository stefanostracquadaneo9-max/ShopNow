# Script PowerShell per deployare su Railway con variabili d'ambiente e regione Europa
# Execution Policy: Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope CurrentUser

$ErrorActionPreference = "Stop"

# Token e info di Railway
$RAILWAY_TOKEN = $env:RAILWAY_TOKEN
$PROJECT_ID = if ($env:RAILWAY_PROJECT_ID) {
    $env:RAILWAY_PROJECT_ID
} else {
    "4f69a0a3-1d8b-4806-bca3-1d8eaf51e272"
}
$ENVIRONMENT_NAME = if ($env:RAILWAY_ENVIRONMENT) {
    $env:RAILWAY_ENVIRONMENT
} else {
    "production"
}
$SERVICE_NAME = $env:RAILWAY_SERVICE

if ([string]::IsNullOrWhiteSpace($RAILWAY_TOKEN)) {
    throw "Imposta la variabile d'ambiente RAILWAY_TOKEN prima di eseguire questo script."
}

Write-Host "=== Railway Deployment Script ===" -ForegroundColor Cyan
Write-Host "Project: ShopNow" -ForegroundColor Green
Write-Host "Environment: $ENVIRONMENT_NAME (Europa)" -ForegroundColor Green
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
if (-not $envVars.ContainsKey("DB_PATH")) {
    $envVars["DB_PATH"] = "/data/app.db"
}

# Imposta le variabili su Railway
Write-Host "[3/4] Impostando variabili su Railway..." -ForegroundColor Yellow
foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    Write-Host "  -> Impostando: $key" -ForegroundColor Cyan
    npx @railway/cli variable set "$key=$value" --environment "$ENVIRONMENT_NAME" --project "$PROJECT_ID" 2>&1 | Out-Null
}

# Deploy
Write-Host "[4/4] Facendo deploy su Railway..." -ForegroundColor Yellow
$deployArgs = @("up", "--ci", "--project", "$PROJECT_ID", "--environment", "$ENVIRONMENT_NAME")
if (-not [string]::IsNullOrWhiteSpace($SERVICE_NAME)) {
    $deployArgs += @("--service", "$SERVICE_NAME")
}
npx @railway/cli @deployArgs 2>&1 | Out-Null

Write-Host ""
Write-Host "OK Deployment completato!" -ForegroundColor Green
Write-Host "App disponibile a: https://shopnow-production.up.railway.app" -ForegroundColor Green
