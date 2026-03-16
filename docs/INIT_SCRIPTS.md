# Initialization Scripts

## 1) S&P 500 + SEC universe snapshot
Command:

`node scripts/init-pilot-universe.mjs`

Environment variables (optional):
- `RUN_ID` default: `pilot25_2026Q1_v1`
- `PILOT_SIZE` default: `25`
- `AS_OF_DATE` default: current date (`YYYY-MM-DD`)

Outputs:
- raw source snapshots (`data/raw/`)
- full constituent table (`data/intermediate/`)
- pilot company subset (`data/intermediate/`)
- source document ledger (`data/intermediate/`)
- run manifest (`runs/`)

Selection rule for pilot subset:
- deterministic alphabetical selection by normalized ticker (`.` -> `-`).

## 2) karpathy/jobs score snapshot
Command:

`node scripts/init-karpathy-snapshot.mjs`

Environment variables (optional):
- `RUN_ID` default: `pilot25_2026Q1_v1`
- `AS_OF_DATE` default: current date (`YYYY-MM-DD`)

Outputs:
- raw `scores.json` and `occupations.csv` snapshots (`data/raw/`)
- normalized vulnerability score table (`data/intermediate/`)
- karpathy source ledger (`data/intermediate/`)
- updated run manifest with commit hash (`runs/`)

## 3) Pilot SEC annual filing metadata
Command:

`node scripts/fetch-pilot-filings-metadata.mjs`

Environment variables (optional):
- `RUN_ID` default: `pilot25_2026Q1_v1`

Outputs:
- raw SEC submission JSON for each pilot company (`data/raw/`)
- normalized latest annual filing metadata (`data/intermediate/`)
- SEC submission source ledger (`data/intermediate/`)

## 4) Initialization QA checks
Command:

`node scripts/qa-initialization.mjs`

Environment variables (optional):
- `RUN_ID` default: `pilot25_2026Q1_v1`

Outputs:
- pass/fail QA ledger (`data/logs/`)
- checks: constituent count, CIK coverage, pilot row count, uniqueness, score range, filing coverage

## 5) Workforce evidence extraction (auto)
Command:

`node scripts/extract-workforce-evidence.mjs`

Environment variables (optional):
- `RUN_ID` default: `pilot25_2026Q1_v1`
- `MAX_SNIPPETS_PER_COMPANY` default: `12`

Outputs:
- primary filing document snapshots (`data/raw/`)
- workforce evidence rows (`data/intermediate/`)
- citation ledger rows (`data/intermediate/`)
- filing document source ledger (`data/intermediate/`)

Notes:
- This is a keyword-based extraction pass and must be manually reviewed before final publication.

## 6) Unknown role mapping placeholder (no imputation)
Command:

`node scripts/create-role-mapping-unknown.mjs`

Purpose:
- records explicit 100% unknown role share per company when no auditable role mix is available.

## 7) Company result computation + QA
Commands:

`node scripts/compute-company-results.mjs`  
`node scripts/qa-phase1-results.mjs`

Outputs:
- company-level results table (`data/outputs/`)
- result QA ledger (`data/logs/`)

## 8) Headcount verification workflow
Commands:

`node scripts/build-headcount-verification-queue.mjs`  
`node scripts/compute-company-results-verified-headcount.mjs`

Workflow:
- build auto candidates and one recommended review row per company
- manually set `review_status` and `verified_headcount` in the queue file
- recompute results to apply only `approved` verified headcounts

Status values:
- `pending`
- `approved`
- `rejected`
- `needs_research`

## 9) Strict Auto Review (Optional)
Commands:

`node scripts/auto-review-headcount-queue.mjs`  
`node scripts/compute-company-results-verified-headcount.mjs`

Behavior:
- auto-approves only high-confidence total-headcount statements
- leaves medium/unclear rows pending
- preserves `needs_research` rows

## 10) Role-Mix Candidate Extraction
Command:

`node scripts/extract-role-mix-candidates.mjs`

Purpose:
- scans workforce evidence for role-specific count/percentage signals
- links signals to approved total headcount (when available)
- outputs a review queue for manual role-share validation

## 11) Targeted Workforce Extraction (Higher Recall)
Command:

`node scripts/extract-workforce-evidence-targeted.mjs`

Purpose:
- scans local filing HTML snapshots with targeted human-capital terms
- generates denser evidence/citation sets for downstream role extraction

## 12) Role Label Suggestion + Review
Commands:

`node scripts/generate-role-label-suggestions.mjs`  
`node scripts/build-role-mapping-review-queue.mjs`  
`node scripts/generate-role-mapping-review-pack.mjs`

Purpose:
- proposes best-fit `karpathy/jobs` labels for extracted role signals
- creates a reviewer queue and markdown review pack

## 13) Company Vulnerability from Approved Role Mapping
Command:

`node scripts/compute-company-vulnerability-from-role-approvals.mjs`

Output:
- company-level vulnerability computed from manually approved role mappings only

## 14) Methodology v2 (Conservative)
Config:

`config/methodology_v2.json`

Commands:

`node scripts/build-role-mapping-adjudication-v2.mjs`  
`node scripts/generate-role-mapping-adjudication-v2-pack.mjs`  
`node scripts/compute-company-vulnerability-v2-conservative.mjs`  
`node scripts/qa-methodology-v2.mjs`

Rules:
- uses confidence tiers (`exact`, `narrow`, `broad`, `unknown`)
- publishes score only when approved mapped share >= threshold
- blocks scoring when confidence policy is violated

## 15) Visualization Dashboard
Command:

`node scripts/generate-results-dashboard.mjs`

Output:
- `data/outputs/pilot25_2026Q1_v1__dashboard.html`

Dashboard includes:
- conservative vs relaxed comparison
- top relaxed scores
- confidence and blocker distributions
- full company detail table

## Reproducibility
Each run writes timestamped, immutable artifacts and records source URLs, access time, and checksums.
