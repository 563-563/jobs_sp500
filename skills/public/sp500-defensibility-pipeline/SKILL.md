---
name: sp500-defensibility-pipeline
description: Run and stabilize one-by-one company defensibility scoring for large ticker universes (pilot sets through S&P 500 scale) using this repository's pipeline scripts. Use when asked to move companies up the confidence ladder, execute per-ticker reasoning passes, enforce hard publish gates, regenerate dashboard/kanban/dossiers, or recover from pipeline regressions after iterative runs.
---

# SP500 Defensibility Pipeline

## Overview

Operate each ticker with a strict stage contract:

1. Internet source discovery.
2. Document acquisition/parsing (HTML/PDF/OCR).
3. Signal extraction (keyword/table/entity).
4. LLM reasoning for role breakdown and confidence.
5. Gap check and targeted retries.

Then aggregate into universe-level scoring and QA.

## Quick Start

1. Create a checkpoint:
   - `node scripts/create-final-final-baseline.mjs`
2. Run one ticker:
   - `node scripts/run-company-agent-one.mjs AAPL`
3. Validate integrity:
   - `node skills/public/sp500-defensibility-pipeline/scripts/validate_integrity_minimum.mjs`
4. Validate final hard gates (final lock only):
   - `node skills/public/sp500-defensibility-pipeline/scripts/validate_hard_gates.mjs`
5. If needed, restore from checkpoint:
   - `node skills/public/sp500-defensibility-pipeline/scripts/restore_checkpoint.mjs --checkpoint <path-to-checkpoint-json>`

## Default Ticker Method (Required)

For each ticker, follow `references/ticker-sop.md` exactly.

Do not treat repeated score recomputation as progress unless the ticker has gone through:

1. Discovery
2. Acquisition/parsing
3. Extraction
4. LLM reasoning
5. Gap-driven retry decision

If any stage is incomplete, the ticker is not done.

## Execution Modes

### Final-Lock Sweep (strict)

Run a one-by-one sweep from a ticker list:

```powershell
powershell -ExecutionPolicy Bypass -File skills/public/sp500-defensibility-pipeline/scripts/run_ticker_sweep.ps1 -TickersFile data/intermediate/my_universe.csv -CheckpointEvery 25
```

If `-TickersFile` is omitted, the script uses latest `pilot*_companies` intermediate file.

Use this mode when all companies are expected to satisfy final hard gates at the end of the run.

### Iterative Scale Sweep (500 ingest)

Run iterative one-by-one passes where progress accumulates across passes and unresolved companies are re-queued:

```powershell
powershell -ExecutionPolicy Bypass -File skills/public/sp500-defensibility-pipeline/scripts/run_iterative_ladder.ps1 -UniverseFile data/intermediate/my_universe.csv -MaxPasses 4 -CheckpointEvery 25 -QueueLimit 150
```

Default flow:

1. Pass 1 runs the provided universe file.
2. Next passes run only the generated repair queue (highest-priority unresolved tickers first).
3. Each pass enforces integrity checks (source/methodology failures), not final hard-gate lock.

Repair queue command (standalone):

```bash
node skills/public/sp500-defensibility-pipeline/scripts/build_repair_queue.mjs --limit 150
```

## Guardrails

- Use `scripts/run-company-agent-one.mjs` for iterative ticker work.
- Avoid `scripts/run-company-agents.mjs` during one-by-one upgrade passes.
- Use strict hard-gate mode only for final lock declarations.
- Use iterative mode for large ingest convergence and queue-driven retries.
- Regenerate dashboard/kanban after restores or artifact rollbacks.
- Treat per-ticker reasoning as mandatory, not optional.
- Use hard-coded adjudication rules only for triage/rejection; keep context-dependent mappings pending for reasoning.
- Conservative publish is blocked unless a ticker has a reasoning artifact with explicit `need_more_data=no`.
- Auto-adjudication defaults to reject-only triage for obvious non-role artifacts; auto-approval is opt-in only.
- In-window reasoning must follow the standard contract in `references/reasoning-prompt-contract.md` and produce decision files consumable by apply scripts.

## References

- Workflow: `references/workflow.md`
- Per-ticker SOP: `references/ticker-sop.md`
- Reasoning prompt contract: `references/reasoning-prompt-contract.md`
- Source ladder and evidence strategy: `references/source-ladder.md`
- At-scale runbook: `references/at-scale.md`
