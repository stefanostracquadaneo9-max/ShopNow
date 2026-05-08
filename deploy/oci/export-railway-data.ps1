param(
    [string]$Service = "ShopNow",
    [string]$OutputDir = "backups"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    throw "Railway CLI non trovata."
}

$resolvedOutputDir = Join-Path (Get-Location) $OutputDir
New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputFile = Join-Path $resolvedOutputDir "shopnow-railway-$stamp.tar.gz"

$remoteCommand = "tar -C /app/data -czf - app.db uploads 2>/tmp/shopnow-export.err | base64 | tr -d '\n'"
Write-Host "Esporto database e uploads da Railway..." -ForegroundColor Cyan
$base64 = railway ssh --service $Service -- $remoteCommand
$payload = (($base64 | Out-String) -replace "\s", "").Trim()

if ([string]::IsNullOrWhiteSpace($payload)) {
    throw "Backup Railway vuoto o non generato."
}

[IO.File]::WriteAllBytes($outputFile, [Convert]::FromBase64String($payload))

$size = (Get-Item $outputFile).Length
Write-Host "Backup creato: $outputFile ($size bytes)" -ForegroundColor Green
