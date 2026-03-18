# Source Ladder

## Table of Contents

1. Purpose
2. Preferred Source Order
3. Role Breakdown Strategy
4. Escalation Rules

## Purpose

Use a repeatable evidence ladder so role/headcount decisions remain defensible.

## Preferred Source Order

1. SEC primary annual filing (`10-K`, `20-F`, `40-F`).
2. SEC proxy statement (`DEF 14A`).
3. SEC-hosted annual report PDF.
4. EEO-1 workforce tables (if publicly available).
5. Sustainability/ESG/DEI workforce composition tables.
6. Investor presentations with workforce/function breakout.
7. Company workforce/careers pages.
8. Fallback priors (BLS/industry role mix) only when direct evidence is unavailable.

## Role Breakdown Strategy

- Prefer direct role counts/shares over broad classes.
- If source uses broad buckets (for example, "professionals"), map using explicit decomposition assumptions and keep provenance.
- Replace broad/proxy mappings with direct evidence when discovered in later passes.

## Escalation Rules

- If ticker drops from `medium_high_confidence`, stop and inspect before continuing batch.
- If pending mappings increase unexpectedly, inspect adjudication outputs for that ticker.
- If source-ladder QA fails, fix queue integrity before trusting scores.

