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

## Reproducibility
Each run writes timestamped, immutable artifacts and records source URLs, access time, and checksums.
