param(
  [string]$RunId = "pilot25_2026Q1_v1",
  [string]$TickersFile = "",
  [int]$CheckpointEvery = 25,
  [switch]$RollbackOnFailure = $true,
  [string]$RollbackCheckpoint = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:LastCheckpointPath = ""
$script:LastKnownGoodCheckpointPath = ""

function Get-LatestPilotFile {
  $files = @(Get-ChildItem "data/intermediate" -File |
    Where-Object { $_.Name -like "$RunId*__pilot*_companies__*" } |
    Sort-Object Name)
  if (-not $files -or $files.Count -eq 0) {
    throw "No pilot company file found in data/intermediate for run_id=$RunId"
  }
  return $files[-1].FullName
}

function Get-TickersFromFile([string]$path) {
  if (-not (Test-Path $path)) {
    throw "Ticker file not found: $path"
  }

  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  if ($ext -eq ".csv") {
    $rows = Import-Csv $path
    $tickers = @()
    foreach ($row in $rows) {
      if ($row.PSObject.Properties.Name -contains "ticker") {
        $t = "$($row.ticker)".Trim().ToUpperInvariant()
        if ($t) { $tickers += $t }
      }
    }
    return $tickers
  }

  $lines = Get-Content $path
  $tickers = @()
  foreach ($line in $lines) {
    $t = "$line".Trim().ToUpperInvariant()
    if ($t) { $tickers += $t }
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
        if (Test-CheckpointHardGates $resolved) {
          $script:LastKnownGoodCheckpointPath = $resolved
          Write-Host "Checkpoint status: hard-gates PASS"
        } else {
          Write-Host "Checkpoint status: hard-gates NOT PASS"
        }
      }
    }
  }
}

function Test-CheckpointHardGates([string]$CheckpointPath) {
  if (-not (Test-Path $CheckpointPath)) {
    return $false
  }

  try {
    $raw = Get-Content -Path $CheckpointPath -Raw
    $checkpoint = $raw | ConvertFrom-Json
    $h = $checkpoint.hard_gate_snapshot
    if (-not $h) {
      return $false
    }

    $u = [int]$h.universe_count
    if ($u -le 0) {
      return $false
    }

    return (
      [int]$h.medium_high_confidence_count -eq $u -and
      [int]$h.published_score_count -eq $u -and
      [int]$h.conservative_score_count -eq $u -and
      [int]$h.pending_mapping_rows -eq 0 -and
      [int]$h.external_pending_research_rows -eq 0 -and
      [int]$h.source_ladder_warn_count -eq 0 -and
      [int]$h.source_ladder_fail_count -eq 0 -and
      [int]$h.methodology_fail_count -eq 0
    )
  } catch {
    return $false
  }
}

function Invoke-RollbackIfConfigured([string]$FailureReason) {
  if (-not $RollbackOnFailure) {
    return
  }

  $checkpointToRestore = ""
  if ($RollbackCheckpoint) {
    $checkpointToRestore = $RollbackCheckpoint
  } elseif ($script:LastKnownGoodCheckpointPath) {
    $checkpointToRestore = $script:LastKnownGoodCheckpointPath
  } elseif ($script:LastCheckpointPath) {
    $checkpointToRestore = $script:LastCheckpointPath
  }

  if (-not $checkpointToRestore) {
    Write-Warning "Rollback requested but no checkpoint is available."
    return
  }

  Write-Warning "Sweep failed: $FailureReason"
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

  Write-Host "Post-rollback hard-gate validation ..."
  node skills/public/sp500-defensibility-pipeline/scripts/validate_hard_gates.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback completed, but hard-gate validation still fails"
  }
}

$sourceFile = $TickersFile
if (-not $sourceFile) {
  $sourceFile = Get-LatestPilotFile
}

$tickers = @(Get-TickersFromFile $sourceFile)
if (-not $tickers -or $tickers.Count -eq 0) {
  throw "No tickers found in $sourceFile"
}

Write-Host "Run ID: $RunId"
Write-Host "Ticker source: $sourceFile"
Write-Host "Ticker count: $($tickers.Count)"
Write-Host "Checkpoint every: $CheckpointEvery"
Write-Host "Rollback on failure: $RollbackOnFailure"

$env:RUN_ID = $RunId
try {
  New-BaselineCheckpoint "start of sweep"

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
  Write-Host "Final validation ..."
  node skills/public/sp500-defensibility-pipeline/scripts/validate_hard_gates.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Hard-gate validation failed after sweep"
  }

  Write-Host "Sweep completed successfully."
}
catch {
  $failure = $_.Exception.Message
  Invoke-RollbackIfConfigured $failure
  throw
}
