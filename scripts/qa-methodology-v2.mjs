#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const ROOT = process.cwd();
const INT_DIR = path.join(ROOT, "data", "intermediate");
const OUT_DIR = path.join(ROOT, "data", "outputs");
const LOG_DIR = path.join(ROOT, "data", "logs");
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");

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

function latest(dir, pattern) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) throw new Error(`No file found for ${pattern}`);
  return path.join(dir, files[files.length - 1]);
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
  const adjPath = latest(INT_DIR, /__role_mapping_adjudication_v2__/);
  const vulnPath = latest(OUT_DIR, /__company_vulnerability_v2_conservative__/);
  const adj = parseSimpleCsv(readFileSync(adjPath, "utf8"));
  const vuln = parseSimpleCsv(readFileSync(vulnPath, "utf8"));

  const checks = [];
  const badConfidence = adj.filter((r) => {
    const c = String(r.mapping_confidence || "").toLowerCase();
    return !["exact", "narrow", "broad", "unknown"].includes(c);
  });
  checks.push(
    check("adjudication_confidence_enum", badConfidence.length === 0, `invalid_rows=${badConfidence.length}`),
  );

  const badShare = adj.filter((r) => {
    if (String(r.review_status).toLowerCase() !== "approved") return false;
    const s = Number(r.approved_share_pct || 0);
    return !Number.isFinite(s) || s <= 0 || s > 100;
  });
  checks.push(check("approved_share_valid", badShare.length === 0, `invalid_rows=${badShare.length}`));

  const publishedRows = vuln.filter((r) => String(r.ai_vulnerability_score_v2).trim() !== "");
  const thresholdViolations = publishedRows.filter((r) => String(r.threshold_met) !== "yes");
  checks.push(
    check(
      "published_score_threshold_gate",
      thresholdViolations.length === 0,
      `violations=${thresholdViolations.length}`,
    ),
  );

  const qaPath = path.join(LOG_DIR, `${RUN_ID}__qa_methodology_v2__${STAMP}.csv`);
  writeFileSync(
    qaPath,
    toCsv(checks, ["check_id", "run_id", "check_name", "check_status", "check_details", "checked_at"]),
    "utf8",
  );

  const passCount = checks.filter((c) => c.check_status === "pass").length;
  console.log(`Wrote methodology v2 QA: ${qaPath}`);
  console.log(`Passed ${passCount}/${checks.length}`);
}

main();

