$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $root
$composeFile = if ($env:COMPOSE_FILE) { $env:COMPOSE_FILE } else { 'docker-compose.prod.yml' }
$envFile = if ($env:ENV_FILE) { $env:ENV_FILE } else { '.env.production' }
$backupDir = Join-Path $root 'backups'
[IO.Directory]::CreateDirectory($backupDir) | Out-Null
$lock = $null
$partial = $null
try {
  $lock = [IO.File]::Open((Join-Path $backupDir '.backup.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
  $stamp = [DateTime]::UtcNow.ToString('yyyy-MM-dd_HH-mm-ss')
  $target = Join-Path $backupDir "backup_$stamp.dump"
  $partial = "$target.partial"
  if ($composeFile.Contains('"') -or $envFile.Contains('"')) { throw 'Invalid configuration path' }
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = 'docker'
  $info.Arguments = 'compose --env-file "' + $envFile + '" -f "' + $composeFile + '" exec -T postgres sh -c "exec pg_dump -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -F c -b -v"'
  $info.WorkingDirectory = $root
  $info.UseShellExecute = $false
  $info.RedirectStandardOutput = $true
  $info.CreateNoWindow = $true
  $process = [Diagnostics.Process]::Start($info)
  $stream = [IO.File]::Open($partial, 'CreateNew', 'Write', 'None')
  try { $process.StandardOutput.BaseStream.CopyTo($stream) } finally { $stream.Dispose() }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "pg_dump failed: $($process.ExitCode)" }
  if ((Get-Item -LiteralPath $partial).Length -eq 0) { throw 'Empty dump' }
  # Copy bytes, not PowerShell text redirection: works in Windows PowerShell 5.1.
  [IO.File]::Move($partial, $target)
  Get-ChildItem -LiteralPath $backupDir -File -Filter 'backup_*.dump' | Where-Object {
    $_.Name -match '^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.dump$' -and $_.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-14)
  } | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
  Write-Output "Backup created: $target"
} finally {
  if ($partial -and (Test-Path -LiteralPath $partial)) { Remove-Item -LiteralPath $partial }
  if ($lock) { $lock.Dispose() }
}
