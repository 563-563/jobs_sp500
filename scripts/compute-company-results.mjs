#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const AS_OF_DATE = process.env.AS_OF_DATE || new Date().toISOString().slice(0, 10);
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const ROOT = process.cwd();
const INT_DIR = path.join(ROOT, "data", "intermediate");
const OUT_DIR = path.join(ROOT, "data", "outputs");

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

function latest(pattern, dir = INT_DIR) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (files.length === 0) throw new Error(`No file found for pattern ${pattern}`);
  return path.join(dir, files[files.length - 1]);
}

function grade(unknownPct) {
  if (unknownPct > 50) return "F";
  if (unknownPct > 35) return "D";
  if (unknownPct > 20) return "C";
  if (unknownPct > 10) return "B";
  return "A";
}

function findLatestEmployeeCount(evidenceRows) {
  const vals = evidenceRows
    .map((r) => Number(r.extracted_metric_value))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

function main() {
  const pilotPath = latest(/__pilot\d+_companies__/);
  const filingsPath = latest(/__pilot_filings_metadata__/);
  const evidencePath = latest(/__workforce_evidence_auto__/);
  const mappingPath = latest(/__role_mapping_unknown__/);

  const pilot = parseSimpleCsv(readFileSync(pilotPath, "utf8"));
  const filings = parseSimpleCsv(readFileSync(filingsPath, "utf8"));
  const evidence = parseSimpleCsv(readFileSync(evidencePath, "utf8"));
  const mapping = parseSimpleCsv(readFileSync(mappingPath, "utf8"));

  const filingsByTicker = new Map(filings.map((f) => [f.ticker, f]));
  const evidenceByTicker = new Map();
  for (const row of evidence) {
    const list = evidenceByTicker.get(row.ticker) || [];
    list.push(row);
    evidenceByTicker.set(row.ticker, list);
  }
  const unknownByTicker = new Map();
  for (const row of mapping) {
    const value = Number(row.mapped_share_pct || 0);
    if (!Number.isFinite(value)) continue;
    unknownByTicker.set(row.ticker, (unknownByTicker.get(row.ticker) || 0) + value);
  }

  const results = pilot.map((c) => {
    const unknown = Math.min(100, Math.max(0, unknownByTicker.get(c.ticker) ?? 100));
    const known = Math.max(0, 100 - unknown);
    const ev = evidenceByTicker.get(c.ticker) || [];
    const latestCount = findLatestEmployeeCount(ev);
    const filing = filingsByTicker.get(c.ticker);
    return {
      run_id: RUN_ID,
      as_of_date: AS_OF_DATE,
      company_name: c.company_name,
      ticker: c.ticker,
      cik: c.cik,
      ai_vulnerability_score: "",
      known_workforce_share_pct: known,
      unknown_workforce_share_pct: unknown,
      confidence_level: "low",
      data_quality_grade: grade(unknown),
      primary_filing_date: filing?.filing_date || "",
      notes: latestCount
        ? `employee_count_candidate=${latestCount}; no role-share breakdown extracted`
        : "no employee count candidate extracted; no role-share breakdown extracted",
    };
  });

  const outPath = path.join(OUT_DIR, `${RUN_ID}__company_results__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(results, [
      "run_id",
      "as_of_date",
      "company_name",
      "ticker",
      "cik",
      "ai_vulnerability_score",
      "known_workforce_share_pct",
      "unknown_workforce_share_pct",
      "confidence_level",
      "data_quality_grade",
      "primary_filing_date",
      "notes",
    ]),
    "utf8",
  );

  console.log(`Wrote company results: ${outPath}`);
  console.log(`Rows: ${results.length}`);
}

main();

