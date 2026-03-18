#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "outputs");
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");

function argValue(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  return process.argv[idx + 1] || fallback;
}

const LIMIT = Number(argValue("--limit", "0"));
const INCLUDE_PUBLISHED = argValue("--include-published", "false").toLowerCase() === "true";

function parseSimpleCsv(content) {
  const trimmed = content.trimEnd();
  if (!trimmed) return [];
  const lines = trimmed.split("\n");
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
  if (!files.length) throw new Error(`No file found in ${dir} for ${pattern}`);
  return path.join(dir, files[files.length - 1]);
}

function n(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const x = Number(raw);
  return Number.isFinite(x) ? x : 0;
}

function priorityScore(row) {
  const status = String(row.defensibility_status || "");
  const stage = String(row.current_stage || "");
  const pending = n(row.pending_mapping_count);
  const roleSignals = n(row.role_signal_count);
  const directShare = n(row.direct_mapped_share_pct);
  const usedPriors = String(row.used_sector_priors || "").toLowerCase() === "yes";

  let score = 0;

  if (status === "not_defensible_yet") score += 100;
  else if (status === "defensible_guess") score += 60;
  else if (status === "medium_high_confidence") score += 5;

  if (stage === "needs_headcount_review") score += 35;
  else if (stage === "needs_mapping_adjudication") score += 30;
  else if (stage === "needs_role_signal") score += 25;
  else if (stage === "needs_more_coverage") score += 20;
  else if (stage === "in_progress") score += 10;
  else if (stage === "published_score") score += 0;

  score += Math.min(30, pending * 3);
  if (roleSignals <= 0) score += 12;
  if (directShare > 0 && directShare < 60) score += Math.ceil((60 - directShare) / 10);
  if (usedPriors) score += 5;

  return score;
}

function priorityBucket(score) {
  if (score >= 120) return "p0_critical";
  if (score >= 90) return "p1_high";
  if (score >= 60) return "p2_medium";
  return "p3_low";
}

function isUnresolved(row) {
  const status = String(row.defensibility_status || "");
  const stage = String(row.current_stage || "");
  const pending = n(row.pending_mapping_count);
  if (INCLUDE_PUBLISHED) return true;
  return status !== "medium_high_confidence" || stage !== "published_score" || pending > 0;
}

function main() {
  const confidencePath = latest(OUT_DIR, /__confidence_pipeline_status__/);
  const rows = parseSimpleCsv(readFileSync(confidencePath, "utf8"));

  const unresolved = rows
    .filter(isUnresolved)
    .map((row) => {
      const score = priorityScore(row);
      return {
        run_id: RUN_ID,
        generated_at: NOW_ISO,
        ticker: row.ticker,
        company_name: row.company_name,
        priority_score: String(score),
        priority_bucket: priorityBucket(score),
        current_stage: row.current_stage,
        defensibility_status: row.defensibility_status,
        headcount_status: row.headcount_status,
        pending_mapping_count: row.pending_mapping_count || "0",
        role_signal_count: row.role_signal_count || "0",
        direct_mapped_share_pct: row.direct_mapped_share_pct || "0",
        used_sector_priors: row.used_sector_priors || "no",
        next_action: row.next_action || "",
        recommended_sources: row.recommended_sources || "",
      };
    })
    .sort((a, b) => {
      const d = Number(b.priority_score) - Number(a.priority_score);
      if (d !== 0) return d;
      return String(a.ticker).localeCompare(String(b.ticker));
    });

  const finalRows =
    LIMIT > 0 && Number.isFinite(LIMIT) ? unresolved.slice(0, Math.max(0, LIMIT)) : unresolved;

  const outPath = path.join(OUT_DIR, `${RUN_ID}__repair_queue__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(finalRows, [
      "run_id",
      "generated_at",
      "ticker",
      "company_name",
      "priority_score",
      "priority_bucket",
      "current_stage",
      "defensibility_status",
      "headcount_status",
      "pending_mapping_count",
      "role_signal_count",
      "direct_mapped_share_pct",
      "used_sector_priors",
      "next_action",
      "recommended_sources",
    ]),
    "utf8",
  );

  console.log(`Wrote repair queue: ${outPath}`);
  console.log(`rows=${finalRows.length} unresolved_total=${unresolved.length}`);
}

main();
