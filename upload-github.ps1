$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$zip = Join-Path $root 'fitpilot-bot-upload.zip'

if (Test-Path $zip) { Remove-Item $zip -Force }

$excludeDirs = @('node_modules', 'data', 'dist', 'tools', '.git')
$excludeFiles = @('.env', '.env.txt', 'fitpilot-bot-upload.zip')

$items = Get-ChildItem -Path $root -Force | Where-Object {
    if ($_.Name -in $excludeFiles) { return $false }
    if ($_.PSIsContainer -and $_.Name -in $excludeDirs) { return $false }
    return $true
}

Compress-Archive -Path ($items.FullName) -DestinationPath $zip -Force

Write-Host ''
Write-Host 'Готово:' $zip
Write-Host ''
Write-Host 'Дальше на GitHub:'
Write-Host '1. Откройте https://github.com/rodionabzalilov95596-cloud/fitpilot-bot'
Write-Host '2. Удалите старые файлы (app.js, index.html и т.д.) — они только от календаря'
Write-Host '3. Add file -> Upload files -> перетащите fitpilot-bot-upload.zip'
Write-Host '   ИЛИ распакуйте zip и загрузите все папки: src, miniapp, site, package.json ...'
Write-Host '4. Commit changes'
Write-Host ''
Write-Host 'Проверка: в репозитории должны быть package.json и папка src/'
Write-Host ''

Start-Process 'https://github.com/rodionabzalilov95596-cloud/fitpilot-bot'
