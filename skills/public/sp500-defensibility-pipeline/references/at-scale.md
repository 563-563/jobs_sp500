# At-Scale Runbook

## Table of Contents

1. Objective
2. Inputs
3. Commands
4. Pass Strategy
5. Safety Checks

## Objective

Run full-universe one-by-one reasoning (up to S&P 500 scale) without discarding progress when some tickers remain unresolved.

## Inputs

- Universe CSV with `ticker` column (for example `sp500_constituents_full` export).
- Existing run artifacts for selected `RUN_ID`.
- Optional API credentials if enforcing LLM-backed reasoning.

## Commands

1. Iterative ladder:

```powershell
powershell -ExecutionPolicy Bypass -File skills/public/sp500-defensibility-pipeline/scripts/run_iterative_ladder.ps1 -RunId pilot25_2026Q1_v1 -UniverseFile data/intermediate/pilot25_2026Q1_v1__pilot25_companies__*.csv -MaxPasses 4 -CheckpointEvery 25 -QueueLimit 150
```

2. Build repair queue directly:

```bash
node skills/public/sp500-defensibility-pipeline/scripts/build_repair_queue.mjs --limit 150
```

3. Integrity validation:

```bash
node skills/public/sp500-defensibility-pipeline/scripts/validate_integrity_minimum.mjs
```

4. Strict final lock (only near completion):

```powershell
powershell -ExecutionPolicy Bypass -File skills/public/sp500-defensibility-pipeline/scripts/run_ticker_sweep.ps1 -RunId pilot25_2026Q1_v1 -TickersFile data/intermediate/my_universe.csv -CheckpointEvery 25
```

## Pass Strategy

1. Pass 1 over full universe.
2. Generate prioritized repair queue from `confidence_pipeline_status`.
3. Run queue-only passes until one of:
   - queue is empty,
   - queue no longer improves,
   - max passes reached.
4. Review unresolved tail manually, then run strict final-lock sweep.

## Safety Checks

- Require rollback on integrity failure for automated passes.
- Checkpoint every 25-50 tickers.
- Keep one-ticker execution (`run-company-agent-one.mjs`) as the only mutation primitive.
- Treat methodology/source `fail` as blockers.
