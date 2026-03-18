param(
  [string]$RunId = "pilot25_2026Q1_v1",
  [string]$UniverseFile = "",
  [int]$MaxPasses = 4,
  [int]$CheckpointEvery = 25,
  [int]$QueueLimit = 0,
  [int]$MaxTickersPerPass = 0,
  [switch]$StopWhenQueueNotImproving = $true,
  [switch]$RollbackOnIntegrityFailure = $true,
  [switch]$RequireLlmReasoning = $false,
  [switch]$FailOnSourceWarn = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-LatestUniverseFile {
  $full = @(Get-ChildItem "data/intermediate" -File |
    Where-Object { $_.Name -like "$RunId*__sp500_constituents_full__*" } |
    Sort-Object Name)
  if ($full.Count -gt 0) {
    return $full[-1].FullName
  }

  $pilot = @(Get-ChildItem "data/intermediate" -File |
    Where-Object { $_.Name -like "$RunId*__pilot*_companies__*" } |
    Sort-Object Name)
  if ($pilot.Count -gt 0) {
    return $pilot[-1].FullName
  }

  throw "No universe file found in data/intermediate for run_id=$RunId"
}

function Get-LatestRepairQueueFile {
  $files = @(Get-ChildItem "data/outputs" -File |
    Where-Object { $_.Name -like "$RunId*__repair_queue__*" } |
    Sort-Object Name)
  if ($files.Count -eq 0) {
    throw "No repair queue file found for run_id=$RunId"
  }
  return $files[-1].FullName
}

function Build-RepairQueue {
  $nodeArgs = @(
    "skills/public/sp500-defensibility-pipeline/scripts/build_repair_queue.mjs"
  )
  if ($QueueLimit -gt 0) {
    $nodeArgs += @("--limit", "$QueueLimit")
  }

  node @nodeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to build repair queue"
  }

  return Get-LatestRepairQueueFile
}

function Write-TickerListFromQueue([string]$QueuePath, [int]$PassNumber) {
  $rows = @(Import-Csv $QueuePath)
  $tickers = @()
  foreach ($row in $rows) {
    $ticker = "$($row.ticker)".Trim().ToUpperInvariant()
    if ($ticker) {
      $tickers += $ticker
    }
  }

  if ($MaxTickersPerPass -gt 0 -and $tickers.Count -gt $MaxTickersPerPass) {
    $tickers = @($tickers[0..($MaxTickersPerPass - 1)])
  }

  $stamp = (Get-Date).ToString("o").Replace(":", "-")
  $tmpPath = "data/intermediate/${RunId}__pass${PassNumber}_tickers__${stamp}.txt"
  Set-Content -Path $tmpPath -Value ($tickers -join "`n")
  return @{
    path = $tmpPath
    count = $tickers.Count
  }
}

function Run-Pass([int]$PassNumber, [string]$TickersFilePath) {
  Write-Host ""
  Write-Host "=== Pass $PassNumber ==="
  Write-Host "Tickers file: $TickersFilePath"

  & "skills/public/sp500-defensibility-pipeline/scripts/run_ticker_pass.ps1" `
    -RunId $RunId `
    -TickersFile $TickersFilePath `
    -CheckpointEvery $CheckpointEvery `
    -MaxTickers $MaxTickersPerPass `
    -RollbackOnIntegrityFailure:$RollbackOnIntegrityFailure `
    -RequireLlmReasoning:$RequireLlmReasoning `
    -FailOnSourceWarn:$FailOnSourceWarn
  if ($LASTEXITCODE -ne 0) {
    throw "Ticker pass failed at pass=$PassNumber"
  }
}

$sourceUniverse = $UniverseFile
if (-not $sourceUniverse) {
  $sourceUniverse = Get-LatestUniverseFile
}
if (-not (Test-Path $sourceUniverse)) {
  throw "Universe file not found: $sourceUniverse"
}

Write-Host "Run ID: $RunId"
Write-Host "Universe source: $sourceUniverse"
Write-Host "Max passes: $MaxPasses"
Write-Host "Checkpoint every: $CheckpointEvery"
Write-Host "Queue limit: $QueueLimit"
Write-Host "Max tickers per pass: $MaxTickersPerPass"
Write-Host "Stop when queue not improving: $StopWhenQueueNotImproving"

$previousQueueCount = -1
$completedPasses = 0

for ($pass = 1; $pass -le $MaxPasses; $pass++) {
  $passTickersFile = $sourceUniverse
  $passQueueCount = -1

  if ($pass -gt 1) {
    $queuePath = Build-RepairQueue
    $queueRows = @(Import-Csv $queuePath)
    $passQueueCount = $queueRows.Count
    Write-Host "Repair queue rows before pass $($pass): $passQueueCount"

    if ($passQueueCount -eq 0) {
      Write-Host "Repair queue is empty. Converged."
      break
    }

    if ($StopWhenQueueNotImproving -and $previousQueueCount -ge 0 -and $passQueueCount -ge $previousQueueCount) {
      Write-Warning "Queue did not improve (previous=$previousQueueCount current=$passQueueCount). Stopping."
      break
    }
    $previousQueueCount = $passQueueCount

    $tmp = Write-TickerListFromQueue -QueuePath $queuePath -PassNumber $pass
    if ($tmp.count -eq 0) {
      Write-Host "No tickers selected from repair queue. Stopping."
      break
    }
    $passTickersFile = $tmp.path
    Write-Host "Selected $($tmp.count) tickers for pass $pass"
  }

  Run-Pass -PassNumber $pass -TickersFilePath $passTickersFile
  $completedPasses += 1
}

Write-Host ""
Write-Host "Iterative ladder complete."
Write-Host "Completed passes: $completedPasses"
Write-Host "Next checks:"
Write-Host "  node skills/public/sp500-defensibility-pipeline/scripts/build_repair_queue.mjs"
Write-Host "  node skills/public/sp500-defensibility-pipeline/scripts/validate_hard_gates.mjs"
