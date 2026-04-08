#!/usr/bin/env node
/**
 * inject-researched-role-mappings.mjs
 *
 * Reads deep-research JSON files from data/intermediate/researched/*.json
 * and injects them into the pipeline artifacts so downstream scripts
 * (conservative, relaxed, dashboard, treemap) pick up the new data.
 *
 * Files updated (new timestamped versions written):
 *  - data/intermediate/pilot25_2026Q1_v1__pilot25_companies__<stamp>.csv
 *    (extended with new tickers for sector lookup)
 *  - data/intermediate/pilot25_2026Q1_v1__headcount_verification_queue_reviewed__<stamp>.csv
 *    (new headcount entries for researched tickers)
 *  - data/intermediate/pilot25_2026Q1_v1__role_mapping_adjudication_v2_reviewed__<stamp>.csv
 *    (new approved role mappings for researched tickers)
 *  - data/outputs/pilot25_2026Q1_v1__company_results_verified_headcount__<stamp>.csv
 *    (extended company list with headcount status)
 *
 * JSON format expected in data/intermediate/researched/<TICKER>.json:
 * {
 *   "ticker": "AAPL",
 *   "company_name": "Apple Inc.",
 *   "total_headcount": 166000,
 *   "headcount_quote": "As of ..., the Company had approximately 166,000 ...",
 *   "headcount_source_url": "https://...",
 *   "roles": [
 *     {
 *       "role_phrase_raw": "software and services",
 *       "signal_type": "pct",      // "pct" or "count"
 *       "signal_value": 45,        // raw value (pct or count)
 *       "implied_share_pct": 45.0,
 *       "approved_repo_label": "software-developers",
 *       "mapping_confidence": "narrow",  // "exact" | "narrow" | "broad"
 *       "confidence_rationale": "...",
 *       "quote": "exact quote from filing",
 *       "source_url": "https://..."
 *     }
 *   ],
 *   "research_notes": "..."
 * }
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const ROOT = process.cwd();
const INT_DIR = path.join(ROOT, "data", "intermediate");
const OUT_DIR = path.join(ROOT, "data", "outputs");
const RESEARCHED_DIR = path.join(INT_DIR, "researched");
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const TODAY = NOW_ISO.slice(0, 10);

// ── CSV helpers ──────────────────────────────────────────────────────────────

function parseSimpleCsv(content) {
  const lines = content.trimEnd().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; continue; }
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    return row;
  });
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function toCsv(rows, headers) {
  const head = headers.join(",");
  const body = rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

function latest(dir, pattern) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) throw new Error(`No file found in ${dir} for ${pattern}`);
  return path.join(dir, files[files.length - 1]);
}

// ── Load existing artifacts ──────────────────────────────────────────────────

function loadExisting() {
  const pilotPath = latest(INT_DIR, /__pilot\d+_companies__/);
  const hqPath = latest(INT_DIR, /__headcount_verification_queue_reviewed__/);
  const adjPath = latest(INT_DIR, /__role_mapping_adjudication_v2_reviewed__/);
  const companyPath = latest(OUT_DIR, /__company_results_verified_headcount__/);
  const sp500Path = latest(INT_DIR, /__sp500_constituents_full__/);

  return {
    pilotRows: parseSimpleCsv(readFileSync(pilotPath, "utf8")),
    hqRows: parseSimpleCsv(readFileSync(hqPath, "utf8")),
    adjRows: parseSimpleCsv(readFileSync(adjPath, "utf8")),
    companyRows: parseSimpleCsv(readFileSync(companyPath, "utf8")),
    sp500Rows: parseSimpleCsv(readFileSync(sp500Path, "utf8")),
  };
}

// ── ID generation ────────────────────────────────────────────────────────────

function nextAdjId(existingAdj, ticker, idx) {
  return `ADJ-${RUN_ID}-DR-${ticker}-${String(idx + 1).padStart(3, "0")}`;
}

function nextHqId(ticker) {
  return `HQ-${RUN_ID}-DR-${ticker}`;
}

function citationId(ticker, idx) {
  return `CIT-${RUN_ID}-DR-${ticker}-${String(idx + 1).padStart(3, "0")}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(RESEARCHED_DIR)) {
    console.log(`No researched directory found at ${RESEARCHED_DIR}. Nothing to inject.`);
    return;
  }

  const jsonFiles = readdirSync(RESEARCHED_DIR).filter((f) => f.endsWith(".json"));
  if (jsonFiles.length === 0) {
    console.log("No JSON research files found in researched/. Nothing to inject.");
    return;
  }

  console.log(`Found ${jsonFiles.length} research file(s): ${jsonFiles.join(", ")}`);

  const { pilotRows, hqRows, adjRows, companyRows, sp500Rows } = loadExisting();

  const existingPilotTickers = new Set(pilotRows.map((r) => r.ticker));
  const existingHqTickers = new Set(hqRows.map((r) => r.ticker));
  const existingCompanyTickers = new Set(companyRows.map((r) => r.ticker));
  const existingAdjTickers = new Set(adjRows.map((r) => r.ticker));

  const sp500ByCik = new Map(sp500Rows.map((r) => [r.ticker, r]));

  const newPilotRows = [...pilotRows];
  const newHqRows = [...hqRows];
  const newAdjRows = [...adjRows];
  const newCompanyRows = [...companyRows];

  let injectedTickers = [];
  let skippedTickers = [];

  for (const file of jsonFiles.sort()) {
    const filePath = path.join(RESEARCHED_DIR, file);
    let research;
    try {
      research = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (e) {
      console.warn(`  SKIP ${file}: parse error: ${e.message}`);
      continue;
    }

    const { ticker, company_name, total_headcount, headcount_quote,
            headcount_source_url, roles = [], research_notes = "" } = research;

    if (!ticker) {
      console.warn(`  SKIP ${file}: missing ticker`);
      continue;
    }

    console.log(`\nInjecting ${ticker} (${company_name || "?"})`);

    // ── 1. Extend pilot companies (for sector lookup) ────────────────────────
    if (!existingPilotTickers.has(ticker)) {
      const sp500 = sp500ByCik.get(ticker);
      newPilotRows.push({
        run_id: RUN_ID,
        as_of_date: TODAY,
        ticker,
        ticker_norm: ticker.replace(".", "-"),
        company_name: company_name || sp500?.company_name || ticker,
        cik: sp500?.cik || "",
        sec_title: sp500?.sec_title || "",
        gics_sector: sp500?.gics_sector || "",
        gics_sub_industry: sp500?.gics_sub_industry || "",
        cik_match_status: sp500 ? "matched" : "injected",
      });
      existingPilotTickers.add(ticker);
      console.log(`  + Added ${ticker} to pilot companies`);
    }

    // ── 2. Headcount verification queue ─────────────────────────────────────
    if (!existingHqTickers.has(ticker)) {
      const hasHead = total_headcount && Number(total_headcount) > 0;
      newHqRows.push({
        run_id: RUN_ID,
        ticker,
        company_name: company_name || "",
        cik: sp500ByCik.get(ticker)?.cik || "",
        candidate_headcount: hasHead ? total_headcount : "",
        candidate_confidence: hasHead ? "high" : "none",
        citation_id: hasHead ? citationId(ticker, 0) : "",
        source_url: headcount_source_url || "",
        filing_date: "",
        quote: headcount_quote || "",
        review_status: hasHead ? "approved" : "needs_research",
        verified_headcount: hasHead ? total_headcount : "",
        reviewer: "deep-research-agent",
        reviewed_at: NOW_ISO,
        review_notes: hasHead
          ? "Auto-approved via deep research agent."
          : `No headcount found. Notes: ${research_notes}`,
      });
      existingHqTickers.add(ticker);
      console.log(`  + Added ${ticker} headcount: ${total_headcount || "N/A"}`);
    } else {
      console.log(`  ~ Skipped headcount for ${ticker} (already exists)`);
    }

    // ── 3. Company results verified headcount ────────────────────────────────
    if (!existingCompanyTickers.has(ticker)) {
      const sp500 = sp500ByCik.get(ticker);
      const hasHead = total_headcount && Number(total_headcount) > 0;
      newCompanyRows.push({
        run_id: RUN_ID,
        as_of_date: TODAY,
        company_name: company_name || sp500?.company_name || ticker,
        ticker,
        cik: sp500?.cik || "",
        ai_vulnerability_score: "",
        known_workforce_share_pct: 0,
        unknown_workforce_share_pct: 100,
        confidence_level: "low",
        data_quality_grade: "F",
        primary_filing_date: "",
        verified_headcount: hasHead ? total_headcount : "",
        headcount_verification_status: hasHead ? "approved" : "needs_research",
        headcount_citation_id: hasHead ? citationId(ticker, 0) : "",
        notes: `injected_by_deep_research; ${research_notes}`,
      });
      existingCompanyTickers.add(ticker);
      console.log(`  + Added ${ticker} to company results`);
    } else {
      console.log(`  ~ Skipped company row for ${ticker} (already exists)`);
    }

    // ── 4. Role mapping adjudication rows ────────────────────────────────────
    // Remove any prior deep-research rows for this ticker (allow re-injection)
    const filteredAdj = newAdjRows.filter(
      (r) => !(r.ticker === ticker && r.adjudication_id?.includes("-DR-")),
    );
    newAdjRows.length = 0;
    newAdjRows.push(...filteredAdj);

    if (roles.length === 0) {
      console.log(`  ~ No roles to inject for ${ticker}`);
      skippedTickers.push(ticker);
      continue;
    }

    let roleIdx = 0;
    for (const role of roles) {
      const {
        role_phrase_raw = "",
        signal_type = "pct",
        signal_value = 0,
        implied_share_pct = 0,
        approved_repo_label = "",
        mapping_confidence = "narrow",
        confidence_rationale = "",
        quote = "",
        source_url = headcount_source_url || "",
      } = role;

      if (!approved_repo_label) {
        console.warn(`  SKIP role ${roleIdx} for ${ticker}: missing approved_repo_label`);
        continue;
      }

      const adjId = nextAdjId(newAdjRows, ticker, roleIdx);
      const sigId = `RSC-${RUN_ID}-DR-${ticker}-${roleIdx + 1}`;
      const rmrId = `RMR-${RUN_ID}-DR-${ticker}-${roleIdx + 1}`;
      const citId = citationId(ticker, roleIdx + 1);

      newAdjRows.push({
        adjudication_id: adjId,
        run_id: RUN_ID,
        mapping_review_id: rmrId,
        signal_id: sigId,
        ticker,
        role_phrase_raw,
        signal_type,
        signal_value,
        implied_share_pct: Number(implied_share_pct).toFixed(2),
        normalized_role_bucket: role_phrase_raw,
        suggested_repo_label: approved_repo_label,
        suggested_repo_title: "",
        suggested_repo_score: "",
        mapping_confidence,
        confidence_rationale,
        review_status: "approved",
        approved_repo_label,
        approved_share_pct: Number(implied_share_pct).toFixed(2),
        reviewer: "deep-research-agent",
        reviewed_at: NOW_ISO,
        review_notes: `Deep research injection. ${confidence_rationale}`,
        citation_id: citId,
        quote,
        created_at: NOW_ISO,
      });
      roleIdx += 1;
    }

    console.log(`  + Injected ${roleIdx} role mapping(s) for ${ticker}`);
    injectedTickers.push(ticker);
  }

  // ── Write updated files ───────────────────────────────────────────────────

  const PILOT_HEADERS = [
    "run_id","as_of_date","ticker","ticker_norm","company_name","cik",
    "sec_title","gics_sector","gics_sub_industry","cik_match_status",
  ];
  const HQ_HEADERS = [
    "run_id","ticker","company_name","cik","candidate_headcount","candidate_confidence",
    "citation_id","source_url","filing_date","quote","review_status","verified_headcount",
    "reviewer","reviewed_at","review_notes",
  ];
  const ADJ_HEADERS = [
    "adjudication_id","run_id","mapping_review_id","signal_id","ticker","role_phrase_raw",
    "signal_type","signal_value","implied_share_pct","normalized_role_bucket",
    "suggested_repo_label","suggested_repo_title","suggested_repo_score",
    "mapping_confidence","confidence_rationale","review_status","approved_repo_label",
    "approved_share_pct","reviewer","reviewed_at","review_notes","citation_id","quote","created_at",
  ];
  const COMPANY_HEADERS = [
    "run_id","as_of_date","company_name","ticker","cik","ai_vulnerability_score",
    "known_workforce_share_pct","unknown_workforce_share_pct","confidence_level",
    "data_quality_grade","primary_filing_date","verified_headcount",
    "headcount_verification_status","headcount_citation_id","notes",
  ];

  const pilotOut = path.join(INT_DIR, `${RUN_ID}__pilot25_companies__${STAMP}.csv`);
  const hqOut = path.join(INT_DIR, `${RUN_ID}__headcount_verification_queue_reviewed__${STAMP}.csv`);
  const adjOut = path.join(INT_DIR, `${RUN_ID}__role_mapping_adjudication_v2_reviewed__${STAMP}.csv`);
  const companyOut = path.join(OUT_DIR, `${RUN_ID}__company_results_verified_headcount__${STAMP}.csv`);

  writeFileSync(pilotOut, toCsv(newPilotRows, PILOT_HEADERS), "utf8");
  writeFileSync(hqOut, toCsv(newHqRows, HQ_HEADERS), "utf8");
  writeFileSync(adjOut, toCsv(newAdjRows, ADJ_HEADERS), "utf8");
  writeFileSync(companyOut, toCsv(newCompanyRows, COMPANY_HEADERS), "utf8");

  console.log(`\n✓ inject complete`);
  console.log(`  pilot companies : ${pilotOut}`);
  console.log(`  headcount queue : ${hqOut}`);
  console.log(`  adjudications   : ${adjOut} (${newAdjRows.length} rows)`);
  console.log(`  company results : ${companyOut} (${newCompanyRows.length} rows)`);
  console.log(`\nInjected tickers : ${injectedTickers.join(", ") || "none"}`);
  console.log(`Skipped (no roles): ${skippedTickers.join(", ") || "none"}`);
}

main();
