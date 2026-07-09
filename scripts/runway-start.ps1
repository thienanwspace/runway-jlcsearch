# One-click launcher — opens the Runway shell and browser
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host "Bun is not installed. Install from: https://bun.com" -ForegroundColor Red
  exit 1
}

Start-Process "http://127.0.0.1:3080/"
bun run server.ts