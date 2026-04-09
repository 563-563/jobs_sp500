# Workflow

## Table of Contents

1. Objectives
2. Inputs
3. Per-Ticker Stage Contract
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

## Per-Ticker Stage Contract

Canonical flow is defined in `references/ticker-sop.md`.

Every ticker must pass these stages in order:

1. Source discovery (internet scrub).
2. Document acquisition and parsing (including PDF/OCR as needed).
3. Signal extraction (keyword/table/entity).
4. LLM reasoning (role allocation + confidence + citations).
5. Gap check.
6. Retry missing stages until satisfactory.

Automation notes:

1. Use `scripts/run-company-agent-one.mjs <TICKER>` as the mutation primitive.
   - Includes source-ladder acquisition before reasoning:
     `generate-external-role-evidence-queue.mjs` ->
     `resolve_external_search_urls.py` ->
     `auto-triage-external-role-evidence-queue.mjs` ->
     `review_external_docs.py` ->
     `promote_external_doc_signals.py` ->
     `integrate-external-role-signals.mjs`.
2. Use `run_ticker_pass.ps1`/`run_iterative_ladder.ps1` for batch orchestration.
3. Use `build_repair_queue.mjs` to target unresolved tickers.
4. Treat scripted adjudication policy as triage only:
   - Auto-reject obvious malformed/non-role snippets.
   - Keep ambiguous mappings pending.
   - Resolve pending mappings through per-ticker reasoning with citation-backed rationale.
5. Generate per-ticker reasoning artifact before scoring gates:
   - Must include role-confidence judgment.
   - Must include explicit `need_more_data` decision.
   - Conservative publish is allowed only when `need_more_data=no`.
6. When reasoning in-window (non-API mode), enforce the standard prompt and decision schema:
   - Use `references/reasoning-prompt-contract.md`.
   - Produce both headcount and mapping decisions in apply-script-compatible CSV shape.
   - Apply decisions before recomputing confidence/scoring artifacts.

Important:
- Re-running scoring alone is not a completed pass for a ticker unless stages 1-5 are satisfied.

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
