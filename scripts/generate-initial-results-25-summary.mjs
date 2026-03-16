#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const ROOT = process.cwd();
const INT_DIR = path.join(ROOT, "data", "intermediate");
const OUT_DIR = path.join(ROOT, "data", "outputs");
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

function blocker(row) {
  const head = row.headcount_verification_status;
  const role = Number(row.role_signal_count);
  const mapped = Number(row.approved_mapping_count);
  const thresholdMet = row.threshold_met === "yes";
  if (head !== "approved") return "headcount_not_verified";
  if (role === 0) return "no_role_mix_signal";
  if (mapped === 0) return "no_role_mapping_approved";
  if (!thresholdMet) return "coverage_below_threshold";
  return "";
}

function stage(row) {
  if (row.ai_vulnerability_score_v2 !== "") return "published_score";
  const b = blocker(row);
  if (b === "headcount_not_verified") return "needs_headcount_review";
  if (b === "no_role_mix_signal") return "needs_role_signal";
  if (b === "no_role_mapping_approved") return "needs_mapping_adjudication";
  if (b === "coverage_below_threshold") return "needs_more_coverage";
  return "in_progress";
}

function main() {
  const companyPath = latest(OUT_DIR, /__company_vulnerability_v2_conservative__/);
  const headcountPath = latest(OUT_DIR, /__company_results_verified_headcount__/);
  const roleMixPath = latest(INT_DIR, /__role_mix_candidates__/);
  const adjPath = latest(INT_DIR, /__role_mapping_adjudication_v2_reviewed__/);

  const company = parseSimpleCsv(readFileSync(companyPath, "utf8"));
  const head = parseSimpleCsv(readFileSync(headcountPath, "utf8"));
  const roleMix = parseSimpleCsv(readFileSync(roleMixPath, "utf8"));
  const adj = parseSimpleCsv(readFileSync(adjPath, "utf8"));

  const headByTicker = new Map(head.map((r) => [r.ticker, r]));
  const roleCountByTicker = new Map();
  for (const r of roleMix) roleCountByTicker.set(r.ticker, (roleCountByTicker.get(r.ticker) || 0) + 1);

  const approvedAdjByTicker = new Map();
  for (const r of adj) {
    if (String(r.review_status).toLowerCase() !== "approved") continue;
    approvedAdjByTicker.set(r.ticker, (approvedAdjByTicker.get(r.ticker) || 0) + 1);
  }

  const out = company.map((c) => {
    const h = headByTicker.get(c.ticker);
    const row = {
      run_id: RUN_ID,
      ticker: c.ticker,
      company_name: c.company_name,
      ai_vulnerability_score_v2: c.ai_vulnerability_score_v2,
      approved_role_share_pct: c.approved_role_share_pct,
      threshold_met: c.threshold_met,
      headcount_verification_status: h?.headcount_verification_status || "unknown",
      role_signal_count: roleCountByTicker.get(c.ticker) || 0,
      approved_mapping_count: approvedAdjByTicker.get(c.ticker) || 0,
      blocker: "",
      stage: "",
      updated_at: NOW_ISO,
    };
    row.blocker = blocker(row);
    row.stage = stage(row);
    return row;
  });

  out.sort((a, b) => {
    const as = a.ai_vulnerability_score_v2 === "" ? -1 : Number(a.ai_vulnerability_score_v2);
    const bs = b.ai_vulnerability_score_v2 === "" ? -1 : Number(b.ai_vulnerability_score_v2);
    if (bs !== as) return bs - as;
    return String(a.ticker).localeCompare(String(b.ticker));
  });

  const outPath = path.join(OUT_DIR, `${RUN_ID}__initial_results_25_summary__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(out, [
      "run_id",
      "ticker",
      "company_name",
      "ai_vulnerability_score_v2",
      "approved_role_share_pct",
      "threshold_met",
      "headcount_verification_status",
      "role_signal_count",
      "approved_mapping_count",
      "blocker",
      "stage",
      "updated_at",
    ]),
    "utf8",
  );

  const published = out.filter((r) => r.stage === "published_score").length;
  console.log(`Wrote initial results summary: ${outPath}`);
  console.log(`Published scores: ${published}/25`);
}

main();

