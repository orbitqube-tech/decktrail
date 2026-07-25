<#
.SYNOPSIS
Bring DeckTrail up from a fresh clone, and put the command line tool on your PATH.

.DESCRIPTION
The Windows twin of scripts/up.sh, and it does the same things in the same order: check Docker,
write a .env with a generated database password, start the stack, wait until the portal actually
answers, build the command line tool, and print the one-time setup link.

One command, because every step is either derivable or generated, and a step a person has to
perform by hand is a step they can get wrong. The only value that must be chosen is the database
password, so this generates one. The portal's own secrets it generates itself on first boot, and
this deliberately leaves them empty rather than inventing them here.

Safe to run twice. An existing .env is never overwritten and an existing stack is left running.

.PARAMETER Port
Which port the portal listens on. Ignored when a .env already names one, because that file is the
authoritative home for the setting.

.PARAMETER Gateway
Also start a local routing gateway and tell OpenCode about it.

.EXAMPLE
.\scripts\up.ps1

.EXAMPLE
.\scripts\up.ps1 -Port 3900 -Gateway
#>
[CmdletBinding()]
param(
  [int]$Port = 3000,
  [switch]$Gateway,
  [int]$GatewayPort = 20128
)

$ErrorActionPreference = 'Stop'

function Say  { param([string]$m) Write-Host "  $m" }
function Die  { param([string]$m) Write-Host ""; Write-Host $m -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'docker-compose.yml') -or -not (Test-Path '.env.example')) {
  Die "Run this from the repository root: .\scripts\up.ps1"
}

Write-Host ""
Write-Host "DeckTrail"
Write-Host ""

# ---------------------------------------------------------------- what must already be here

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Die "Docker is not installed, or not on your PATH. Install Docker Desktop, then run this again."
}
try { docker compose version *> $null } catch {
  Die "This needs Docker Compose v2, which ships with current Docker. 'docker compose version' failed."
}
if ($LASTEXITCODE -ne 0) {
  Die "This needs Docker Compose v2, which ships with current Docker. 'docker compose version' failed."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { Die "Docker is installed but not running. Start Docker Desktop, then run this again." }
Say "Docker is running"

# The tool is built with pnpm because this is a workspace. Corepack ships with Node and can provide
# pnpm without a separate install, so it is tried before giving up on the author's behalf.
$pnpm = $null
if (Get-Command pnpm -ErrorAction SilentlyContinue) { $pnpm = 'pnpm' }
elseif (Get-Command corepack -ErrorAction SilentlyContinue) {
  corepack enable pnpm *> $null
  if (Get-Command pnpm -ErrorAction SilentlyContinue) { $pnpm = 'pnpm' }
}
if (-not $pnpm) {
  Die "Node with pnpm is needed to build the command line tool. Install Node 22 or newer, then run: corepack enable pnpm"
}
Say "pnpm is available"

# ---------------------------------------------------------------- the port

function Test-PortBusy {
  param([int]$p)
  # Ask the operating system, not a guess. Any listener on the port is a reason to stop.
  try {
    if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop) { return $true }
  } catch { }
  $published = docker ps --format '{{.Ports}}' 2>$null
  if ($published -and ($published -join "`n") -match ":$p->") { return $true }
  return $false
}

# .env is the authoritative home for the port once it exists, so it is read rather than overridden.
# Deciding the port here and letting Compose read a different one from the file is exactly the
# guess-a-value-you-cannot-see mistake that this project has paid for before.
if (Test-Path '.env') {
  $fromEnv = Select-String -Path '.env' -Pattern '^PORT=(\d+)' | Select-Object -Last 1
  $effectivePort = if ($fromEnv) { [int]$fromEnv.Matches[0].Groups[1].Value } else { 3000 }
  if ($effectivePort -ne $Port -and $Port -ne 3000) {
    Say "Ignoring -Port $Port : your existing .env says PORT=$effectivePort, and it wins"
  }
  Say "Keeping the .env you already have, on port $effectivePort"
} else {
  $effectivePort = $Port
}

# Our own running stack holds this port, and that is not a conflict. Without this the second run of
# a script whose whole promise is that it is safe to run twice failed on the port it had itself
# taken. "Busy" has to mean somebody else.
function Test-OursAlreadyUp {
  param([int]$p)
  $ids = docker compose ps -q portal 2>$null
  if (-not $ids) { return $false }
  try {
    Invoke-WebRequest -Uri "http://localhost:$p/healthz" -TimeoutSec 3 -UseBasicParsing *> $null
    return $true
  } catch { return $false }
}

if (Test-OursAlreadyUp $effectivePort) {
  Say "DeckTrail is already running on port $effectivePort"
} elseif (Test-PortBusy $effectivePort) {
  if (Test-Path '.env') {
    Die "Port $effectivePort is already in use by something else on this machine, and your .env asks for it.`nChange PORT and DT_BASE_HOST in .env to a free port, then run this again."
  }
  Die "Port $effectivePort is already in use by something else on this machine.`nPick another and DeckTrail will use it end to end:`n`n    .\scripts\up.ps1 -Port 3900"
} else {
  Say "Port $effectivePort is free"
}

# ---------------------------------------------------------------- configuration

if (-not (Test-Path '.env')) {
  $bytes = [byte[]]::new(24)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $pw = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''

  # Only the database password is written. DT_TOKEN_SECRET, DT_SESSION_SECRET and DT_ADMIN_TOKEN
  # stay empty on purpose: the portal mints and persists those on first boot, and a value invented
  # here would be a second source of truth for a secret.
  $lines = Get-Content '.env.example' | ForEach-Object {
    if ($_ -match '^POSTGRES_PASSWORD=') { "POSTGRES_PASSWORD=$pw" }
    elseif ($_ -match '^PORT=')          { "PORT=$effectivePort" }
    elseif ($_ -match '^DT_BASE_HOST=')  { "DT_BASE_HOST=localhost:$effectivePort" }
    else { $_ }
  }
  # LF endings, because this file is read inside a Linux container.
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), (($lines -join "`n") + "`n"))
  Say "Wrote .env with a generated database password"
}

# ---------------------------------------------------------------- the stack

Say "Starting the stack, which pulls images the first time"
# Deliberately not --wait: on a first boot the database initialises and the portal mints and
# persists its secrets, and that ran past Compose's own patience while the stack was in fact coming
# up fine. Start the containers, then wait on the thing that actually matters.
$upLog = docker compose up -d 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "The stack did not start. Docker's own words:" -ForegroundColor Red
  $upLog | Write-Host
  exit 1
}

$base = "http://localhost:$effectivePort"
Say "Waiting for the portal, which sets itself up on a first boot"
$healthy = $false
foreach ($i in 1..180) {
  try {
    Invoke-WebRequest -Uri "$base/healthz" -TimeoutSec 3 -UseBasicParsing *> $null
    $healthy = $true; break
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $healthy) {
  Write-Host ""
  Write-Host "The stack started but $base/healthz never answered. The portal's own words:" -ForegroundColor Red
  docker compose logs --tail 40 portal | Write-Host
  exit 1
}
Say "Portal is healthy on $base"

# ---------------------------------------------------------------- the command line tool

Say "Building the command line tool"
& $pnpm install --silent *> $null
if ($LASTEXITCODE -ne 0) { Die "pnpm install failed. Run it yourself to see why: $pnpm install" }
& $pnpm -r build *> $null
if ($LASTEXITCODE -ne 0) { Die "The build failed. Run it yourself to see why: $pnpm -r build" }

# A repository-local launcher always works and needs no permissions. Linking it globally is nicer
# when it is allowed, so it is attempted and its failure is not fatal.
$launcher = @"
@echo off
node "%~dp0packages\studio\dist\cli.js" %*
"@
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'decktrail.cmd'), $launcher)

$how = '.\decktrail'
Push-Location packages/studio
npm link *> $null
Pop-Location
if (Get-Command decktrail -ErrorAction SilentlyContinue) {
  $how = 'decktrail'
  Say "Installed the decktrail command on your PATH"
} else {
  Say "Created .\decktrail.cmd in this folder (a global install was not available)"
}

# ---------------------------------------------------------------- the optional routing gateway

$gatewayReady = $false
if ($Gateway) {
  # Compare against the list of names, not a joined string: an anchored match on joined output only
  # ever tests the first line, so an already-running gateway looked absent and the port it holds
  # then looked like somebody else's.
  $running = @(docker ps --format '{{.Names}}' 2>$null)
  if ($running -contains 'decktrail-gateway') {
    Say "Routing gateway already running"
    $gatewayReady = $true
  } elseif (Test-PortBusy $GatewayPort) {
    Say "Something already listens on $GatewayPort; leaving it alone and skipping the gateway"
  } else {
    Say "Starting a routing gateway, which pulls a large image the first time"
    docker rm -f decktrail-gateway *> $null
    docker run -d --name decktrail-gateway --stop-timeout 40 `
      -p "127.0.0.1:$($GatewayPort):20128" `
      -v decktrail-gateway-data:/app/data `
      diegosouzapw/omniroute:latest *> $null
    if ($LASTEXITCODE -eq 0) {
      foreach ($i in 1..120) {
        try {
          Invoke-WebRequest -Uri "http://127.0.0.1:$GatewayPort/v1/models" -TimeoutSec 3 -UseBasicParsing *> $null
          $gatewayReady = $true; break
        } catch { Start-Sleep -Seconds 1 }
      }
      if ($gatewayReady) { Say "Gateway is answering on http://127.0.0.1:$GatewayPort" }
      else { Say "The gateway started but never answered. Look at: docker logs decktrail-gateway" }
    } else {
      Say "Could not start the gateway. Look at: docker logs decktrail-gateway"
    }
  }

  # Teaching OpenCode about the gateway means editing OpenCode's configuration, which belongs to
  # the author and may already say things we must not lose. The shared helper merges, backs up
  # first, and refuses rather than guesses when the file carries comments.
  if ($gatewayReady -and (Get-Command node -ErrorAction SilentlyContinue)) {
    $env:GATEWAY_PORT = "$GatewayPort"
    node scripts/wire-gateway.mjs
  }
}

# ---------------------------------------------------------------- what to do next

$setup = $null
$logs = docker compose logs portal 2>$null
if ($logs) {
  $m = [regex]::Matches(($logs -join "`n"), [regex]::Escape($base) + '/setup\?token=[A-Za-z0-9_-]+')
  if ($m.Count -gt 0) { $setup = $m[$m.Count - 1].Value }
}

Write-Host ""
Write-Host "Ready."
Write-Host ""
if ($setup) {
  Write-Host "Open this once to name yourself and set your brand:"
  Write-Host ""
  Write-Host "    $setup" -ForegroundColor Cyan
} else {
  Write-Host "Finish setup by opening the link this prints:"
  Write-Host ""
  Write-Host "    docker compose logs portal | Select-String setup"
}
Write-Host ""
Write-Host "Then make a deck from anything you already have:"
Write-Host ""
if ($gatewayReady) {
  Write-Host "    $how generate notes.md --client acme --prompt `"lead with the cost`" ``"
  Write-Host "        --provider opencode --model omniroute/bestfast"
  Write-Host ""
  Write-Host "That routes through the gateway, which picks a free model and reports what it cost."
  Write-Host "Drop the last line to use your own Claude login instead."
} else {
  Write-Host "    $how generate notes.md --client acme --prompt `"lead with the cost`""
  Write-Host "    $how generate proposal.pdf --client acme"
}
Write-Host ""
Write-Host "A PDF, a PowerPoint deck, a Word document, a scan or plain notes all work."
Write-Host ""
