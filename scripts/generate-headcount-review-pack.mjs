#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const NOW = new Date();
const STAMP = NOW.toISOString().replaceAll(":", "-");
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

function latest(pattern) {
  const files = readdirSync(INT_DIR)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (files.length === 0) throw new Error(`No file found for ${pattern}`);
  return path.join(INT_DIR, files[files.length - 1]);
}

function suggestedAction(row) {
  if (row.review_status === "needs_research") return "manual research";
  if (row.candidate_confidence === "high") return "likely approve after spot-check";
  if (row.candidate_confidence === "medium") return "verify quote context carefully";
  return "manual review required";
}

function main() {
  const queuePath = latest(/__headcount_verification_queue__/);
  const rows = parseSimpleCsv(readFileSync(queuePath, "utf8"));

  const pending = rows.filter((r) => r.review_status === "pending");
  const research = rows.filter((r) => r.review_status === "needs_research");

  const lines = [];
  lines.push(`# Headcount Review Pack (${RUN_ID})`);
  lines.push("");
  lines.push(`Generated: ${NOW.toISOString()}`);
  lines.push("");
  lines.push(`Pending candidates: ${pending.length}`);
  lines.push(`Needs research: ${research.length}`);
  lines.push("");
  lines.push("## Pending Candidates");
  lines.push("");
  for (const r of pending) {
    lines.push(`- **${r.ticker} (${r.company_name})**`);
    lines.push(`  candidate: ${r.candidate_headcount} (${r.candidate_confidence})`);
    lines.push(`  filing date: ${r.filing_date}`);
    lines.push(`  citation: ${r.citation_id}`);
    lines.push(`  source: ${r.source_url}`);
    lines.push(`  suggested action: ${suggestedAction(r)}`);
    lines.push(`  quote: "${r.quote}"`);
    lines.push("");
  }
  lines.push("## Needs Research");
  lines.push("");
  for (const r of research) {
    lines.push(`- ${r.ticker} (${r.company_name})`);
  }
  lines.push("");
  lines.push("## How To Apply");
  lines.push("");
  lines.push("1. Open the queue CSV and set `review_status` to `approved` or `rejected`.");
  lines.push("2. For approved rows, fill `verified_headcount`, `reviewer`, and `reviewed_at`.");
  lines.push("3. Re-run `node scripts/compute-company-results-verified-headcount.mjs`.");

  const outPath = path.join(OUT_DIR, `${RUN_ID}__headcount_review_pack__${STAMP}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote review pack: ${outPath}`);
}

main();

