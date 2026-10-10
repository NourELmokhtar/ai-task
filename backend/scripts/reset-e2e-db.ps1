<#
.SYNOPSIS
  Drops and recreates the isolated E2E MySQL database `quickflow_e2e` (M09 B5). Non-interactive.

.DESCRIPTION
  - The target is hard-coded to `quickflow_e2e`. There is no parameter to change it.
  - Credentials come at runtime from the environment variable `ConnectionStrings__QuickFlowE2E`
    or, if that is unset, from user-secrets id `quickflow-api-dev` key `ConnectionStrings:QuickFlowE2E`.
    The password is passed to mysql.exe only through the child-process variable MYSQL_PWD.
    It is never printed, written to disk or put on a command line.
  - Guards (any failure aborts before touching MySQL):
      1. the E2E connection string's Database must be exactly `quickflow_e2e`;
      2. the target must not be `quickflow` (the dev DB);
      3. the dev connection string `ConnectionStrings:QuickFlow`, if present, must NOT point to `quickflow_e2e`.
  - The schema is NOT created here: start the API with `Database__ConnectionStringName=QuickFlowE2E`
    in Development and it applies all EF Core migrations at startup.
  - Stop any API instance that uses `quickflow_e2e` before resetting, and start it again afterwards.

.PARAMETER DryRun
  Validate the guards and print the target (host, port, database) plus the current table count. Change nothing.

.PARAMETER MySqlExe
  Path to mysql.exe. Default: $env:MYSQL_EXE, then `mysql` on PATH, then
  `C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe`.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/reset-e2e-db.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/reset-e2e-db.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$MySqlExe
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$TargetDatabase = 'quickflow_e2e'   # the only database this script can ever drop
$DevDatabase    = 'quickflow'
$SecretsId      = 'quickflow-api-dev'

function Fail([string]$message) {
    [Console]::Error.WriteLine("reset-e2e-db: $message")
    exit 1
}

function Get-SecretConnectionString([string]$name) {
    $envValue = [Environment]::GetEnvironmentVariable("ConnectionStrings__$name")
    if (-not [string]::IsNullOrWhiteSpace($envValue)) { return $envValue }

    $secretsPath = Join-Path $env:APPDATA "Microsoft\UserSecrets\$SecretsId\secrets.json"
    if (-not (Test-Path -LiteralPath $secretsPath)) { return $null }
    $json = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json

    # Flat form: { "ConnectionStrings:QuickFlowE2E": "..." }
    $flat = $json.PSObject.Properties | Where-Object { $_.Name -eq "ConnectionStrings:$name" } | Select-Object -First 1
    if ($flat) { return [string]$flat.Value }
    # Nested form: { "ConnectionStrings": { "QuickFlowE2E": "..." } }
    $section = $json.PSObject.Properties | Where-Object { $_.Name -eq 'ConnectionStrings' } | Select-Object -First 1
    if ($section) {
        $nested = $section.Value.PSObject.Properties | Where-Object { $_.Name -eq $name } | Select-Object -First 1
        if ($nested) { return [string]$nested.Value }
    }
    return $null
}

function ConvertFrom-ConnectionString([string]$connectionString) {
    $map = @{}
    foreach ($part in $connectionString.Split(';')) {
        $index = $part.IndexOf('=')
        if ($index -lt 1) { continue }
        $map[$part.Substring(0, $index).Trim().ToLowerInvariant()] = $part.Substring($index + 1).Trim()
    }
    function Pick([string[]]$keys, [string]$default) {
        foreach ($k in $keys) { if ($map.ContainsKey($k) -and $map[$k] -ne '') { return $map[$k] } }
        return $default
    }
    [pscustomobject]@{
        Host     = Pick @('server', 'host', 'data source', 'datasource', 'address', 'addr') 'localhost'
        Port     = Pick @('port') '3306'
        User     = Pick @('user', 'user id', 'userid', 'uid', 'username', 'user name') ''
        Password = Pick @('password', 'pwd') ''
        Database = Pick @('database', 'initial catalog') ''
    }
}

# ---- resolve and guard -------------------------------------------------------------------------
$e2eConnectionString = Get-SecretConnectionString 'QuickFlowE2E'
if ([string]::IsNullOrWhiteSpace($e2eConnectionString)) {
    Fail "ConnectionStrings:QuickFlowE2E is not configured (user-secrets id '$SecretsId' or env ConnectionStrings__QuickFlowE2E)."
}
$e2e = ConvertFrom-ConnectionString $e2eConnectionString

if ($e2e.Database -ine $TargetDatabase) {
    Fail "Refusing: ConnectionStrings:QuickFlowE2E points to database '$($e2e.Database)', expected '$TargetDatabase'."
}
if ($TargetDatabase -ieq $DevDatabase -or $e2e.Database -ieq $DevDatabase) {
    Fail "Refusing: the target is the dev database '$DevDatabase'."
}
$devConnectionString = Get-SecretConnectionString 'QuickFlow'
if (-not [string]::IsNullOrWhiteSpace($devConnectionString)) {
    $dev = ConvertFrom-ConnectionString $devConnectionString
    if ($dev.Database -ieq $TargetDatabase) {
        Fail "Refusing: the dev connection string ConnectionStrings:QuickFlow also points to '$TargetDatabase'."
    }
}
if ([string]::IsNullOrWhiteSpace($e2e.User)) { Fail 'The E2E connection string has no user.' }

# ---- locate mysql.exe ----------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($MySqlExe)) { $MySqlExe = $env:MYSQL_EXE }
if ([string]::IsNullOrWhiteSpace($MySqlExe)) {
    $onPath = Get-Command mysql -ErrorAction SilentlyContinue
    if ($onPath) { $MySqlExe = $onPath.Source } else { $MySqlExe = 'C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe' }
}
if (-not (Test-Path -LiteralPath $MySqlExe)) { Fail "mysql client not found at '$MySqlExe' (set -MySqlExe or MYSQL_EXE)." }

function Invoke-MySql([string]$sql) {
    $previous = $env:MYSQL_PWD
    try {
        $env:MYSQL_PWD = $e2e.Password
        $output = & $MySqlExe "--host=$($e2e.Host)" "--port=$($e2e.Port)" "--user=$($e2e.User)" --protocol=TCP --batch --skip-column-names -e $sql
        if ($LASTEXITCODE -ne 0) { Fail "mysql exited with code $LASTEXITCODE." }
        return $output
    }
    finally {
        $env:MYSQL_PWD = $previous
    }
}

$countSql = "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$TargetDatabase';"
Write-Host "Target: database '$TargetDatabase' on $($e2e.Host):$($e2e.Port) (credentials hidden)."
$before = Invoke-MySql $countSql
Write-Host "Tables in '$TargetDatabase' before: $before"

if ($DryRun) {
    Write-Host 'Dry run: guards passed, nothing changed.'
    exit 0
}

# The statement names the constant target only. It can never reference the dev database.
Invoke-MySql ("DROP DATABASE IF EXISTS ``$TargetDatabase``; " +
              "CREATE DATABASE ``$TargetDatabase`` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;") | Out-Null
$after = Invoke-MySql $countSql
Write-Host "Recreated '$TargetDatabase' (empty, $after tables). Start the API with Database__ConnectionStringName=QuickFlowE2E to apply migrations."
exit 0
