# Data Directory Conventions

- `data/raw/`: immutable source files. Never edit in place.
- `data/intermediate/`: cleaned and normalized tables.
- `data/outputs/`: ranked results and audit exports.
- `data/logs/`: pipeline and QA logs.

Recommended naming:

`<run_id>__<entity>__<timestamp>.<ext>`

Examples:
- `pilot25_2026Q1_v1__company_results__2026-03-16T18-30-00Z.csv`
- `pilot25_2026Q1_v1__citations__2026-03-16T18-30-00Z.csv`
