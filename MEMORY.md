# SP500 Deep-Research Pipeline — Memory

## Status
Last updated: 2026-04-16

## RESEARCHED list
<!-- Tickers that have completed deep-research (JSON in data/intermediate/researched/) -->
<!-- and have been injected into the pipeline. -->
537 total unique tickers injected. All known SP500 constituents complete.
Final session added: SBAC, SHW, SJM, SNA, SO, SPG, SPGI, SRE, STE, STT, SWK, SYF, SYY, TDG, TEL, TFX, TMUS, TROW, TSCO, TSN, TT, TTWO, TXT, TYL, UAL, UDR, UHS, UNP, UPS, URI, VFC, VLO, VMC, VRSN, VST, VTR, VTRS, WAB, WBA, WBD, WEC, WELL, WHR, WMB, WRB, WY, XEL, XYL, YUM, ZBH

## Priority List (remaining)
None — all SP500 tickers complete (537 total)

## Batch History

| Batch | Tickers | Status | Role Data Found | Notes |
|-------|---------|--------|-----------------|-------|
| 1 | AAPL, AVGO, TSLA, BRK.B, CRM | ✓ done | BRK.B only | AAPL/AVGO/TSLA/CRM 10-Ks have no role breakdown; BRK.B segment data from AFS supplement |
| 2 | NFLX, AMD, INTC, GILD, REGN | ✓ done | none | All 10-Ks lack role breakdown; headcounts added |

## Pipeline Results After Batch 2 (34 companies total)

| Ticker | Conservative | Relaxed | Confidence | Notes |
|--------|-------------|---------|------------|-------|
| ADI | 8.00 | — | high | From pilot25; 53% engineering (narrow) |
| AKAM | 8.25 | — | high | From pilot25; 80% role coverage (narrow) |
| BRK.B | blocked | 7.12 | high | 100% direct mapped; blocked conservative by medium-conf rows |
| AAPL | — | 8.05 | low | Sector priors (IT) |
| AVGO | — | 8.05 | low | Sector priors (IT) |
| CRM | — | 8.05 | low | Sector priors (IT) |
| AMD | — | 8.05 | low | Sector priors (IT) |
| INTC | — | 8.05 | low | Sector priors (IT) |
| NFLX | — | 8.05 | low | Sector priors (Communication Services) |
| TSLA | — | 6.80 | low | Sector priors (Consumer Discretionary) |
| GILD | — | 7.30 | low | Sector priors (Health Care) |
| REGN | — | 7.30 | low | Sector priors (Health Care) |

## Key Findings
- Most mega-cap 10-Ks do NOT disclose role/function breakdowns — only total headcount
- BRK.B is exception: AFS supplement provides segment-level employee counts
- Conservative scoring blocked for BRK.B by "medium" confidence on manufacturing/service segments
- To unlock conservative scores: need explicit function breakdowns from filings (like ADI/AKAM)

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
- BRK.B special case: medium-confidence segment mappings block conservative despite 100% coverage
