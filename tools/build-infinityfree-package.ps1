param(
  [string]$OutputPath = "dist/infinityfree-shopnow.zip",
  [switch]$IncludeLocalConfig
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputFullPath = Join-Path $repoRoot $OutputPath
$stagingRoot = Join-Path $repoRoot ".tmp-infinityfree-package"

if (Test-Path -LiteralPath $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputFullPath) | Out-Null

$rootFiles = @(
  ".htaccess",
  "account.html",
  "account.js",
  "admin.html",
  "admin_ui.js",
  "auth_ui.js",
  "cart.html",
  "checkout.html",
  "checkout.js",
  "favicon.svg",
  "forgot-password.html",
  "forgot_password_ui.js",
  "index.html",
  "order-confirmation.html",
  "order_confirmation.js",
  "orders.html",
  "orders.js",
  "product.html",
  "product_ui.js",
  "products.html",
  "products_ui.js",
  "register.html",
  "reset-password.html",
  "reset_password_ui.js",
  "shopnow-common.js",
  "style.css"
)

foreach ($file in $rootFiles) {
  Copy-Item -LiteralPath (Join-Path $repoRoot $file) -Destination (Join-Path $stagingRoot $file)
}

Copy-Item -LiteralPath (Join-Path $repoRoot "api") -Destination (Join-Path $stagingRoot "api") -Recurse
if (-not $IncludeLocalConfig) {
  Remove-Item -LiteralPath (Join-Path $stagingRoot "api/config.local.php") -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath (Join-Path $repoRoot "uploads")) {
  Copy-Item -LiteralPath (Join-Path $repoRoot "uploads") -Destination (Join-Path $stagingRoot "uploads") -Recurse
}

Remove-Item -LiteralPath $outputFullPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $outputFullPath -Force
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host "Pacchetto InfinityFree creato:"
Write-Host $outputFullPath
if (-not $IncludeLocalConfig) {
  Write-Host "Nota: api/config.local.php non incluso. Crealo/caricalo su InfinityFree prima dei test."
}
