---
name: sp500-defensibility-pipeline
description: Run and stabilize one-by-one company defensibility scoring for large ticker universes (pilot sets through S&P 500 scale) using this repository's pipeline scripts. Use when asked to move companies up the confidence ladder, execute per-ticker reasoning passes, enforce hard publish gates, regenerate dashboard/kanban/dossiers, or recover from pipeline regressions after iterative runs.
---

# SP500 Defensibility Pipeline

## Overview

Execute per-ticker reasoning cycles while preserving global artifacts, enforce hard publish gates, and provide checkpoint/restore safety for large-universe runs.

## Quick Start

1. Create a checkpoint:
   - `node scripts/create-final-final-baseline.mjs`
2. Run one ticker:
   - `node scripts/run-company-agent-one.mjs AAPL`
3. Validate hard gates:
   - `node skills/public/sp500-defensibility-pipeline/scripts/validate_hard_gates.mjs`
4. If needed, restore from checkpoint:
   - `node skills/public/sp500-defensibility-pipeline/scripts/restore_checkpoint.mjs --checkpoint <path-to-checkpoint-json>`

## Full Sweep

Run a one-by-one sweep from a ticker list:

```powershell
powershell -ExecutionPolicy Bypass -File skills/public/sp500-defensibility-pipeline/scripts/run_ticker_sweep.ps1 -TickersFile data/intermediate/my_universe.csv -CheckpointEvery 25
```

If `-TickersFile` is omitted, the script uses latest `pilot*_companies` intermediate file.

## Guardrails

- Use `scripts/run-company-agent-one.mjs` for iterative ticker work.
- Avoid `scripts/run-company-agents.mjs` during one-by-one upgrade passes.
- Treat hard-gate regressions as blockers; checkpoint before major sweeps.
- Regenerate dashboard/kanban after restores or artifact rollbacks.

## References

- Workflow: `references/workflow.md`
- Source ladder and evidence strategy: `references/source-ladder.md`
