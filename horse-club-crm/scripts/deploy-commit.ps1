[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$Message
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Message)) {
    throw 'Commit message must not be blank.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = git -C $projectRoot rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine the Git repository root.' }

Push-Location $repositoryRoot
try {
    $branch = git branch --show-current
    if ($LASTEXITCODE -ne 0) { throw 'Cannot determine the current Git branch.' }
    if ($branch -ne 'main') { throw 'Switch to main before deploying.' }

    git add .
    if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw 'git push failed.' }

    Write-Host 'Код отправлен в GitHub! GitHub Actions запустил автодеплой на сервере.'
}
finally {
    Pop-Location
}
