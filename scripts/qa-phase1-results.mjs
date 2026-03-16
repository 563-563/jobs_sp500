#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "outputs");
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

function latestOutput(pattern) {
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) throw new Error(`No output file found for ${pattern}`);
  return path.join(OUT_DIR, files[files.length - 1]);
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
  const resultPath = latestOutput(/__company_results__/);
  const rows = parseSimpleCsv(readFileSync(resultPath, "utf8"));

  const checks = [];
  checks.push(check("result_row_count", rows.length === 25, `rows=${rows.length}; expected=25`));
  checks.push(
    check(
      "unique_tickers",
      rows.length === new Set(rows.map((r) => r.ticker)).size,
      `unique=${new Set(rows.map((r) => r.ticker)).size}`,
    ),
  );

  const badShare = rows.filter((r) => {
    const known = Number(r.known_workforce_share_pct);
    const unknown = Number(r.unknown_workforce_share_pct);
    return Math.abs(known + unknown - 100) > 0.1;
  });
  checks.push(check("known_unknown_sum_100", badShare.length === 0, `bad_rows=${badShare.length}`));

  const scoredWithZeroKnown = rows.filter(
    (r) => Number(r.known_workforce_share_pct) === 0 && String(r.ai_vulnerability_score).trim() !== "",
  );
  checks.push(
    check(
      "null_score_when_zero_known",
      scoredWithZeroKnown.length === 0,
      `violations=${scoredWithZeroKnown.length}`,
    ),
  );

  const outPath = path.join(LOG_DIR, `${RUN_ID}__qa_phase1_results__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(checks, ["check_id", "run_id", "check_name", "check_status", "check_details", "checked_at"]),
    "utf8",
  );

  const passCount = checks.filter((c) => c.check_status === "pass").length;
  console.log(`Wrote phase1 result QA: ${outPath}`);
  console.log(`Passed ${passCount}/${checks.length}`);
  for (const c of checks) console.log(`${c.check_status.toUpperCase()} ${c.check_name} :: ${c.check_details}`);
}

main();

