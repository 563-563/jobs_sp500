# Phase 1 Runbook

## 1) Initialize Run
1. Create new `run_id` (example: `pilot25_2026Q1_v1`).
2. Record `as_of_date` and operator.
3. Freeze `karpathy/jobs` commit hash.
4. Freeze S&P 500 constituent snapshot source and timestamp.

## 2) Source Ingestion
1. Save raw source files into `data/raw/` using immutable naming.
2. Add one row per source in `source_documents`.
3. Verify source URL and access timestamp are populated.

## 3) Workforce Evidence Extraction
1. Capture verbatim evidence snippets and filing section/page.
2. Add extraction method (`manual`, `script`, `hybrid`).
3. Attach citation id for each evidence row.

## 4) Mapping to Repo Labels
1. Map each evidence unit to exactly one repo label when confident.
2. If ambiguous, keep as unknown.
3. Store rationale and mapping confidence.

## 5) Compute Metrics
1. Calculate known and unknown share.
2. Calculate vulnerability score on known share.
3. Assign confidence level and data quality grade.

## 6) QA + Publish
1. Execute all checks in `qa_checks` table.
2. Export ranked CSV and audit pack.
3. Log unresolved issues and assumptions.

## 7) Quarterly Refresh
1. New run_id each quarter.
2. Never overwrite prior raw or output artifacts.
3. Diff new results against prior run for change analysis.
