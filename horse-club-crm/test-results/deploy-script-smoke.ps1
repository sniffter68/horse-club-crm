$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts/deploy-commit.ps1'
$global:deploySmokeRoot = (Get-Location).Path
$nativeRoot = git -C (Split-Path -Parent $scriptPath) rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $nativeRoot)) { throw 'Native Git root discovery failed for the Cyrillic checkout path.' }
$global:deploySmokeCalls = @()
$global:deploySmokeBranch = 'main'
$global:deploySmokeFailure = ''
function global:git {
    $global:deploySmokeCalls += ($args -join ' ')
    $global:LASTEXITCODE = 0
    if ($args -contains 'rev-parse') { return $global:deploySmokeRoot }
    if ($args[0] -eq 'branch') { return $global:deploySmokeBranch }
    if ($args[0] -eq $global:deploySmokeFailure) { $global:LASTEXITCODE = 1 }
}
try {
    $originalPath = (Get-Location).Path
    $global:deploySmokeRoot = $nativeRoot
    & $scriptPath -Message 'deploy smoke test'
    if (($global:deploySmokeCalls -notcontains 'push origin main')) { throw 'Successful push missing.' }
    if ((Get-Location).Path -ne $originalPath) { throw 'Working directory not restored.' }
    # Exercise literal path handling and fallback without staging or pushing real files.
    $fixtureRoot = Join-Path $PSScriptRoot 'Кириллица [deploy smoke]'
    $fixtureScripts = Join-Path $fixtureRoot 'scripts'
    New-Item -ItemType Directory -Path $fixtureScripts -Force | Out-Null
    $fixtureScript = Join-Path $fixtureScripts 'deploy-commit.ps1'
    Copy-Item -LiteralPath $scriptPath -Destination $fixtureScript
    try {
        $global:deploySmokeRoot = $fixtureRoot
        & $fixtureScript -Message 'Проверка кириллицы и пробелов'
        $global:deploySmokeRoot = $null
        & $fixtureScript -Message 'Проверка резервного пути'
        if ((Get-Location).Path -ne $originalPath) { throw 'Working directory not restored after fallback.' }
    } finally {
        Remove-Item -LiteralPath $fixtureScript
        Remove-Item -LiteralPath $fixtureScripts
        Remove-Item -LiteralPath $fixtureRoot
        $global:deploySmokeRoot = $nativeRoot
    }
    foreach ($failure in @('add', 'commit', 'push')) {
        $global:deploySmokeCalls = @()
        $global:deploySmokeFailure = $failure
        $caught = $false
        try { & $scriptPath -Message 'failure smoke test' } catch { $caught = $true }
        if (!$caught) { throw "Failure was ignored: $failure" }
        if ($failure -ne 'push' -and ($global:deploySmokeCalls -contains 'push origin main')) { throw 'Push ran after a failed command.' }
        if ((Get-Location).Path -ne $originalPath) { throw 'Working directory not restored after failure.' }
    }
    $global:deploySmokeFailure = ''
    $global:deploySmokeBranch = 'feature'
    $global:deploySmokeCalls = @()
    $caught = $false
    try { & $scriptPath -Message 'wrong branch smoke test' } catch { $caught = $true }
    if (!$caught -or ($global:deploySmokeCalls -contains 'add .')) { throw 'Wrong branch was not rejected before staging.' }
    Write-Output 'PowerShell smoke checks passed; all Git calls were mocked.'
}
finally { Remove-Item Function:\git }
