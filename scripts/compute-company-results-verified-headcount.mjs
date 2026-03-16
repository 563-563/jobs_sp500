#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const AS_OF_DATE = process.env.AS_OF_DATE || new Date().toISOString().slice(0, 10);
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "outputs");
const INT_DIR = path.join(ROOT, "data", "intermediate");

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

function latest(pattern, dir) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) throw new Error(`No file found for ${pattern} in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

function main() {
  const basePath = latest(/__company_results__/, OUT_DIR);
  const queuePath = latest(/__headcount_verification_queue__/, INT_DIR);

  const baseRows = parseSimpleCsv(readFileSync(basePath, "utf8"));
  const queueRows = parseSimpleCsv(readFileSync(queuePath, "utf8"));
  const approved = new Map();

  for (const q of queueRows) {
    if (String(q.review_status).toLowerCase() !== "approved") continue;
    const val = Number(q.verified_headcount);
    if (!Number.isFinite(val) || val <= 0) continue;
    approved.set(q.ticker, q);
  }

  const outRows = baseRows.map((b) => {
    const q = approved.get(b.ticker);
    if (q) {
      return {
        run_id: RUN_ID,
        as_of_date: AS_OF_DATE,
        company_name: b.company_name,
        ticker: b.ticker,
        cik: b.cik,
        ai_vulnerability_score: b.ai_vulnerability_score,
        known_workforce_share_pct: b.known_workforce_share_pct,
        unknown_workforce_share_pct: b.unknown_workforce_share_pct,
        confidence_level: b.confidence_level,
        data_quality_grade: b.data_quality_grade,
        primary_filing_date: b.primary_filing_date,
        verified_headcount: q.verified_headcount,
        headcount_verification_status: "approved",
        headcount_citation_id: q.citation_id,
        notes: `${b.notes}; verified_headcount_approved`,
      };
    }
    return {
      run_id: RUN_ID,
      as_of_date: AS_OF_DATE,
      company_name: b.company_name,
      ticker: b.ticker,
      cik: b.cik,
      ai_vulnerability_score: b.ai_vulnerability_score,
      known_workforce_share_pct: b.known_workforce_share_pct,
      unknown_workforce_share_pct: b.unknown_workforce_share_pct,
      confidence_level: b.confidence_level,
      data_quality_grade: b.data_quality_grade,
      primary_filing_date: b.primary_filing_date,
      verified_headcount: "",
      headcount_verification_status: "unverified",
      headcount_citation_id: "",
      notes: b.notes,
    };
  });

  const outPath = path.join(
    OUT_DIR,
    `${RUN_ID}__company_results_verified_headcount__${STAMP}.csv`,
  );
  writeFileSync(
    outPath,
    toCsv(outRows, [
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
      "verified_headcount",
      "headcount_verification_status",
      "headcount_citation_id",
      "notes",
    ]),
    "utf8",
  );

  console.log(`Wrote verified-headcount results: ${outPath}`);
  console.log(`Approved headcounts applied: ${approved.size}`);
}

main();

