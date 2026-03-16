# Phase 1 Acceptance Criteria

## Deliverable
A ranked table for 25 pilot companies with source-verifiable metrics.

## Required Columns
1. `run_id`
2. `as_of_date`
3. `company_name`
4. `ticker`
5. `cik`
6. `ai_vulnerability_score`
7. `known_workforce_share_pct`
8. `unknown_workforce_share_pct`
9. `confidence_level`
10. `data_quality_grade`
11. `primary_filing_date`
12. `notes`

## Must-Pass Quality Gates
1. 25/25 companies present once each.
2. 100% of numeric claims have at least one citation record.
3. Role-share totals satisfy: known + unknown = 100% (+/- 0.1%).
4. `ai_vulnerability_score` null only when known share is 0%.
5. Every row includes reproducibility fields (`run_id`, source versions).
6. Assumptions referenced by output rows exist in assumptions register.
7. No proxy-imputed role shares unless assumption explicitly approved.

## Audit Artifacts
1. Ranked CSV in `data/outputs/`.
2. Citation ledger export.
3. Assumption register snapshot.
4. Run manifest snapshot.
5. QA check report.
