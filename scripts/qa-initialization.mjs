#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const ROOT = process.cwd();
const INT_DIR = path.join(ROOT, "data", "intermediate");
const LOG_DIR = path.join(ROOT, "data", "logs");

function parseSimpleCsv(content) {
  const lines = content.trimEnd().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
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

function latestMatch(pattern) {
  const files = readdirSync(INT_DIR).filter((f) => f.startsWith(RUN_ID) && pattern.test(f)).sort();
  if (files.length === 0) return null;
  return path.join(INT_DIR, files[files.length - 1]);
}

function check(name, pass, details) {
  return {
    check_id: `CHK-${RUN_ID}-${name.replaceAll(/\s+/g, "_").toUpperCase()}`,
    run_id: RUN_ID,
    check_name: name,
    check_status: pass ? "pass" : "fail",
    check_details: details,
    checked_at: NOW_ISO,
  };
}

function main() {
  const checks = [];

  const fullPath = latestMatch(/__sp500_constituents_full__/);
  const pilotPath = latestMatch(/__pilot\d+_companies__/);
  const scoresPath = latestMatch(/__karpathy_vulnerability_scores__/);
  const filingsPath = latestMatch(/__pilot_filings_metadata__/);

  if (!fullPath || !pilotPath || !scoresPath || !filingsPath) {
    throw new Error("Missing one or more initialization artifacts in data/intermediate.");
  }

  const fullRows = parseSimpleCsv(readFileSync(fullPath, "utf8"));
  const pilotRows = parseSimpleCsv(readFileSync(pilotPath, "utf8"));
  const scoreRows = parseSimpleCsv(readFileSync(scoresPath, "utf8"));
  const filingRows = parseSimpleCsv(readFileSync(filingsPath, "utf8"));

  checks.push(
    check(
      "sp500_universe_row_count",
      fullRows.length >= 500,
      `rows=${fullRows.length}; expected>=500`,
    ),
  );

  const unmatched = fullRows.filter((r) => r.cik_match_status !== "matched");
  checks.push(
    check(
      "sp500_cik_match_complete",
      unmatched.length === 0,
      `unmatched=${unmatched.length}`,
    ),
  );

  checks.push(
    check(
      "pilot_row_count",
      pilotRows.length === 25,
      `rows=${pilotRows.length}; expected=25`,
    ),
  );

  const duplicateTickerCount =
    pilotRows.length - new Set(pilotRows.map((r) => r.ticker_norm || r.ticker)).size;
  checks.push(
    check(
      "pilot_unique_tickers",
      duplicateTickerCount === 0,
      `duplicate_tickers=${duplicateTickerCount}`,
    ),
  );

  const badScoreRows = scoreRows.filter((r) => Number(r.repo_score) < 0 || Number(r.repo_score) > 10);
  checks.push(
    check(
      "karpathy_score_range",
      badScoreRows.length === 0 && scoreRows.length > 0,
      `rows=${scoreRows.length}; out_of_range=${badScoreRows.length}`,
    ),
  );

  const filingOk = filingRows.filter((r) => r.status === "ok");
  checks.push(
    check(
      "pilot_filings_annual_form_coverage",
      filingOk.length === 25,
      `ok=${filingOk.length}; total=${filingRows.length}`,
    ),
  );

  const qaPath = path.join(LOG_DIR, `${RUN_ID}__qa_initialization__${STAMP}.csv`);
  writeFileSync(
    qaPath,
    toCsv(checks, ["check_id", "run_id", "check_name", "check_status", "check_details", "checked_at"]),
    "utf8",
  );

  const passCount = checks.filter((c) => c.check_status === "pass").length;
  console.log(`QA checks written: ${qaPath}`);
  console.log(`Passed ${passCount}/${checks.length}`);
  for (const c of checks) {
    console.log(`${c.check_status.toUpperCase()} ${c.check_name} :: ${c.check_details}`);
  }
}

main();

