# jobs_sp500 - Phase 1 Scaffold

This repository is set up to run a **25-company pilot** that estimates AI workforce vulnerability for current S&P 500 companies using:

- `karpathy/jobs` scores (as-is)
- company filings as primary workforce evidence
- explicit unknowns instead of silent imputation
- full citation traceability

## Phase 1 Goal
Produce a ranked table for 25 companies with:

1. `ai_vulnerability_score` (0-100)
2. `unknown_workforce_share_pct`
3. `confidence_level` (`high`/`medium`/`low`)
4. `data_quality_grade` (`A`-`F`)
5. source-backed evidence trail for every claim

## Directory Layout
- `docs/` project plan, runbook, acceptance criteria
- `schemas/` DuckDB/Postgres-compatible DDL for core tables
- `templates/` reusable templates for citations and assumptions
- `assumptions/` assumptions register (CSV)
- `runs/` run manifests for reproducibility
- `data/raw/` immutable source snapshots
- `data/intermediate/` normalized and mapped data
- `data/outputs/` ranked tables and publication artifacts
- `data/logs/` pipeline and QA logs
- `sql/` reference queries

## First Execution Checklist
1. Freeze pilot company list (25 names + tickers + CIKs).
2. Freeze `karpathy/jobs` source version (commit hash).
3. Record run manifest.
4. Ingest filings and extract workforce evidence.
5. Map evidence to repo job labels with confidence.
6. Compute and QA company-level scores.
7. Publish ranked table with citations and assumptions.
