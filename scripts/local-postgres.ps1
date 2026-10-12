param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$data = Join-Path $env:LOCALAPPDATA 'TenderMarket\postgres-data'
$secretDir = Join-Path $env:LOCALAPPDATA 'TenderMarket'
$log = Join-Path $secretDir 'postgres.log'
$envFile = Join-Path $root 'apps\api\.env'
$initDb = Join-Path $bin 'initdb.exe'
$pgCtl = Join-Path $bin 'pg_ctl.exe'
$createDb = Join-Path $bin 'createdb.exe'
$psql = Join-Path $bin 'psql.exe'

if (-not (Test-Path $pgCtl)) { throw 'PostgreSQL 17 is not installed at C:\Program Files\PostgreSQL\17.' }
New-Item -ItemType Directory -Force -Path $secretDir | Out-Null

if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $root 'apps\api\.env.example') $envFile
}
$contents = [IO.File]::ReadAllText($envFile)
$dbMatch = [regex]::Match($contents, '(?m)^DATABASE_URL=postgresql://([^:]+):([^@]+)@[^:]+:(\d+)/([^?]+)')
if (-not $dbMatch.Success) { throw 'Could not read DATABASE_URL in apps/api/.env.' }
$dbUser = $dbMatch.Groups[1].Value
$dbPassword = $dbMatch.Groups[2].Value
$dbPort = [int]$dbMatch.Groups[3].Value
$dbName = $dbMatch.Groups[4].Value

if ($Action -eq 'stop') {
  & $pgCtl -D $data -m fast -w stop
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop the local PostgreSQL cluster.' }
  exit 0
}

if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $dbPassword = [Convert]::ToHexString($bytes)
  $dbUser = 'tendermarket'
  $dbName = 'tendermarket'
  $dbPort = 5433
  $passwordFile = Join-Path $secretDir 'initdb-password.tmp'
  [IO.File]::WriteAllText($passwordFile, $dbPassword, (New-Object System.Text.UTF8Encoding($false)))
  try {
    & $initDb -D $data -U $dbUser --pwfile=$passwordFile --auth=scram-sha-256 --encoding=UTF8 --no-locale --no-instructions
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initdb failed.' }
  }
  finally {
    Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
  }
  $url = "DATABASE_URL=postgresql://$dbUser`:$dbPassword@localhost`:$dbPort/$dbName?schema=public"
  if ($contents -match '(?m)^DATABASE_URL=') {
    $contents = [regex]::Replace($contents, '(?m)^DATABASE_URL=.*$', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $url })
    [IO.File]::WriteAllText($envFile, $contents, (New-Object System.Text.UTF8Encoding($false)))
  }
  else {
    [IO.File]::AppendAllText($envFile, "`r`n$url`r`n", (New-Object System.Text.UTF8Encoding($false)))
  }
}

if ($Action -eq 'status') {
  & $pgCtl -D $data status
  exit $LASTEXITCODE
}

& $pgCtl -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgCtl -D $data -l $log -o "-h 127.0.0.1 -p $dbPort" -w start
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL failed to start on port $dbPort." }
}
$env:PGPASSWORD = $dbPassword
try {
  $exists = & $psql -w -h 127.0.0.1 -p $dbPort -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'"
  if ($LASTEXITCODE -ne 0) { throw 'Could not connect to the local PostgreSQL cluster.' }
  if (-not ($exists -match '1')) {
    & $createDb -h 127.0.0.1 -p $dbPort -U $dbUser $dbName
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the TenderMarket database.' }
  }
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
Write-Output "Local PostgreSQL is ready on localhost:$dbPort (database: $dbName)."
