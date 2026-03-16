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

## Reproducibility
Each run writes timestamped, immutable artifacts and records source URLs, access time, and checksums.
