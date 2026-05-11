param(
  [Parameter(Mandatory = $true)]
  [string]$DbHost,

  [Parameter(Mandatory = $true)]
  [string]$DbName,

  [Parameter(Mandatory = $true)]
  [string]$DbUser,

  [Parameter(Mandatory = $true)]
  [string]$DbPass,

  [Parameter(Mandatory = $true)]
  [string]$PublicUrl,

  [string]$AdminEmail,
  [string]$AdminName,
  [string]$AdminPassword,
  [string]$InstallToken
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"
$configPath = Join-Path $repoRoot "api/config.local.php"
$envValues = @{}

if (Test-Path -LiteralPath $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or $trimmed -notmatch "=") {
      continue
    }
    $parts = $trimmed -split "=", 2
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    $envValues[$key] = $value
  }
}

function Get-ValueOrEnv([string]$value, [string]$key, [string]$fallback = "") {
  if ($value) { return $value }
  if ($envValues.ContainsKey($key)) { return [string]$envValues[$key] }
  return $fallback
}

function Escape-Php([string]$value) {
  return ($value -replace "\\", "\\\\" -replace "'", "\\'")
}

$stripePublic = Get-ValueOrEnv "" "STRIPE_PUBLIC_KEY"
$stripeSecret = Get-ValueOrEnv "" "STRIPE_SECRET_KEY"
$emailUser = Get-ValueOrEnv "" "EMAIL_USER"
$emailPass = Get-ValueOrEnv "" "EMAIL_PASSWORD"
$emailFrom = Get-ValueOrEnv "" "EMAIL_FROM" $emailUser
$adminEmailValue = Get-ValueOrEnv $AdminEmail "ADMIN_EMAIL" "admin@gmail.com"
$adminNameValue = Get-ValueOrEnv $AdminName "ADMIN_NAME" "Administrator"
$adminPasswordValue = Get-ValueOrEnv $AdminPassword "ADMIN_PASSWORD" "admin"
$tokenValue = if ($InstallToken) { $InstallToken } else { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant() }

$content = @"
<?php
return [
    'db' => [
        'host' => '$(Escape-Php $DbHost)',
        'name' => '$(Escape-Php $DbName)',
        'user' => '$(Escape-Php $DbUser)',
        'pass' => '$(Escape-Php $DbPass)',
    ],
    'stripe' => [
        'public_key' => '$(Escape-Php $stripePublic)',
        'secret_key' => '$(Escape-Php $stripeSecret)',
    ],
    'email' => [
        'host' => 'smtp.gmail.com',
        'port' => 587,
        'secure' => false,
        'user' => '$(Escape-Php $emailUser)',
        'pass' => '$(Escape-Php $emailPass)',
        'from' => '$(Escape-Php $emailFrom)',
        'from_name' => 'ShopNow',
    ],
    'site' => [
        'public_url' => '$(Escape-Php $PublicUrl)',
    ],
    'security' => [
        'install_token' => '$(Escape-Php $tokenValue)',
    ],
    'admin' => [
        'email' => '$(Escape-Php $adminEmailValue)',
        'name' => '$(Escape-Php $adminNameValue)',
        'password' => '$(Escape-Php $adminPasswordValue)',
    ],
];
"@

Set-Content -LiteralPath $configPath -Value $content -Encoding UTF8

Write-Host "Creato api/config.local.php"
Write-Host "Token controllo installazione:"
Write-Host $tokenValue
Write-Host "URL controllo:"
Write-Host ($PublicUrl.TrimEnd("/") + "/api/install-check?token=" + $tokenValue)
