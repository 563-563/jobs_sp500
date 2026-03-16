# Initial Results Report (Pilot 25)

Run: `pilot25_2026Q1_v1`  
Methodology: `v2_conservative_2026-03-16`  
Coverage threshold: `30%` approved role-share

## Headline

- Companies in pilot: `25`
- Companies with published v2 score: `2`
- Companies blocked by missing verified headcount: `13`
- Companies blocked by missing role-mix signal after verified headcount: `9`
- Companies blocked by pending role-mapping adjudication: `1` (`ALGN`)

## Published Scores

1. `AKAM` (Akamai Technologies): score `8.25`, approved role-share `80.00%`
2. `ADI` (Analog Devices): score `8.00`, approved role-share `53.06%`

## Primary Bottlenecks

1. Headcount not verified (`needs_research` or `unverified`)
2. No explicit role-mix percentage/count disclosure in filing human-capital text
3. Role phrase exists but mapping confidence/adjudication not yet approved (`ALGN`)

## Interpretation

- This is a strong initial baseline under strict gates: no hidden imputation, explicit blockers, and reproducible audit trails.
- The low publish count is expected because most filings do not disclose function-level workforce composition.

## Key Output Files

- `data/outputs/pilot25_2026Q1_v1__company_vulnerability_v2_conservative__2026-03-16T17-57-27.350Z.csv`
- `data/outputs/pilot25_2026Q1_v1__initial_results_25_summary__2026-03-16T17-57-52.068Z.csv`
- `data/intermediate/pilot25_2026Q1_v1__role_mapping_adjudication_v2_reviewed__2026-03-16T17-57-27.116Z.csv`
- `data/logs/pilot25_2026Q1_v1__qa_methodology_v2__2026-03-16T17-57-27.283Z.csv`
