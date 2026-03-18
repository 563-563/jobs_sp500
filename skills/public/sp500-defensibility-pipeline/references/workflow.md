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

- Keep one-ticker execution as default.
- Checkpoint every 25-50 tickers.
- Keep a queue of high-impact tickers (low confidence, pending mappings, broad priors) and run them first.
- Treat large metric swings as investigation triggers, not automatic acceptance.

