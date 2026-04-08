# SP500 Deep-Research Pipeline — Memory

## Status
Last updated: 2026-04-08

## RESEARCHED list
<!-- Tickers that have completed deep-research (JSON in data/intermediate/researched/) -->
<!-- and have been injected into the pipeline. -->

(none yet — batch 1 in progress)

## Priority List
AAPL, AVGO, TSLA, BRK.B, CRM, NFLX, AMD, INTC, GILD, REGN, ZTS, QCOM, TXN, INTU, NOW, UBER, TRV, NSC, ADI, AMAT

## Batch History

| Batch | Tickers | Status | Notes |
|-------|---------|--------|-------|
| 1 | AAPL, AVGO, TSLA, BRK.B, CRM | in_progress | Agents launched 2026-04-08 |

## Pipeline Commands

```bash
# Inject researched JSON files → update pipeline artifacts
node scripts/inject-researched-role-mappings.mjs

# Recompute conservative scores
node scripts/compute-company-vulnerability-v2-conservative.mjs

# Recompute relaxed scores
node scripts/compute-company-vulnerability-v2-relaxed.mjs

# Regenerate dashboard
node scripts/generate-results-dashboard.mjs

# Regenerate treemap
node scripts/generate-treemap.mjs
```

## Notes
- ADI and AKAM already have approved role mappings from the pilot25 run
- All other pilot25 tickers (A-AMAT) have headcount but no role breakdowns
- Conservative scoring requires ≥30% role share with narrow/exact confidence
- Relaxed scoring fills gaps with sector priors (confidence=low)
