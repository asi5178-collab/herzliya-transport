# יצירת חבילת התקנה להפצה - מערכת הסעות הרצליה
# הפעל: PowerShell create-package.ps1

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackageName = "herzliya-transport-$(Get-Date -Format 'yyyyMMdd')"
$OutputZip   = "$ProjectDir\..\$PackageName.zip"

Write-Host ""
Write-Host "================================================"
Write-Host "  Creating Herzliya Transport Package"
Write-Host "================================================"

# Files/folders to EXCLUDE
$Exclude = @(
    "node_modules",
    ".env",
    "database\*.db",
    "database\backups",
    "data\raw\*",
    "data\processed\*",
    "logs\*.log",
    "backups\*",
    "*.zip",
    ".git",
    "__pycache__"
)

# Create temp staging dir
$TempDir = "$env:TEMP\$PackageName"
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir | Out-Null

# Copy all files except excluded
Write-Host "[*] Copying files..."
$items = Get-ChildItem -Path $ProjectDir -Recurse -Force |
    Where-Object {
        $rel = $_.FullName.Replace($ProjectDir + "\", "")
        $excluded = $false
        foreach ($ex in $Exclude) {
            if ($rel -like $ex -or $rel -like "$ex\*" -or $_.Name -like $ex) {
                $excluded = $true; break
            }
        }
        -not $excluded
    }

foreach ($item in $items) {
    $rel  = $item.FullName.Replace($ProjectDir + "\", "")
    $dest = Join-Path $TempDir $rel
    if ($item.PSIsContainer) {
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
    } else {
        $destDir = Split-Path $dest -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item -Path $item.FullName -Destination $dest -Force
    }
}

# Copy .env.example as .env template (rename for clarity)
$envExample = Join-Path $TempDir ".env.example"
if (Test-Path $envExample) {
    Write-Host "[*] Preparing .env template..."
}

# Create QUICKSTART.txt
$quickstart = @"
================================================
  Herzliya Transport System - Quick Start
  מערכת הסעות תיכונים - הרצליה
================================================

REQUIREMENTS / דרישות:
  - Node.js v18+ from https://nodejs.org
  - An Anthropic API key from https://console.anthropic.com

INSTALLATION / התקנה:
  1. Double-click: install.bat
  2. Edit .env file - add your ANTHROPIC_API_KEY
  3. Double-click: start.bat
  4. Open browser: http://localhost:3000

DEFAULT USERS / משתמשים:
  admin    / admin123  (full access)
  manager  / manager123 (data entry + analysis)
  viewer   / viewer123  (view only)

NETWORK ACCESS / גישה ברשת:
  After starting, other computers can connect at:
  http://[YOUR-IP]:3000
  (IP shown in the server console)

IMPORTANT / חשוב:
  - Change default passwords after first login!
  - Add ANTHROPIC_API_KEY to .env for AI analysis
  - Run backup.bat weekly to backup your data

SUPPORT:
  Contact: asi5178@gmail.com
================================================
"@

$quickstart | Out-File -FilePath "$TempDir\QUICKSTART.txt" -Encoding utf8

# Create ZIP
Write-Host "[*] Creating ZIP archive..."
if (Test-Path $OutputZip) { Remove-Item $OutputZip -Force }
Compress-Archive -Path "$TempDir\*" -DestinationPath $OutputZip -CompressionLevel Optimal

# Cleanup temp
Remove-Item $TempDir -Recurse -Force

$size = [Math]::Round((Get-Item $OutputZip).Length / 1MB, 1)

Write-Host ""
Write-Host "================================================"
Write-Host "  Package created successfully!"
Write-Host "  File: $OutputZip"
Write-Host "  Size: $size MB"
Write-Host "================================================"
Write-Host ""
Write-Host "Share this ZIP file. Recipient runs: install.bat"
Write-Host ""
