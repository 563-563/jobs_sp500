# Workflow

## Table of Contents

1. Objectives
2. Inputs
3. Standard Loop
4. Hard Gates
5. Recovery Pattern
6. Scale-Up to 500

## Objectives

- Move each company to the highest defensibility possible with auditable evidence.
- Preserve global artifacts while updating one ticker at a time.
- Keep publishability gates green throughout long-running sweeps.

## Inputs

- Run ID (default: `pilot25_2026Q1_v1`).
- Universe file (`ticker` column CSV or line-delimited ticker text file).
- Existing intermediate artifacts and checkpoint history.

## Standard Loop

1. Create a baseline checkpoint:
   - `node scripts/create-final-final-baseline.mjs`
2. Run per-ticker cycle:
   - `node scripts/run-company-agent-one.mjs <TICKER>`
3. Validate gates:
   - `node skills/public/sp500-defensibility-pipeline/scripts/validate_hard_gates.mjs`
4. Repeat for next ticker.

Use `run_ticker_sweep.ps1` to automate steps 2-3 with periodic checkpoints.

## Hard Gates

- `medium_high_confidence`: all companies.
- `published_score`: all companies.
- Conservative score populated for all companies.
- Pending mapping rows: `0`.
- External `pending_research`: `0`.
- Source-ladder QA: no `warn`/`fail`.
- Methodology QA: no `fail`.

## Recovery Pattern

Use checkpoint restore when a sweep creates unacceptable regression:

1. Restore:
   - `node skills/public/sp500-defensibility-pipeline/scripts/restore_checkpoint.mjs --checkpoint <checkpoint.json>`
2. Regenerate presentation artifacts:
   - `node scripts/generate-results-dashboard.mjs`
   - `node scripts/generate-process-kanban.mjs`
3. Re-run hard-gate validation script.

## Scale-Up to 500

Use two modes deliberately:

1. Convergence mode (iterative ladder):
   - `run_iterative_ladder.ps1`
   - Runs full universe once, then re-runs only unresolved high-priority tickers from repair queue.
   - Enforces integrity checks (no source/methodology fails), not final all-green hard-gate lock.
2. Final-lock mode (strict sweep):
   - `run_ticker_sweep.ps1`
   - Requires full hard-gate pass at run end and rolls back on failure.

Recommended cadence for 500 ingest:

1. Pass 1: full universe.
2. Pass 2+: repair queue only (`build_repair_queue.mjs`) with queue limit (for example, 100-200).
3. Stop when queue reaches 0, or queue size is no longer improving.
4. Run strict final-lock sweep only when convergence indicates all companies can pass hard gates.
