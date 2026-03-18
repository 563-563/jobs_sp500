param(
  [string]$RunId = "pilot25_2026Q1_v1",
  [string]$TickersFile = "",
  [int]$CheckpointEvery = 25,
  [int]$MaxTickers = 0,
  [switch]$RollbackOnIntegrityFailure = $true,
  [string]$RollbackCheckpoint = "",
  [switch]$RequireLlmReasoning = $false,
  [switch]$FailOnSourceWarn = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:LastCheckpointPath = ""

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

function Get-TickersFromFile([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "Ticker file not found: $Path"
  }

  $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($ext -eq ".csv") {
    $rows = Import-Csv $Path
    $tickers = @()
    foreach ($row in $rows) {
      if ($row.PSObject.Properties.Name -contains "ticker") {
        $ticker = "$($row.ticker)".Trim().ToUpperInvariant()
        if ($ticker) { $tickers += $ticker }
      }
    }
    return $tickers
  }

  $lines = Get-Content $Path
  $tickers = @()
  foreach ($line in $lines) {
    $ticker = "$line".Trim().ToUpperInvariant()
    if ($ticker) { $tickers += $ticker }
  }
  return $tickers
}

function New-BaselineCheckpoint([string]$Reason) {
  if ($Reason) {
    Write-Host "Checkpoint: $Reason"
  } else {
    Write-Host "Checkpoint ..."
  }

  $output = & node scripts/create-final-final-baseline.mjs 2>&1
  $exit = $LASTEXITCODE
  foreach ($line in $output) {
    Write-Host $line
  }
  if ($exit -ne 0) {
    throw "Failed to create checkpoint"
  }

  foreach ($line in $output) {
    $text = "$line"
    if ($text -match "^Wrote baseline checkpoint:\s*(.+)$") {
      $rawPath = $matches[1].Trim()
      $resolved = $rawPath
      if (-not [System.IO.Path]::IsPathRooted($rawPath)) {
        $resolved = Join-Path (Get-Location) $rawPath
      }
      if (Test-Path $resolved) {
        $script:LastCheckpointPath = $resolved
      }
    }
  }
}

function Invoke-RollbackIfConfigured([string]$FailureReason) {
  if (-not $RollbackOnIntegrityFailure) {
    return
  }

  $checkpointToRestore = ""
  if ($RollbackCheckpoint) {
    $checkpointToRestore = $RollbackCheckpoint
  } elseif ($script:LastCheckpointPath) {
    $checkpointToRestore = $script:LastCheckpointPath
  }

  if (-not $checkpointToRestore) {
    Write-Warning "Rollback requested but no checkpoint is available."
    return
  }

  Write-Warning "Pass failed: $FailureReason"
  Write-Host "Rolling back to checkpoint: $checkpointToRestore"
  node skills/public/sp500-defensibility-pipeline/scripts/restore_checkpoint.mjs --checkpoint $checkpointToRestore
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback failed for checkpoint: $checkpointToRestore"
  }

  Write-Host "Rebuilding dashboard and kanban after rollback ..."
  node scripts/generate-results-dashboard.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback restore succeeded, but dashboard regeneration failed"
  }
  node scripts/generate-process-kanban.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback restore succeeded, but kanban regeneration failed"
  }

  $validateArgs = @("skills/public/sp500-defensibility-pipeline/scripts/validate_integrity_minimum.mjs")
  if ($FailOnSourceWarn) {
    $validateArgs += "--fail-on-source-warn"
  }

  Write-Host "Post-rollback integrity validation ..."
  node @validateArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback completed, but integrity validation still fails"
  }
}

$sourceFile = $TickersFile
if (-not $sourceFile) {
  $sourceFile = Get-LatestUniverseFile
}

$tickers = @(Get-TickersFromFile $sourceFile)
if (-not $tickers -or $tickers.Count -eq 0) {
  throw "No tickers found in $sourceFile"
}

if ($MaxTickers -gt 0 -and $tickers.Count -gt $MaxTickers) {
  $tickers = @($tickers[0..($MaxTickers - 1)])
}

Write-Host "Run ID: $RunId"
Write-Host "Ticker source: $sourceFile"
Write-Host "Ticker count: $($tickers.Count)"
Write-Host "Checkpoint every: $CheckpointEvery"
Write-Host "Rollback on integrity failure: $RollbackOnIntegrityFailure"
Write-Host "Require LLM reasoning: $RequireLlmReasoning"

$env:RUN_ID = $RunId
$env:REASONING_SOURCE = "window"
if ($RequireLlmReasoning) {
  $env:REASONING_SOURCE = "api"
  $env:REQUIRE_LLM_REASONING = "1"
} else {
  $env:REQUIRE_LLM_REASONING = "0"
}

try {
  New-BaselineCheckpoint "start of pass"

  $i = 0
  foreach ($ticker in $tickers) {
    $i += 1
    Write-Host ""
    Write-Host "[$i/$($tickers.Count)] Running $ticker ..."
    node scripts/run-company-agent-one.mjs $ticker
    if ($LASTEXITCODE -ne 0) {
      throw "run-company-agent-one failed for $ticker"
    }

    if ($CheckpointEvery -gt 0 -and ($i % $CheckpointEvery -eq 0)) {
      New-BaselineCheckpoint "after $i tickers"
    }
  }

  Write-Host ""
  Write-Host "Integrity validation ..."
  $validateArgs = @("skills/public/sp500-defensibility-pipeline/scripts/validate_integrity_minimum.mjs")
  if ($FailOnSourceWarn) {
    $validateArgs += "--fail-on-source-warn"
  }
  node @validateArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Integrity validation failed after pass"
  }

  Write-Host "Ticker pass completed successfully."
}
catch {
  $failure = $_.Exception.Message
  Invoke-RollbackIfConfigured $failure
  throw
}
