# Local-only integration: real Git commit/push into a disposable bare repository.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts/deploy-commit.ps1'
$originalLocation = Get-Location
$fixtureRoot = Join-Path $PSScriptRoot ('Валерий [Git test] ' + [guid]::NewGuid())
$repo = Join-Path $fixtureRoot 'репозиторий'
$remote = Join-Path $fixtureRoot 'remote.git'
function Invoke-TestGit {
    & git @args
    if ($LASTEXITCODE -ne 0) { throw "Git fixture command failed: $args" }
}
try {
    New-Item -ItemType Directory -Path (Join-Path $repo 'scripts') -Force | Out-Null
    Copy-Item -LiteralPath $scriptPath -Destination (Join-Path $repo 'scripts/deploy-commit.ps1')
    Invoke-TestGit init --bare $remote
    Invoke-TestGit -C $repo init -b main
    Invoke-TestGit -C $repo config user.name 'Deploy test'
    Invoke-TestGit -C $repo config user.email 'deploy-test@example.invalid'
    Invoke-TestGit -C $repo remote add origin $remote
    & (Join-Path $repo 'scripts/deploy-commit.ps1') -Message 'Проверка кириллического пути'
    if ((Get-Location).Path -ne $originalLocation.Path) { throw 'Working directory was not restored.' }
    $localCommit = Invoke-TestGit -C $repo rev-parse HEAD
    $remoteCommit = Invoke-TestGit --git-dir=$remote rev-parse refs/heads/main
    if ($localCommit -ne $remoteCommit) { throw 'Local push did not reach the fixture remote.' }
    Write-Output 'Windows PowerShell native Git integration passed (Cyrillic, spaces, brackets, unrelated working directory).'
} finally {
    Set-Location -LiteralPath $originalLocation.Path
    # Delete only this test's known directory inside test-results.
    $resolvedFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
    $allowedParent = [System.IO.Path]::GetFullPath($PSScriptRoot) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedFixture.StartsWith($allowedParent, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path.' }
    if (Test-Path -LiteralPath $resolvedFixture) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force }
}
