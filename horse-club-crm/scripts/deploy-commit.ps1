[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$Message
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Message)) {
    throw 'Commit message must not be blank.'
}

$originalLocation = Get-Location
try {
    # Anchor discovery to this script, even when invoked from another directory.
    $repoRoot = $null
    try { $repoRoot = git -C $PSScriptRoot rev-parse --show-toplevel 2>$null } catch { $repoRoot = $null }
    if (-not $repoRoot) {
        $repoRoot = (Resolve-Path -LiteralPath "$PSScriptRoot\..").Path
    }
    Set-Location -LiteralPath $repoRoot
    $branch = git branch --show-current
    if ($LASTEXITCODE -ne 0) { throw 'Cannot determine the current Git branch.' }
    if ($branch -ne 'main') { throw 'Switch to main before deploying.' }
    Write-Host '✔ Ветка проверена'

    git add .
    if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
    Write-Host "✔ Файлы закоммичены: $Message"
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw 'git push failed.' }

    Write-Host '✔ Git push выполнен успешно -> GitHub Actions запустил деплой на сервере.'
}
finally {
    Set-Location -LiteralPath $originalLocation.Path
}
