# Phase 1 Plan (Pilot: 25 Companies)

## Objective
Build a reproducible, citation-complete pipeline that ranks 25 S&P 500 companies by workforce AI vulnerability using `karpathy/jobs` scores.

## Scope In
- Current S&P 500 snapshot only.
- Company-level score only (no segment-level outputs in phase 1).
- Workforce evidence from 10-K / annual filing disclosures first.
- Full citation trail for all pilot companies.
- Unknown workforce shares kept explicit.

## Scope Out
- Historical index membership.
- Dashboard UI (ranked table only for phase 1).
- Score recalibration beyond repo-native values.

## Data Products
1. `company_results` table and exported ranked CSV.
2. Citation log for all evidence rows.
3. Assumptions register with rationale and owner.
4. Run manifest capturing versions and timestamps.

## Method Summary
1. Normalize pilot company universe.
2. Load vulnerability label+score catalog from `karpathy/jobs` at frozen commit.
3. Extract workforce text evidence from filings with source pointers.
4. Map evidence to repo labels with confidence and rationale.
5. Compute weighted vulnerability over known shares.
6. Report unknown share and quality/confidence metadata.

## Key Formula
For each company:

`ai_vulnerability_score = SUM(known_share_i * repo_score_i) / SUM(known_share_i)`

where known shares are in [0,1] and map to one repo label each.

## Confidence + Data Grade
- `confidence_level`: based on coverage and mapping certainty.
- `data_quality_grade`: based on citation completeness + unknown share.

Suggested thresholds (can tune after dry run):
- `A`: citations complete, unknown <= 10%
- `B`: citations complete, unknown <= 20%
- `C`: citations complete, unknown <= 35%
- `D`: citations incomplete or unknown <= 50%
- `F`: unknown > 50% or major citation gaps

## Milestones
1. `M1` Spec freeze: schema + templates + pilot list.
2. `M2` Source ingest: filings + repo score snapshot.
3. `M3` Mapping: role assignments with confidence.
4. `M4` Compute: results + QA checks.
5. `M5` Publish: ranked table + assumptions + audit pack.
