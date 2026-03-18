# Per-Ticker SOP

## Table of Contents

1. Purpose
2. Operating Contract
3. Stage 0: Discovery (Internet Scrub)
4. Stage 1: Acquire and Parse Documents
5. Stage 2: Signal Extraction
6. Stage 3: LLM Reasoning
7. Stage 4: Gap Check and Retry
8. Satisfactory Answer Criteria
9. Required Artifacts

## Purpose

Define the exact one-company workflow. This is the default operating method for every ticker.

## Operating Contract

For each ticker, run this ordered loop:

1. Discover candidate sources.
2. Acquire and parse the most relevant documents.
3. Extract role/headcount signals.
4. Produce LLM-backed role breakdown reasoning with citations.
5. Check for gaps.
6. Repeat any missing stage until the ticker reaches a satisfactory answer or explicit stop condition.

Do not skip directly to scoring before stages 0-4 are complete for that ticker.

## Stage 0: Discovery (Internet Scrub)

Goal:
- Identify the highest-value documents for headcount and role mix.

Minimum source buckets to check:
1. SEC annual filings (`10-K`, `20-F`, `40-F`) and proxy (`DEF 14A`).
2. SEC-hosted annual report PDF.
3. Company investor relations pages (annual report, sustainability, workforce).
4. EEO-1 / workforce disclosure pages and linked reports.
5. ESG/DEI/workforce tables.
6. Investor presentations with function/workforce breakout.
7. Careers/workforce pages.
8. Industry fallback references (BLS/NAICS) only if direct sources are missing.

Expected output:
- Source candidates recorded in `source_search_reference` and/or external evidence queue.

## Stage 1: Acquire and Parse Documents

Goal:
- Pull document content into machine-readable form.

Required actions:
1. Download filing/document artifacts for the ticker.
2. Parse HTML pages and convert PDFs to text/OCR when needed.
3. Preserve local artifact paths and source metadata.

Expected output:
- Raw/intermediate text artifacts tied to source URLs/doc ids.

## Stage 2: Signal Extraction

Goal:
- Extract evidence-bearing snippets and candidate metrics.

Required actions:
1. Keyword scan for workforce/headcount/function terms.
2. Table-aware extraction for counts/shares where available.
3. Build candidate role-mix rows and citation rows.
4. Map evidence to ticker-level queues for adjudication.

Expected output:
- Evidence rows, citation rows, role-mix candidates, mapping adjudication inputs.

## Stage 3: LLM Reasoning

Goal:
- Convert extracted evidence into a defensible role breakdown decision.

Required reasoning output per ticker:
1. Company business model summary (what they do).
2. Workforce location/context summary.
3. Proposed role distribution with rationale.
4. Confidence judgment and why.
5. Explicit citation references backing major assumptions.
6. Remaining unknowns and next best source to close them.

Rules:
- Prefer direct evidence over priors.
- If using priors, state it explicitly and mark confidence down.
- Reject unresolved broad buckets as final unless decomposition is justified.

## Stage 4: Gap Check and Retry

Goal:
- Decide whether ticker is complete or needs another source/reasoning pass.

Retry triggers:
1. Missing approved headcount.
2. Missing role signal coverage.
3. Pending mapping adjudications.
4. Over-reliance on priors with no direct support.
5. Contradictory sources without resolution.

Retry policy:
- Loop back only to the missing stage(s), not the entire pipeline.
- Prioritize the shortest path to close the highest-impact gap.

## Satisfactory Answer Criteria

A ticker is "satisfactory" when all are true:
1. Headcount status is approved from high-priority sources.
2. Role breakdown is evidence-backed and mapped to target schema.
3. Key assumptions are traceable to citations.
4. Confidence is at least defensible guess with documented rationale.
5. Remaining uncertainty is explicitly documented.

For final publish lock, also require hard-gate compliance at universe level.

## Required Artifacts

Per ticker, maintain:
1. Source references (`source_search_reference` and/or external queue rows).
2. Evidence/citation rows.
3. Mapping adjudication status.
4. Reasoning summary (LLM or documented manual rationale).
5. Final confidence/stage row in `confidence_pipeline_status`.
