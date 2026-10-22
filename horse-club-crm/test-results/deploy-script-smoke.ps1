$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts/deploy-commit.ps1'
$global:deploySmokeRoot = (Get-Location).Path
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
    & $scriptPath -Message 'deploy smoke test'
    if (($global:deploySmokeCalls -notcontains 'push origin main')) { throw 'Successful push missing.' }
    if ((Get-Location).Path -ne $originalPath) { throw 'Working directory not restored.' }
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
